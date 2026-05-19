import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await db.compra.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
