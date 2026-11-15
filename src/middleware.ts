import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { roleFromCookie } from '@/lib/auth'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isApi = pathname.startsWith('/api')
  const isPublic = pathname === '/login'
    || pathname === '/api/auth/login'
    || pathname === '/api/auth/logout'
    || pathname === '/api/gestao' // API pública -- autenticada por chave própria, não por cookie (ver route.ts)

  if (isPublic) return NextResponse.next()

  const role = roleFromCookie(request.cookies.get('precify_auth')?.value)

  if (!role) {
    if (isApi) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|favicon.ico).*)'],
}
