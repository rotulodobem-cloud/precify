import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  const vencendo = searchParams.get('vencendo')

  const where: Record<string, unknown> = {}
  if (q) where.numeroLote = { contains: q }
  if (vencendo) {
    const limite = new Date()
    limite.setDate(limite.getDate() + 30)
    where.dataValidade = { lte: limite }
  }

  const lotes = await db.lote.findMany({
    where,
    include: { compra: { select: { skuPrincipal: true, nomeProduto: true, fornecedor: true, dataCompra: true, numeroNF: true, numeroPedido: true } } },
    orderBy: { dataValidade: 'asc' },
    take: 500,
  })
  return NextResponse.json(lotes)
}

export async function POST(req: NextRequest) {
  const b = await req.json()
  if (!b.compraId) return NextResponse.json({ error: 'Compra é obrigatória' }, { status: 400 })
  if (!b.quantidade) return NextResponse.json({ error: 'Quantidade é obrigatória' }, { status: 400 })
  if (!b.dataValidade) return NextResponse.json({ error: 'Data de validade é obrigatória' }, { status: 400 })

  const compra = await db.compra.findUnique({ where: { id: b.compraId } })
  if (!compra) return NextResponse.json({ error: 'Compra não encontrada' }, { status: 404 })

  let numeroLote = String(b.numeroLote ?? '').trim()
  let geradoAuto = false

  if (!numeroLote) {
    geradoAuto = true
    const stamp = compra.dataCompra.toISOString().slice(0, 10).replace(/-/g, '')
    const base = `${stamp}-${compra.skuPrincipal}`
    let candidato = base
    let sufixo = 1
    while (await db.lote.findFirst({ where: { numeroLote: candidato } })) {
      sufixo += 1
      candidato = `${base}-${sufixo}`
    }
    numeroLote = candidato
  }

  const lote = await db.lote.create({
    data: {
      compraId: b.compraId,
      numeroLote, geradoAuto,
      quantidade: parseFloat(b.quantidade),
      dataValidade: new Date(String(b.dataValidade).includes('T') ? b.dataValidade : b.dataValidade + 'T12:00:00'),
    },
    include: { compra: { select: { skuPrincipal: true, nomeProduto: true, fornecedor: true, dataCompra: true, numeroNF: true, numeroPedido: true } } },
  })
  return NextResponse.json(lote, { status: 201 })
}
