import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { calcPrecificacaoComFreteML, round2 } from '@/lib/calculos'

// Mapa canal → slug plataforma
const CANAL_SLUG: Record<string, string> = {
  ml_full:     'ml',
  ml_classico: 'ml',
  ml_flex:     'ml',
  shopee:      'shopee',
  tray:        'tray',
  loja:        'loja',
}

const CANAL_LABEL: Record<string, string> = {
  ml_full:     'ML FULL',
  ml_classico: 'ML Clássico',
  ml_flex:     'ML Flex',
  shopee:      'Shopee',
  tray:        'Tray',
  loja:        'Loja Física',
}

function calcAnuncio(anuncio: {
  canal: string; custoEmbalagem: number; custoColeta: number
  custoFrete: number; tipoFrete: string; comissaoPct: number
  impostoPct: number; precoAtual?: number | null
  pesoGramas?: number | null; custoProduto: number
}) {
  const isML = anuncio.canal.startsWith('ml')

  const calc = calcPrecificacaoComFreteML({
    custoProduto:   anuncio.custoProduto,
    custoEmbalagem: anuncio.custoEmbalagem,
    custoFrete:     anuncio.custoFrete,
    custoColeta:    anuncio.custoColeta,
    comissaoPct:    anuncio.comissaoPct,
    impostoPct:     anuncio.impostoPct,
    precoAtual:     anuncio.precoAtual,
    isML,
    tipoFreteML:    anuncio.tipoFrete,
    pesoGramas:     anuncio.pesoGramas,
  })

  return calc
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const skuVariacao = searchParams.get('skuVariacao')
  const canal       = searchParams.get('canal')
  const ativo       = searchParams.get('ativo')
  const q           = searchParams.get('q')

  const where: Record<string, unknown> = {}
  if (skuVariacao) where.skuVariacao = skuVariacao
  if (canal)       where.canal = canal
  if (ativo !== null && ativo !== undefined) where.ativo = ativo === 'true'
  if (q) where.OR = [
    { codigoAnuncio: { contains: q } },
    { skuCanal: { contains: q } },
    { variacao: { produto: { nome: { contains: q } } } },
    { variacao: { produto: { skuPrincipal: { contains: q } } } },
  ]

  const anuncios = await db.anuncio.findMany({
    where,
    include: {
      variacao: {
        include: {
          produto: { select: { nome: true, skuPrincipal: true, categoria: true } },
        },
      },
    },
    orderBy: [
      { variacao: { skuPrincipal: 'asc' } },
      { variacao: { pesoGramas: 'asc' } },
      { canal: 'asc' },
    ],
  })

  return NextResponse.json(anuncios)
}

export async function POST(req: NextRequest) {
  const b = await req.json()

  const variacao = await db.variacao.findUnique({
    where: { skuVariacao: b.skuVariacao },
  })
  if (!variacao) return NextResponse.json({ error: 'Variação não encontrada' }, { status: 404 })

  const custoProduto = variacao.custoTotal ?? variacao.custoCalculado ?? 0

  // Coleta padrão para FULL
  const custoColeta = b.canal === 'ml_full'
    ? parseFloat(b.custoColeta ?? 0.60)
    : parseFloat(b.custoColeta ?? 0)

  // Embalagem zero para FULL (é deles)
  const custoEmbalagem = b.canal === 'ml_full'
    ? 0
    : parseFloat(b.custoEmbalagem ?? 0)

  const tipoFrete = b.canal === 'ml_full' ? 'full'
    : b.canal === 'ml_flex' ? 'flex'
    : b.canal === 'ml_classico' ? 'classico'
    : 'fixo'

  const calc = calcAnuncio({
    canal: b.canal, custoProduto,
    custoEmbalagem, custoColeta,
    custoFrete: parseFloat(b.custoFrete ?? 0),
    tipoFrete,
    comissaoPct: parseFloat(b.comissaoPct),
    impostoPct:  parseFloat(b.impostoPct ?? 0.0829),
    precoAtual:  b.precoAtual ? parseFloat(b.precoAtual) : null,
    pesoGramas:  variacao.pesoGramas,
  })

  // Upsert — cria se não existir, atualiza se já existir (preservando código anúncio/SKU canal)
  const existente = await db.anuncio.findFirst({
    where: { skuVariacao: b.skuVariacao, canal: b.canal },
  })

  const dadosCalc = {
    custoEmbalagem, custoColeta,
    custoFrete:     round2(calc.custoFrete),
    tipoFrete,
    comissaoPct:    parseFloat(b.comissaoPct),
    impostoPct:     parseFloat(b.impostoPct ?? 0.0829),
    precoAtual:     b.precoAtual ? parseFloat(b.precoAtual) : null,
    custoTotalCalc:   calc.custoTotalCalc,
    lucroBruto:       calc.lucroBruto,
    margemAtual:      calc.margemAtual,
    precoMinimo:      calc.precoMinimo,
    precoIdeal:       calc.precoIdeal,
    precoMaximo:      calc.precoMaximo,
    precoPromocional: calc.precoPromocional,
    statusMargem:     calc.statusMargem,
  }

  let anuncio; let atualizado = false

  if (existente) {
    anuncio = await db.anuncio.update({
      where: { id: existente.id },
      data: dadosCalc,
      include: { variacao: { include: { produto: true } } },
    })
    atualizado = true
  } else {
    anuncio = await db.anuncio.create({
      data: {
        skuVariacao: b.skuVariacao, canal: b.canal,
        codigoAnuncio: b.codigoAnuncio || null,
        codigoCatalogo: b.codigoCatalogo || null,
        skuCanal: b.skuCanal || null,
        nomeAnuncio: b.nomeAnuncio || null,
        ativo: b.ativo ?? true,
        ...dadosCalc,
      },
      include: { variacao: { include: { produto: true } } },
    })
  }

  return NextResponse.json({ ...anuncio, _atualizado: atualizado }, { status: atualizado ? 200 : 201 })
}
