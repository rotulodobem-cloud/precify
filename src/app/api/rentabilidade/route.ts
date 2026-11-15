import { NextRequest, NextResponse } from 'next/server'
import { lerRentabilidade, ErroFarol } from '@/lib/giroEstoque'

export const dynamic = 'force-dynamic'

// ?mes=AAAA-MM  rentabilidade por canal no mês (até hoje, se for o mês corrente)
export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const mes = /^\d{4}-\d{2}$/.test(sp.get('mes') ?? '') ? sp.get('mes')! : new Date().toISOString().slice(0, 7)
  const [ano, m] = mes.split('-').map(Number)
  const ultimoDia = new Date(ano, m, 0).getDate()
  const inicio = `${mes}-01`
  const fim = `${mes}-${String(ultimoDia).padStart(2, '0')}`
  try {
    return NextResponse.json(await lerRentabilidade(inicio, fim, sp.get('atualizar') === '1'))
  } catch (e) {
    if (e instanceof ErroFarol) return NextResponse.json({ error: e.mensagem }, { status: 503 })
    throw e
  }
}
