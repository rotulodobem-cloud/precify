import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

interface LinhaConfirmada {
  calculoId: string
  precoNovo: number
}

export async function POST(req: NextRequest) {
  const { linhas }: { linhas: LinhaConfirmada[] } = await req.json()

  let atualizados = 0
  const erros: string[] = []
  const agora = new Date()

  for (const linha of linhas) {
    try {
      await db.calculoMulticanal.update({
        where: { id: linha.calculoId },
        data: { precoPraticadoLP: linha.precoNovo, precoPraticadoLPAtualizadoEm: agora },
      })
      atualizados++
    } catch (e) {
      erros.push(`${linha.calculoId}: ${String(e)}`)
    }
  }

  return NextResponse.json({ ok: true, atualizados, erros })
}
