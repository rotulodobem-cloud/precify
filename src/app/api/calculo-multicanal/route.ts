import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()

  const where: Record<string, unknown> = {}
  if (q) where.OR = [{ sku: { contains: q, mode: 'insensitive' } }, { nome: { contains: q, mode: 'insensitive' } }]

  const calculos = await db.calculoMulticanal.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 500,
  })
  return NextResponse.json(calculos)
}

export async function POST(req: NextRequest) {
  const b = await req.json()
  if (!b.sku?.trim() && !b.nome?.trim())
    return NextResponse.json({ error: 'Informe o SKU ou o nome do produto' }, { status: 400 })
  if (b.custoProduto == null)
    return NextResponse.json({ error: 'Custo do produto é obrigatório' }, { status: 400 })

  const sku = String(b.sku ?? '').trim()
  const variacao = String(b.variacao ?? '').trim()

  const data = {
    sku,
    nome: String(b.nome ?? '').trim(),
    variacao,
    skuVariacao: b.skuVariacao || null,
    custoProduto: parseFloat(b.custoProduto),
    pesoGramas: b.pesoGramas != null ? parseFloat(b.pesoGramas) : null,
    despesasVariaveisPct: parseFloat(b.despesasVariaveisPct ?? 8),
    despesasFixasPct: parseFloat(b.despesasFixasPct ?? 0),
    modo: b.modo === 'margem' ? 'margem' : 'preco',
    precoTeste: b.precoTeste != null ? parseFloat(b.precoTeste) : null,
    canais: b.canais ?? {},
  }

  // Sem SKU não há chave estável pra upsert (colidiria com outros cálculos
  // sem SKU em sku_variacao = ('', '')) — cada salvamento vira um registro novo.
  const calculo = sku
    ? await db.calculoMulticanal.upsert({
        where: { sku_variacao: { sku, variacao } },
        update: data,
        create: data,
      })
    : await db.calculoMulticanal.create({ data })
  return NextResponse.json(calculo, { status: 201 })
}
