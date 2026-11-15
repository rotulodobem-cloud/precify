import type { NextRequest } from 'next/server'
import { tratarRetornoShopee } from '@/lib/shopeeRetorno'

export const dynamic = 'force-dynamic'

// Retorno sem o estado no caminho: só passa se vier em ?state= e bater com o cookie.
export function GET(req: NextRequest) {
  return tratarRetornoShopee(req, new URL(req.url).searchParams.get('state') ?? '')
}
