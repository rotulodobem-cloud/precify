/**
 * Pipeline de ingestão (especificação, seção 4). Roda a cada novo relatório de anúncios:
 *   1. lê e agrega o relatório por anúncio × campanha
 *   2. completa o SKU pelo de-para (ads_sku_depara) quando o relatório não traz
 *   3. atualiza custo dos SKUs do relatório pela API do Precify (produtos_custo)
 *   4. grava ads_anuncios_snapshot
 *   5. roda o motor sobre a view ads_anuncios_margem e grava ads_recomendacoes_historico
 *   6. abre alertas novos (sem duplicar os que já estão abertos)
 *   7. devolve o resumo do dia no formato situação → evidência → impacto → ação
 *
 * Usa a service role — nunca é chamado pelas telas de leitura.
 */
import { analisar, montarEntradas, type CampanhaView, type LinhaView } from './agregacao'
import { CONFIG_PADRAO, type ConfigMotor } from './motor'
import { parsearArquivo, type ResultadoParser } from './parserRelatorio'
import { gravar, inserir, lerTabelaServico } from './supabase'
import { reais } from './fmt'
import type { AnuncioAnalisado, Canal, Estado, Gravidade, RecomendacaoHistorico, TipoAlerta } from './tipos'

export interface ResultadoIngestao {
  capturadoEm: string
  periodo: ResultadoParser['periodo']
  anuncios: number
  linhas: number
  skusSemCusto: string[]
  custosAtualizados: number
  avisos: string[]
  mudancas: { codigo: string; titulo: string; de: Estado | null; para: Estado; gravidade: Gravidade }[]
  alertasCriados: number
  resumo: string
}

const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

interface ProdutoPrecify {
  skuPrincipal: string; nome: string; categoria: string | null
  custoAtualizado: number | null; custoUnitario: number | null
  variacoes?: { skuVariacao: string; nomeVariacao?: string; custoTotal: number | null; custoCalculado: number | null }[]
}

/** Custo direto por SKU (principal e variações) pela API /api/gestao do Precify. */
export async function buscarCustosPrecify(skus: Set<string>): Promise<{ sku: string; nome: string; categoria: string | null; custo_direto: number }[]> {
  const url = process.env.PRECIFY_API_URL, chave = process.env.PRECIFY_API_KEY
  if (!url || !chave || skus.size === 0) return []
  const r = await fetch(`${url.replace(/\/$/, '')}/api/gestao?tipo=produtos`, { headers: { 'x-api-key': chave }, cache: 'no-store' })
  if (!r.ok) throw new Error(`Precify respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const { data } = await r.json() as { data: ProdutoPrecify[] }
  const out: { sku: string; nome: string; categoria: string | null; custo_direto: number }[] = []
  for (const p of data ?? []) {
    const custoP = p.custoAtualizado ?? p.custoUnitario
    if (skus.has(p.skuPrincipal) && custoP != null) out.push({ sku: p.skuPrincipal, nome: p.nome, categoria: p.categoria, custo_direto: custoP })
    for (const v of p.variacoes ?? []) {
      const custoV = v.custoTotal ?? v.custoCalculado
      if (skus.has(v.skuVariacao) && custoV != null) out.push({ sku: v.skuVariacao, nome: v.nomeVariacao ?? p.nome, categoria: p.categoria, custo_direto: custoV })
    }
  }
  return out
}

async function lerConfigServico(): Promise<ConfigMotor> {
  const cfg = { ...CONFIG_PADRAO }
  for (const l of await lerTabelaServico<{ chave: string; valor: number }>('ads_config')) {
    if (l.chave in cfg) (cfg as Record<string, number>)[l.chave] = Number(l.valor)
  }
  return cfg
}

const PRIORIDADE: Record<Estado, number> = { PAUSAR: 0, REDUZIR: 1, OTIMIZAR: 2, ESCALAR: 3, OBSERVAR: 4, MANTER: 5 }

export async function ingerirRelatorio(buffer: ArrayBuffer | Buffer, opts: { nomeArquivo?: string; capturadoEm?: string; canal?: Canal } = {}): Promise<ResultadoIngestao> {
  const canal = opts.canal ?? 'mercado_livre'
  const capturadoEm = opts.capturadoEm ?? hojeSP()
  const rel = parsearArquivo(buffer)
  const avisos = [...rel.avisos]
  if (rel.linhas.length === 0) throw new Error('O relatório não tem nenhum anúncio.')

  // 2. de-para de SKU
  const depara = await lerTabelaServico<{ codigo_anuncio: string; sku: string }>('ads_sku_depara', { canal: `eq.${canal}` }, 'codigo_anuncio,sku')
  const skuPorCodigo = new Map(depara.map(d => [d.codigo_anuncio, d.sku]))
  for (const l of rel.linhas) l.sku = l.sku ?? skuPorCodigo.get(l.codigoAnuncio) ?? null
  const semSku = [...new Set(rel.linhas.filter(l => !l.sku).map(l => l.codigoAnuncio))]
  if (semSku.length) avisos.push(`${semSku.length} anúncio(s) sem SKU — cadastre em ads_sku_depara para calcular a margem: ${semSku.slice(0, 5).join(', ')}${semSku.length > 5 ? '…' : ''}`)

  // 3. custo do Precify
  const skus = new Set(rel.linhas.map(l => l.sku).filter((s): s is string => !!s))
  let custosAtualizados = 0
  try {
    const custos = await buscarCustosPrecify(skus)
    await gravar('produtos_custo', custos.map(c => ({ ...c, atualizado_em: new Date().toISOString() })), 'sku')
    custosAtualizados = custos.length
    if (!process.env.PRECIFY_API_URL) avisos.push('PRECIFY_API_URL não configurada — usando os custos que já estão no Farol (custos_produto).')
  } catch (e) {
    avisos.push(`Não consegui atualizar custos no Precify (${(e as Error).message}); usando os últimos custos salvos.`)
  }

  // 4. snapshot
  await gravar('ads_anuncios_snapshot', rel.linhas.map(l => ({
    canal, codigo_anuncio: l.codigoAnuncio, nome_campanha: l.campanha, capturado_em: capturadoEm, sku: l.sku,
    titulo_anuncio: l.titulo, status: l.status, tipo_anuncio: l.tipoAnuncio, impressoes: Math.round(l.impressoes), cliques: Math.round(l.cliques),
    cpc: l.cpc, ctr: l.ctr, cvr: l.cvr, investimento: l.investimento, receita: l.receita, acos: l.acos, roas: l.roas,
    vendas_diretas: Math.round(l.vendasDiretas), vendas_indiretas: Math.round(l.vendasIndiretas),
    relatorio_desde: rel.periodo.desde, relatorio_ate: rel.periodo.ate, arquivo_origem: opts.nomeArquivo ?? null,
  })), 'canal,codigo_anuncio,nome_campanha,capturado_em')

  // 5. motor — sempre recalcula a partir da view (descarta decisão gravada antes para esta captura)
  const [config, linhasView, campanhas, anteriorData, histRaw] = await Promise.all([
    lerConfigServico(),
    lerTabelaServico<LinhaView>('ads_anuncios_margem', { canal: `eq.${canal}`, capturado_em: `eq.${capturadoEm}` }),
    lerTabelaServico<CampanhaView>('ads_campanhas_snapshot', { canal: `eq.${canal}`, capturado_em: `lte.${capturadoEm}`, order: 'capturado_em.desc', limit: '200' }),
    lerTabelaServico<{ capturado_em: string }>('ads_anuncios_snapshot', { canal: `eq.${canal}`, capturado_em: `lt.${capturadoEm}`, order: 'capturado_em.desc', limit: '1' }, 'capturado_em'),
    lerTabelaServico<Record<string, unknown>>('ads_recomendacoes_historico', { canal: `eq.${canal}`, order: 'gerado_em.desc', limit: '2000' },
      'codigo_anuncio,estado,gravidade,status_recomendacao,gerado_em,capturado_em,sku,motivo,acao_recomendada,resolvido_em'),
  ])
  const ultimaCampanha = new Map<string, CampanhaView>()
  for (const c of campanhas) if (!ultimaCampanha.has(c.nome_campanha)) ultimaCampanha.set(c.nome_campanha, c)
  const anteriores = anteriorData[0]
    ? await lerTabelaServico<LinhaView>('ads_anuncios_margem', { canal: `eq.${canal}`, capturado_em: `eq.${anteriorData[0].capturado_em}` })
    : []
  const historico: RecomendacaoHistorico[] = histRaw.filter(h => h.capturado_em !== capturadoEm).map(h => ({
    geradoEm: String(h.gerado_em), codigoAnuncio: String(h.codigo_anuncio), sku: (h.sku as string) ?? null, titulo: '',
    estado: h.estado as Estado, gravidade: h.gravidade as Gravidade, motivo: String(h.motivo), acao: String(h.acao_recomendada),
    status: h.status_recomendacao as RecomendacaoHistorico['status'], resolvidoEm: (h.resolvido_em as string) ?? null,
  }))
  const limpas = linhasView.map(l => ({ ...l, estado_motor: null }))
  const analisados = analisar(montarEntradas(limpas, [...ultimaCampanha.values()], anteriores, historico), config, new Date(`${capturadoEm}T12:00:00Z`))

  await gravar('ads_recomendacoes_historico', analisados.map(a => ({
    canal, codigo_anuncio: a.codigoAnuncio, nome_campanha: '', sku: a.sku, capturado_em: capturadoEm, gerado_em: new Date().toISOString(),
    estado: a.diagnostico.estado, gravidade: a.diagnostico.gravidade, impacto: Math.round(a.diagnostico.impacto * 100) / 100,
    motivo: a.diagnostico.situacao, evidencias: a.diagnostico.evidencias, impacto_texto: a.diagnostico.impactoTexto,
    acao_recomendada: a.diagnostico.acao, componente: a.diagnostico.componente ?? null, travas: a.diagnostico.travas,
    proxima_data_reavaliacao: a.diagnostico.proximaReavaliacao,
    metricas_no_momento: { titulo: a.titulo, entrada: { ...a, economia: undefined, diagnostico: undefined }, economia: a.economia },
  })), 'canal,codigo_anuncio,nome_campanha,capturado_em')

  // 6. alertas
  const estadoAnterior = new Map<string, Estado>()
  for (const h of historico) if (!estadoAnterior.has(h.codigoAnuncio)) estadoAnterior.set(h.codigoAnuncio, h.estado)
  const mudancas = analisados
    .filter(a => estadoAnterior.get(a.codigoAnuncio) !== a.diagnostico.estado)
    .map(a => ({ codigo: a.codigoAnuncio, titulo: a.titulo, de: estadoAnterior.get(a.codigoAnuncio) ?? null, para: a.diagnostico.estado, gravidade: a.diagnostico.gravidade }))

  const abertos = await lerTabelaServico<{ tipo: string; item_id: string | null }>('ads_alertas', { canal: `eq.${canal}`, status: 'neq.resolvido' }, 'tipo,item_id')
  const jaAberto = new Set(abertos.map(a => `${a.tipo}|${a.item_id}`))
  const novos: Record<string, unknown>[] = []
  const alerta = (tipo: TipoAlerta, a: AnuncioAnalisado, problema: string, gravidade = a.diagnostico.gravidade, campanha: string | null = a.campanha) => {
    const k = `${tipo}|${a.codigoAnuncio}`
    if (jaAberto.has(k)) return
    jaAberto.add(k)
    novos.push({
      canal, tipo, item_id: a.codigoAnuncio, campanha_id: campanha, sku: a.sku, titulo: a.titulo, gravidade,
      problema, causa: a.diagnostico.situacao, acao: a.diagnostico.acao,
      detalhe: { estado: a.diagnostico.estado, impacto: a.diagnostico.impacto, evidencias: a.diagnostico.evidencias, capturado_em: capturadoEm },
    })
  }
  for (const a of analisados) {
    const e = a.economia
    if (e.custoNaoCadastrado) alerta('custo_nao_cadastrado', a, `Sem custo no Precify para o SKU ${a.sku ?? '(sem SKU)'} — margem não calculada.`, 'ATENCAO')
    if (e.vendas === 0 && a.investimento >= config.minInvestimento) alerta('anuncio_sem_venda', a, `Investiu ${reais(a.investimento)} e não teve vendas por ads no período.`)
    if (e.margemPosAds != null && e.margemPosAds < 0 && a.cliques >= config.minCliques) alerta('anuncio_margem_negativa', a, `Margem após ads negativa (${reais(e.margemPosAds)} no período).`)
    const m = mudancas.find(x => x.codigo === a.codigoAnuncio)
    if (m && m.de && ['REDUZIR', 'PAUSAR', 'ESCALAR'].includes(m.para)) alerta('mudanca_estado', a, `Mudou de ${m.de} para ${m.para}.`)
  }
  // Catálogo × clássico/premium misturados na mesma campanha: só alerta (fora de escopo reorganizar)
  const tiposPorCampanha = new Map<string, Set<string>>()
  for (const l of rel.linhas) {
    if (!l.tipoAnuncio) continue
    const t = /cat[aá]logo/i.test(l.tipoAnuncio) ? 'catalogo' : 'classico'
    tiposPorCampanha.set(l.campanha, (tiposPorCampanha.get(l.campanha) ?? new Set()).add(t))
  }
  for (const [camp, tipos] of tiposPorCampanha) {
    if (tipos.size < 2 || jaAberto.has(`conflito_catalogo_classico|${camp}`)) continue
    novos.push({
      canal, tipo: 'conflito_catalogo_classico', item_id: camp, campanha_id: camp, titulo: camp, gravidade: 'ATENCAO',
      problema: 'A campanha mistura anúncios de catálogo e clássico/premium.',
      causa: 'Anúncios de catálogo e clássicos competem de forma diferente; misturados, a campanha esconde a performance de cada um.',
      acao: 'Avaliar separar em campanhas distintas (decisão sua — o Farol só avisa).',
    })
  }
  if (novos.length) await inserir('ads_alertas', novos)

  const resultado: ResultadoIngestao = {
    capturadoEm, periodo: rel.periodo, anuncios: analisados.length, linhas: rel.linhas.length,
    skusSemCusto: analisados.filter(a => a.economia.custoNaoCadastrado).map(a => a.sku ?? a.codigoAnuncio),
    custosAtualizados, avisos, mudancas, alertasCriados: novos.length, resumo: '',
  }
  resultado.resumo = montarResumo(analisados, resultado)
  return resultado
}

/** Resumo para o chat: só o que mudou de estado ou precisa de ação, em situação → evidência → impacto → ação. */
export function montarResumo(analisados: AnuncioAnalisado[], r: Pick<ResultadoIngestao, 'mudancas' | 'avisos' | 'capturadoEm'>): string {
  const mudou = new Set(r.mudancas.filter(m => ['REDUZIR', 'PAUSAR', 'ESCALAR'].includes(m.para)).map(m => m.codigo))
  const destaque = analisados
    .filter(a => mudou.has(a.codigoAnuncio) || (['REDUZIR', 'PAUSAR'].includes(a.diagnostico.estado) && a.diagnostico.gravidade === 'CRITICO'))
    .sort((a, b) => PRIORIDADE[a.diagnostico.estado] - PRIORIDADE[b.diagnostico.estado] || a.diagnostico.impacto - b.diagnostico.impacto)
  const perda = analisados.reduce((s, a) => s + Math.min(0, a.economia.margemPosAds ?? 0), 0)
  const cont = (e: Estado[]) => analisados.filter(a => e.includes(a.diagnostico.estado)).length
  const linhas = [
    `*Farol Ads — relatório de anúncios de ${r.capturadoEm.split('-').reverse().join('/')}*`,
    `${analisados.length} anúncios analisados: ${cont(['REDUZIR', 'PAUSAR', 'OTIMIZAR'])} precisam de ação, ${cont(['OBSERVAR'])} em observação, ${cont(['ESCALAR'])} oportunidades de escala.`,
    perda < 0 ? `Anúncios com margem negativa somam ${reais(perda)} no período.` : 'Nenhum anúncio com margem negativa. ✅',
  ]
  if (destaque.length === 0) linhas.push('', 'Nenhum produto mudou para REDUZIR, PAUSAR ou ESCALAR desde o último relatório.')
  for (const a of destaque.slice(0, 8)) {
    const d = a.diagnostico
    linhas.push('', `*${d.estado} — ${a.titulo}*${mudou.has(a.codigoAnuncio) ? ' (novo)' : ''}`,
      `Situação: ${d.situacao}`, `Evidência: ${d.evidencias.slice(0, 3).join('; ')}`, `Impacto: ${d.impactoTexto}`, `Ação: ${d.acao}`)
  }
  if (destaque.length > 8) linhas.push('', `…e mais ${destaque.length - 8} no painel.`)
  if (r.avisos.length) linhas.push('', ...r.avisos.map(a => `⚠️ ${a}`))
  return linhas.join('\n')
}
