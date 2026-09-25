import { NextResponse, type NextRequest } from 'next/server'
import { ingerirRelatorio } from './ingestao'

/** Lê o multipart (campo "arquivo" + "capturado_em" opcional) e roda a ingestão. */
export async function processarUpload(req: NextRequest) {
  try {
    const form = await req.formData()
    const arquivo = form.get('arquivo')
    if (!(arquivo instanceof File)) return NextResponse.json({ error: 'Envie o relatório no campo "arquivo".' }, { status: 400 })
    if (arquivo.size > 15 * 1024 * 1024) return NextResponse.json({ error: 'Arquivo grande demais (máx. 15 MB).' }, { status: 413 })
    const data = String(form.get('capturado_em') ?? '')
    const r = await ingerirRelatorio(Buffer.from(await arquivo.arrayBuffer()), {
      nomeArquivo: arquivo.name, capturadoEm: /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : undefined,
    })
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 })
  }
}
