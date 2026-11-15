import { NextRequest, NextResponse } from 'next/server'
import { lerConfigLoja, salvarConfigLoja } from '@/lib/configLoja'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await lerConfigLoja())
}

export async function PUT(req: NextRequest) {
  const corpo = await req.json().catch(() => null)
  if (!corpo || typeof corpo !== 'object') return NextResponse.json({ error: 'Envie os parâmetros.' }, { status: 400 })
  try {
    return NextResponse.json(await salvarConfigLoja(corpo))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
