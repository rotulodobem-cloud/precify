import { NextRequest, NextResponse } from 'next/server'
import { montarSugestoes, resumirSugestoes, ErroFarol } from '@/lib/giroEstoque'

export const dynamic = 'force-dynamic'

// ?cobertura=30  dias de estoque que a compra deve cobrir
// ?atualizar=1   ignora o cache de 10 minutos
// ?resumo=1      só os números e as listas curtas (Dashboard)
export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const coberturaDias = Math.min(180, Math.max(7, Number(sp.get('cobertura')) || 30))
  try {
    const s = await montarSugestoes(coberturaDias, sp.get('atualizar') === '1')
    return NextResponse.json(sp.get('resumo') === '1' ? resumirSugestoes(s) : s)
  } catch (e) {
    if (e instanceof ErroFarol) return NextResponse.json({ error: e.mensagem }, { status: 503 })
    throw e
  }
}
