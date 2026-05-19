import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { calcCustoVariacao, round2 } from '@/lib/calculos'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const v = await db.variacao.findUnique({ where: { id: params.id }, include: { produto: true } })
  if (!v) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const adicional = parseFloat(body.custoAdicional ?? v.custoAdicional ?? 0)
  const peso = body.pesoGramas ? parseFloat(body.pesoGramas) : v.pesoGramas

  let custoCalc = v.custoCalculado
  let custoTot  = v.custoTotal
  if (v.produto.custoPorKg && peso) {
    custoCalc = round2(calcCustoVariacao(v.produto.custoPorKg, peso, 0))
    custoTot  = round2(custoCalc + adicional)
  }

  const updated = await db.variacao.update({
    where: { id: params.id },
    data: {
      nomeVariacao: body.nomeVariacao ?? v.nomeVariacao,
      pesoGramas: peso,
      fatorConversao: peso ? peso / 1000 : v.fatorConversao,
      custoCalculado: custoCalc,
      custoAdicional: adicional,
      custoTotal: custoTot,
      embalagem: body.embalagem ?? v.embalagem,
      status: body.status ?? v.status,
    },
  })
  return NextResponse.json(updated)
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await db.variacao.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
