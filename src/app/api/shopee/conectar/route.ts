// Leva a dona da loja até a Shopee para autorizar o app. Depois de autorizar,
// a Shopee devolve para /api/shopee/callback com o código e o id da loja.
import { NextRequest, NextResponse } from 'next/server'
import { credenciais, urlAutorizacao, ErroShopee } from '@/lib/shopee'
import { origemPublica, CAMINHO_RETORNO } from '@/lib/shopeeUrl'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const origem = origemPublica(req)
  try {
    return NextResponse.redirect(urlAutorizacao(credenciais(), origem + CAMINHO_RETORNO))
  } catch (e) {
    const msg = e instanceof ErroShopee ? e.message : 'Não foi possível montar o link da Shopee.'
    return NextResponse.redirect(`${origem}/painel-marketplaces?shopee=erro&motivo=${encodeURIComponent(msg)}`)
  }
}
