import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { calcCustoVariacao, round2 } from '@/lib/calculos'
import { CANAIS_MULTICANAL, calcularCanalModoPreco } from '@/lib/calculosMulticanal'

const ROTULOS: Record<string, string> = { lp: 'Loja Própria', mlFull: 'ML FULL', mlClassico: 'ML Clássico', sh: 'Shopee', tt: 'TikTok' }

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const skuPrincipal = searchParams.get('skuPrincipal')
  const q = searchParams.get('q')

  const where: Record<string, unknown> = {}
  if (skuPrincipal) where.skuPrincipal = skuPrincipal
  if (q) where.OR = [{ skuVariacao: { contains: q, mode: 'insensitive' } }, { nomeVariacao: { contains: q, mode: 'insensitive' } }]

  const variacoes = await db.variacao.findMany({
    where,
    include: {
      produto: { select: { nome: true, custoPorKg: true, custoUnitario: true, tipoPrecificacao: true, categoria: true } },
    },
    orderBy: [{ skuPrincipal: 'asc' }, { pesoGramas: 'asc' }],
  })

  const skusVariacao = variacoes.map(v => v.skuVariacao)
  const calculos = skusVariacao.length
    ? await db.calculoMulticanal.findMany({
        where: { skuVariacao: { in: skusVariacao } },
        select: { skuVariacao: true, custoProduto: true, pesoGramas: true, despesasVariaveisPct: true, despesasFixasPct: true, canais: true, canaisAtivos: true },
      })
    : []
  const porSku = new Map(calculos.filter(c => c.skuVariacao).map(c => [c.skuVariacao as string, c]))

  const resposta = variacoes.map(v => {
    const calc = porSku.get(v.skuVariacao)
    const precosAnunciados: { canal: string; preco: number | null }[] = []
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
        precosAnunciados.push({ canal: ROTULOS[key] ?? key, preco: r ? r.preco : null })
      }
    }
    return { ...v, precosAnunciados }
  })

  return NextResponse.json(resposta)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { skuVariacao, skuPrincipal, nomeVariacao, pesoGramas, custoAdicional, embalagem } = body

  if (!skuVariacao?.trim() || !skuPrincipal?.trim() || !nomeVariacao?.trim())
    return NextResponse.json({ error: 'SKU variação, SKU principal e nome são obrigatórios' }, { status: 400 })

  const exists = await db.variacao.findUnique({ where: { skuVariacao } })
  if (exists) return NextResponse.json({ error: 'SKU de variação já existe' }, { status: 409 })

  const produto = await db.produto.findUnique({ where: { skuPrincipal } })
  if (!produto) return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 })

  const adicional = parseFloat(custoAdicional ?? 0)
  const peso = pesoGramas ? parseFloat(pesoGramas) : null
  const fator = peso ? peso / 1000 : null

  let custoCalc: number | null = null
  let custoTot: number | null = null

  if (produto.custoPorKg && peso) {
    custoCalc = round2(calcCustoVariacao(produto.custoPorKg, peso, 0))
    custoTot  = round2(custoCalc + adicional)
  } else if (produto.custoUnitario) {
    custoCalc = produto.custoUnitario
    custoTot  = round2(produto.custoUnitario + adicional)
  }

  const v = await db.variacao.create({
    data: { skuVariacao, skuPrincipal, nomeVariacao, pesoGramas: peso, fatorConversao: fator, custoCalculado: custoCalc, custoAdicional: adicional, custoTotal: custoTot, embalagem: embalagem || null, status: 'ativo' },
  })
  return NextResponse.json(v, { status: 201 })
}
