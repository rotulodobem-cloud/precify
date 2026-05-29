import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const f = searchParams.get('fornecedor')
  const s = searchParams.get('sku')
  const w: Record<string, unknown> = { ativo: true }
  if (f) w.fornecedor = f
  if (s) w.skuPrincipal = s
  const a = await db.fornecedorAlias.findMany({
    where: w,
    include: { produto: { select: { nome: true } } },
    orderBy: [{ fornecedor: 'asc' }, { nomeNoFornecedor: 'asc' }],
  })
  return NextResponse.json(a)
}

export async function POST(req: NextRequest) {
  const b = await req.json()
  if (!b.skuPrincipal || !b.fornecedor || !b.nomeNoFornecedor)
    return NextResponse.json({ error: 'Campos obrigatorios' }, { status: 400 })
  const p = await db.produto.findUnique({ where: { skuPrincipal: b.skuPrincipal } })
  if (!p) return NextResponse.json({ error: 'SKU nao encontrado' }, { status: 404 })
  const a = await db.fornecedorAlias.upsert({
    where: { fornecedor_nomeNoFornecedor: { fornecedor: b.fornecedor.trim(), nomeNoFornecedor: b.nomeNoFornecedor.trim() } },
    update: { skuPrincipal: b.skuPrincipal, codigoFornecedor: b.codigoFornecedor || null, embalagem: b.embalagem || null, ultimoPreco: b.ultimoPreco ? parseFloat(b.ultimoPreco) : null, dataUltimoPreco: b.ultimoPreco ? new Date() : undefined, ativo: true },
    create: { skuPrincipal: b.skuPrincipal, fornecedor: b.fornecedor.trim(), nomeNoFornecedor: b.nomeNoFornecedor.trim(), codigoFornecedor: b.codigoFornecedor || null, embalagem: b.embalagem || null, ultimoPreco: b.ultimoPreco ? parseFloat(b.ultimoPreco) : null, dataUltimoPreco: b.ultimoPreco ? new Date() : null },
  })
  return NextResponse.json(a, { status: 201 })
}
