import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { calcPrecificacaoCompleta, calcPrecificacaoComFreteML } from '@/lib/calculos'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')
  const plataformaId = searchParams.get('plataformaId')
  const status = searchParams.get('status')

  const where: Record<string, unknown> = {}
  if (plataformaId) where.plataformaId = plataformaId
  if (status && status !== 'TODAS') where.statusMargem = status
  if (q) where.OR = [
    { skuVariacao: { contains: q, mode: 'insensitive' } },
    { variacao: { produto: { nome: { contains: q, mode: 'insensitive' } } } },
    { variacao: { produto: { skuPrincipal: { contains: q, mode: 'insensitive' } } } },
  ]

  const precs = await db.precificacao.findMany({
    where,
    include: {
      variacao: {
        include: { produto: { select: { nome: true, skuPrincipal: true, categoria: true } } },
      },
      plataforma: true,
    },
    orderBy: [
      { variacao: { skuPrincipal: 'asc' } },
      { variacao: { pesoGramas: 'asc' } },
      { plataforma: { nome: 'asc' } },
    ],
  })
  return NextResponse.json(precs)
}

export async function POST(req: NextRequest) {
  const b = await req.json()

  const variacao = await db.variacao.findUnique({
    where: { skuVariacao: b.skuVariacao },
    include: { produto: true },
  })
  if (!variacao) return NextResponse.json({ error: 'Variação não encontrada' }, { status: 404 })

  const plataforma = await db.plataforma.findUnique({ where: { id: b.plataformaId } })
  if (!plataforma) return NextResponse.json({ error: 'Plataforma não encontrada' }, { status: 404 })

  const isML = plataforma.slug === 'ml'
  const custoProduto = variacao.custoTotal ?? variacao.custoCalculado ?? 0

  const calc = calcPrecificacaoComFreteML({
    custoProduto,
    custoEmbalagem: parseFloat(b.custoEmbalagem ?? 0),
    custoFrete:     parseFloat(b.custoFrete ?? plataforma.taxaFixa ?? 0),
    custoColeta:    parseFloat(b.custoColeta ?? 0),
    comissaoPct:    parseFloat(b.comissaoPct ?? plataforma.comissaoPct),
    impostoPct:     parseFloat(b.impostoPct ?? plataforma.impostoPct ?? 0.08),
    precoAtual:     b.precoAtual ? parseFloat(b.precoAtual) : null,
    isML,
    tipoFreteML:    b.tipoFreteML ?? 'full',
    pesoGramas:     variacao.pesoGramas,
  })

  const p = await db.precificacao.upsert({
    where: { skuVariacao_plataformaId: { skuVariacao: b.skuVariacao, plataformaId: b.plataformaId } },
    update: {
      custoEmbalagem: parseFloat(b.custoEmbalagem ?? 0),
      custoFrete:     calc.custoFrete,
      custoColeta:    parseFloat(b.custoColeta ?? 0),
      comissaoPct:    parseFloat(b.comissaoPct ?? plataforma.comissaoPct),
      impostoPct:     parseFloat(b.impostoPct ?? plataforma.impostoPct ?? 0.08),
      tipoFreteML:    b.tipoFreteML ?? 'full',
      precoAtual:     b.precoAtual ? parseFloat(b.precoAtual) : null,
      codigoAnuncio:  b.codigoAnuncio || null,
      custoTotalCalc: calc.custoTotalCalc,
      precoMinimo:    calc.precoMinimo,
      precoIdeal:     calc.precoIdeal,
      precoMaximo:    calc.precoMaximo,
      precoPromocional: calc.precoPromocional,
      lucroBruto:     calc.lucroBruto,
      margemAtual:    calc.margemAtual,
      statusMargem:   calc.statusMargem,
    },
    create: {
      skuVariacao:    b.skuVariacao,
      plataformaId:   b.plataformaId,
      custoEmbalagem: parseFloat(b.custoEmbalagem ?? 0),
      custoFrete:     calc.custoFrete,
      custoColeta:    parseFloat(b.custoColeta ?? 0),
      comissaoPct:    parseFloat(b.comissaoPct ?? plataforma.comissaoPct),
      impostoPct:     parseFloat(b.impostoPct ?? plataforma.impostoPct ?? 0.08),
      tipoFreteML:    b.tipoFreteML ?? 'full',
      precoAtual:     b.precoAtual ? parseFloat(b.precoAtual) : null,
      codigoAnuncio:  b.codigoAnuncio || null,
      custoTotalCalc: calc.custoTotalCalc,
      precoMinimo:    calc.precoMinimo,
      precoIdeal:     calc.precoIdeal,
      precoMaximo:    calc.precoMaximo,
      precoPromocional: calc.precoPromocional,
      lucroBruto:     calc.lucroBruto,
      margemAtual:    calc.margemAtual,
      statusMargem:   calc.statusMargem,
    },
  })
  return NextResponse.json(p, { status: 201 })
}
