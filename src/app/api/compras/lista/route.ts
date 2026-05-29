import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tipo = searchParams.get('tipo')
  const sku = searchParams.get('sku')

  // ── Sugestão de fornecedor para um SKU ────────────────────
  if (tipo === 'sugestao' && sku) {
    const ultimas = await db.compra.findMany({
      where: { skuPrincipal: sku, fornecedor: { not: '' } },
      orderBy: { dataCompra: 'desc' },
      take: 5,
      select: { fornecedor: true, custoUnitario: true, quantidade: true, dataCompra: true, custoTotal: true },
    })
    const aliases = await db.fornecedorAlias.findMany({
      where: { skuPrincipal: sku, ativo: true },
      orderBy: { dataUltimoPreco: 'desc' },
    })
    const fornecedoresDuas = ultimas.slice(0, 2).map(c => c.fornecedor)
    const contagem = fornecedoresDuas.reduce<Record<string, number>>((acc, f) => { acc[f] = (acc[f] || 0) + 1; return acc }, {})
    const fornecedorSugerido = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0]?.[0] || null

    const trintaDias = new Date(); trintaDias.setDate(trintaDias.getDate() - 30)
    const ultimos30 = await db.compra.findMany({ where: { skuPrincipal: sku, dataCompra: { gte: trintaDias } } })
    const qtd30dias = ultimos30.reduce((s, c) => s + c.quantidade, 0)
    const ultimaQtd = ultimas[0]?.quantidade || 0

    return NextResponse.json({
      ultimas2Compras: ultimas.slice(0, 2), fornecedorSugerido, aliases,
      qtd30dias, ultimaQtd, sugestaoQtd: ultimaQtd,
    })
  }

  // ── Histórico mensal (mês anterior) ──────────────────────
  if (tipo === 'historico') {
    const agora = new Date()
    const inicioMesAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1)
    const fimMesAnterior = new Date(agora.getFullYear(), agora.getMonth(), 0, 23, 59, 59)
    const comprasMes = await db.compra.findMany({
      where: { dataCompra: { gte: inicioMesAnterior, lte: fimMesAnterior } },
      orderBy: { dataCompra: 'desc' },
    })
    const porSku: Record<string, typeof comprasMes[0]> = {}
    for (const c of comprasMes) { if (!porSku[c.skuPrincipal]) porSku[c.skuPrincipal] = c }
    const totalGasto = comprasMes.reduce((s, c) => s + c.custoTotal, 0)
    const fornecedoresSet = new Set(comprasMes.map(c => c.fornecedor).filter(Boolean))

    const resultado = await Promise.all(Object.values(porSku).map(async (c) => {
      const ini2 = new Date(agora.getFullYear(), agora.getMonth() - 2, 1)
      const fim2 = new Date(agora.getFullYear(), agora.getMonth() - 1, 0)
      const anterior = await db.compra.findFirst({
        where: { skuPrincipal: c.skuPrincipal, dataCompra: { gte: ini2, lte: fim2 } },
        orderBy: { dataCompra: 'desc' },
      })
      const variacaoPct = anterior ? (c.custoUnitario - anterior.custoUnitario) / anterior.custoUnitario : null
      return {
        skuPrincipal: c.skuPrincipal, nomeProduto: c.nomeProduto, fornecedor: c.fornecedor,
        quantidade: c.quantidade, custoUnitario: c.custoUnitario, custoTotal: c.custoTotal,
        dataCompra: c.dataCompra, variacaoPct, statusVariacao: c.statusVariacao,
        custoAnterior: anterior?.custoUnitario || null,
        sugestao: !variacaoPct ? 'manter' : variacaoPct > 0.05 ? 'revisar_aumento' : variacaoPct < -0.05 ? 'oportunidade' : 'manter',
      }
    }))

    return NextResponse.json({
      mes: `${inicioMesAnterior.toLocaleString('pt-BR', { month: 'long' })}/${inicioMesAnterior.getFullYear()}`,
      totalGasto: Math.round(totalGasto * 100) / 100,
      totalItens: Object.keys(porSku).length,
      fornecedoresAtivos: fornecedoresSet.size,
      comAumento: resultado.filter(r => r.sugestao === 'revisar_aumento').length,
      itens: resultado.sort((a, b) => b.custoTotal - a.custoTotal),
    })
  }

  // ── Curva ABC ────────────────────────────────────────────
  if (tipo === 'curva') {
    const meses = parseInt(searchParams.get('meses') || '3')
    const desde = new Date(); desde.setMonth(desde.getMonth() - meses)
    const compras = await db.compra.findMany({ where: { dataCompra: { gte: desde } }, orderBy: { dataCompra: 'desc' } })

    const porSku: Record<string, { sku: string; produto: string; totalGasto: number; qtdCompras: number; fornecedores: Record<string, number>; ultimoCusto: number }> = {}
    for (const c of compras) {
      if (!porSku[c.skuPrincipal]) porSku[c.skuPrincipal] = { sku: c.skuPrincipal, produto: c.nomeProduto, totalGasto: 0, qtdCompras: 0, fornecedores: {}, ultimoCusto: c.custoUnitario }
      porSku[c.skuPrincipal].totalGasto += c.custoTotal
      porSku[c.skuPrincipal].qtdCompras += 1
      if (c.fornecedor) porSku[c.skuPrincipal].fornecedores[c.fornecedor] = (porSku[c.skuPrincipal].fornecedores[c.fornecedor] || 0) + c.custoTotal
    }
    const lista = Object.values(porSku).sort((a, b) => b.totalGasto - a.totalGasto)
    const totalGeral = lista.reduce((s, i) => s + i.totalGasto, 0)
    let acumulado = 0
    const resultado = lista.map(item => {
      const pct = totalGeral > 0 ? item.totalGasto / totalGeral : 0
      acumulado += pct
      const curva = acumulado <= 0.80 ? 'A' : acumulado <= 0.95 ? 'B' : 'C'
      const fornOrd = Object.entries(item.fornecedores).sort((a, b) => b[1] - a[1])
      return {
        sku: item.sku, produto: item.produto, curva, totalGasto: item.totalGasto, qtdCompras: item.qtdCompras,
        pctTotal: Math.round(pct * 1000) / 10,
        fornecedorPrincipal: fornOrd[0]?.[0] || '',
        outrosFornecedores: fornOrd.slice(1).map(([f]) => f),
        mediaGastoMes: Math.round((item.totalGasto / meses) * 100) / 100,
      }
    })
    return NextResponse.json({
      periodo: `${meses} meses`, totalGeral: Math.round(totalGeral * 100) / 100,
      qtdA: resultado.filter(r => r.curva === 'A').length,
      qtdB: resultado.filter(r => r.curva === 'B').length,
      qtdC: resultado.filter(r => r.curva === 'C').length,
      itens: resultado,
    })
  }

  return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
}
