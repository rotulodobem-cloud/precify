import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { CANAIS_MULTICANAL, calcularCanalModoPreco } from '@/lib/calculosMulticanal'

const DIAS_PARADO = 60
const TOLERANCIA_PADRAO = 10

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mes = searchParams.get('mes') || new Date().toISOString().slice(0, 7)
  const fornecedorFiltro = searchParams.get('fornecedor')?.trim()

  const [ano, mesNum] = mes.split('-').map(Number)
  const inicio = new Date(ano, mesNum - 1, 1)
  const fim = new Date(ano, mesNum, 0, 23, 59, 59)

  const whereCompras: Record<string, unknown> = { dataCompra: { gte: inicio, lte: fim } }
  if (fornecedorFiltro) whereCompras.fornecedor = { contains: fornecedorFiltro, mode: 'insensitive' }

  const compras = await db.compra.findMany({ where: whereCompras })

  const gastoTotal = compras.reduce((a, c) => a + c.custoTotal, 0)

  const porFornecedor = new Map<string, number>()
  for (const c of compras) porFornecedor.set(c.fornecedor, (porFornecedor.get(c.fornecedor) ?? 0) + c.custoTotal)
  const fornecedores = [...porFornecedor.entries()]
    .map(([fornecedor, total]) => ({ fornecedor, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total)

  const tolConfig = await db.configuracao.findUnique({ where: { chave: 'tolerancia_loja_propria_pct' } })
  const tolerancia = tolConfig ? parseFloat(tolConfig.valor) : TOLERANCIA_PADRAO

  type ItemAjustar = {
    sku: string; skuVariacao: string | null; nome: string
    direcao: 'subir' | 'baixar'; fonte: 'preco_praticado' | 'variacao_custo'
    desvioPct: number | null; variacaoPct: number | null; dataCompra: string | null
  }

  const defLp = CANAIS_MULTICANAL.find(d => d.key === 'lp')!
  const comPrecoPraticado = await db.calculoMulticanal.findMany({
    where: { precoPraticadoLP: { not: null } },
    select: {
      sku: true, skuVariacao: true, nome: true, variacao: true,
      custoProduto: true, pesoGramas: true, despesasVariaveisPct: true, despesasFixasPct: true,
      canais: true, precoPraticadoLP: true,
    },
  })

  const skusComSinalPreciso = new Set<string>()
  const produtosPrecisos: ItemAjustar[] = []
  for (const calc of comPrecoPraticado) {
    if (!calc.precoPraticadoLP) continue
    const canaisCfg = (calc.canais ?? {}) as Record<string, Record<string, number>>
    const cfgLp = canaisCfg.lp
    if (!cfgLp) continue
    const r = calcularCanalModoPreco({
      custoProduto: calc.custoProduto, despVarPct: calc.despesasVariaveisPct, despFixPct: calc.despesasFixasPct,
      pesoGramas: calc.pesoGramas, canal: cfgLp as any, def: defLp, shAuto: true,
    })
    if (!r) continue
    if (calc.sku) skusComSinalPreciso.add(calc.sku)
    const desvio = (r.preco - calc.precoPraticadoLP) / calc.precoPraticadoLP
    if (Math.abs(desvio) * 100 <= tolerancia) continue
    produtosPrecisos.push({
      sku: calc.sku ?? '', skuVariacao: calc.skuVariacao ?? null,
      nome: calc.variacao ? `${calc.nome} ${calc.variacao}` : calc.nome,
      direcao: desvio > 0 ? 'subir' : 'baixar',
      fonte: 'preco_praticado',
      desvioPct: Math.round(Math.abs(desvio) * 10000) / 100,
      variacaoPct: null, dataCompra: null,
    })
  }

  const comprasComVariacao = compras.filter(c => c.statusVariacao === 'AUMENTOU > 5%' || c.statusVariacao === 'DIMINUIU > 5%')
  const skusComVariacao = [...new Set(comprasComVariacao.map(c => c.skuPrincipal))]
  const calculosDosSkus = skusComVariacao.length
    ? await db.calculoMulticanal.findMany({
        where: { sku: { in: skusComVariacao } },
        select: { sku: true, nome: true, canaisAtivos: true },
      })
    : []
  const skusComAnuncio = new Set(
    calculosDosSkus
      .filter(c => c.canaisAtivos && Object.values(c.canaisAtivos as Record<string, boolean>).some(Boolean))
      .map(c => c.sku)
  )
  const nomesPorSku = new Map(calculosDosSkus.map(c => [c.sku, c.nome]))
  const produtosAproximados: ItemAjustar[] = comprasComVariacao
    .filter(c => skusComAnuncio.has(c.skuPrincipal) && !skusComSinalPreciso.has(c.skuPrincipal))
    .map(c => ({
      sku: c.skuPrincipal, skuVariacao: null,
      nome: nomesPorSku.get(c.skuPrincipal) ?? c.nomeProduto,
      direcao: (c.statusVariacao === 'AUMENTOU > 5%' ? 'subir' : 'baixar') as 'subir' | 'baixar',
      fonte: 'variacao_custo' as const,
      desvioPct: null,
      variacaoPct: c.variacaoPct != null ? Math.round(c.variacaoPct * 10000) / 100 : null,
      dataCompra: c.dataCompra.toISOString(),
    }))
    .filter((v, i, arr) => arr.findIndex(x => x.sku === v.sku) === i)

  const produtosPraAjustar: ItemAjustar[] = [...produtosPrecisos, ...produtosAproximados]

  const produtos = await db.produto.findMany({ where: { status: 'ativo' }, select: { skuPrincipal: true, categoria: true } })
  const categoriaPorSku = new Map(produtos.map(p => [p.skuPrincipal, p.categoria]))
  const todosCalculos = await db.calculoMulticanal.findMany({
    select: { sku: true, custoProduto: true, pesoGramas: true, despesasVariaveisPct: true, despesasFixasPct: true, canais: true, canaisAtivos: true },
  })
  const margensPorCategoria = new Map<string, number[]>()
  for (const calc of todosCalculos) {
    const categoria = calc.sku ? categoriaPorSku.get(calc.sku) : null
    if (!categoria) continue
    const ativos = (calc.canaisAtivos ?? {}) as Record<string, boolean>
    const canaisCfg = (calc.canais ?? {}) as Record<string, Record<string, number>>
    for (const key of Object.keys(ativos)) {
      if (!ativos[key]) continue
      const def = CANAIS_MULTICANAL.find(d => d.key === key)
      const cfg = canaisCfg[key]
      if (!def || !cfg) continue
      const r = calcularCanalModoPreco({
        custoProduto: calc.custoProduto, despVarPct: calc.despesasVariaveisPct, despFixPct: calc.despesasFixasPct,
        pesoGramas: calc.pesoGramas, canal: cfg as any, def, shAuto: true,
      })
      if (!r) continue
      if (!margensPorCategoria.has(categoria)) margensPorCategoria.set(categoria, [])
      margensPorCategoria.get(categoria)!.push(r.margem)
    }
  }
  const porCategoria = [...margensPorCategoria.entries()]
    .map(([categoria, margens]) => ({
      categoria,
      margemMedia: Math.round((margens.reduce((a, m) => a + m, 0) / margens.length) * 10000) / 100,
      n: margens.length,
    }))
    .sort((a, b) => b.margemMedia - a.margemMedia)

  const limite = new Date()
  limite.setDate(limite.getDate() - DIAS_PARADO)
  const produtosParados = await db.produto.findMany({
    where: { status: 'ativo', OR: [{ dataUltimaCompra: { lt: limite } }, { dataUltimaCompra: null }] },
    select: { skuPrincipal: true, nome: true, dataUltimaCompra: true },
    orderBy: { dataUltimaCompra: 'asc' },
    take: 30,
  })

  return NextResponse.json({
    mes, fornecedorFiltro: fornecedorFiltro ?? null,
    gastoTotal: Math.round(gastoTotal * 100) / 100,
    totalCompras: compras.length,
    fornecedores, produtosPraAjustar, porCategoria, produtosParados,
  })
}
