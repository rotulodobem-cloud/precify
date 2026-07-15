import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

// Calcula o custo de um componente com base no produto cadastrado
async function calcCustoComponente(skuProduto: string, quantidadeGramas?: number, quantidadeUn?: number): Promise<{ custo: number; nome: string; custoPorKg: number | null } | null> {
  const produto = await db.produto.findUnique({ where: { skuPrincipal: skuProduto } })
  if (!produto) return null

  let custo = 0
  if (quantidadeGramas && produto.custoPorKg) {
    custo = (produto.custoPorKg * quantidadeGramas) / 1000
  } else if (quantidadeUn && produto.custoUnitario) {
    custo = produto.custoUnitario * quantidadeUn
  } else if (produto.custoAtualizado) {
    custo = quantidadeGramas
      ? (produto.custoAtualizado * quantidadeGramas) / 1000
      : produto.custoAtualizado * (quantidadeUn ?? 1)
  }

  return {
    custo: Math.round(custo * 10000) / 10000,
    nome: produto.nome,
    custoPorKg: produto.custoPorKg,
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')
  const status = searchParams.get('status')

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (q) where.OR = [
    { skuKit: { contains: q, mode: 'insensitive' } },
    { nome: { contains: q, mode: 'insensitive' } },
  ]

  const kits = await db.kit.findMany({
    where,
    include: { componentes: { orderBy: { createdAt: 'asc' } } },
    orderBy: { nome: 'asc' },
  })
  return NextResponse.json(kits)
}

export async function POST(req: NextRequest) {
  const b = await req.json()

  if (!b.skuKit?.trim() || !b.nome?.trim())
    return NextResponse.json({ error: 'SKU e nome são obrigatórios' }, { status: 400 })

  const exists = await db.kit.findUnique({ where: { skuKit: b.skuKit } })
  if (exists) return NextResponse.json({ error: 'SKU de kit já cadastrado' }, { status: 409 })

  // Calcular custo de cada componente
  const componentes = b.componentes ?? []
  let custoTotal = 0
  const componentesData = []

  for (const comp of componentes) {
    const info = await calcCustoComponente(comp.skuProduto, comp.quantidadeGramas, comp.quantidadeUn)
    if (!info) return NextResponse.json({ error: `Produto ${comp.skuProduto} não encontrado` }, { status: 404 })
    custoTotal += info.custo
    componentesData.push({
      skuProduto:       comp.skuProduto,
      nomeProduto:      info.nome,
      quantidadeGramas: comp.quantidadeGramas ? parseFloat(comp.quantidadeGramas) : null,
      quantidadeUn:     comp.quantidadeUn     ? parseFloat(comp.quantidadeUn)     : null,
      custoUnitario:    info.custo,
    })
  }

  const custoEmbalagem = parseFloat(b.custoEmbalagem ?? 0)
  custoTotal += custoEmbalagem

  const kit = await db.kit.create({
    data: {
      skuKit:         b.skuKit.trim(),
      nome:           b.nome.trim(),
      categoria:      b.categoria || 'Kits',
      custoTotal:     Math.round(custoTotal * 10000) / 10000,
      custoEmbalagem,
      observacoes:    b.observacoes || null,
      status:         b.status || 'ativo',
      componentes:    { create: componentesData },
    },
    include: { componentes: true },
  })

  return NextResponse.json(kit, { status: 201 })
}
