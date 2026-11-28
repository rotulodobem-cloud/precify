import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { montarComponentes, numeroForm, respostaErro } from '@/lib/kits'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')
  const status = searchParams.get('status')

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (q) where.OR = [
    { skuKit: { contains: q, mode: 'insensitive' } },
    { nome: { contains: q, mode: 'insensitive' } },
  ]

  const kits = await db.kit.findMany({
    where,
    include: { componentes: { orderBy: { createdAt: 'asc' } } },
    orderBy: { nome: 'asc' },
  })
  return NextResponse.json(kits)
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    const skuKit = typeof b.skuKit === 'string' ? b.skuKit.trim() : ''
    const nome = typeof b.nome === 'string' ? b.nome.trim() : ''
    if (!skuKit || !nome) return NextResponse.json({ error: 'SKU e nome são obrigatórios' }, { status: 400 })

    const exists = await db.kit.findFirst({ where: { skuKit: { equals: skuKit, mode: 'insensitive' } } })
    if (exists) return NextResponse.json({ error: `O kit ${exists.skuKit} já está cadastrado. Use o lápis na lista para editar.` }, { status: 409 })

    const { dados, custoTotal } = await montarComponentes(Array.isArray(b.componentes) ? b.componentes : [])
    const custoEmbalagem = numeroForm(b.custoEmbalagem) ?? 0

    const kit = await db.kit.create({
      data: {
        skuKit, nome,
        categoria:      b.categoria || 'Kits',
        custoTotal:     Math.round((custoTotal + custoEmbalagem) * 10000) / 10000,
        custoEmbalagem,
        observacoes:    b.observacoes || null,
        status:         b.status || 'ativo',
        componentes:    { create: dados },
      },
      include: { componentes: true },
    })
    return NextResponse.json(kit, { status: 201 })
  } catch (e) {
    const { status, corpo } = respostaErro(e)
    return NextResponse.json(corpo, { status })
  }
}
