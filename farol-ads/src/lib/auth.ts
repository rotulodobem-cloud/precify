/**
 * Sessão do painel: cookie assinado (HMAC-SHA256) com validade. Roda no middleware
 * (Edge) e nas rotas (Node), por isso usa só Web Crypto.
 */
export const COOKIE_SESSAO = 'farol_sessao'
export const VALIDADE_SEG = 60 * 60 * 24 * 7 // 7 dias

const enc = new TextEncoder()

async function assinar(texto: string): Promise<string> {
  const segredo = process.env.PAINEL_SEGREDO
  if (!segredo || segredo.length < 16) throw new Error('PAINEL_SEGREDO ausente ou curto demais (mínimo 16 caracteres).')
  const chave = await crypto.subtle.importKey('raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', chave, enc.encode(texto))
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function iguais(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

export async function criarSessao(usuario: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + VALIDADE_SEG
  const corpo = `${encodeURIComponent(usuario)}.${exp}`
  return `${corpo}.${await assinar(corpo)}`
}

export async function validarSessao(valor: string | undefined): Promise<string | null> {
  if (!valor) return null
  const partes = valor.split('.')
  if (partes.length !== 3) return null
  const [u, exp, sig] = partes
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return null
  try {
    return iguais(sig, await assinar(`${u}.${exp}`)) ? decodeURIComponent(u) : null
  } catch {
    return null
  }
}

export function credenciaisValidas(usuario: string, senha: string): boolean {
  const u = process.env.PAINEL_USUARIO, s = process.env.PAINEL_SENHA
  if (!u || !s) return false
  return iguais(usuario, u) && iguais(senha, s)
}
