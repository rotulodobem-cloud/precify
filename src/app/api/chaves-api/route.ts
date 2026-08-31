import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { roleFromCookie } from '@/lib/auth'
import db from '@/lib/db'
import { gerarChaveApi, hashChaveApi, prefixoVisivel } from '@/lib/apiKeys'

const CANAIS_VALIDOS = ['loja_propria', 'ml_full', 'ml_classico', 'shopee', 'tiktok']

function exigirAdmin() {
  const role = roleFromCookie(cookies().get('precify_auth')?.value)
  return role === 'admin'
}

export async function GET() {
  if (!exigirAdmin()) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  const chaves = await db.apiKey.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, nome: true, chavePrefixo: true, escopo: true, canais: true, ativa: true, ultimoUsoEm: true, createdAt: true },
  })
  return NextResponse.json(chaves)
}

export async function POST(req: NextRequest) {
  if (!exigirAdmin()) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  const { nome, escopo, canais } = await req.json()
  if (!nome || typeof nome !== 'string' || !nome.trim()) {
    return NextResponse.json({ error: 'Informe um nome pra identificar o sistema que vai usar essa chave.' }, { status: 400 })
  }
  const escopoFinal = escopo === 'financeiro' ? 'financeiro' : 'produtos'
  const canaisFinal = Array.isArray(canais) ? canais.filter(c => CANAIS_VALIDOS.includes(c)) : []

  const chave = gerarChaveApi()
  const criada = await db.apiKey.create({
    data: { nome: nome.trim(), chaveHash: hashChaveApi(chave), chavePrefixo: prefixoVisivel(chave), escopo: escopoFinal, canais: canaisFinal },
  })

  // A chave em texto puro só existe nesta resposta -- não fica salva em lugar nenhum.
  return NextResponse.json({ id: criada.id, nome: criada.nome, escopo: criada.escopo, chave })
}
