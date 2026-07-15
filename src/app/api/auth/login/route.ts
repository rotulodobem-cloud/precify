import { NextRequest, NextResponse } from 'next/server'
import { cookieValueForRole, Role } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()
  const u = typeof username === 'string' ? username : ''
  const p = typeof password === 'string' ? password : ''

  let role: Role | null = null
  if (u && process.env.ADMIN_USER && u === process.env.ADMIN_USER && p === process.env.ADMIN_PASSWORD) {
    role = 'admin'
  } else if (u && process.env.PARTNER_USER && u === process.env.PARTNER_USER && p === process.env.PARTNER_PASSWORD) {
    role = 'partner'
  }

  if (!role) {
    return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
  }

  const cookieValue = cookieValueForRole(role)
  if (!cookieValue) {
    return NextResponse.json({ error: 'Configuração do servidor incompleta' }, { status: 500 })
  }

  const res = NextResponse.json({ ok: true, role })
  res.cookies.set('precify_auth', cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 dias
    path: '/',
  })
  return res
}
