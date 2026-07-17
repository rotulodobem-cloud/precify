import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

const CHAVE = 'tolerancia_loja_propria_pct'
const PADRAO = 10

export async function GET() {
  const config = await db.configuracao.findUnique({ where: { chave: CHAVE } })
  const valor = config ? parseFloat(config.valor) : PADRAO
  return NextResponse.json({ valor: isNaN(valor) ? PADRAO : valor })
}

export async function PUT(req: NextRequest) {
  const { valor } = await req.json()
  const num = parseFloat(valor)
  if (isNaN(num) || num < 0)
    return NextResponse.json({ error: 'Valor de tolerância inválido' }, { status: 400 })

  const config = await db.configuracao.upsert({
    where: { chave: CHAVE },
    update: { valor: String(num) },
    create: { chave: CHAVE, valor: String(num), descricao: 'Tolerância de desvio entre preço calculado e preço praticado na Loja Própria (%)' },
  })
  return NextResponse.json({ valor: parseFloat(config.valor) })
}
