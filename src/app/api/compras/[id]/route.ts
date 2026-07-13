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
    },
  })

  // Só recalcula produto/variações/precificações se esta for a compra mais recente do SKU
  const maisRecente = await db.compra.findFirst({
    where: { skuPrincipal: existing.skuPrincipal },
    orderBy: { dataCompra: 'desc' },
  })
  if (maisRecente?.id === params.id) {
    await db.produto.update({
      where: { skuPrincipal: existing.skuPrincipal },
      data: { custoPorKg: custoUnit, custoAtualizado: custoUnit, dataUltimaCompra: dataCompra },
    })
    await recalcularVariacoesEPrecificacoes(existing.skuPrincipal, custoUnit)
  }

  return NextResponse.json(updated)
}
