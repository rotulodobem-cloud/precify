import type { Canal, Estado } from './tipos'
import { ESTADOS } from './tipos'

/** Filtros globais (ficam na URL e valem para todas as telas ao mesmo tempo). */
export interface Filtros {
  periodo: '7d' | '30d' | '90d' | 'mes' | 'ano' | 'custom'
  de: string
  ate: string
  canal: Canal | 'todos'
  campanha: string | null
  estado: Estado | null
}

export const PERIODOS: { valor: Filtros['periodo']; rotulo: string }[] = [
  { valor: '7d', rotulo: 'Últimos 7 dias' },
  { valor: '30d', rotulo: 'Últimos 30 dias' },
  { valor: '90d', rotulo: 'Últimos 90 dias' },
  { valor: 'mes', rotulo: 'Este mês' },
  { valor: 'ano', rotulo: 'Este ano' },
  { valor: 'custom', rotulo: 'Personalizado' },
]

const iso = (d: Date) => d.toISOString().slice(0, 10)
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/

export function hojeISO(): string {
  // Data em São Paulo (o relatório e a tarefa diária usam o fuso da loja)
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

export function lerFiltros(sp: Record<string, string | string[] | undefined>, hoje = hojeISO()): Filtros {
  const v = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) as string | undefined
  const periodo = (PERIODOS.some(p => p.valor === v('periodo')) ? v('periodo') : '30d') as Filtros['periodo']
  const fim = new Date(`${hoje}T12:00:00Z`)
  let de: string
  let ate = hoje
  if (periodo === 'custom' && RE_DATA.test(v('de') ?? '') && RE_DATA.test(v('ate') ?? '')) {
    de = v('de')!; ate = v('ate')!
    if (de > ate) [de, ate] = [ate, de]
  } else if (periodo === 'mes') {
    de = `${hoje.slice(0, 7)}-01`
  } else if (periodo === 'ano') {
    de = `${hoje.slice(0, 4)}-01-01`
  } else {
    const dias = periodo === '7d' ? 7 : periodo === '90d' ? 90 : 30
    de = iso(new Date(fim.getTime() - (dias - 1) * 86_400_000))
  }
  const canal = (['mercado_livre', 'shopee', 'tiktok'].includes(v('canal') ?? '') ? v('canal') : 'todos') as Filtros['canal']
  const estado = ESTADOS.includes(v('estado') as Estado) ? (v('estado') as Estado) : null
  return { periodo: periodo === 'custom' && de === undefined ? '30d' : periodo, de, ate, canal, campanha: v('campanha') || null, estado }
}

export function diasNoPeriodo(f: Pick<Filtros, 'de' | 'ate'>): number {
  return Math.round((new Date(f.ate).getTime() - new Date(f.de).getTime()) / 86_400_000) + 1
}

/** Período anterior equivalente (mesmo número de dias, imediatamente antes). */
export function periodoAnterior(f: Pick<Filtros, 'de' | 'ate'>): { de: string; ate: string } {
  const dias = diasNoPeriodo(f)
  const ate = new Date(new Date(`${f.de}T12:00:00Z`).getTime() - 86_400_000)
  const de = new Date(ate.getTime() - (dias - 1) * 86_400_000)
  return { de: iso(de), ate: iso(ate) }
}

export function rotuloPeriodo(f: Filtros): string {
  if (f.periodo !== 'custom') return PERIODOS.find(p => p.valor === f.periodo)!.rotulo
  const fmt = (s: string) => s.split('-').reverse().join('/')
  return `${fmt(f.de)} – ${fmt(f.ate)}`
}

/** Query string dos filtros, para links entre telas manterem o mesmo recorte. */
export function queryFiltros(f: Filtros, extra: Record<string, string | null | undefined> = {}): string {
  const q = new URLSearchParams()
  if (f.periodo !== '30d') q.set('periodo', f.periodo)
  if (f.periodo === 'custom') { q.set('de', f.de); q.set('ate', f.ate) }
  if (f.canal !== 'todos') q.set('canal', f.canal)
  if (f.campanha) q.set('campanha', f.campanha)
  if (f.estado) q.set('estado', f.estado)
  for (const [k, val] of Object.entries(extra)) if (val) q.set(k, val); else q.delete(k)
  const s = q.toString()
  return s ? `?${s}` : ''
}
