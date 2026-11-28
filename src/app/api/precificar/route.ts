// Catálogo para precificação de loja física e site: uma linha por produto-base,
// com custo (Precify), preço cadastrado (Bling, via Farol), curva ABC e a análise
// de margem. A tela "Precificar" usa uma linha; a "Análise de preços" usa todas.
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { lerPrecosFarol, ErroFarol } from '@/lib/giroEstoque'
import { lerConfigLoja } from '@/lib/configLoja'
import { analisar, curvaAbc } from '@/lib/precificacaoLoja'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const atualizar = new URL(req.url).searchParams.get('atualizar') === '1'

  let precos: Awaited<ReturnType<typeof lerPrecosFarol>> = []
  let avisoFarol: string | null = null
  try {
    precos = await lerPrecosFarol(atualizar)
  } catch (e) {
    if (!(e instanceof ErroFarol)) throw e
    // sem o Farol a tela ainda serve para simular: fica sem preço atual e sem curva
    avisoFarol = e.mensagem
  }

  const [config, produtos, kits] = await Promise.all([
    lerConfigLoja(),
    db.produto.findMany({
      where: { status: 'ativo' },
      select: { skuPrincipal: true, nome: true, categoria: true, unidadeCompra: true, custoAtualizado: true, custoPorKg: true, custoUnitario: true, dataUltimaCompra: true, fornecedorPrincipal: true },
      orderBy: { nome: 'asc' },
    }),
    db.kit.findMany({ select: { skuKit: true, nome: true, categoria: true, status: true, custoTotal: true, updatedAt: true, componentes: { select: { nomeProduto: true, quantidadeGramas: true, quantidadeUn: true } } } }),
  ])
  const ehKit = new Set(kits.map(k => k.skuKit))
  const precoDe = new Map(precos.map(p => [p.sku, p]))
  const kitsAtivos = kits.filter(k => k.status === 'ativo')
  const curva = curvaAbc([
    ...produtos.map(p => ({ sku: p.skuPrincipal, receita: precoDe.get(p.skuPrincipal)?.receita_propria_90d ?? 0 })),
    ...kitsAtivos.map(k => ({ sku: k.skuKit, receita: precoDe.get(k.skuKit)?.receita_propria_90d ?? 0 })),
  ])

  const itens = produtos.filter(p => !ehKit.has(p.skuPrincipal) && !/^KIT/i.test(p.skuPrincipal)).map(p => {
    // granel tem SKU só numérico e é vendido por gramatura; os demais são por unidade
    const fracionado = p.unidadeCompra === 'kg' && /^[0-9]+$/.test(p.skuPrincipal)
    const custo = p.custoAtualizado ?? (fracionado ? p.custoPorKg : p.custoUnitario) ?? null
    const f = precoDe.get(p.skuPrincipal)
    const preco = f?.preco && f.preco > 0 ? Number(f.preco) : null
    const qtd30 = f ? (fracionado ? f.kg_proprio_30d : f.un_proprio_30d) : 0
    return {
      sku: p.skuPrincipal, nome: p.nome, categoria: p.categoria, fracionado,
      custo, dataUltimaCompra: p.dataUltimaCompra, fornecedor: p.fornecedorPrincipal,
      preco, precoAtualizadoEm: f?.preco_atualizado_em ?? null,
      // preço médio realmente praticado nas lojas e no site nos últimos 30 dias
      precoMedio30d: f && qtd30 > 0 ? Math.round((f.receita_propria_30d / qtd30) * 100) / 100 : null,
      receita90d: f?.receita_propria_90d ?? 0,
      receitaMkt90d: f?.receita_mkt_90d ?? 0,
      curva: curva.get(p.skuPrincipal) ?? 'NOVO',
      ...analisar({ custo, preco, fracionado }, config),
    }
  })

  // Kits: custo é a soma da composição cadastrada em Kits; preço vem do Bling
  const itensKit = kitsAtivos.map(k => {
    const f = precoDe.get(k.skuKit)
    const preco = f?.preco && f.preco > 0 ? Number(f.preco) : null
    const custo = k.custoTotal && k.custoTotal > 0 ? k.custoTotal : null
    const composicao = k.componentes.map(c => `${c.nomeProduto}${c.quantidadeGramas ? ` ${c.quantidadeGramas} g` : c.quantidadeUn ? ` ${c.quantidadeUn} un` : ''}`).join(' + ')
    return {
      sku: k.skuKit, nome: k.nome, categoria: k.categoria || 'Kits', fracionado: false,
      custo, dataUltimaCompra: null, fornecedor: null, composicao,
      preco, precoAtualizadoEm: f?.preco_atualizado_em ?? null,
      precoMedio30d: f && f.un_proprio_30d > 0 ? Math.round((f.receita_propria_30d / f.un_proprio_30d) * 100) / 100 : null,
      receita90d: f?.receita_propria_90d ?? 0,
      receitaMkt90d: f?.receita_mkt_90d ?? 0,
      curva: curva.get(k.skuKit) ?? 'NOVO',
      ...analisar({ custo, preco, fracionado: false }, config),
    }
  })

  return NextResponse.json({ config, avisoFarol, itens: [...itens, ...itensKit] })
}
