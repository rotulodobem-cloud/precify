// Sugestão de compra por giro de estoque.
// Entrada: vendas das últimas 13 semanas (semana 0 = a mais recente) e saldo atual.
// Saída: previsão de venda diária, cobertura em dias e quanto comprar.

export const SEMANAS = 13

/** Prazo de entrega em dias. Padrão informado pela Michele em 15/11/2026. */
export const PRAZO_PADRAO = 2
export const PRAZO_POR_FORNECEDOR: Record<string, number> = { GOMAH: 4 }
/** Linhas que demoram mais. O número de dias é provisório até a Michele confirmar. */
export const PRAZO_LINHAS_LENTAS = 7
const LINHAS_LENTAS = /drage|amanteigad|[oó]leo(s)? essencia/i

export function prazoEntrega(fornecedor: string | null | undefined, nome: string, categoria?: string | null): number {
  if (LINHAS_LENTAS.test(nome) || (categoria && LINHAS_LENTAS.test(categoria))) return PRAZO_LINHAS_LENTAS
  const f = (fornecedor ?? '').trim().toUpperCase()
  return PRAZO_POR_FORNECEDOR[f] ?? PRAZO_PADRAO
}

export type StatusGiro = 'urgente' | 'comprar' | 'ok' | 'parado' | 'sem_venda'

export interface EntradaGiro {
  /** vendas por semana, índice 0 = semana mais recente; semanas sem venda = 0 */
  semanas: number[]
  saldo: number | null
  /** dias com foto de estoque no período e, deles, quantos com saldo zerado */
  diasFoto: number
  diasZerado: number
  prazoDias: number
  coberturaDias: number
  /** reforço de temporada sobre a venda prevista para a compra (0.3 = +30%); padrão 0 */
  reforco?: number
}

export interface ResultadoGiro {
  vendaDia: number
  venda30d: number
  venda90d: number
  /** variação das 4 últimas semanas contra a média das 13 (0.2 = +20%) */
  tendencia: number | null
  /** dias que o saldo atual dura no ritmo previsto; null se não há venda */
  coberturaAtual: number | null
  estoqueSeguranca: number
  sugestao: number
  status: StatusGiro
  /** true quando a venda foi corrigida por dias sem estoque */
  corrigidoRuptura: boolean
}

const DIAS_PARADO = 120
// nível de serviço ~90%: cobre a variação normal de venda durante o prazo de entrega
const Z = 1.28

const media = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0)

/** Preenche as 13 semanas a partir do formato esparso que vem do Farol. */
export function serieSemanal(pontos: { s: number; valor: number }[]): number[] {
  const serie = new Array<number>(SEMANAS).fill(0)
  for (const p of pontos) if (p.s >= 0 && p.s < SEMANAS) serie[p.s] += p.valor
  return serie
}

export function calcularGiro(e: EntradaGiro): ResultadoGiro {
  const semanas = e.semanas.slice(0, SEMANAS)
  const saldo = Math.max(0, e.saldo ?? 0)
  const m4 = media(semanas.slice(0, 4))
  const m13 = media(semanas)

  // Dias sem estoque não vendem: sem correção, quem ficou zerado parece vender pouco.
  let fator = 1
  const diasComEstoque = e.diasFoto - e.diasZerado
  if (e.diasFoto >= 14 && e.diasZerado > 0 && diasComEstoque > 0) fator = Math.min(2, e.diasFoto / diasComEstoque)

  // Venda subindo: o mês recente pesa mais. Venda caindo: fica a média do
  // trimestre. Queda de um mês costuma ser passageira (produto fora da
  // prateleira, mês fraco) e cortar a compra por ela deixa faltar produto.
  const vendaSemana = Math.max(m13, 0.6 * m4 + 0.4 * m13) * fator
  const vendaDia = vendaSemana / 7

  const variancia = media(semanas.map(x => (x - m13) ** 2))
  const estoqueSeguranca = vendaDia > 0 ? Z * Math.sqrt(variancia) * Math.sqrt(e.prazoDias / 7) : 0

  const coberturaAtual = vendaDia > 0 ? saldo / vendaDia : null
  // Reforço de temporada (Natal, Black Friday...): só aumenta o quanto comprar.
  // O histórico de 13 semanas não enxerga datas que ainda não aconteceram.
  const reforco = Math.min(3, Math.max(0, e.reforco ?? 0))
  const alvo = vendaDia * (1 + reforco) * (e.prazoDias + e.coberturaDias) + estoqueSeguranca * (1 + reforco)
  const sugestao = vendaDia > 0 ? Math.max(0, alvo - saldo) : 0

  let status: StatusGiro
  if (vendaDia <= 0) status = saldo > 0 ? 'parado' : 'sem_venda'
  else if (coberturaAtual! <= e.prazoDias) status = 'urgente'
  else if (sugestao > 0 && coberturaAtual! < e.prazoDias + e.coberturaDias / 2) status = 'comprar'
  else if (coberturaAtual! > DIAS_PARADO) status = 'parado'
  else status = 'ok'

  return {
    vendaDia,
    venda30d: semanas.slice(0, 4).reduce((s, x) => s + x, 0) * (30 / 28),
    venda90d: semanas.reduce((s, x) => s + x, 0) * (90 / 91),
    tendencia: m13 > 0 ? m4 / m13 - 1 : null,
    coberturaAtual,
    estoqueSeguranca,
    sugestao,
    status,
    corrigidoRuptura: fator > 1,
  }
}

/** Arredonda para cima numa quantidade comprável: kg inteiro (ou meio kg abaixo de 5), unidade inteira. */
export function arredondarCompra(qtd: number, unidade: string): number {
  if (qtd <= 0) return 0
  if (unidade !== 'kg') return Math.ceil(qtd)
  return qtd < 5 ? Math.ceil(qtd * 2) / 2 : Math.ceil(qtd)
}
