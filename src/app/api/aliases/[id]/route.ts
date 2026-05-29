import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await db.fornecedorAlias.update({ where: { id: params.id }, data: { ativo: false } })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json()
  const a = await db.fornecedorAlias.update({
    where: { id: params.id },
    data: { nomeNoFornecedor: b.nomeNoFornecedor?.trim(), codigoFornecedor: b.codigoFornecedor?.trim() || null, embalagem: b.embalagem?.trim() || null, ultimoPreco: b.ultimoPreco ? parseFloat(b.ultimoPreco) : undefined },
  })
  return NextResponse.json(a)
}
