import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET() {
  const fornecedores = await db.fornecedor.findMany({
    where: { ativo: true },
    orderBy: { nome: 'asc' },
  })
  // Também buscar fornecedores das compras que não estão cadastrados
  const doCompras = await db.compra.findMany({
    select: { fornecedor: true },
    distinct: ['fornecedor'],
    where: { fornecedor: { not: '' } },
  })
  const nomesDb = new Set(fornecedores.map(f => f.nome))
  const extras = doCompras.filter(c => !nomesDb.has(c.fornecedor)).map(c => ({ id: c.fornecedor, nome: c.fornecedor, contato: null, obs: null, ativo: true }))
  return NextResponse.json([...fornecedores, ...extras])
}

export async function POST(req: NextRequest) {
  const b = await req.json()
  if (!b.nome?.trim()) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 })
  const exists = await db.fornecedor.findUnique({ where: { nome: b.nome.trim() } })
  if (exists) return NextResponse.json({ error: 'Fornecedor já cadastrado' }, { status: 409 })
  const f = await db.fornecedor.create({
    data: { nome: b.nome.trim(), contato: b.contato || null, obs: b.obs || null },
  })
  return NextResponse.json(f, { status: 201 })
}
