import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { processarUpload } from '@/lib/uploadRelatorio'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Entrada da tarefa agendada (chat, 8h): recebe o relatório de anúncios baixado do
 * Drive e devolve o resumo pronto para mandar no chat. Autenticada por token próprio
 * (header x-ingestao-token), não pelo login do painel.
 *
 *   curl -X POST https://<painel>/api/ingestao -H "x-ingestao-token: $INGESTAO_TOKEN" \
 *        -F arquivo=@relatorio.xlsx -F capturado_em=2026-09-25
 */
function tokenOk(recebido: string | null) {
  const esperado = process.env.INGESTAO_TOKEN
  if (!esperado || !recebido || esperado.length < 16) return false
  const a = Buffer.from(recebido), b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  if (!tokenOk(req.headers.get('x-ingestao-token'))) return NextResponse.json({ error: 'Token inválido.' }, { status: 401 })
  return processarUpload(req)
}
