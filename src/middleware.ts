import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const auth = request.cookies.get('precify_auth')?.value
  const isLoginPage = request.nextUrl.pathname === '/login'
  const isApi = request.nextUrl.pathname.startsWith('/api')

  if (isApi || isLoginPage) return NextResponse.next()

  if (auth !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|favicon.ico).*)'],
}