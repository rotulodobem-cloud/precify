import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { CANAIS_MULTICANAL } from '@/lib/calculosMulticanal'

interface LinhaConfirmada {
  calculoId: string | null
  codigo: string
  precoNovo: number
}

function canaisDefault(): Record<string, unknown> {
  const canais: Record<string, unknown> = {}
  CANAIS_MULTICANAL.forEach(c => { canais[c.key] = { ...c.default } })
  return canais
}

export async function POST(req: NextRequest) {
  const { linhas }: { linhas: LinhaConfirmada[] } = await req.json()

  let atualizados = 0
  let criados = 0
  const erros: string[] = []
  const agora = new Date()

  for (const linha of linhas) {
    try {
      if (linha.calculoId) {
        await db.calculoMulticanal.update({
          where: { id: linha.calculoId },
          data: { precoPraticadoLP: linha.precoNovo, precoPraticadoLPAtualizadoEm: agora },
        })
        atualizados++
        continue
      }

      const v = await db.variacao.findUnique({
        where: { skuVariacao: linha.codigo },
        include: { produto: { select: { nome: true } } },
      })
      if (v) {
        await db.calculoMulticanal.create({
          data: {
            sku: v.skuPrincipal, skuVariacao: v.skuVariacao,
            nome: v.produto.nome, variacao: v.nomeVariacao,
            custoProduto: v.custoTotal ?? v.custoCalculado ?? 0,
            pesoGramas: v.pesoGramas,
            canais: canaisDefault() as any,
            canaisAtivos: {},
            precoPraticadoLP: linha.precoNovo,
            precoPraticadoLPAtualizadoEm: agora,
          },
        })
        criados++
        continue
      }

      const p = await db.produto.findUnique({ where: { skuPrincipal: linha.codigo } })
      if (p) {
        await db.calculoMulticanal.create({
          data: {
            sku: p.skuPrincipal, skuVariacao: null,
            nome: p.nome, variacao: '',
            custoProduto: p.custoAtualizado ?? p.custoPorKg ?? p.custoUnitario ?? 0,
            pesoGramas: null,
            canais: canaisDefault() as any,
            canaisAtivos: {},
            precoPraticadoLP: linha.precoNovo,
            precoPraticadoLPAtualizadoEm: agora,
          },
        })
        criados++
        continue
      }

      erros.push(`${linha.codigo}: produto/variação não encontrado`)
    } catch (e) {
      erros.push(`${linha.codigo}: ${String(e)}`)
    }
  }

  return NextResponse.json({ ok: true, atualizados, criados, erros })
}
