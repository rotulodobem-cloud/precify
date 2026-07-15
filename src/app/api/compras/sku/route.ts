import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sku = searchParams.get('sku')?.trim()
  if (!sku || sku.length < 2) return NextResponse.json(null)

  // Buscar produto cadastrado
  const produto = await db.produto.findFirst({
    where: { skuPrincipal: { contains: sku, mode: 'insensitive' } },
    select: { skuPrincipal: true, nome: true, fornecedorPrincipal: true, custoPorKg: true },
  })

  // Buscar última compra desse SKU
  const ultimaCompra = await db.compra.findFirst({
    where: { skuPrincipal: { equals: sku, mode: 'insensitive' } },
    orderBy: { dataCompra: 'desc' },
    select: { nomeProduto: true, fornecedor: true, custoUnitario: true, dataCompra: true },
  })

  return NextResponse.json({ produto, ultimaCompra })
}
