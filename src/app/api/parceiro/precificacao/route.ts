import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  const plataforma = searchParams.get('plataforma')?.trim()

  const where: Record<string, unknown> = {}
  if (q) where.OR = [
    { skuVariacao: { contains: q, mode: 'insensitive' } },
    { variacao: { produto: { nome: { contains: q, mode: 'insensitive' } } } },
    { variacao: { produto: { skuPrincipal: { contains: q, mode: 'insensitive' } } } },
  ]
  if (plataforma) where.plataforma = { nome: plataforma }

  const precs = await db.precificacao.findMany({
    where,
    select: {
      id: true,
      codigoAnuncio: true,
      precoIdeal: true,
      precoPromocional: true,
      plataforma: { select: { nome: true } },
      variacao: {
        select: {
          skuVariacao: true,
          nomeVariacao: true,
          produto: { select: { nome: true, skuPrincipal: true } },
        },
      },
    },
    orderBy: [
      { variacao: { skuPrincipal: 'asc' } },
      { variacao: { pesoGramas: 'asc' } },
      { plataforma: { nome: 'asc' } },
    ],
  })
  return NextResponse.json(precs)
}
