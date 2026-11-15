// Leva a dona da loja até a Shopee para autorizar o app. Depois de autorizar,
// a Shopee devolve para /api/shopee/callback com o código e o id da loja.
import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { credenciais, urlAutorizacao, ErroShopee } from '@/lib/shopee'
import { origemPublica, CAMINHO_RETORNO, COOKIE_ESTADO, VALIDADE_ESTADO_S } from '@/lib/shopeeUrl'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const origem = origemPublica(req)
  try {
    // Amarra a autorização a este navegador: o retorno só é aceito se trouxer o
    // mesmo valor guardado aqui. Sem isso, um link forjado poderia ligar o
    // sistema à loja de outra pessoa.
    const estado = crypto.randomBytes(32).toString('hex')
    const retorno = `${origem}${CAMINHO_RETORNO}/${estado}`
    const res = NextResponse.redirect(urlAutorizacao(credenciais(), retorno))
    res.cookies.set(COOKIE_ESTADO, estado, {
      httpOnly: true, sameSite: 'lax', secure: origem.startsWith('https://'),
      maxAge: VALIDADE_ESTADO_S, path: CAMINHO_RETORNO,
    })
    return res
  } catch (e) {
    const msg = e instanceof ErroShopee ? e.message : 'Não foi possível montar o link da Shopee.'
    return NextResponse.redirect(`${origem}/painel-marketplaces?shopee=erro&motivo=${encodeURIComponent(msg)}`)
  }
}
