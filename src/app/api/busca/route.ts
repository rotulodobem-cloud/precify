import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ results: [] })

  // Busca produto pelo SKU principal OU variação
  const produtos = await db.produto.findMany({
    where: {
      OR: [
        { skuPrincipal: { contains: q, mode: 'insensitive' } },
        { nome: { contains: q, mode: 'insensitive' } },
        { variacoes: { some: { skuVariacao: { contains: q, mode: 'insensitive' } } } },
      ],
    },
    include: {
      variacoes: {
        include: { precificacoes: { include: { plataforma: true } } },
        orderBy: { pesoGramas: 'asc' },
      },
      compras: { orderBy: { dataCompra: 'desc' }, take: 3 },
    },
    take: 10,
  })

  return NextResponse.json({ results: produtos })
}
