import { NextResponse, type NextRequest } from 'next/server'
import { processarUpload } from '@/lib/uploadRelatorio'

export const runtime = 'nodejs'
export const maxDuration = 60

// Upload manual pela tela "Importar relatório" (sessão validada no middleware).
export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Modo demonstração: configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para gravar relatórios.' }, { status: 409 })
  }
  return processarUpload(req)
}
