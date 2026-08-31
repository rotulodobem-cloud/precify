import { NextRequest, NextResponse } from 'next/server'
import { cookieValueForRole, Role } from '@/lib/auth'

const LIMITE_TENTATIVAS = 5
const JANELA_MS = 10 * 60 * 1000 // 10 minutos
const BLOQUEIO_MS = 15 * 60 * 1000 // 15 minutos

// Contador em memória por IP -- suficiente porque a aplicação roda numa única
// instância (Railway/next start), não em várias instâncias serverless.
const tentativas = new Map<string, { count: number; primeiraEm: number; bloqueadoAte?: number }>()

function ipDoPedido(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'desconhecido'
}

export async function POST(req: NextRequest) {
  const ip = ipDoPedido(req)
  const agora = Date.now()
  const registro = tentativas.get(ip)

  if (registro?.bloqueadoAte && registro.bloqueadoAte > agora) {
    const minutos = Math.ceil((registro.bloqueadoAte - agora) / 60000)
    return NextResponse.json({ error: `Muitas tentativas. Tente de novo em ${minutos} min.` }, { status: 429 })
  }

  const { username, password } = await req.json()
  const u = typeof username === 'string' ? username : ''
  const p = typeof password === 'string' ? password : ''

  let role: Role | null = null
  if (u && process.env.ADMIN_USER && u === process.env.ADMIN_USER && p === process.env.ADMIN_PASSWORD) {
    role = 'admin'
  } else if (u && process.env.PARTNER_USER && u === process.env.PARTNER_USER && p === process.env.PARTNER_PASSWORD) {
    role = 'partner'
  }

  if (!role) {
    const anterior = tentativas.get(ip)
    const dentroDaJanela = anterior && agora - anterior.primeiraEm < JANELA_MS
    const count = dentroDaJanela ? anterior!.count + 1 : 1
    const primeiraEm = dentroDaJanela ? anterior!.primeiraEm : agora
    const bloqueadoAte = count >= LIMITE_TENTATIVAS ? agora + BLOQUEIO_MS : undefined
    tentativas.set(ip, { count, primeiraEm, bloqueadoAte })
    return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
  }

  tentativas.delete(ip)
  const cookieValue = cookieValueForRole(role)
  if (!cookieValue) {
    return NextResponse.json({ error: 'Configuração do servidor incompleta' }, { status: 500 })
  }

  const res = NextResponse.json({ ok: true, role })
  res.cookies.set('precify_auth', cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 dias
    path: '/',
  })
  return res
}
