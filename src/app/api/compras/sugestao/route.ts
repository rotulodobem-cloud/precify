import { NextRequest, NextResponse } from 'next/server'
import { montarSugestoes, resumirSugestoes, ErroFarol } from '@/lib/giroEstoque'

export const dynamic = 'force-dynamic'

// ?cobertura=30  dias de estoque que a compra deve cobrir
// ?reforco=30  reforço de temporada em % sobre a venda prevista (0 a 200)
// ?atualizar=1   ignora o cache de 10 minutos
// ?sku=AB0001  só esse produto (aba Montar pedido)
// ?resumo=1      só os números e as listas curtas (Dashboard)
export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const coberturaDias = Math.min(180, Math.max(7, Number(sp.get('cobertura')) || 30))
  const reforco = Math.min(200, Math.max(0, Number(sp.get('reforco')) || 0)) / 100
  try {
    const s = await montarSugestoes(coberturaDias, sp.get('atualizar') === '1', reforco)
    const sku = sp.get('sku')
    if (sku) {
      // Montar pedido: só o produto buscado (null se não tem venda)
      const item = s.itens.find(i => i.sku.toLowerCase() === sku.toLowerCase()) ?? null
      return NextResponse.json({ coberturaDias: s.coberturaDias, item })
    }
    return NextResponse.json(sp.get('resumo') === '1' ? resumirSugestoes(s) : s)
  } catch (e) {
    if (e instanceof ErroFarol) return NextResponse.json({ error: e.mensagem }, { status: 503 })
    throw e
  }
}
