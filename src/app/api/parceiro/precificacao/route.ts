import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { CANAIS_MULTICANAL, calcularCanalModoPreco } from '@/lib/calculosMulticanal'

const CANAIS_PARCEIRO = ['mlFull', 'mlClassico', 'sh', 'tt']
const ROTULOS: Record<string, string> = {
  mlFull: 'Mercado Livre FULL',
  mlClassico: 'Mercado Livre Clássico',
  sh: 'Shopee',
  tt: 'TikTok Shop',
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  const plataforma = searchParams.get('plataforma')?.trim()

  const where: Record<string, unknown> = {}
  if (q) where.OR = [
    { sku: { contains: q, mode: 'insensitive' } },
    { nome: { contains: q, mode: 'insensitive' } },
  ]

  const calculos = await db.calculoMulticanal.findMany({
    where,
    select: {
      id: true, sku: true, skuVariacao: true, nome: true, variacao: true,
      custoProduto: true, pesoGramas: true,
      despesasVariaveisPct: true, despesasFixasPct: true,
      canais: true, canaisAtivos: true, codigosAnuncio: true,
    },
    orderBy: [{ sku: 'asc' }, { variacao: 'asc' }],
  })

  const linhas: Record<string, unknown>[] = []
  for (const c of calculos) {
    const ativos = (c.canaisAtivos ?? {}) as Record<string, boolean>
    const codigos = (c.codigosAnuncio ?? {}) as Record<string, string | null>
    const canaisCfg = (c.canais ?? {}) as Record<string, Record<string, number>>

    for (const key of CANAIS_PARCEIRO) {
      if (!ativos[key]) continue
      const rotulo = ROTULOS[key]
      if (plataforma && plataforma !== rotulo) continue

      const def = CANAIS_MULTICANAL.find(d => d.key === key)
      const cfg = canaisCfg[key] ?? def?.default
      if (!def || !cfg) continue

      const r = calcularCanalModoPreco({
        custoProduto: c.custoProduto, despVarPct: c.despesasVariaveisPct, despFixPct: c.despesasFixasPct,
        pesoGramas: c.pesoGramas, canal: cfg as any, def, shAuto: true,
      })

      linhas.push({
        id: `${c.id}-${key}`,
        codigoAnuncio: codigos[key] ?? null,
        precoIdeal: r ? r.preco : null,
        precoPromocional: r ? Math.round(r.preco * 1.4 * 100) / 100 : null,
        plataforma: { nome: rotulo },
        variacao: {
          skuVariacao: c.skuVariacao ?? c.sku ?? '',
          nomeVariacao: c.variacao,
          produto: { nome: c.nome, skuPrincipal: c.sku ?? '' },
        },
      })
    }
  }

  return NextResponse.json(linhas)
}
