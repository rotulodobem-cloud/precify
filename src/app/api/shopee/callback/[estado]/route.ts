import type { NextRequest } from 'next/server'
import { tratarRetornoShopee } from '@/lib/shopeeRetorno'

export const dynamic = 'force-dynamic'

// O estado vai no caminho da URL, e não na query, porque a Shopee monta o
// retorno acrescentando ?code=…&shop_id=… e não há garantia de que preserve
// parâmetros que já estavam lá. O caminho ela não altera.
export function GET(req: NextRequest, { params }: { params: { estado: string } }) {
  return tratarRetornoShopee(req, params.estado ?? '')
}
