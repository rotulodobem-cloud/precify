import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { round2 } from '@/lib/calculos'
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

interface ItemCompra {
  skuPrincipal: string; nomeProduto: string; quantidade: string | number; custoTotal: string | number
  outrosCustos?: string | number; precoVenda?: string | number
}

export async function POST(req: NextRequest) {
  const b = await req.json()
  const itens: ItemCompra[] = b.itens ?? []

  if (!b.fornecedor) return NextResponse.json({ error: 'Fornecedor é obrigatório' }, { status: 400 })
  if (!itens.length) return NextResponse.json({ error: 'Adicione ao menos um produto' }, { status: 400 })
  for (const it of itens) {
    if (!it.skuPrincipal || !it.nomeProduto || !it.quantidade || !it.custoTotal)
      return NextResponse.json({ error: 'SKU, produto, quantidade e custo total são obrigatórios em cada item' }, { status: 400 })
  }

  const freteTotal = parseFloat(b.frete ?? 0)
  const somaCusto  = itens.reduce((s, it) => s + parseFloat(String(it.custoTotal)), 0)

  const compras = []
  for (const it of itens) {
    const custoItem = parseFloat(String(it.custoTotal))
    const freteItem = freteTotal > 0 && somaCusto > 0 ? round2(freteTotal * (custoItem / somaCusto)) : 0
    const compra = await saveCompra({
      dataCompra: b.dataCompra || new Date().toISOString(),
      skuPrincipal: it.skuPrincipal, nomeProduto: it.nomeProduto,
      fornecedor: b.fornecedor,
      quantidade: parseFloat(String(it.quantidade)), custoTotal: custoItem,
      frete: freteItem, outrosCustos: parseFloat(String(it.outrosCustos ?? 0)),
      precoVenda: it.precoVenda ? parseFloat(String(it.precoVenda)) : null,
      numeroNF: b.numeroNF || undefined, numeroPedido: b.numeroPedido || undefined,
    })
    compras.push(compra)
  }

  return NextResponse.json(compras, { status: 201 })
}
