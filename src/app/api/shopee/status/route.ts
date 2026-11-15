import { NextResponse } from 'next/server'
import { credenciais, lerConexao, desconectar, ehSandbox, ErroShopee } from '@/lib/shopee'

export const dynamic = 'force-dynamic'

// Situação da ligação com a Shopee. Nunca devolve token nem chave.
export async function GET() {
  let ambiente: 'teste' | 'producao' | null = null
  try { ambiente = ehSandbox(credenciais().host) ? 'teste' : 'producao' }
  catch (e) { if (!(e instanceof ErroShopee)) throw e }
  if (!ambiente) return NextResponse.json({ configurada: false, conectada: false })
  const con = await lerConexao()
  return NextResponse.json({
    configurada: true, ambiente,
    conectada: !!con,
    shopId: con?.shopId ?? null,
    conectadaEm: con?.atualizadoEm ?? null,
    // tokens de um ambiente não valem no outro
    ambienteDaConexao: con?.ambiente ?? null,
  })
}

export async function DELETE() {
  await desconectar()
  return NextResponse.json({ ok: true })
}
