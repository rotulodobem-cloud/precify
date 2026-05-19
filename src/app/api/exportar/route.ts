import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import db from '@/lib/db'

export async function GET() {
  const precs = await db.precificacao.findMany({
    include: {
      variacao: { include: { produto: true } },
      plataforma: true,
    },
    orderBy: [{ variacao: { skuPrincipal: 'asc' } }, { plataforma: { nome: 'asc' } }, { variacao: { pesoGramas: 'asc' } }],
  })

  const rows = precs.map(p => ({
    'SKU Variação':        p.skuVariacao,
    'SKU Principal':       p.variacao.skuPrincipal,
    'Produto':             p.variacao.produto.nome,
    'Variação':            p.variacao.nomeVariacao,
    'Peso (g)':            p.variacao.pesoGramas ?? '',
    'Categoria':           p.variacao.produto.categoria,
    'Plataforma':          p.plataforma.nome,
    'Custo Produto R$':    p.variacao.custoTotal?.toFixed(2) ?? '',
    'Embalagem R$':        p.custoEmbalagem.toFixed(2),
    'Frete/Taxa R$':       p.custoFrete.toFixed(2),
    'Custo Total R$':      p.custoTotalCalc?.toFixed(2) ?? '',
    'Comissão %':          `${(p.comissaoPct * 100).toFixed(1)}%`,
    'Imposto %':           `${(p.impostoPct * 100).toFixed(1)}%`,
    'Preço Mínimo R$':     p.precoMinimo?.toFixed(2) ?? '',
    'Preço Ideal R$':      p.precoIdeal?.toFixed(2) ?? '',
    'Preço Máximo R$':     p.precoMaximo?.toFixed(2) ?? '',
    'Preço Promoção R$':   p.precoPromocional?.toFixed(2) ?? '',
    'Preço Atual R$':      p.precoAtual?.toFixed(2) ?? '',
    'Lucro Bruto R$':      p.lucroBruto?.toFixed(2) ?? '',
    'Margem Atual %':      p.margemAtual != null ? `${(p.margemAtual * 100).toFixed(1)}%` : '',
    'Status Margem':       p.statusMargem ?? '',
  }))

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = Array(21).fill({}).map((_, i) => ({ wch: [12,12,28,22,8,14,14,14,10,10,12,10,10,12,12,12,14,12,12,12,14][i] ?? 12 }))
  XLSX.utils.book_append_sheet(wb, ws, 'Precificação')

  // Aba de compras
  const compras = await db.compra.findMany({ orderBy: { dataCompra: 'desc' }, take: 500 })
  const rowsC = compras.map(c => ({
    'Data':              new Date(c.dataCompra).toLocaleDateString('pt-BR'),
    'SKU':               c.skuPrincipal,
    'Produto':           c.nomeProduto,
    'Fornecedor':        c.fornecedor,
    'Quantidade':        c.quantidade,
    'Custo Total R$':    c.custoTotal.toFixed(2),
    'Custo Unitário R$': c.custoUnitario.toFixed(2),
    'Anterior R$':       c.custoAnterior?.toFixed(2) ?? '',
    'Variação %':        c.variacaoPct != null ? `${(c.variacaoPct * 100).toFixed(1)}%` : '',
    'Status Variação':   c.statusVariacao ?? '',
    'Preço Venda R$':    c.precoVenda?.toFixed(2) ?? '',
    'Margem %':          c.margem != null ? `${(c.margem * 100).toFixed(1)}%` : '',
    'Status Financeiro': c.statusFinanceiro ?? '',
    'Fonte':             c.fonte,
  }))
  const wsC = XLSX.utils.json_to_sheet(rowsC)
  XLSX.utils.book_append_sheet(wb, wsC, 'Compras')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="precify_export_${new Date().toISOString().slice(0,10)}.xlsx"`,
    },
  })
}
