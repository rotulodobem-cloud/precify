// Leitura de conferência: últimos pedidos da loja com as taxas que a Shopee
// cobrou em cada um. Serve para validar a ligação antes da sincronização diária.
import { NextRequest, NextResponse } from 'next/server'
import { listarPedidos, rendaDoPedido, ErroShopee } from '@/lib/shopee'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const dias = Math.min(15, Math.max(1, Number(sp.get('dias')) || 7))
  const limite = Math.min(20, Math.max(1, Number(sp.get('limite')) || 10))
  try {
    const pedidos = await listarPedidos(dias, 100)
    const amostra = []
    for (const p of pedidos.slice(0, limite)) {
      try { amostra.push({ status: p.order_status ?? null, ...(await rendaDoPedido(p.order_sn)) }) }
      catch (e) { amostra.push({ orderSn: p.order_sn, status: p.order_status ?? null, erro: (e as Error).message }) }
    }
    return NextResponse.json({ dias, totalNoPeriodo: pedidos.length, amostra })
  } catch (e) {
    if (e instanceof ErroShopee) {
      const status = e.codigo === 'SEM_CONFIG' || e.codigo === 'NAO_CONECTADA' ? 409 : 502
      return NextResponse.json({ error: e.message, codigo: e.codigo }, { status })
    }
    throw e
  }
}
