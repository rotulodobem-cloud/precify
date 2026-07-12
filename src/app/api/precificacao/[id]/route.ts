import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { calcPrecificacaoComFreteML } from '@/lib/calculos'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json()

  const ex = await db.precificacao.findUnique({
    where: { id: params.id },
    include: { variacao: true, plataforma: true },
  })
  if (!ex) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const isML = ex.plataforma.slug === 'ml'
  const custoProduto = ex.variacao.custoTotal ?? ex.variacao.custoCalculado ?? 0

  const tipoFreteML = b.tipoFreteML ?? (ex as Record<string,unknown>).tipoFreteML ?? 'full'
  const precoAtual  = b.precoAtual !== undefined
    ? (b.precoAtual ? parseFloat(b.precoAtual) : null)
    : ex.precoAtual

  const calc = calcPrecificacaoComFreteML({
    custoProduto,
    custoEmbalagem: parseFloat(String(b.custoEmbalagem ?? ex.custoEmbalagem)),
    custoFrete:     ex.custoFrete,   // será recalculado internamente se ML
    custoColeta:    parseFloat(String(b.custoColeta ?? ex.custoColeta)),
    comissaoPct:    parseFloat(String(b.comissaoPct ?? ex.comissaoPct)),
    impostoPct:     parseFloat(String(b.impostoPct  ?? ex.impostoPct)),
    precoAtual,
    isML,
    tipoFreteML:    String(tipoFreteML),
    pesoGramas:     ex.variacao.pesoGramas,
  })

  const updated = await db.precificacao.update({
    where: { id: params.id },
    data: {
      precoAtual,
      codigoAnuncio:  b.codigoAnuncio !== undefined ? (b.codigoAnuncio || null) : ex.codigoAnuncio,
      custoEmbalagem: parseFloat(String(b.custoEmbalagem ?? ex.custoEmbalagem)),
      custoFrete:     calc.custoFrete,
      custoColeta:    parseFloat(String(b.custoColeta ?? ex.custoColeta)),
      comissaoPct:    parseFloat(String(b.comissaoPct ?? ex.comissaoPct)),
      impostoPct:     parseFloat(String(b.impostoPct  ?? ex.impostoPct)),
      tipoFreteML:    String(tipoFreteML),
      custoTotalCalc: calc.custoTotalCalc,
      precoMinimo:    calc.precoMinimo,
      precoIdeal:     calc.precoIdeal,
      precoMaximo:    calc.precoMaximo,
      precoPromocional: calc.precoPromocional,
      lucroBruto:     calc.lucroBruto,
      margemAtual:    calc.margemAtual,
      statusMargem:   calc.statusMargem,
    },
    include: { plataforma: true, variacao: { include: { produto: true } } },
  })
  return NextResponse.json(updated)
}
