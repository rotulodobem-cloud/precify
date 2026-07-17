import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

interface LinhaRaw {
  linha: number
  codigo: string
  preco: number
}

export async function POST(req: NextRequest) {
  const { linhas }: { linhas: LinhaRaw[] } = await req.json()

  const codigos = [...new Set(linhas.map(l => l.codigo).filter(Boolean))]
  const calculos = codigos.length
    ? await db.calculoMulticanal.findMany({
        where: { skuVariacao: { in: codigos } },
        select: { id: true, skuVariacao: true, sku: true, nome: true, variacao: true, precoPraticadoLP: true },
      })
    : []
  const porCodigo = new Map(calculos.filter(c => c.skuVariacao).map(c => [c.skuVariacao as string, c]))

  const resultado = linhas.map(l => {
    const match = porCodigo.get(l.codigo)
    return {
      linha: l.linha,
      codigo: l.codigo,
      precoNovo: l.preco,
      encontrado: !!match,
      calculoId: match?.id ?? null,
      sku: match?.sku ?? null,
      nome: match ? (match.variacao ? `${match.nome} ${match.variacao}` : match.nome) : null,
      precoAntigo: match?.precoPraticadoLP ?? null,
    }
  })

  return NextResponse.json(resultado)
}
