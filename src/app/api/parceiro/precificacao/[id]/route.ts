import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

const CANAIS_PARCEIRO = ['mlFull', 'mlClassico', 'sh', 'tt']

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const separador = params.id.lastIndexOf('-')
  const calculoId = separador > 0 ? params.id.slice(0, separador) : ''
  const canalKey = separador > 0 ? params.id.slice(separador + 1) : ''
  if (!calculoId || !CANAIS_PARCEIRO.includes(canalKey)) return NextResponse.json({ error: 'Identificador inválido' }, { status: 400 })

  const b = await req.json()
  const codigoAnuncio = typeof b.codigoAnuncio === 'string' ? b.codigoAnuncio.trim() : ''

  const atual = await db.calculoMulticanal.findUnique({ where: { id: calculoId }, select: { codigosAnuncio: true, canaisAtivos: true } })
  if (!atual) return NextResponse.json({ error: 'Registro não encontrado' }, { status: 404 })

  const ativos = (atual.canaisAtivos ?? {}) as Record<string, boolean>
  if (!ativos[canalKey]) return NextResponse.json({ error: 'Canal não anunciado' }, { status: 404 })

  const codigos = { ...((atual.codigosAnuncio ?? {}) as Record<string, string | null>), [canalKey]: codigoAnuncio || null }

  await db.calculoMulticanal.update({
    where: { id: calculoId },
    data: { codigosAnuncio: codigos },
  })
  return NextResponse.json({ id: params.id, codigoAnuncio: codigoAnuncio || null })
}
