const brl0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const brl2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })

/** R$ 1.234 (sem centavos acima de R$ 100; com centavos abaixo). */
export function reais(v: number | null | undefined, opts: { sinal?: boolean } = {}): string {
  if (v == null || !isFinite(v)) return '—'
  const f = Math.abs(v) >= 100 ? brl0 : brl2
  const s = f.format(Math.abs(v)).replace(/ /g, ' ')
  if (v < 0) return `−${s}`
  return opts.sinal && v > 0 ? `+${s}` : s
}

export function pct(v: number | null | undefined, casas = 1, opts: { sinal?: boolean } = {}): string {
  if (v == null || !isFinite(v)) return '—'
  const s = (Math.abs(v) * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
  if (v < 0) return `−${s}%`
  return `${opts.sinal && v > 0 ? '+' : ''}${s}%`
}

export function num(v: number | null | undefined, casas = 2): string {
  if (v == null || !isFinite(v)) return '—'
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

export function inteiro(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—'
  return Math.round(v).toLocaleString('pt-BR')
}

/** Pontos percentuais: diferença entre duas frações (0,318 − 0,256 = +6,2 p.p.). */
export function pp(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—'
  const s = (Math.abs(v) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return `${v < 0 ? '−' : '+'}${s} p.p.`
}

/** Variação relativa entre atual e anterior (null quando não há base). */
export function variacao(atual: number | null | undefined, anterior: number | null | undefined): number | null {
  if (atual == null || anterior == null || anterior === 0) return null
  return (atual - anterior) / Math.abs(anterior)
}

export function dataCurta(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}${a ? '' : ''}`
}

export function dataLonga(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export function dataHora(iso: string): string {
  const dt = new Date(iso)
  return dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
}
