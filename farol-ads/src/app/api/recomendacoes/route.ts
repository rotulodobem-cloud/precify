import { NextResponse, type NextRequest } from 'next/server'
import { atualizar, inserir, lerTabelaServico } from '@/lib/supabase'

const STATUS = ['pendente', 'aplicada', 'ignorada', 'resolvida']

/**
 * Registra o que a Michele fez com uma recomendação. "aplicada" também grava uma
 * alteração em ads_alteracoes — isso liga a trava de observação (6.3) e conta como
 * "já tentou ajustar" para o motor.
 */
export async function PATCH(req: NextRequest) {
  const { id, status } = await req.json().catch(() => ({}))
  if (typeof id !== 'string' || !STATUS.includes(status)) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Modo demonstração: nada é gravado.' }, { status: 409 })
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Recomendação inválida.' }, { status: 400 })
  const [rec] = await lerTabelaServico<{ id: string; canal: string; codigo_anuncio: string; estado: string; acao_recomendada: string }>(
    'ads_recomendacoes_historico', { id: `eq.${id}` }, 'id,canal,codigo_anuncio,estado,acao_recomendada')
  if (!rec) return NextResponse.json({ error: 'Recomendação não encontrada.' }, { status: 404 })
  await atualizar('ads_recomendacoes_historico', { id: `eq.${id}` }, { status_recomendacao: status, resolvido_em: status === 'pendente' ? null : new Date().toISOString() })
  if (status === 'aplicada') {
    await inserir('ads_alteracoes', [{
      canal: rec.canal, codigo_anuncio: rec.codigo_anuncio, tipo_ultima_alteracao: rec.estado === 'OTIMIZAR' ? 'outro' : 'orcamento',
      valor_novo: rec.acao_recomendada, recomendacao_origem: rec.id, registrado_por: 'painel',
    }])
  }
  return NextResponse.json({ ok: true })
}
