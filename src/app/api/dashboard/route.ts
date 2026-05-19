import { NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET() {
  const [precs, compras, plataformas] = await Promise.all([
    db.precificacao.findMany({
      include: {
        variacao: { include: { produto: { select: { nome: true, skuPrincipal: true, categoria: true } } } },
        plataforma: true,
      },
    }),
    db.compra.findMany({ orderBy: { dataCompra: 'desc' }, take: 200 }),
    db.plataforma.findMany({ where: { ativa: true } }),
  ])

  const total = precs.length
  const saudavel = precs.filter(p => p.statusMargem === 'SAUDAVEL').length
  const atencao  = precs.filter(p => p.statusMargem === 'ATENCAO').length
  const prejuizo = precs.filter(p => p.statusMargem === 'PREJUIZO').length
  const semPreco = precs.filter(p => !p.precoAtual).length

  const comPreco = precs.filter(p => p.margemAtual !== null)
  const margemMedia = comPreco.length
    ? comPreco.reduce((a, p) => a + (p.margemAtual ?? 0), 0) / comPreco.length
    : 0

  // Alertas agrupados
  const alertas = [
    ...precs
      .filter(p => p.statusMargem === 'PREJUIZO' && p.precoAtual)
      .slice(0, 15)
      .map(p => ({ tipo: 'PREJUIZO', sku: p.skuVariacao, produto: p.variacao.produto.nome, plataforma: p.plataforma.nome, margem: p.margemAtual, precoAtual: p.precoAtual, precoIdeal: p.precoIdeal })),
    ...precs
      .filter(p => p.statusMargem === 'ATENCAO')
      .slice(0, 10)
      .map(p => ({ tipo: 'ATENCAO', sku: p.skuVariacao, produto: p.variacao.produto.nome, plataforma: p.plataforma.nome, margem: p.margemAtual, precoAtual: p.precoAtual, precoIdeal: p.precoIdeal })),
    ...compras
      .filter(c => c.statusVariacao === 'AUMENTOU > 5%')
      .slice(0, 10)
      .map(c => ({ tipo: 'CUSTO_AUMENTO', sku: c.skuPrincipal, produto: c.nomeProduto, plataforma: '', margem: null, precoAtual: null, precoIdeal: null, extra: `${((c.variacaoPct ?? 0) * 100).toFixed(1)}% ↑ R$${c.custoAnterior?.toFixed(2)} → R$${c.custoUnitario.toFixed(2)}` })),
    ...precs
      .filter(p => !p.precoAtual)
      .slice(0, 8)
      .map(p => ({ tipo: 'SEM_PRECO', sku: p.skuVariacao, produto: p.variacao.produto.nome, plataforma: p.plataforma.nome, margem: null, precoAtual: null, precoIdeal: p.precoIdeal })),
  ]

  // Comparativo ML × Shopee
  const ml     = plataformas.find(p => p.slug === 'ml')
  const shopee = plataformas.find(p => p.slug === 'shopee')
  const comparativo = []

  if (ml && shopee) {
    const mlPrecs = precs.filter(p => p.plataformaId === ml.id)
    for (const mp of mlPrecs.slice(0, 25)) {
      const sp = precs.find(p => p.skuVariacao === mp.skuVariacao && p.plataformaId === shopee.id)
      if (sp) {
        comparativo.push({
          sku: mp.skuVariacao,
          produto: mp.variacao.produto.nome,
          variacao: mp.variacao.produto.nome,
          margemML: mp.margemAtual,
          margemShopee: sp.margemAtual,
          precoIdealML: mp.precoIdeal,
          precoIdealShopee: sp.precoIdeal,
          precoAtualML: mp.precoAtual,
          precoAtualShopee: sp.precoAtual,
          melhor: (mp.margemAtual ?? -1) >= (sp.margemAtual ?? -1) ? 'ML' : 'Shopee',
        })
      }
    }
  }

  // Margem por plataforma
  const porPlataforma = plataformas.map(p => {
    const pp = precs.filter(pr => pr.plataformaId === p.id && pr.margemAtual !== null)
    const media = pp.length ? pp.reduce((a, pr) => a + (pr.margemAtual ?? 0), 0) / pp.length : null
    return { plataforma: p.nome, slug: p.slug, cor: p.corHex, media, total: precs.filter(pr => pr.plataformaId === p.id).length }
  })

  // Margem por categoria
  const cats: Record<string, number[]> = {}
  for (const p of precs) {
    const cat = p.variacao.produto.categoria
    if (p.margemAtual !== null) {
      cats[cat] = cats[cat] ?? []
      cats[cat].push(p.margemAtual)
    }
  }
  const porCategoria = Object.entries(cats)
    .map(([cat, vals]) => ({ categoria: cat, media: vals.reduce((a, v) => a + v, 0) / vals.length, n: vals.length }))
    .sort((a, b) => b.media - a.media)

  return NextResponse.json({
    metricas: {
      totalProdutos: await db.produto.count({ where: { status: 'ativo' } }),
      totalVariacoes: await db.variacao.count({ where: { status: 'ativo' } }),
      totalPrecificacoes: total,
      totalCompras: await db.compra.count(),
      saudavel, atencao, prejuizo, semPreco, margemMedia,
    },
    alertas: alertas.slice(0, 30),
    comparativo,
    porPlataforma,
    porCategoria,
    comprasRecentes: compras.slice(0, 8),
    custosAlterados: compras.filter(c => c.statusVariacao === 'AUMENTOU > 5%').slice(0, 5),
  })
}
