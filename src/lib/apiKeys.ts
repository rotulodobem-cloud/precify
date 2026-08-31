import { randomBytes, createHash } from 'crypto'
import db from '@/lib/db'

const PREFIXO = 'pfk_'

/** Gera uma nova chave em texto puro (só existe neste momento, nunca é salva). */
export function gerarChaveApi(): string {
  return PREFIXO + randomBytes(24).toString('hex')
}

export function hashChaveApi(chave: string): string {
  return createHash('sha256').update(chave).digest('hex')
}

export function prefixoVisivel(chave: string): string {
  return chave.slice(0, PREFIXO.length + 6) + '…'
}

export type EscopoChaveApi = 'produtos' | 'financeiro'

export interface ChaveApiValidada {
  escopo: EscopoChaveApi
  /** slugs de canal permitidos (loja_propria, ml_full, ml_classico, shopee, tiktok); [] = todos */
  canais: string[]
}

/** Confere uma chave recebida via header contra as chaves ativas no banco e devolve escopo + canais permitidos. */
export async function validarChaveApi(chave: string | null): Promise<ChaveApiValidada | null> {
  if (!chave) return null
  const registro = await db.apiKey.findUnique({ where: { chaveHash: hashChaveApi(chave) } })
  if (!registro || !registro.ativa) return null
  db.apiKey.update({ where: { id: registro.id }, data: { ultimoUsoEm: new Date() } }).catch(() => {})
  return { escopo: registro.escopo === 'financeiro' ? 'financeiro' : 'produtos', canais: registro.canais }
}
