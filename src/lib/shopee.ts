// Shopee Open Platform (API v2): assinatura, autorização da loja, tokens e
// chamadas. Só roda no servidor.
//
// Credenciais vêm do ambiente: SHOPEE_HOST, SHOPEE_PARTNER_ID e
// SHOPEE_PARTNER_KEY. Em teste o host é o sandbox; em produção é
// https://partner.shopeemobile.com e a Shopee exige IP fixo na lista do app.
//
// Os tokens ficam numa tabela própria (ShopeeConexao), criada sob demanda, e
// não em Configuracao: Configuracao entra no backup diário e na exportação, e
// token não pode ir parar lá.
import crypto from 'crypto'
import db from '@/lib/db'

export class ErroShopee extends Error {
  constructor(public codigo: string, mensagem: string) { super(mensagem) }
}

export interface CredenciaisShopee { host: string; partnerId: string; partnerKey: string }

export function credenciais(): CredenciaisShopee {
  const { SHOPEE_HOST, SHOPEE_PARTNER_ID, SHOPEE_PARTNER_KEY } = process.env
  if (!SHOPEE_HOST || !SHOPEE_PARTNER_ID || !SHOPEE_PARTNER_KEY) {
    throw new ErroShopee('SEM_CONFIG', 'As credenciais da Shopee ainda não foram configuradas neste servidor.')
  }
  return { host: SHOPEE_HOST.replace(/\/+$/, ''), partnerId: SHOPEE_PARTNER_ID, partnerKey: SHOPEE_PARTNER_KEY }
}

export const ehSandbox = (host: string) => /sandbox|test-stable/.test(host)

/**
 * Assinatura da API v2: HMAC-SHA256 com a partner key sobre
 * partner_id + caminho + timestamp (+ access_token + shop_id nas chamadas da loja).
 */
export function assinar(c: CredenciaisShopee, caminho: string, timestamp: number, accessToken = '', shopId = ''): string {
  return crypto.createHmac('sha256', c.partnerKey).update(`${c.partnerId}${caminho}${timestamp}${accessToken}${shopId}`).digest('hex')
}

const agora = () => Math.floor(Date.now() / 1000)

/** Link em que a dona da loja entra na Shopee e autoriza o app. */
export function urlAutorizacao(c: CredenciaisShopee, redirect: string, ts = agora()): string {
  const caminho = '/api/v2/shop/auth_partner'
  const q = new URLSearchParams({ partner_id: c.partnerId, timestamp: String(ts), sign: assinar(c, caminho, ts), redirect })
  return `${c.host}${caminho}?${q}`
}

// ── Tokens ───────────────────────────────────────────────────
export interface Conexao {
  shopId: string; accessToken: string; refreshToken: string
  /** quando o access token vence (dura ~4 h; o refresh token dura ~30 dias) */
  expiraEm: Date; atualizadoEm: Date; ambiente: string
}

let tabelaPronta = false
async function garantirTabela() {
  if (tabelaPronta) return
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ShopeeConexao" (
      "id" INTEGER PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
      "shopId" TEXT NOT NULL,
      "accessToken" TEXT NOT NULL,
      "refreshToken" TEXT NOT NULL,
      "expiraEm" TIMESTAMPTZ NOT NULL,
      "ambiente" TEXT NOT NULL,
      "atualizadoEm" TIMESTAMPTZ NOT NULL DEFAULT now()
    )`)
  tabelaPronta = true
}

export async function lerConexao(): Promise<Conexao | null> {
  await garantirTabela()
  const linhas = await db.$queryRaw<Conexao[]>`SELECT "shopId", "accessToken", "refreshToken", "expiraEm", "atualizadoEm", "ambiente" FROM "ShopeeConexao" WHERE "id" = 1`
  return linhas[0] ?? null
}

async function gravarConexao(c: { shopId: string; accessToken: string; refreshToken: string; expiraEm: Date; ambiente: string }) {
  await garantirTabela()
  await db.$executeRaw`
    INSERT INTO "ShopeeConexao" ("id", "shopId", "accessToken", "refreshToken", "expiraEm", "ambiente", "atualizadoEm")
    VALUES (1, ${c.shopId}, ${c.accessToken}, ${c.refreshToken}, ${c.expiraEm}, ${c.ambiente}, now())
    ON CONFLICT ("id") DO UPDATE SET "shopId" = EXCLUDED."shopId", "accessToken" = EXCLUDED."accessToken",
      "refreshToken" = EXCLUDED."refreshToken", "expiraEm" = EXCLUDED."expiraEm", "ambiente" = EXCLUDED."ambiente", "atualizadoEm" = now()`
}

export async function desconectar() {
  await garantirTabela()
  await db.$executeRaw`DELETE FROM "ShopeeConexao" WHERE "id" = 1`
}

async function lerJson(r: Response): Promise<Record<string, unknown>> {
  const texto = await r.text()
  try { return JSON.parse(texto) } catch { throw new ErroShopee('RESPOSTA_INVALIDA', `A Shopee respondeu algo que não é JSON (HTTP ${r.status}).`) }
}

/** A Shopee devolve HTTP 200 com "error" preenchido quando algo dá errado. */
function conferir(j: Record<string, unknown>, status: number) {
  const erro = typeof j.error === 'string' ? j.error : ''
  if (erro || status >= 400) {
    const msg = typeof j.message === 'string' && j.message ? j.message : `HTTP ${status}`
    throw new ErroShopee(erro || `HTTP_${status}`, `Shopee: ${msg}`)
  }
}

async function pedirToken(c: CredenciaisShopee, caminho: string, corpo: Record<string, unknown>, shopId: string) {
  const ts = agora()
  const q = new URLSearchParams({ partner_id: c.partnerId, timestamp: String(ts), sign: assinar(c, caminho, ts) })
  const r = await fetch(`${c.host}${caminho}?${q}`, {
    method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...corpo, shop_id: Number(shopId), partner_id: Number(c.partnerId) }),
  })
  const j = await lerJson(r)
  conferir(j, r.status)
  if (typeof j.access_token !== 'string' || typeof j.refresh_token !== 'string') {
    throw new ErroShopee('SEM_TOKEN', 'A Shopee não devolveu o token de acesso.')
  }
  const conexao = {
    shopId, accessToken: j.access_token, refreshToken: j.refresh_token,
    // margem de 5 minutos para nunca usar um token no limite
    expiraEm: new Date(Date.now() + (Number(j.expire_in ?? 14400) - 300) * 1000),
    ambiente: ehSandbox(c.host) ? 'teste' : 'producao',
  }
  await gravarConexao(conexao)
  return conexao
}

/** Troca o código que volta da autorização pelos tokens da loja. */
export const trocarCodigo = (c: CredenciaisShopee, code: string, shopId: string) =>
  pedirToken(c, '/api/v2/auth/token/get', { code }, shopId)

/** Devolve um access token válido, renovando com o refresh token quando venceu. */
async function tokenValido(c: CredenciaisShopee): Promise<{ accessToken: string; shopId: string }> {
  const con = await lerConexao()
  if (!con) throw new ErroShopee('NAO_CONECTADA', 'A loja da Shopee ainda não foi autorizada.')
  if (con.expiraEm.getTime() > Date.now()) return { accessToken: con.accessToken, shopId: con.shopId }
  const nova = await pedirToken(c, '/api/v2/auth/access_token/get', { refresh_token: con.refreshToken }, con.shopId)
  return { accessToken: nova.accessToken, shopId: nova.shopId }
}

/** Chamada GET em nome da loja. Devolve o campo "response" da Shopee. */
export async function chamar<T = Record<string, unknown>>(caminho: string, params: Record<string, string | number> = {}): Promise<T> {
  const c = credenciais()
  const { accessToken, shopId } = await tokenValido(c)
  const ts = agora()
  const q = new URLSearchParams({
    partner_id: c.partnerId, timestamp: String(ts), access_token: accessToken, shop_id: shopId,
    sign: assinar(c, caminho, ts, accessToken, shopId),
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  })
  const r = await fetch(`${c.host}${caminho}?${q}`, { cache: 'no-store' })
  const j = await lerJson(r)
  conferir(j, r.status)
  return (j.response ?? {}) as T
}

// ── Leituras ─────────────────────────────────────────────────
export interface PedidoShopee { order_sn: string; order_status?: string }
export interface RendaPedido {
  orderSn: string
  /** o que o comprador pagou pelos produtos, antes das taxas */
  valorProdutos: number | null
  comissao: number | null
  taxaServico: number | null
  taxaTransacao: number | null
  /** o que a Shopee repassa ao vendedor */
  repasse: number | null
}

/** Pedidos criados nos últimos `dias` (a Shopee limita cada consulta a 15 dias). */
export async function listarPedidos(dias: number, maximo = 50): Promise<PedidoShopee[]> {
  const ate = agora()
  const de = ate - Math.min(15, Math.max(1, Math.floor(dias))) * 86400
  const r = await chamar<{ order_list?: PedidoShopee[] }>('/api/v2/order/get_order_list', {
    time_range_field: 'create_time', time_from: de, time_to: ate, page_size: Math.min(100, maximo),
  })
  return r.order_list ?? []
}

const numero = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)

/** Taxas e repasse de um pedido (o que a tela "Minha Renda" mostra). */
export async function rendaDoPedido(orderSn: string): Promise<RendaPedido> {
  const r = await chamar<{ order_income?: Record<string, unknown> }>('/api/v2/payment/get_escrow_detail', { order_sn: orderSn })
  const i = r.order_income ?? {}
  return {
    orderSn,
    valorProdutos: numero(i.order_selling_price) ?? numero(i.original_price),
    comissao: numero(i.commission_fee),
    taxaServico: numero(i.service_fee),
    taxaTransacao: numero(i.seller_transaction_fee),
    repasse: numero(i.escrow_amount),
  }
}
