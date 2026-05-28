import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

async function calcCustoComponente(skuProduto: string, quantidadeGramas?: number, quantidadeUn?: number) {
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
  return { custo: Math.round(custo * 10000) / 10000, nome: produto.nome }
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const kit = await db.kit.findUnique({
    where: { skuKit: params.id },
    include: { componentes: { orderBy: { createdAt: 'asc' } } },
  })
  if (!kit) return NextResponse.json({ error: 'Kit não encontrado' }, { status: 404 })
  return NextResponse.json(kit)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json()

  // Recalcular componentes
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

  // Deletar componentes antigos e recriar
  await db.kitComponente.deleteMany({ where: { kit: { skuKit: params.id } } })

  const kit = await db.kit.update({
    where: { skuKit: params.id },
    data: {
      nome:           b.nome,
      categoria:      b.categoria || 'Kits',
      custoTotal:     Math.round(custoTotal * 10000) / 10000,
      custoEmbalagem,
      observacoes:    b.observacoes || null,
      status:         b.status || 'ativo',
      componentes:    { create: componentesData },
    },
    include: { componentes: true },
  })

  return NextResponse.json(kit)
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await db.kit.delete({ where: { skuKit: params.id } })
  return NextResponse.json({ ok: true })
}
