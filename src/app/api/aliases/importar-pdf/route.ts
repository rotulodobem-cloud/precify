import { NextRequest, NextResponse } from 'next/server'

const PDF_SERVICE_URL = process.env.PDF_SERVICE_URL || 'http://localhost:5001'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

    // Verifica se o serviço Python está rodando
    try {
      await fetch(`${PDF_SERVICE_URL}/saude`, { signal: AbortSignal.timeout(2000) })
    } catch {
      return NextResponse.json({
        error: 'Serviço de PDF não está rodando. Abra o terminal e execute: python python\\pdf_parser.py',
        itens: [],
        servicoOffline: true,
      }, { status: 503 })
    }

    // Envia o PDF para o serviço Python
    const form = new FormData()
    form.append('file', file)

    const res = await fetch(`${PDF_SERVICE_URL}/parsear-pdf`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(30000), // 30s timeout
    })

    if (!res.ok) {
      const err = await res.json()
      return NextResponse.json({ error: err.error || 'Erro no parser', itens: [] }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: `Erro ao processar PDF: ${msg}`, itens: [] }, { status: 500 })
  }
}
