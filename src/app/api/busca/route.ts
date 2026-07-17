import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { CANAIS_MULTICANAL, calcularCanalModoPreco } from '@/lib/calculosMulticanal'
import { statusMargem } from '@/lib/calculos'

const ROTULOS: Record<string, string> = { lp: 'Loja Própria', mlFull: 'Mercado Livre FULL', mlClassico: 'Mercado Livre Clássico', sh: 'Shopee', tt: 'TikTok Shop' }
const CORES: Record<string, string> = { lp: '#055E2B', mlFull: '#FFE600', mlClassico: '#FFE600', sh: '#EE4D2D', tt: '#111111' }

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ results: [] })

  const produtos = await db.produto.findMany({
    where: {
      OR: [
        { skuPrincipal: { contains: q, mode: 'insensitive' } },
        { nome: { contains: q, mode: 'insensitive' } },
        { variacoes: { some: { skuVariacao: { contains: q, mode: 'insensitive' } } } },
      ],
    },
    include: {
      variacoes: { orderBy: { pesoGramas: 'asc' } },
      compras: { orderBy: { dataCompra: 'desc' }, take: 3 },
    },
    take: 10,
  })

  const skusVariacao = produtos.flatMap(p => p.variacoes.map(v => v.skuVariacao))
  const calculos = skusVariacao.length
    ? await db.calculoMulticanal.findMany({
        where: { skuVariacao: { in: skusVariacao } },
        select: { skuVariacao: true, custoProduto: true, pesoGramas: true, despesasVariaveisPct: true, despesasFixasPct: true, canais: true, canaisAtivos: true },
      })
    : []
  const porSku = new Map(calculos.filter(c => c.skuVariacao).map(c => [c.skuVariacao as string, c]))

  const results = produtos.map(produto => ({
    ...produto,
    variacoes: produto.variacoes.map(v => {
      const calc = porSku.get(v.skuVariacao)
      const canaisAnunciados: { canal: string; nome: string; cor: string; precoIdeal: number | null; precoPromocional: number | null; margem: number | null; statusMargem: string }[] = []
      if (calc) {
        const ativos = (calc.canaisAtivos ?? {}) as Record<string, boolean>
        const canaisCfg = (calc.canais ?? {}) as Record<string, Record<string, number>>
        for (const key of Object.keys(ativos)) {
          if (!ativos[key]) continue
          const def = CANAIS_MULTICANAL.find(d => d.key === key)
          const cfg = canaisCfg[key]
          if (!def || !cfg) continue
          const r = calcularCanalModoPreco({
            custoProduto: calc.custoProduto, despVarPct: calc.despesasVariaveisPct, despFixPct: calc.despesasFixasPct,
            pesoGramas: calc.pesoGramas, canal: cfg as any, def, shAuto: true,
          })
          canaisAnunciados.push({
            canal: key, nome: ROTULOS[key] ?? key, cor: CORES[key] ?? '#666',
            precoIdeal: r ? r.preco : null,
            precoPromocional: r ? Math.round(r.preco * 1.4 * 100) / 100 : null,
            margem: r ? r.margem : null,
            statusMargem: r ? statusMargem(r.margem) : 'SEM_PRECO',
          })
        }
      }
      return { ...v, canaisAnunciados }
    }),
  }))

  return NextResponse.json({ results })
}
