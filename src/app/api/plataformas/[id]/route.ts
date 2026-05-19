import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json()
  const p = await db.plataforma.update({
    where: { id: params.id },
    data: {
      nome: b.nome, comissaoPct: parseFloat(b.comissaoPct),
      taxaFixa: parseFloat(b.taxaFixa ?? 0), custoFrete: parseFloat(b.custoFrete ?? 0),
      custoColeta: parseFloat(b.custoColeta ?? 0), impostoPct: parseFloat(b.impostoPct ?? 0.08),
      corHex: b.corHex || '#64748b', observacoes: b.observacoes || null, ativa: b.ativa ?? true,
    },
  })
  return NextResponse.json(p)
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await db.plataforma.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
