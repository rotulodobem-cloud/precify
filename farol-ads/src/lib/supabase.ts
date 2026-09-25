/**
 * Acesso ao Supabase via PostgREST, só no servidor.
 * - leitura do painel: SUPABASE_PAINEL_KEY (role painel_leitura → só views ads_painel_*)
 * - gravação da ingestão: SUPABASE_SERVICE_ROLE_KEY (nunca usada nas telas)
 */

export function supabaseConfigurado(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PAINEL_KEY)
}

type Filtro = Record<string, string>

async function chamar(caminho: string, chave: string, init: RequestInit = {}) {
  const url = `${process.env.SUPABASE_URL!.replace(/\/$/, '')}/rest/v1/${caminho}`
  const r = await fetch(url, {
    ...init,
    cache: 'no-store',
    headers: {
      apikey: chave,
      Authorization: `Bearer ${chave}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (!r.ok) throw new Error(`Supabase ${r.status} em ${caminho.split('?')[0]}: ${(await r.text()).slice(0, 300)}`)
  return r.status === 204 ? null : r.json()
}

/** SELECT numa view do painel. `filtros` usa a sintaxe do PostgREST (ex.: { capturado_em: 'lte.2026-09-24' }). */
export async function lerView<T>(view: string, filtros: Filtro = {}, opts: { select?: string; order?: string; limit?: number } = {}): Promise<T[]> {
  const q = new URLSearchParams({ select: opts.select ?? '*', ...filtros })
  if (opts.order) q.set('order', opts.order)
  if (opts.limit) q.set('limit', String(opts.limit))
  return chamar(`${view}?${q}`, process.env.SUPABASE_PAINEL_KEY!)
}

function chaveServico(): string {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!process.env.SUPABASE_URL || !k) throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias para a ingestão.')
  return k
}

/** Upsert (ingestão). `onConflict` = colunas da chave primária/única. */
export async function gravar(tabela: string, linhas: unknown[], onConflict: string) {
  if (linhas.length === 0) return
  for (let i = 0; i < linhas.length; i += 500) {
    await chamar(`${tabela}?on_conflict=${onConflict}`, chaveServico(), {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(linhas.slice(i, i + 500)),
    })
  }
}

export async function inserir(tabela: string, linhas: unknown[]) {
  if (linhas.length === 0) return
  await chamar(tabela, chaveServico(), {
    method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(linhas),
  })
}

export async function lerTabelaServico<T>(tabela: string, filtros: Filtro = {}, select = '*'): Promise<T[]> {
  const q = new URLSearchParams({ select, ...filtros })
  return chamar(`${tabela}?${q}`, chaveServico())
}

/** UPDATE parcial (PATCH do PostgREST) — ex.: atualizar('ads_alertas', { id: 'eq.…' }, { status: 'resolvido' }). */
export async function atualizar(tabela: string, filtros: Filtro, dados: Record<string, unknown>) {
  await chamar(`${tabela}?${new URLSearchParams(filtros)}`, chaveServico(), {
    method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(dados),
  })
}
