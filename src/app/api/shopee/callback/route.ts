// Retorno da autorização da Shopee: troca o código pelos tokens da loja e
// volta para o painel de marketplaces com o resultado.
import { NextRequest, NextResponse } from 'next/server'
import { credenciais, trocarCodigo, ErroShopee } from '@/lib/shopee'
import { origemPublica } from '@/lib/shopeeUrl'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const origem = origemPublica(req)
  const sp = new URL(req.url).searchParams
  const code = sp.get('code'), shopId = sp.get('shop_id')
  const voltar = (q: string) => NextResponse.redirect(`${origem}/painel-marketplaces?${q}`)

  if (!code || !shopId || !/^\d+$/.test(shopId)) {
    // main_account_id vem quando a autorização é feita por conta principal de várias lojas
    const motivo = sp.get('main_account_id')
      ? 'A autorização veio de uma conta principal com várias lojas, que este sistema ainda não trata.'
      : 'A Shopee não devolveu o código de autorização.'
    return voltar(`shopee=erro&motivo=${encodeURIComponent(motivo)}`)
  }
  try {
    await trocarCodigo(credenciais(), code, shopId)
    return voltar('shopee=conectada')
  } catch (e) {
    const msg = e instanceof ErroShopee ? e.message : 'Falha ao trocar o código da Shopee pelos tokens.'
    return voltar(`shopee=erro&motivo=${encodeURIComponent(msg)}`)
  }
}
