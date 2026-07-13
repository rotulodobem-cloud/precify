import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { round2 } from '@/lib/calculos'
import { recalcularVariacoesEPrecificacoes } from '@/lib/saveCompra'

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await db.compra.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json()
  const existing = await db.compra.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Compra não encontrada' }, { status: 404 })

  const dataCompra = b.dataCompra
    ? (String(b.dataCompra).includes('T') ? new Date(b.dataCompra) : new Date(b.dataCompra + 'T12:00:00'))
    : existing.dataCompra
  const quantidade = b.quantidade != null ? parseFloat(b.quantidade) : existing.quantidade
  const custoTotal = b.custoTotal != null ? parseFloat(b.custoTotal) : existing.custoTotal
  const custoUnit  = round2(custoTotal / quantidade)
  const precoVenda = b.precoVenda !== undefined ? (b.precoVenda ? parseFloat(b.precoVenda) : null) : existing.precoVenda
  const impostoPct = b.impostoPct != null ? parseFloat(b.impostoPct) : existing.impostoPct

  // Recalcula margem/statusFinanceiro da própria compra editada (mesma fórmula de saveCompra.ts)
  let margem: number | null = null
  let statusFinanceiro: string | null = null
  if (precoVenda && precoVenda > 0) {
    const receitaLiq = precoVenda * (1 - impostoPct)
    margem = (receitaLiq - custoUnit) / precoVenda
    statusFinanceiro = margem >= 0.25 ? 'Lucro' : margem >= 0 ? 'Atenção' : 'Prejuízo'
  } else {
    statusFinanceiro = 'Sem preço de venda'
  }

  const updated = await db.compra.update({
    where: { id: params.id },
    data: {
      dataCompra,
      nomeProduto:  b.nomeProduto ?? existing.nomeProduto,
      fornecedor:   b.fornecedor ?? existing.fornecedor,
      quantidade, custoTotal, custoUnitario: custoUnit,
      frete:        b.frete != null ? parseFloat(b.frete) : existing.frete,
      outrosCustos: b.outrosCustos != null ? parseFloat(b.outrosCustos) : existing.outrosCustos,
      numeroNF:     b.numeroNF !== undefined ? (b.numeroNF || null) : existing.numeroNF,
      numeroPedido: b.numeroPedido !== undefined ? (b.numeroPedido || null) : existing.numeroPedido,
      precoVenda,
      margem, statusFinanceiro,
    },
  })

  // Sincroniza Produto/variações/precificações com a compra que for de fato a mais recente
  // do SKU após a edição — pode não ser mais a compra que acabou de ser editada (ex.: mudança
  // de data que a "empurra" para trás na ordem cronológica).
  // NÃO tenta recalcular custoAnterior/variacaoPct/statusVariacao (nem em cascata para outras
  // compras que referenciavam esta como "compra anterior") — fora do escopo deste fix.
  const maisRecente = await db.compra.findFirst({
    where: { skuPrincipal: existing.skuPrincipal },
    orderBy: { dataCompra: 'desc' },
  })
  if (maisRecente) {
    await db.produto.update({
      where: { skuPrincipal: existing.skuPrincipal },
      data: {
        custoPorKg: maisRecente.custoUnitario,
        custoAtualizado: maisRecente.custoUnitario,
        dataUltimaCompra: maisRecente.dataCompra,
      },
    })
    await recalcularVariacoesEPrecificacoes(existing.skuPrincipal, maisRecente.custoUnitario)
  }

  return NextResponse.json(updated)
}
