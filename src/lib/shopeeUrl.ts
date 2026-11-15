import type { NextRequest } from 'next/server'

/**
 * Endereço público do sistema. Atrás do proxy do Railway, req.url traz o
 * endereço interno; o público vem nos cabeçalhos x-forwarded-*.
 */
export function origemPublica(req: NextRequest): string {
  if (process.env.PRECIFY_URL) return process.env.PRECIFY_URL.replace(/\/+$/, '')
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https')
  return host ? `${proto}://${host}` : new URL(req.url).origin
}

export const CAMINHO_RETORNO = '/api/shopee/callback'
