import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET() {
  const p = await db.plataforma.findMany({ orderBy: { nome: 'asc' } })
  return NextResponse.json(p)
}

export async function POST(req: NextRequest) {
  const b = await req.json()
  const p = await db.plataforma.create({
    data: {
      nome: b.nome, slug: b.slug || b.nome.toLowerCase().replace(/\s/g, '_'),
      comissaoPct: parseFloat(b.comissaoPct),
      taxaFixa: parseFloat(b.taxaFixa ?? 0),
      custoFrete: parseFloat(b.custoFrete ?? 0),
      custoColeta: parseFloat(b.custoColeta ?? 0),
      custoEmbalagem: parseFloat(b.custoEmbalagem ?? 0),
      impostoPct: parseFloat(b.impostoPct ?? 0.08),
      corHex: b.corHex || '#64748b',
      observacoes: b.observacoes || null,
    },
  })
  return NextResponse.json(p, { status: 201 })
}
