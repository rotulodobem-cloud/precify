import { calcularEconomia } from './economia'
import { CONFIG_PADRAO, diagnosticar, type ConfigMotor } from './motor'
import type {
  AnuncioAnalisado, AnuncioEntrada, CampanhaResumo, Canal, Diagnostico, Estado, Gravidade, PontoSerie, RecomendacaoHistorico,
} from './tipos'

/** Uma linha da view ads_painel_anuncios (anúncio × campanha × captura). */
export interface LinhaView {
  canal: Canal
  codigo_anuncio: string
  nome_campanha: string
  capturado_em: string
  sku: string | null
  titulo_anuncio: string | null
  status: string | null
  categoria: string | null
  impressoes: number
  cliques: number
  investimento_ads: number
  receita_ads: number
  vendas_diretas: number
  vendas_indiretas: number
  perdeu_buy_box: boolean | null
  estoque: number | null
  receita_total: number | null
  unidades: number | null
  custo_unitario: number | null
  imposto_pct: number
  comissao_pct: number
  taxa_fixa_unit: number
  ultima_alteracao_em: string | null
  tipo_ultima_alteracao: string | null
  // decisão gravada pela ingestão (null quando o motor ainda não rodou para esta captura)
  estado_motor: Estado | null
  gravidade: Gravidade | null
  impacto: number | null
  proxima_data_reavaliacao: string | null
  motivo: string | null
  evidencias: string[] | null
  impacto_texto: string | null
  acao_recomendada: string | null
  componente: Diagnostico['componente'] | null
  travas: string[] | null
  status_recomendacao?: Diagnostico['statusRecomendacao'] | null
  recomendacao_id?: string | null
}

export interface CampanhaView {
  canal: Canal
  nome_campanha: string
  capturado_em: string
  status: string | null
  orcamento: number | null
  roas_objetivo: number | null
  impressoes: number | null
  cliques: number | null
  investimento: number | null
  receita: number | null
  vendas: number | null
  anuncios: number | null
}

const n = (v: unknown) => (v == null ? 0 : Number(v))
const nn = (v: unknown) => (v == null ? null : Number(v))

/**
 * Junta as linhas de um mesmo anúncio (ele pode estar em mais de uma campanha — caso
 * da Cúrcuma) numa entrada única para o motor. Receita total e custo são do SKU, então
 * vêm da primeira linha; métricas de mídia somam.
 */
export function montarEntradas(
  linhas: LinhaView[], campanhas: CampanhaView[], anteriores: LinhaView[], historico: RecomendacaoHistorico[],
): { entrada: AnuncioEntrada; linhas: LinhaView[] }[] {
  const grupos = new Map<string, LinhaView[]>()
  for (const l of linhas) {
    const k = `${l.canal}|${l.codigo_anuncio}`
    grupos.set(k, [...(grupos.get(k) ?? []), l])
  }
  const antPorAnuncio = new Map<string, LinhaView[]>()
  for (const l of anteriores) {
    const k = `${l.canal}|${l.codigo_anuncio}`
    antPorAnuncio.set(k, [...(antPorAnuncio.get(k) ?? []), l])
  }
  const campPorNome = new Map(campanhas.map(c => [`${c.canal}|${c.nome_campanha}`, c]))

  return [...grupos.entries()].map(([k, ls]) => {
    const p = ls[0]
    const principal = [...ls].sort((a, b) => n(b.investimento_ads) - n(a.investimento_ads))[0]
    const soma = (f: (l: LinhaView) => unknown, arr = ls) => arr.reduce((s, l) => s + n(f(l)), 0)
    const ant = antPorAnuncio.get(k)
    const jaTentou = historico.some(h => h.codigoAnuncio === p.codigo_anuncio
      && (h.estado === 'OTIMIZAR' || h.estado === 'REDUZIR') && (h.status === 'aplicada' || h.status === 'resolvida'))
    const entrada: AnuncioEntrada = {
      canal: p.canal,
      codigoAnuncio: p.codigo_anuncio,
      sku: p.sku,
      titulo: p.titulo_anuncio ?? p.codigo_anuncio,
      campanha: principal.nome_campanha,
      categoria: p.categoria,
      status: principal.status ?? '—',
      impressoes: soma(l => l.impressoes),
      cliques: soma(l => l.cliques),
      investimento: soma(l => l.investimento_ads),
      receitaAds: soma(l => l.receita_ads),
      vendasDiretas: soma(l => l.vendas_diretas),
      vendasIndiretas: soma(l => l.vendas_indiretas),
      receitaTotal: nn(p.receita_total),
      unidades: nn(p.unidades),
      custoUnitario: nn(p.custo_unitario),
      impostoPct: n(p.imposto_pct),
      comissaoPct: n(p.comissao_pct),
      taxaFixaUnit: n(p.taxa_fixa_unit),
      freteEmpresa: null,
      roasObjetivo: nn(campPorNome.get(`${p.canal}|${principal.nome_campanha}`)?.roas_objetivo),
      estoque: nn(p.estoque),
      perdeuBuyBox: ls.some(l => l.perdeu_buy_box === true) ? true : ls.every(l => l.perdeu_buy_box == null) ? null : false,
      ultimaAlteracaoEm: p.ultima_alteracao_em,
      tipoUltimaAlteracao: p.tipo_ultima_alteracao,
      jaTentouAjustar: jaTentou,
      anterior: ant ? {
        impressoes: soma(l => l.impressoes, ant), cliques: soma(l => l.cliques, ant),
        investimento: soma(l => l.investimento_ads, ant), receitaAds: soma(l => l.receita_ads, ant),
        vendasDiretas: soma(l => l.vendas_diretas, ant), vendasIndiretas: soma(l => l.vendas_indiretas, ant),
        receitaTotal: nn(ant[0].receita_total),
        margemPosAds: calcularEconomia(entradaMinima(ant)).margemPosAds,
      } : undefined,
    }
    return { entrada, linhas: ls }
  })
}

function entradaMinima(ls: LinhaView[]): AnuncioEntrada {
  const p = ls[0]
  const soma = (f: (l: LinhaView) => unknown) => ls.reduce((s, l) => s + n(f(l)), 0)
  return {
    canal: p.canal, codigoAnuncio: p.codigo_anuncio, sku: p.sku, titulo: '', campanha: '', categoria: null, status: '',
    impressoes: soma(l => l.impressoes), cliques: soma(l => l.cliques), investimento: soma(l => l.investimento_ads),
    receitaAds: soma(l => l.receita_ads), vendasDiretas: soma(l => l.vendas_diretas), vendasIndiretas: soma(l => l.vendas_indiretas),
    receitaTotal: nn(p.receita_total), unidades: nn(p.unidades), custoUnitario: nn(p.custo_unitario),
    impostoPct: n(p.imposto_pct), comissaoPct: n(p.comissao_pct), taxaFixaUnit: n(p.taxa_fixa_unit), freteEmpresa: null,
    roasObjetivo: null, estoque: null, perdeuBuyBox: null, ultimaAlteracaoEm: null, tipoUltimaAlteracao: null, jaTentouAjustar: false,
  }
}

/**
 * Economia + decisão por anúncio. A decisão vem da ingestão (gravada em
 * ads_recomendacoes_historico); só quando ela ainda não existe para a captura é que
 * o painel roda o mesmo motor — e sinaliza isso.
 */
export function analisar(
  grupos: { entrada: AnuncioEntrada; linhas: LinhaView[] }[], cfg: ConfigMotor = CONFIG_PADRAO, hoje = new Date(),
): (AnuncioAnalisado & { decisaoCalculadaNoPainel: boolean })[] {
  return grupos.map(({ entrada, linhas }) => {
    const economia = calcularEconomia(entrada)
    const gravada = linhas.find(l => l.estado_motor)
    const diagnostico: Diagnostico = gravada
      ? {
        estado: gravada.estado_motor!, gravidade: gravada.gravidade ?? 'INFORMATIVO', impacto: n(gravada.impacto),
        titulo: `${gravada.estado_motor} — ${entrada.titulo}`, situacao: gravada.motivo ?? '',
        evidencias: gravada.evidencias ?? [], impactoTexto: gravada.impacto_texto ?? '', acao: gravada.acao_recomendada ?? '',
        componente: gravada.componente ?? undefined, travas: gravada.travas ?? [], proximaReavaliacao: gravada.proxima_data_reavaliacao,
        recomendacaoId: gravada.recomendacao_id ?? undefined, statusRecomendacao: gravada.status_recomendacao ?? undefined,
      }
      : diagnosticar(entrada, economia, cfg, hoje)
    return { ...entrada, economia, diagnostico, decisaoCalculadaNoPainel: !gravada }
  })
}

const PESO_ESTADO: Record<Estado, number> = { PAUSAR: 6, REDUZIR: 5, OTIMIZAR: 4, OBSERVAR: 3, MANTER: 2, ESCALAR: 1 }
const ORDEM_GRAV: Gravidade[] = ['INFORMATIVO', 'ATENCAO', 'IMPORTANTE', 'CRITICO']

/**
 * Campanhas como nível de agregação da visão de Produtos (seção 7.3). A margem da
 * campanha é a margem das vendas atribuídas: Σ (margem % antes de ads do anúncio ×
 * receita atribuída na campanha) − investimento na campanha.
 */
export function agregarCampanhas(
  anuncios: AnuncioAnalisado[], linhas: LinhaView[], campanhas: CampanhaView[], campanhasAnt: CampanhaView[],
): CampanhaResumo[] {
  const porCodigo = new Map(anuncios.map(a => [`${a.canal}|${a.codigoAnuncio}`, a]))
  const antPorNome = new Map(campanhasAnt.map(c => [`${c.canal}|${c.nome_campanha}`, c]))
  const nomes = new Map<string, CampanhaView>()
  for (const c of campanhas) nomes.set(`${c.canal}|${c.nome_campanha}`, c)
  for (const l of linhas) {
    const k = `${l.canal}|${l.nome_campanha}`
    if (!nomes.has(k)) nomes.set(k, { canal: l.canal, nome_campanha: l.nome_campanha, capturado_em: l.capturado_em, status: null, orcamento: null, roas_objetivo: null, impressoes: null, cliques: null, investimento: null, receita: null, vendas: null, anuncios: null })
  }

  return [...nomes.entries()].map(([k, c]) => {
    const ls = linhas.filter(l => `${l.canal}|${l.nome_campanha}` === k)
    const soma = (f: (l: LinhaView) => unknown) => ls.reduce((s, l) => s + n(f(l)), 0)
    const investimento = c.investimento != null ? n(c.investimento) : soma(l => l.investimento_ads)
    const receita = c.receita != null ? n(c.receita) : soma(l => l.receita_ads)
    // Anúncios sem custo cadastrado ficam de fora da soma (a tela de Produtos sinaliza cada um).
    let margemConhecida = false
    let margem = 0
    const doCampanha: AnuncioAnalisado[] = []
    for (const l of ls) {
      const a = porCodigo.get(`${l.canal}|${l.codigo_anuncio}`)
      if (a) doCampanha.push(a)
      const pctPre = a?.economia.margemPreAdsPct
      if (pctPre == null) continue
      margemConhecida = true
      margem += pctPre * n(l.receita_ads) - n(l.investimento_ads)
    }
    const margemPosAds = margemConhecida ? Math.round(margem * 100) / 100 : null
    const pior = doCampanha.sort((a, b) => PESO_ESTADO[b.diagnostico.estado] - PESO_ESTADO[a.diagnostico.estado])[0]
    let estado: Estado = pior?.diagnostico.estado ?? 'OBSERVAR'
    let gravidade: Gravidade = pior?.diagnostico.gravidade ?? 'INFORMATIVO'
    if (c.status && /paus/i.test(c.status)) { estado = 'OBSERVAR'; gravidade = 'INFORMATIVO' }
    else if (investimento > 0 && receita === 0) { estado = 'PAUSAR'; gravidade = ORDEM_GRAV[Math.max(ORDEM_GRAV.indexOf(gravidade), 2)] }
    else if (margemPosAds != null && margemPosAds < 0 && PESO_ESTADO[estado] < PESO_ESTADO.REDUZIR) estado = 'REDUZIR'
    const ant = antPorNome.get(k)
    return {
      canal: c.canal, nome: c.nome_campanha, status: c.status ?? (ls[0]?.status ?? '—'),
      orcamento: nn(c.orcamento), roasObjetivo: nn(c.roas_objetivo),
      impressoes: c.impressoes != null ? n(c.impressoes) : soma(l => l.impressoes),
      cliques: c.cliques != null ? n(c.cliques) : soma(l => l.cliques),
      investimento, receita,
      vendas: c.vendas != null ? n(c.vendas) : soma(l => n(l.vendas_diretas) + n(l.vendas_indiretas)),
      anuncios: c.anuncios != null ? n(c.anuncios) : new Set(ls.map(l => l.codigo_anuncio)).size,
      margemPosAds,
      margemPosAdsPct: margemPosAds != null && receita > 0 ? margemPosAds / receita : null,
      anterior: ant ? { investimento: n(ant.investimento), receita: n(ant.receita) } : undefined,
      estado, gravidade,
    }
  }).sort((a, b) => b.investimento - a.investimento)
}

/** Série por captura (dados reais: um ponto por relatório processado). */
export function seriePorCaptura(linhas: LinhaView[], anuncios: AnuncioAnalisado[]): PontoSerie[] {
  const pctPre = new Map(anuncios.map(a => [a.codigoAnuncio, a.economia.margemPreAdsPct]))
  const porData = new Map<string, PontoSerie>()
  for (const l of linhas) {
    const p = porData.get(l.capturado_em) ?? { data: l.capturado_em, receita: 0, investimento: 0, margemPosAds: 0 }
    p.receita += n(l.receita_ads)
    p.investimento += n(l.investimento_ads)
    p.margemPosAds += (pctPre.get(l.codigo_anuncio) ?? 0) * n(l.receita_ads) - n(l.investimento_ads)
    porData.set(l.capturado_em, p)
  }
  return [...porData.values()].sort((a, b) => a.data.localeCompare(b.data))
}
