// Retorno da autorização da Shopee: troca o código pelos tokens da loja e
// volta para o painel de marketplaces com o resultado. Usado pelas duas rotas
// de retorno (com o estado no caminho ou na query).
// A rota fica atrás do login do sistema (middleware) e só aceita o retorno de
// uma autorização que este mesmo navegador iniciou há pouco.
import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { credenciais, trocarCodigo, ErroShopee } from '@/lib/shopee'
import { origemPublica, CAMINHO_RETORNO, COOKIE_ESTADO } from '@/lib/shopeeUrl'

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

/** `estadoRecebido` vem do caminho da URL (preferido) ou do parâmetro state. */
export async function tratarRetornoShopee(req: NextRequest, estadoRecebido: string) {
  const origem = origemPublica(req)
  const sp = new URL(req.url).searchParams
  const code = sp.get('code'), shopId = sp.get('shop_id')

  const voltar = (q: string) => {
    const res = NextResponse.redirect(`${origem}/painel-marketplaces?${q}`)
    // o valor serve para uma única autorização
    res.cookies.set(COOKIE_ESTADO, '', { httpOnly: true, sameSite: 'lax', maxAge: 0, path: CAMINHO_RETORNO })
    return res
  }
  const erro = (motivo: string) => voltar(`shopee=erro&motivo=${encodeURIComponent(motivo)}`)

  // O estado precisa vir na URL e bater com o cookie gravado em /api/shopee/conectar.
  const guardado = req.cookies.get(COOKIE_ESTADO)?.value ?? ''
  const recebido = estadoRecebido
  if (!guardado || !recebido || !iguais(guardado, recebido)) {
    return erro('Este retorno não corresponde a uma autorização iniciada agora neste navegador. Clique em "Autorizar loja" e tente de novo.')
  }

  if (!code || !shopId || !/^\d+$/.test(shopId)) {
    // main_account_id vem quando a autorização é feita por conta principal de várias lojas
    return erro(sp.get('main_account_id')
      ? 'A autorização veio de uma conta principal com várias lojas, que este sistema ainda não trata.'
      : 'A Shopee não devolveu o código de autorização.')
  }
  try {
    await trocarCodigo(credenciais(), code, shopId)
    return voltar('shopee=conectada')
  } catch (e) {
    return erro(e instanceof ErroShopee ? e.message : 'Falha ao trocar o código da Shopee pelos tokens.')
  }
}
