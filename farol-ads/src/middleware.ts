import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_SESSAO, validarSessao } from '@/lib/auth'

// Login próprio (não aberto por link): tudo exige sessão, menos a tela de login e a
// rota de ingestão (que é autenticada por token próprio, ver api/ingestao/route.ts).
const PUBLICAS = ['/login', '/api/auth/login', '/api/auth/logout', '/api/ingestao']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLICAS.includes(pathname)) return NextResponse.next()
  const usuario = await validarSessao(req.cookies.get(COOKIE_SESSAO)?.value)
  if (usuario) return NextResponse.next()
  if (pathname.startsWith('/api')) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const url = new URL('/login', req.url)
  if (pathname !== '/') url.searchParams.set('voltar', pathname + req.nextUrl.search)
  return NextResponse.redirect(url)
}

export const config = { matcher: ['/((?!_next|favicon.ico|icon.svg).*)'] }
