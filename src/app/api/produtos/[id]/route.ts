import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { calcCustoVariacao } from '@/lib/calculos'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const p = await db.produto.findUnique({
    where: { skuPrincipal: params.id },
    include: {
      variacoes: {
        include: { precificacoes: { include: { plataforma: true } } },
        orderBy: { pesoGramas: 'asc' },
      },
      compras: { orderBy: { dataCompra: 'desc' }, take: 10 },
    },
  })
  if (!p) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(p)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const { nome, categoria, unidadeCompra, custoPorKg, custoUnitario, fornecedorPrincipal, tipoPrecificacao, status, observacoes } = body

  const custo = custoPorKg != null ? parseFloat(custoPorKg) : custoUnitario != null ? parseFloat(custoUnitario) : undefined

  const p = await db.produto.update({
    where: { skuPrincipal: params.id },
    data: {
      nome, categoria, unidadeCompra,
      custoPorKg: custoPorKg != null ? parseFloat(custoPorKg) : null,
      custoUnitario: custoUnitario != null ? parseFloat(custoUnitario) : null,
      custoAtualizado: custo,
      fornecedorPrincipal: fornecedorPrincipal || null,
      tipoPrecificacao, status, observacoes,
    },
  })

  // Recalcular custos das variações proporcionais
  if (custoPorKg && tipoPrecificacao === 'peso_proporcional') {
    const vars = await db.variacao.findMany({ where: { skuPrincipal: params.id } })
    for (const v of vars) {
      if (v.pesoGramas) {
        const novo = calcCustoVariacao(parseFloat(custoPorKg), v.pesoGramas, v.custoAdicional)
        await db.variacao.update({ where: { id: v.id }, data: { custoCalculado: novo - v.custoAdicional, custoTotal: novo } })
      }
    }
  }
  return NextResponse.json(p)
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  // Cascade vai apagar variacoes e precificacoes pelo schema
  await db.produto.delete({ where: { skuPrincipal: params.id } })
  return NextResponse.json({ ok: true })
}
