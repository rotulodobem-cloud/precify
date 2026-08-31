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

/** Confere uma chave recebida via header contra as chaves ativas no banco. */
export async function validarChaveApi(chave: string | null): Promise<boolean> {
  if (!chave) return false
  const registro = await db.apiKey.findUnique({ where: { chaveHash: hashChaveApi(chave) } })
  if (!registro || !registro.ativa) return false
  db.apiKey.update({ where: { id: registro.id }, data: { ultimoUsoEm: new Date() } }).catch(() => {})
  return true
}
