import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()

  if (
    username === process.env.ADMIN_USER &&
    password === process.env.ADMIN_PASSWORD
  ) {
    const res = NextResponse.json({ ok: true })
    res.cookies.set('precify_auth', process.env.NEXTAUTH_SECRET!, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 dias
      path: '/',
    })
    return res
  }

  return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
}