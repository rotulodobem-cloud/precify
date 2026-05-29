import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const fornecedor = searchParams.get('fornecedor')
  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (fornecedor) where.fornecedor = fornecedor
  const pedidos = await db.pedidoCompra.findMany({ where, include: { itens: true }, orderBy: { createdAt: 'desc' } })
  return NextResponse.json(pedidos)
}

interface ItemInput {
  skuPrincipal: string; nomeProduto: string; nomeNoFornecedor?: string
  codigoFornecedor?: string; quantidade: number; unidade?: string
  precoUnitario?: number; obs?: string
}

export async function POST(req: NextRequest) {
  const b = await req.json()
  if (!b.fornecedor) return NextResponse.json({ error: 'Fornecedor obrigatorio' }, { status: 400 })
  const pedido = await db.pedidoCompra.create({
    data: {
      fornecedor: b.fornecedor, obs: b.obs || null,
      itens: b.itens?.length ? {
        create: b.itens.map((i: ItemInput) => ({
          skuPrincipal: i.skuPrincipal, nomeProduto: i.nomeProduto,
          nomeNoFornecedor: i.nomeNoFornecedor || null, codigoFornecedor: i.codigoFornecedor || null,
          quantidade: parseFloat(String(i.quantidade)), unidade: i.unidade || 'kg',
          precoUnitario: i.precoUnitario ? parseFloat(String(i.precoUnitario)) : null, obs: i.obs || null,
        }))
      } : undefined,
    },
    include: { itens: true },
  })
  return NextResponse.json(pedido, { status: 201 })
}
