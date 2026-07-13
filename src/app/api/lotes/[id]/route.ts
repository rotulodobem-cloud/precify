import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const lote = await db.lote.findUnique({
    where: { id: params.id },
    include: { compra: { select: { skuPrincipal: true, nomeProduto: true, fornecedor: true, dataCompra: true, numeroNF: true, numeroPedido: true } } },
  })
  if (!lote) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(lote)
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await db.lote.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
