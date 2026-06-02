import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { calcCustoVariacao, calcPrecificacaoComFreteML, round2 } from '@/lib/calculos'
import { saveCompra } from '@/lib/saveCompra'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q          = searchParams.get('q')
  const fornecedor = searchParams.get('fornecedor')
  const status     = searchParams.get('status')
  const dataInicio = searchParams.get('dataInicio')
  const dataFim    = searchParams.get('dataFim')

  const where: Record<string, unknown> = {}
  if (q) where.OR = [{ skuPrincipal: { contains: q } }, { nomeProduto: { contains: q } }]
  if (fornecedor) where.fornecedor = { contains: fornecedor }
  if (status) where.statusVariacao = status
  if (dataInicio || dataFim) {
    where.dataCompra = {}
    if (dataInicio) (where.dataCompra as Record<string,unknown>).gte = new Date(dataInicio)
    if (dataFim) {
      const fim = new Date(dataFim)
      fim.setHours(23, 59, 59, 999)
      ;(where.dataCompra as Record<string,unknown>).lte = fim
    }
  }

  const compras = await db.compra.findMany({
    where,
    include: { produto: { select: { nome: true, categoria: true } } },
    orderBy: { dataCompra: 'desc' },
    take: 500,
  })
  return NextResponse.json(compras)
}

export async function POST(req: NextRequest) {
  const b = await req.json()
  if (!b.skuPrincipal || !b.nomeProduto || !b.quantidade || !b.custoTotal)
    return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 })

  const compra = await saveCompra({
    dataCompra: b.dataCompra || new Date().toISOString(),
    skuPrincipal: b.skuPrincipal, nomeProduto: b.nomeProduto,
    fornecedor: b.fornecedor || '',
    quantidade: parseFloat(b.quantidade), custoTotal: parseFloat(b.custoTotal),
    frete: parseFloat(b.frete ?? 0), outrosCustos: parseFloat(b.outrosCustos ?? 0),
    precoVenda: b.precoVenda ? parseFloat(b.precoVenda) : null,
  })
  return NextResponse.json(compra, { status: 201 })
}
