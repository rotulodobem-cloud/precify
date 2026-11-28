import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { montarComponentes, numeroForm, respostaErro } from '@/lib/kits'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const kit = await db.kit.findUnique({
    where: { skuKit: params.id },
    include: { componentes: { orderBy: { createdAt: 'asc' } } },
  })
  if (!kit) return NextResponse.json({ error: 'Kit não encontrado' }, { status: 404 })
  return NextResponse.json(kit)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const b = await req.json()
    const { dados, custoTotal } = await montarComponentes(Array.isArray(b.componentes) ? b.componentes : [])
    const custoEmbalagem = numeroForm(b.custoEmbalagem) ?? 0

    // troca os componentes e o kit juntos: se algo falhar, nada fica pela metade
    const kit = await db.$transaction(async tx => {
      await tx.kitComponente.deleteMany({ where: { kit: { skuKit: params.id } } })
      return tx.kit.update({
        where: { skuKit: params.id },
        data: {
          nome:           typeof b.nome === 'string' && b.nome.trim() ? b.nome.trim() : undefined,
          categoria:      b.categoria || 'Kits',
          custoTotal:     Math.round((custoTotal + custoEmbalagem) * 10000) / 10000,
          custoEmbalagem,
          observacoes:    b.observacoes || null,
          status:         b.status || 'ativo',
          componentes:    { create: dados },
        },
        include: { componentes: true },
      })
    })
    return NextResponse.json(kit)
  } catch (e) {
    const { status, corpo } = respostaErro(e)
    return NextResponse.json(corpo, { status })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await db.kit.delete({ where: { skuKit: params.id } })
  return NextResponse.json({ ok: true })
}
