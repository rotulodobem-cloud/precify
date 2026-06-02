import db from '@/lib/db'
import { calcCustoVariacao, calcPrecificacaoComFreteML, round2 } from '@/lib/calculos'

export async function saveCompra(data: {
  dataCompra: string; skuPrincipal: string; nomeProduto: string; fornecedor: string
  quantidade: number; custoTotal: number; frete?: number; outrosCustos?: number
  precoVenda?: number | null; impostoPct?: number; fonte?: string
}) {
  const frete     = data.frete ?? 0
  const outros    = data.outrosCustos ?? 0
  const imposto   = data.impostoPct ?? 0.0829
  const custoUnit = round2(data.custoTotal / data.quantidade)

  const ultima = await db.compra.findFirst({
    where: { skuPrincipal: data.skuPrincipal },
    orderBy: { dataCompra: 'desc' },
  })

  let variacaoPct: number | null = null
  let statusVariacao: string | null = null
  if (ultima?.custoUnitario) {
    variacaoPct = (custoUnit - ultima.custoUnitario) / ultima.custoUnitario
    statusVariacao = Math.abs(variacaoPct) <= 0.05
      ? 'ESTAVEL ± 5%'
      : variacaoPct > 0 ? 'AUMENTOU > 5%' : 'DIMINUIU > 5%'
  }

  let margem: number | null = null
  let statusFinanceiro: string | null = null
  if (data.precoVenda && data.precoVenda > 0) {
    const receitaLiq = data.precoVenda * (1 - imposto)
    margem = (receitaLiq - custoUnit) / data.precoVenda
    statusFinanceiro = margem >= 0.25 ? 'Lucro' : margem >= 0 ? 'Atenção' : 'Prejuízo'
  } else {
    statusFinanceiro = 'Sem preço de venda'
  }

  await db.produto.upsert({
    where: { skuPrincipal: data.skuPrincipal },
    update: {
      custoPorKg: custoUnit, custoAtualizado: custoUnit,
      dataUltimaCompra: new Date(data.dataCompra),
      fornecedorPrincipal: data.fornecedor || undefined,
    },
    create: {
      skuPrincipal: data.skuPrincipal, nome: data.nomeProduto,
      categoria: 'Geral', unidadeCompra: 'kg',
      custoPorKg: custoUnit, custoAtualizado: custoUnit,
      dataUltimaCompra: new Date(data.dataCompra),
      fornecedorPrincipal: data.fornecedor || null,
      tipoPrecificacao: 'peso_proporcional', status: 'ativo',
    },
  })

  const variacoes = await db.variacao.findMany({
    where: { skuPrincipal: data.skuPrincipal },
    include: { precificacoes: { include: { plataforma: true } } },
  })

  for (const v of variacoes) {
    let novoCustoCalc = v.custoCalculado
    let novoCustoTotal = v.custoTotal

    if (v.pesoGramas) {
      novoCustoCalc = round2(calcCustoVariacao(custoUnit, v.pesoGramas, 0))
      novoCustoTotal = round2(novoCustoCalc + (v.custoAdicional ?? 0))
    } else {
      novoCustoCalc = custoUnit
      novoCustoTotal = round2(custoUnit + (v.custoAdicional ?? 0))
    }

    await db.variacao.update({
      where: { id: v.id },
      data: { custoCalculado: novoCustoCalc, custoTotal: novoCustoTotal },
    })

    for (const prec of v.precificacoes) {
      const isML = prec.plataforma.slug === 'ml'
      const tipoFreteML = (prec as Record<string, unknown>).tipoFreteML as string ?? 'full'

      const calc = calcPrecificacaoComFreteML({
        custoProduto: novoCustoTotal ?? novoCustoCalc ?? 0,
        custoEmbalagem: prec.custoEmbalagem, custoFrete: prec.custoFrete,
        custoColeta: prec.custoColeta, comissaoPct: prec.comissaoPct,
        impostoPct: prec.impostoPct, precoAtual: prec.precoAtual,
        isML, tipoFreteML, pesoGramas: v.pesoGramas,
      })

      await db.precificacao.update({
        where: { id: prec.id },
        data: {
          custoFrete: calc.custoFrete, custoTotalCalc: calc.custoTotalCalc,
          precoMinimo: calc.precoMinimo, precoIdeal: calc.precoIdeal,
          precoMaximo: calc.precoMaximo, precoPromocional: calc.precoPromocional,
          lucroBruto: calc.lucroBruto, margemAtual: calc.margemAtual,
          statusMargem: calc.statusMargem,
        },
      })
    }
  }

  const dataFinal = data.dataCompra.includes('T')
    ? new Date(data.dataCompra)
    : new Date(data.dataCompra + 'T12:00:00')

  return db.compra.create({
    data: {
      dataCompra: dataFinal, skuPrincipal: data.skuPrincipal,
      nomeProduto: data.nomeProduto, fornecedor: data.fornecedor,
      quantidade: data.quantidade, custoTotal: data.custoTotal,
      frete, outrosCustos: outros, custoUnitario: custoUnit,
      custoAnterior: ultima?.custoUnitario ?? null,
      variacaoPct, statusVariacao,
      precoVenda: data.precoVenda ?? null,
      impostoPct: imposto, margem, statusFinanceiro,
      fonte: data.fonte ?? 'manual',
    },
  })
}
