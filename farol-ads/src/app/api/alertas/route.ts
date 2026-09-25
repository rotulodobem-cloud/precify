import { NextResponse, type NextRequest } from 'next/server'
import { atualizar } from '@/lib/supabase'

const STATUS = ['aberto', 'em_analise', 'resolvido']

export async function PATCH(req: NextRequest) {
  const { id, status } = await req.json().catch(() => ({}))
  if (typeof id !== 'string' || !STATUS.includes(status)) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Modo demonstração: nada é gravado.' }, { status: 409 })
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Alerta inválido.' }, { status: 400 })
  await atualizar('ads_alertas', { id: `eq.${id}` }, { status, lido: true, resolvido_em: status === 'resolvido' ? new Date().toISOString() : null })
  return NextResponse.json({ ok: true })
}
