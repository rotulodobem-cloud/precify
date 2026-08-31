import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { roleFromCookie } from '@/lib/auth'
import db from '@/lib/db'

function exigirAdmin() {
  const role = roleFromCookie(cookies().get('precify_auth')?.value)
  return role === 'admin'
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!exigirAdmin()) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  await db.apiKey.update({ where: { id: params.id }, data: { ativa: false } })
  return NextResponse.json({ ok: true })
}
