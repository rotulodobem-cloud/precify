import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { calcPrecificacaoComFreteML, round2 } from '@/lib/calculos'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json()

  const ex = await db.anuncio.findUnique({
    where: { id: params.id },
    include: { variacao: true },
  })
  if (!ex) return NextResponse.json({ error: 'Anúncio não encontrado' }, { status: 404 })

  const canal          = b.canal ?? ex.canal
  const custoProduto   = ex.variacao.custoTotal ?? ex.variacao.custoCalculado ?? 0
  const custoEmbalagem = canal === 'ml_full' ? 0 : parseFloat(String(b.custoEmbalagem ?? ex.custoEmbalagem))
  const custoColeta    = parseFloat(String(b.custoColeta ?? ex.custoColeta))
  const tipoFrete      = canal === 'ml_full' ? 'full' : canal === 'ml_flex' ? 'flex' : canal === 'ml_classico' ? 'classico' : 'fixo'
  const comissaoPct    = parseFloat(String(b.comissaoPct ?? ex.comissaoPct))
  const impostoPct     = parseFloat(String(b.impostoPct  ?? ex.impostoPct))
  const precoAtual     = b.precoAtual !== undefined ? (b.precoAtual ? parseFloat(b.precoAtual) : null) : ex.precoAtual

  const isML = canal.startsWith('ml')
  const calc = calcPrecificacaoComFreteML({
    custoProduto, custoEmbalagem, custoColeta,
    custoFrete: ex.custoFrete,
    comissaoPct, impostoPct, precoAtual,
    isML, tipoFreteML: tipoFrete,
    pesoGramas: ex.variacao.pesoGramas,
  })

  const updated = await db.anuncio.update({
    where: { id: params.id },
    data: {
      canal,
      codigoAnuncio:  b.codigoAnuncio  !== undefined ? b.codigoAnuncio  : ex.codigoAnuncio,
      codigoCatalogo: b.codigoCatalogo !== undefined ? b.codigoCatalogo : ex.codigoCatalogo,
      skuCanal:       b.skuCanal       !== undefined ? b.skuCanal       : ex.skuCanal,
      nomeAnuncio:    b.nomeAnuncio    !== undefined ? b.nomeAnuncio    : ex.nomeAnuncio,
      ativo:          b.ativo          !== undefined ? b.ativo          : ex.ativo,
      custoEmbalagem, custoColeta,
      custoFrete:       round2(calc.custoFrete),
      tipoFrete,        comissaoPct,     impostoPct,    precoAtual,
      custoTotalCalc:   calc.custoTotalCalc,
      lucroBruto:       calc.lucroBruto,
      margemAtual:      calc.margemAtual,
      precoMinimo:      calc.precoMinimo,
      precoIdeal:       calc.precoIdeal,
      precoMaximo:      calc.precoMaximo,
      precoPromocional: calc.precoPromocional,
      statusMargem:     calc.statusMargem,
    },
    include: { variacao: { include: { produto: true } } },
  })
  return NextResponse.json(updated)
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await db.anuncio.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
