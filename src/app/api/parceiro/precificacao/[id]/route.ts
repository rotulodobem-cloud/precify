import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json()
  const codigoAnuncio = typeof b.codigoAnuncio === 'string' ? b.codigoAnuncio.trim() : ''

  try {
    const p = await db.precificacao.update({
      where: { id: params.id },
      data: { codigoAnuncio: codigoAnuncio || null },
      select: { id: true, codigoAnuncio: true },
    })
    return NextResponse.json(p)
  } catch {
    return NextResponse.json({ error: 'Registro não encontrado' }, { status: 404 })
  }
}
