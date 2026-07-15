import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { roleFromCookie } from '@/lib/auth'

const PARTNER_PAGE = '/parceiro'
const PARTNER_API_PREFIX = '/api/parceiro'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isApi = pathname.startsWith('/api')
  const isPublic = pathname === '/login'
    || pathname === '/api/auth/login'
    || pathname === '/api/auth/logout'

  if (isPublic) return NextResponse.next()

  const role = roleFromCookie(request.cookies.get('precify_auth')?.value)

  if (!role) {
    if (isApi) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (role === 'partner') {
    const allowed = isApi
      ? (pathname === PARTNER_API_PREFIX || pathname.startsWith(PARTNER_API_PREFIX + '/'))
      : pathname === PARTNER_PAGE
    if (!allowed) {
      if (isApi) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
      return NextResponse.redirect(new URL(PARTNER_PAGE, request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|favicon.ico).*)'],
}
