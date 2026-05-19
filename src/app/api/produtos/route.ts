import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')
  const status = searchParams.get('status')
  const categoria = searchParams.get('categoria')

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (categoria && categoria !== 'Todas') where.categoria = categoria
  if (q) where.OR = [
    { nome: { contains: q } },
    { skuPrincipal: { contains: q } },
    { categoria: { contains: q } },
  ]

  const [produtos, categorias] = await Promise.all([
    db.produto.findMany({
      where,
      include: {
        variacoes: {
          where: { status: 'ativo' },
          include: { precificacoes: { include: { plataforma: true } } },
          orderBy: { pesoGramas: 'asc' },
        }
      },
      orderBy: { nome: 'asc' },
    }),
    db.produto.findMany({ select: { categoria: true }, distinct: ['categoria'] }),
  ])

  return NextResponse.json({
    produtos,
    categorias: categorias.map(c => c.categoria).sort(),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { skuPrincipal, nome, categoria, unidadeCompra, custoPorKg, custoUnitario, fornecedorPrincipal, tipoPrecificacao, observacoes } = body

  if (!skuPrincipal?.trim() || !nome?.trim())
    return NextResponse.json({ error: 'SKU e nome são obrigatórios' }, { status: 400 })

  const exists = await db.produto.findUnique({ where: { skuPrincipal } })
  if (exists) return NextResponse.json({ error: 'SKU já cadastrado' }, { status: 409 })

  const custo = custoPorKg ? parseFloat(custoPorKg) : custoUnitario ? parseFloat(custoUnitario) : null

  const p = await db.produto.create({
    data: {
      skuPrincipal: skuPrincipal.trim(),
      nome: nome.trim(),
      categoria: categoria || 'Geral',
      unidadeCompra: unidadeCompra || 'kg',
      custoPorKg: custoPorKg ? parseFloat(custoPorKg) : null,
      custoUnitario: custoUnitario ? parseFloat(custoUnitario) : null,
      custoAtualizado: custo,
      fornecedorPrincipal: fornecedorPrincipal || null,
      tipoPrecificacao: tipoPrecificacao || 'peso_proporcional',
      observacoes: observacoes || null,
    },
  })
  return NextResponse.json(p, { status: 201 })
}
