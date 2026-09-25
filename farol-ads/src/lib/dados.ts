import { cache } from 'react'
import { agregarCampanhas, analisar, montarEntradas, seriePorCaptura, type CampanhaView, type LinhaView } from './agregacao'
import { demoAlertas, demoHistorico, demoPeriodo, demoPromocoes, demoSerie } from './demo'
import { periodoAnterior, type Filtros } from './filtros'
import { CONFIG_PADRAO, type ConfigMotor } from './motor'
import { lerView, supabaseConfigurado } from './supabase'
import type { Alerta, AnuncioAnalisado, CampanhaResumo, Estado, PontoSerie, Promocao, RecomendacaoHistorico } from './tipos'

export interface MetricaCampanha { nome: string; status: string | null; impressoes: number; cliques: number; investimento: number; receitaAds: number; vendas: number }
export type AnuncioPainel = AnuncioAnalisado & { decisaoCalculadaNoPainel: boolean; campanhas: string[]; porCampanha: MetricaCampanha[] }

export interface PainelDados {
  fonte: 'demo' | 'supabase'
  /** Data do relatório de anúncios usado (dados reais: última captura dentro do período). */
  capturadoEm: string | null
  relatorio: { desde: string | null; ate: string | null }
  anuncios: AnuncioPainel[]
  /** Todos os anúncios antes do filtro de estado (para contagens das abas). */
  anunciosSemFiltroEstado: AnuncioPainel[]
  campanhas: CampanhaResumo[]
  nomesCampanhas: string[]
  alertas: Alerta[]
  promocoes: Promocao[]
  historico: RecomendacaoHistorico[]
  serie: PontoSerie[]
  config: ConfigMotor
  totais: Totais
  totaisAnteriores: Totais | null
  avisos: string[]
}

export interface Totais {
  receitaTotal: number
  investimento: number
  receitaAds: number
  margemPreAds: number
  margemPosAds: number
  tacos: number | null
  anunciosSemCusto: number
}

function totais(anuncios: AnuncioAnalisado[]): Totais {
  let receitaTotal = 0, investimento = 0, receitaAds = 0, margemPre = 0, margemPos = 0, semCusto = 0
  for (const a of anuncios) {
    receitaTotal += a.economia.receitaLiquida
    investimento += a.investimento
    receitaAds += a.receitaAds
    if (a.economia.margemPreAds == null) { semCusto++; continue }
    margemPre += a.economia.margemPreAds
    margemPos += a.economia.margemPosAds!
  }
  return {
    receitaTotal, investimento, receitaAds, margemPreAds: margemPre, margemPosAds: margemPos,
    tacos: receitaTotal > 0 ? investimento / receitaTotal : null, anunciosSemCusto: semCusto,
  }
}

async function lerConfig(): Promise<ConfigMotor> {
  const linhas = await lerView<{ chave: string; valor: number }>('ads_painel_config')
  const cfg = { ...CONFIG_PADRAO }
  for (const l of linhas) if (l.chave in cfg) (cfg as Record<string, number>)[l.chave] = Number(l.valor)
  return cfg
}

/** Última data de captura em [de, ate] — o relatório é "total por período", então usamos o mais recente. */
async function ultimaCaptura(de: string, ate: string): Promise<string | null> {
  const r = await lerView<{ capturado_em: string }>('ads_painel_anuncios',
    { and: `(capturado_em.gte.${de},capturado_em.lte.${ate})` }, { select: 'capturado_em', order: 'capturado_em.desc', limit: 1 })
  return r[0]?.capturado_em ?? null
}

async function carregarReal(f: Filtros) {
  const avisos: string[] = []
  const [config, captura] = await Promise.all([lerConfig(), ultimaCaptura(f.de, f.ate)])
  const ant = periodoAnterior(f)
  const capturaAnt = await ultimaCaptura(ant.de, ant.ate)
  if (!captura) avisos.push('Nenhum relatório de anúncios processado dentro do período escolhido.')

  const porCaptura = (c: string | null) => (c ? { capturado_em: `eq.${c}` } : null)
  const [linhas, anteriores, campanhas, campanhasAnt, alertasRaw, promosRaw, histRaw, serieLinhas] = await Promise.all([
    porCaptura(captura) ? lerView<LinhaView>('ads_painel_anuncios', porCaptura(captura)!) : Promise.resolve([]),
    porCaptura(capturaAnt) ? lerView<LinhaView>('ads_painel_anuncios', porCaptura(capturaAnt)!) : Promise.resolve([]),
    porCaptura(captura) ? lerView<CampanhaView>('ads_painel_campanhas', porCaptura(captura)!) : Promise.resolve([]),
    porCaptura(capturaAnt) ? lerView<CampanhaView>('ads_painel_campanhas', porCaptura(capturaAnt)!) : Promise.resolve([]),
    lerView<Record<string, unknown>>('ads_painel_alertas', {}, { order: 'criado_em.desc', limit: 500 }),
    lerView<Record<string, unknown>>('ads_painel_promocoes', {}, { order: 'capturado_em.desc' }),
    lerView<Record<string, unknown>>('ads_painel_recomendacoes', {}, { order: 'gerado_em.desc', limit: 500 }),
    lerView<LinhaView>('ads_painel_anuncios', { and: `(capturado_em.gte.${f.de},capturado_em.lte.${f.ate})` },
      { select: 'canal,codigo_anuncio,nome_campanha,capturado_em,receita_ads,investimento_ads' }),
  ])
  const relatorio = linhas[0] ? { desde: (linhas[0] as unknown as Record<string, string>).relatorio_desde ?? null, ate: (linhas[0] as unknown as Record<string, string>).relatorio_ate ?? null } : { desde: null, ate: null }

  const alertas: Alerta[] = alertasRaw.map(r => ({
    id: String(r.id), canal: r.canal as Alerta['canal'], tipo: r.tipo as Alerta['tipo'], criadoEm: String(r.criado_em),
    codigoAnuncio: (r.item_id as string) ?? null, sku: (r.sku as string) ?? null, titulo: String(r.titulo ?? r.item_id ?? ''),
    campanha: (r.campanha_id as string) ?? null, gravidade: r.gravidade as Alerta['gravidade'], status: r.status as Alerta['status'],
    problema: String(r.problema ?? r.titulo ?? ''), causa: String(r.causa ?? ''), acao: String(r.acao ?? ''),
    resolvidoEm: (r.resolvido_em as string) ?? null,
  }))
  const promocoes: Promocao[] = promosRaw.map(r => ({
    canal: 'mercado_livre', itemId: String(r.item_id), titulo: String(r.titulo ?? r.item_id), sku: (r.sku as string) ?? null,
    preco: Number(r.preco_promocional ?? r.preco), precoOriginal: r.preco_original == null ? null : Number(r.preco_original),
    desconto: r.desconto == null ? null : Number(r.desconto), status: r.status as Promocao['status'],
    desde: String(r.desde), encerradaEm: (r.encerrada_em as string) ?? null, diasAtiva: r.dias_ativa == null ? null : Number(r.dias_ativa),
  }))
  const historico: RecomendacaoHistorico[] = histRaw.map(r => ({
    geradoEm: String(r.gerado_em), codigoAnuncio: String(r.codigo_anuncio), sku: (r.sku as string) ?? null,
    titulo: String(r.titulo ?? r.codigo_anuncio), estado: r.estado as Estado, gravidade: r.gravidade as RecomendacaoHistorico['gravidade'],
    motivo: String(r.motivo), acao: String(r.acao_recomendada), status: r.status_recomendacao as RecomendacaoHistorico['status'],
    resolvidoEm: (r.resolvido_em as string) ?? null,
  }))
  return { config, captura, relatorio, linhas, anteriores, campanhas, campanhasAnt, alertas, promocoes, historico, serieLinhas, avisos }
}

function carregarDemo(f: Filtros) {
  const ant = periodoAnterior(f)
  const d = demoPeriodo(f.de, f.ate, ant)
  return {
    config: CONFIG_PADRAO, captura: f.ate, relatorio: { desde: f.de, ate: f.ate }, ...d,
    alertas: demoAlertas(f.ate), promocoes: demoPromocoes(f.ate), historico: demoHistorico(f.ate),
    serieLinhas: null as LinhaView[] | null, avisos: [] as string[],
  }
}

export const carregarPainel = cache(async (f: Filtros): Promise<PainelDados> => {
  const real = supabaseConfigurado()
  const b = real ? await carregarReal(f) : carregarDemo(f)
  const hoje = new Date(`${f.ate}T12:00:00Z`)

  const noCanal = <T extends { canal: string }>(xs: T[]) => (f.canal === 'todos' ? xs : xs.filter(x => x.canal === f.canal))
  let linhas = noCanal(b.linhas)
  if (f.campanha) {
    const codigos = new Set(linhas.filter(l => l.nome_campanha === f.campanha).map(l => l.codigo_anuncio))
    linhas = linhas.filter(l => codigos.has(l.codigo_anuncio))
  }
  const anteriores = noCanal(b.anteriores)

  const analisarLinhas = (ls: LinhaView[], ants: LinhaView[]) =>
    analisar(montarEntradas(ls, b.campanhas, ants, b.historico), b.config, hoje).map(a => {
      const doAnuncio = ls.filter(l => l.canal === a.canal && l.codigo_anuncio === a.codigoAnuncio)
      return {
        ...a,
        campanhas: [...new Set(doAnuncio.map(l => l.nome_campanha))],
        porCampanha: doAnuncio.map(l => ({
          nome: l.nome_campanha, status: l.status, impressoes: Number(l.impressoes), cliques: Number(l.cliques),
          investimento: Number(l.investimento_ads), receitaAds: Number(l.receita_ads),
          vendas: Number(l.vendas_diretas) + Number(l.vendas_indiretas),
        })).sort((x, y) => y.investimento - x.investimento),
      }
    })
  const todos = analisarLinhas(linhas, anteriores)
  const anuncios = f.estado ? todos.filter(a => a.diagnostico.estado === f.estado) : todos
  const antAnalisados = anteriores.length ? analisarLinhas(anteriores, []) : []

  const codigosVisiveis = new Set(anuncios.map(a => a.codigoAnuncio))
  let campanhas = agregarCampanhas(todos, linhas, noCanal(b.campanhas), noCanal(b.campanhasAnt))
  if (f.campanha) campanhas = campanhas.filter(c => c.nome === f.campanha)
  if (f.estado) campanhas = campanhas.filter(c => linhas.some(l => l.nome_campanha === c.nome && codigosVisiveis.has(l.codigo_anuncio)))

  const serie = b.serieLinhas
    ? seriePorCaptura(noCanal(b.serieLinhas).filter(l => codigosVisiveis.has(l.codigo_anuncio)), anuncios)
    : demoSerie(f.de, f.ate, codigosVisiveis)

  const filtraAlerta = <T extends { canal: string; campanha?: string | null; codigoAnuncio?: string | null }>(xs: T[]) =>
    noCanal(xs).filter(x => !f.campanha || x.campanha === f.campanha || (x.codigoAnuncio && codigosVisiveis.has(x.codigoAnuncio)))

  return {
    fonte: real ? 'supabase' : 'demo',
    capturadoEm: b.captura,
    relatorio: b.relatorio,
    anuncios,
    anunciosSemFiltroEstado: todos,
    campanhas,
    nomesCampanhas: [...new Set(noCanal(b.campanhas).map(c => c.nome_campanha).concat(b.linhas.map(l => l.nome_campanha)))].sort(),
    alertas: filtraAlerta(b.alertas),
    promocoes: noCanal(b.promocoes).filter(p => !f.campanha || (p.itemId && codigosVisiveis.has(p.itemId))),
    historico: b.historico.filter(h => !f.campanha || codigosVisiveis.has(h.codigoAnuncio)),
    serie,
    config: b.config,
    totais: totais(anuncios),
    totaisAnteriores: antAnalisados.length ? totais(f.estado ? antAnalisados.filter(a => codigosVisiveis.has(a.codigoAnuncio)) : antAnalisados) : null,
    avisos: b.avisos,
  }
})

/** Série de um anúncio só (tela de detalhe). */
export async function serieDoAnuncio(f: Filtros, codigo: string, pctPre: number | null): Promise<PontoSerie[]> {
  if (!supabaseConfigurado()) return demoSerie(f.de, f.ate, new Set([codigo]))
  const ls = await lerView<LinhaView>('ads_painel_anuncios',
    { codigo_anuncio: `eq.${codigo}`, and: `(capturado_em.gte.${f.de},capturado_em.lte.${f.ate})` },
    { select: 'capturado_em,receita_ads,investimento_ads' })
  const por = new Map<string, PontoSerie>()
  for (const l of ls) {
    const p = por.get(l.capturado_em) ?? { data: l.capturado_em, receita: 0, investimento: 0, margemPosAds: 0 }
    p.receita += Number(l.receita_ads); p.investimento += Number(l.investimento_ads)
    p.margemPosAds += (pctPre ?? 0) * Number(l.receita_ads) - Number(l.investimento_ads)
    por.set(l.capturado_em, p)
  }
  return [...por.values()].sort((a, b) => a.data.localeCompare(b.data))
}
