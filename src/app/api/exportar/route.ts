import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import db from '@/lib/db'
import { CANAIS_MULTICANAL, calcularCanalModoPreco } from '@/lib/calculosMulticanal'
import { statusMargem } from '@/lib/calculos'

const ROTULOS: Record<string, string> = { lp: 'Loja Própria', mlFull: 'Mercado Livre FULL', mlClassico: 'Mercado Livre Clássico', sh: 'Shopee', tt: 'TikTok Shop' }

export async function GET() {
  const calculos = await db.calculoMulticanal.findMany({
    where: { skuVariacao: { not: null } },
    orderBy: [{ sku: 'asc' }, { variacao: 'asc' }],
  })

  const rows: Record<string, unknown>[] = []
  for (const calc of calculos) {
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
      rows.push({
        'SKU Variação':      calc.skuVariacao,
        'SKU Principal':     calc.sku ?? '',
        'Produto':           calc.nome,
        'Variação':          calc.variacao,
        'Peso (g)':          calc.pesoGramas ?? '',
        'Plataforma':        ROTULOS[key] ?? key,
        'Custo Produto R$':  calc.custoProduto.toFixed(2),
        'Embalagem R$':      cfg.emb != null ? cfg.emb.toFixed(2) : '',
        'Comissão %':        cfg.com != null ? `${cfg.com.toFixed(1)}%` : '',
        'Preço Ideal R$':    r ? r.preco.toFixed(2) : '',
        'Preço Promoção R$': r ? (Math.round(r.preco * 1.4 * 100) / 100).toFixed(2) : '',
        'Margem %':          r ? `${(r.margem * 100).toFixed(1)}%` : '',
        'Status Margem':     r ? statusMargem(r.margem) : 'SEM_PRECO',
      })
    }
  }

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [12,12,28,16,8,20,14,10,10,12,14,10,14].map(wch => ({ wch }))
  XLSX.utils.book_append_sheet(wb, ws, 'Precificação')

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
