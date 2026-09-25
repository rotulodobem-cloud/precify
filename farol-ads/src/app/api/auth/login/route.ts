import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_SESSAO, VALIDADE_SEG, credenciaisValidas, criarSessao } from '@/lib/auth'

const LIMITE = 5
const JANELA_MS = 10 * 60 * 1000
const BLOQUEIO_MS = 15 * 60 * 1000
// Em memória por instância: no Vercel limita por instância quente, o que já corta
// força bruta simples. Para algo mais forte, mover para uma tabela no Supabase.
const tentativas = new Map<string, { n: number; desde: number; bloqueadoAte?: number }>()

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'desconhecido'
  const agora = Date.now()
  const reg = tentativas.get(ip)
  if (reg?.bloqueadoAte && reg.bloqueadoAte > agora) {
    return NextResponse.json({ error: `Muitas tentativas. Tente de novo em ${Math.ceil((reg.bloqueadoAte - agora) / 60000)} min.` }, { status: 429 })
  }
  const corpo = await req.json().catch(() => ({}))
  const usuario = typeof corpo.usuario === 'string' ? corpo.usuario : ''
  const senha = typeof corpo.senha === 'string' ? corpo.senha : ''

  if (!process.env.PAINEL_USUARIO || !process.env.PAINEL_SENHA || !process.env.PAINEL_SEGREDO) {
    return NextResponse.json({ error: 'Login não configurado no servidor (PAINEL_USUARIO, PAINEL_SENHA, PAINEL_SEGREDO).' }, { status: 500 })
  }
  if (!credenciaisValidas(usuario, senha)) {
    const dentro = reg && agora - reg.desde < JANELA_MS
    const n = dentro ? reg!.n + 1 : 1
    tentativas.set(ip, { n, desde: dentro ? reg!.desde : agora, bloqueadoAte: n >= LIMITE ? agora + BLOQUEIO_MS : undefined })
    return NextResponse.json({ error: 'Usuário ou senha incorretos.' }, { status: 401 })
  }
  tentativas.delete(ip)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_SESSAO, await criarSessao(usuario), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: VALIDADE_SEG,
  })
  return res
}
