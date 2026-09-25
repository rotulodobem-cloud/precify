import type { AnuncioEntrada, Diagnostico, Economia, Estado, Gravidade } from './tipos'
import { num, pct, reais } from './fmt'

/**
 * Limites do motor de decisão. Configuráveis (tabela ads_config), nunca fixos no código
 * — estes são só os valores padrão quando a tabela não tem a chave.
 */
export interface ConfigMotor {
  /** Amostra mínima (6.1): abaixo disso, OBSERVAR com "dados insuficientes". */
  minCliques: number
  minInvestimento: number
  /** Trava de alteração recente (6.3), em dias. Também é o período de observação após uma recomendação. */
  diasObservacao: number
  /** Margem após ads (% da receita) considerada "perto de zero" → REDUZIR. */
  margemPertoDeZeroPct: number
  /** Margem após ads (%) considerada saudável — abaixo disso, ROAS abaixo da meta vira OBSERVAR. */
  margemSaudavelPct: number
  /** ESCALAR exige margem após ads ≥ este % … */
  escalarMargemMinPct: number
  /** … e ROAS ≥ ROAS de equilíbrio × (1 + folga). */
  escalarFolgaRoas: number
  escalarMinVendas: number
  /** Estoque (unidades) abaixo do qual nunca recomenda ESCALAR. */
  estoqueMinimoEscalar: number
  /** OTIMIZAR: CTR abaixo disso = problema de imagem/título. */
  ctrMinimo: number
  /** OTIMIZAR: CVR abaixo disso (com CTR saudável e cliques suficientes) = problema de preço/frete/avaliações. */
  cvrMinimo: number
  minCliquesConversao: number
  /** OBSERVAR: queda de CVR ou alta de CPC vs. período anterior acima deste %. */
  deterioracaoPct: number
  /** Gravidade por valor em risco (R$). */
  gravidadeCritico: number
  gravidadeImportante: number
  gravidadeAtencao: number
}

export const CONFIG_PADRAO: ConfigMotor = {
  minCliques: 50,
  minInvestimento: 30,
  diasObservacao: 7,
  margemPertoDeZeroPct: 0.02,
  margemSaudavelPct: 0.08,
  escalarMargemMinPct: 0.12,
  escalarFolgaRoas: 0.3,
  escalarMinVendas: 10,
  estoqueMinimoEscalar: 30,
  ctrMinimo: 0.003,
  cvrMinimo: 0.015,
  minCliquesConversao: 150,
  deterioracaoPct: 0.3,
  gravidadeCritico: 500,
  gravidadeImportante: 150,
  gravidadeAtencao: 30,
}

export const ROTULO_CONFIG: Record<keyof ConfigMotor, string> = {
  minCliques: 'Cliques mínimos para recomendar mudança',
  minInvestimento: 'Investimento mínimo acumulado (R$) para recomendar mudança',
  diasObservacao: 'Dias de observação após alteração (trava)',
  margemPertoDeZeroPct: 'Margem após ads considerada "perto de zero"',
  margemSaudavelPct: 'Margem após ads considerada saudável',
  escalarMargemMinPct: 'ESCALAR: margem após ads mínima',
  escalarFolgaRoas: 'ESCALAR: folga mínima do ROAS sobre o equilíbrio',
  escalarMinVendas: 'ESCALAR: vendas mínimas no período',
  estoqueMinimoEscalar: 'ESCALAR: estoque mínimo (unidades)',
  ctrMinimo: 'OTIMIZAR: CTR mínimo',
  cvrMinimo: 'OTIMIZAR: conversão mínima',
  minCliquesConversao: 'OTIMIZAR: cliques mínimos para julgar conversão',
  deterioracaoPct: 'OBSERVAR: piora vs. período anterior',
  gravidadeCritico: 'Gravidade crítica a partir de (R$ em risco)',
  gravidadeImportante: 'Gravidade importante a partir de (R$ em risco)',
  gravidadeAtencao: 'Gravidade atenção a partir de (R$ em risco)',
}

export const CONFIG_EM_PERCENTUAL: (keyof ConfigMotor)[] = [
  'margemPertoDeZeroPct', 'margemSaudavelPct', 'escalarMargemMinPct', 'escalarFolgaRoas', 'ctrMinimo', 'cvrMinimo', 'deterioracaoPct',
]

const DIA = 86_400_000

function gravidadePorValor(valorEmRisco: number, c: ConfigMotor): Gravidade {
  const v = Math.abs(valorEmRisco)
  if (v >= c.gravidadeCritico) return 'CRITICO'
  if (v >= c.gravidadeImportante) return 'IMPORTANTE'
  if (v >= c.gravidadeAtencao) return 'ATENCAO'
  return 'INFORMATIVO'
}

const ORDEM_GRAV: Gravidade[] = ['INFORMATIVO', 'ATENCAO', 'IMPORTANTE', 'CRITICO']
const limitar = (g: Gravidade, max: Gravidade): Gravidade =>
  ORDEM_GRAV.indexOf(g) > ORDEM_GRAV.indexOf(max) ? max : g

function somarDias(d: Date, dias: number) {
  return new Date(d.getTime() + dias * DIA).toISOString().slice(0, 10)
}

/**
 * Motor de decisão (especificação, seção 6.7). Segue a hierarquia, nesta ordem:
 * (1) tenho dados suficientes? (2) o produto está deixando margem depois dos ads?
 * (3) está acima ou abaixo do próprio ponto de equilíbrio? (4) o problema é tráfego,
 * conversão, competitividade ou custo de mídia? (5) existe alguma trava?
 * (6) ESCALAR / MANTER / OBSERVAR / OTIMIZAR / REDUZIR / PAUSAR.
 *
 * Nenhum estado é decidido por uma métrica só, e toda saída traz
 * Situação → Evidência → Impacto → Ação (6.5).
 */
export function diagnosticar(a: AnuncioEntrada, e: Economia, c: ConfigMotor = CONFIG_PADRAO, hoje = new Date()): Diagnostico {
  const travas: string[] = []
  const ev = evidenciasBase(a, e)
  const reavaliar = somarDias(hoje, c.diasObservacao)

  const saida = (
    estado: Estado, impacto: number, gravidade: Gravidade,
    situacao: string, acao: string, impactoTexto: string,
    extra: Partial<Diagnostico> = {},
  ): Diagnostico => ({
    estado, gravidade, impacto, titulo: `${estado} — ${a.titulo}`,
    situacao, evidencias: ev, impactoTexto, acao, travas, proximaReavaliacao: estado === 'MANTER' ? null : reavaliar, ...extra,
  })

  // ── (1) Dados suficientes? ───────────────────────────────────────────────
  if (e.custoNaoCadastrado) {
    travas.push('Custo não cadastrado no Precify')
    return saida('OBSERVAR', 0, 'ATENCAO',
      'Custo não cadastrado — não dá para calcular a margem deste produto.',
      `Cadastrar o custo do SKU ${a.sku ?? '(sem SKU)'} no Precify. Até lá o Farol não recomenda mudanças (margem com custo zero ficaria falsamente alta).`,
      `Investimento de ${reais(a.investimento)} no período sem margem conhecida.`)
  }
  const amostraOk = a.cliques >= c.minCliques && a.investimento >= c.minInvestimento
  if (!amostraOk) {
    travas.push(`Amostra pequena (${a.cliques} cliques, ${reais(a.investimento)} investidos)`)
    return saida('OBSERVAR', 0, 'INFORMATIVO',
      'Dados insuficientes para recomendar alteração.',
      `Continuar acompanhando. O Farol recomenda mudanças a partir de ${c.minCliques} cliques e ${reais(c.minInvestimento)} investidos.`,
      'Sem impacto relevante ainda.')
  }

  // ── (5) Travas — checadas antes de qualquer estado além de OBSERVAR ──────
  if (a.ultimaAlteracaoEm) {
    const dias = Math.floor((hoje.getTime() - new Date(a.ultimaAlteracaoEm).getTime()) / DIA)
    if (dias < c.diasObservacao) {
      travas.push(`Alteração recente (${a.tipoUltimaAlteracao ?? 'configuração'} há ${dias} dia${dias === 1 ? '' : 's'})`)
      const risco = valorEmRisco(a, e)
      return saida('OBSERVAR', -risco, limitar(gravidadePorValor(risco, c), 'IMPORTANTE'),
        `Houve alteração de ${a.tipoUltimaAlteracao ?? 'configuração'} há ${dias} dia${dias === 1 ? '' : 's'} — ainda em período de observação.`,
        `Não alterar ainda. Reavaliar a partir de ${somarDias(new Date(a.ultimaAlteracaoEm), c.diasObservacao).split('-').reverse().join('/')}.`,
        risco > 0 ? `${reais(risco)} em risco se o cenário atual se mantiver.` : 'Sem perda no período.',
        { proximaReavaliacao: somarDias(new Date(a.ultimaAlteracaoEm), c.diasObservacao) })
    }
  }
  if (a.perdeuBuyBox) {
    travas.push('Perdeu o buy box / catálogo')
    const risco = Math.max(valorEmRisco(a, e), a.investimento * 0.2)
    return saida('OTIMIZAR', -risco, gravidadePorValor(risco, c),
      'Outra oferta está vencendo o catálogo — problema competitivo, não de verba.',
      'Rever preço, frete e condições da oferta para recuperar o catálogo. Não aumentar investimento nem criar promoção enquanto outra oferta estiver vencendo.',
      `${reais(risco)} de investimento em risco enquanto a oferta não ganha o catálogo.`,
      { componente: 'competitividade' })
  }

  const margemPos = e.margemPosAds!
  const margemPosPct = e.margemPosAdsPct ?? 0
  const roas = e.roas ?? 0
  const roasEq = e.roasEquilibrio

  // ── (2) Deixa margem depois dos ads? ─────────────────────────────────────
  if (margemPos <= 0 || margemPosPct < c.margemPertoDeZeroPct) {
    const risco = valorEmRisco(a, e)
    // Sem nenhuma venda com cliques suficientes, o problema é conversão antes de ser verba.
    if (e.vendas === 0 && !a.jaTentouAjustar) {
      const g = gravidadePorValor(a.investimento, c)
      return saida('OTIMIZAR', -a.investimento, g,
        `${a.cliques} cliques e nenhuma venda — o anúncio atrai, mas não converte.`,
        'Revisar preço, frete, fotos e avaliações do anúncio antes de mexer no orçamento. Se continuar sem vender depois do ajuste, o Farol vai sugerir avaliar a pausa.',
        `${reais(a.investimento)} investidos sem retorno no período.`,
        { componente: 'preço/frete/avaliações' })
    }
    if (a.jaTentouAjustar && (margemPos < 0 || e.vendas === 0)) {
      return saida('PAUSAR', -risco, gravidadePorValor(risco, c),
        'Performance continua ruim mesmo depois de ajustes anteriores, e os ads estão tirando dinheiro do produto.',
        'Avaliar a pausa deste anúncio. A decisão final é sua — o Farol não pausa nada sozinho.',
        `Margem após ads de ${reais(margemPos)} no período${e.vendas === 0 ? ', sem vendas' : ''}.`)
    }
    return saida('REDUZIR', -risco, gravidadePorValor(risco, c),
      'A publicidade está consumindo mais margem do que o produto suporta.',
      'Reduzir gradualmente o orçamento (ou o ROAS objetivo mais alto) e reavaliar após o período de observação.',
      margemPos < 0
        ? `Perda de ${reais(-margemPos)} no período (margem após ads negativa).`
        : `Margem após ads de só ${reais(margemPos)} (${pct(margemPosPct)}) — ${reais(risco)} de investimento acima do equilíbrio.`)
  }

  // ── (4) Qual é o problema: tráfego ou conversão? ─────────────────────────
  if (e.ctr != null && e.ctr < c.ctrMinimo) {
    const risco = Math.max(valorEmRisco(a, e), a.investimento * 0.15)
    return saida('OTIMIZAR', -risco, limitar(gravidadePorValor(risco, c), 'IMPORTANTE'),
      `Poucas pessoas clicam no anúncio (CTR ${pct(e.ctr, 2)}) — o problema é a vitrine, não a verba.`,
      'Testar nova foto principal e título mais claro antes de mexer no orçamento.',
      `Margem após ads positiva (${reais(margemPos)}), mas o anúncio desperdiça impressões.`,
      { componente: 'imagem/título' })
  }
  if (e.cvr != null && e.cvr < c.cvrMinimo && a.cliques >= c.minCliquesConversao) {
    const risco = Math.max(valorEmRisco(a, e), a.investimento * 0.15)
    return saida('OTIMIZAR', -risco, limitar(gravidadePorValor(risco, c), 'IMPORTANTE'),
      `Muitos cliques e poucas vendas (conversão ${pct(e.cvr, 2)}) com CTR saudável — quem clica desiste na página.`,
      'Conferir preço vs. concorrentes, frete e avaliações do anúncio antes de mexer no orçamento.',
      `Margem após ads positiva (${reais(margemPos)}), mas cada venda está saindo cara.`,
      { componente: 'preço/frete/avaliações' })
  }

  // ── (3) Acima do equilíbrio com folga? Deteriorando? ─────────────────────
  const deterioracao = sinaisDeteriorando(a, e, c)
  const abaixoDaMeta = a.roasObjetivo != null && roas < a.roasObjetivo
  if (deterioracao.length > 0 || (abaixoDaMeta && margemPosPct < c.margemSaudavelPct)) {
    const motivos = [...deterioracao]
    if (abaixoDaMeta && margemPosPct < c.margemSaudavelPct) motivos.push(`ROAS ${num(roas)} abaixo da meta ${num(a.roasObjetivo)}, mas acima do equilíbrio ${num(roasEq)}`)
    return saida('OBSERVAR', 0, 'ATENCAO',
      `Sinal de atenção, sem evidência suficiente para mexer: ${motivos.join('; ')}.`,
      'Não alterar ainda; continuar acompanhando. O produto segue deixando margem depois dos ads.',
      `Margem após ads de ${reais(margemPos)} (${pct(margemPosPct)}) — economicamente positivo.`)
  }

  const folgaOk = roasEq != null && roas >= roasEq * (1 + c.escalarFolgaRoas)
  const volumeOk = e.vendas >= c.escalarMinVendas
  const estoqueBaixo = a.estoque != null && a.estoque < c.estoqueMinimoEscalar
  if (margemPosPct >= c.escalarMargemMinPct && folgaOk && volumeOk) {
    if (estoqueBaixo) {
      travas.push(`Estoque baixo (${a.estoque} un.) — não escalar`)
    } else {
      const potencial = margemPos * 0.2
      return saida('ESCALAR', potencial, limitar(gravidadePorValor(potencial, c), 'ATENCAO'),
        'Boa margem depois dos ads, ROAS bem acima do equilíbrio e vendas consistentes.',
        'Testar aumento gradual do orçamento (ex.: +20%). Nunca automático — depois do ajuste o produto entra em observação.',
        `Potencial estimado de ${reais(potencial, { sinal: true })} de margem com +20% de verba, se a eficiência se mantiver.`)
    }
  }

  return saida('MANTER', 0, 'INFORMATIVO',
    'Performance saudável: margem positiva depois dos ads e ROAS acima do equilíbrio.',
    'Manter a configuração atual — não vale mexer por uma diferença estatística pequena.',
    `Margem após ads de ${reais(margemPos)} (${pct(margemPosPct)}).`)
}

/** Dinheiro em risco: perda de margem ou investimento acima do ponto de equilíbrio. */
export function valorEmRisco(a: AnuncioEntrada, e: Economia): number {
  // Com margem negativa, o valor em risco é a própria perda (o número que aparece no painel).
  if (e.margemPosAds != null && e.margemPosAds < 0) return -e.margemPosAds
  const acimaDoEquilibrio = e.acosEquilibrio != null ? a.investimento - a.receitaAds * e.acosEquilibrio : 0
  return Math.max(acimaDoEquilibrio, 0)
}

function sinaisDeteriorando(a: AnuncioEntrada, e: Economia, c: ConfigMotor): string[] {
  const ant = a.anterior
  if (!ant?.cliques || !ant.investimento) return []
  const out: string[] = []
  const vendasAnt = (ant.vendasDiretas ?? 0) + (ant.vendasIndiretas ?? 0)
  const cvrAnt = vendasAnt / ant.cliques
  if (e.cvr != null && cvrAnt > 0 && (cvrAnt - e.cvr) / cvrAnt >= c.deterioracaoPct) {
    out.push(`conversão caiu de ${pct(cvrAnt, 2)} para ${pct(e.cvr, 2)}`)
  }
  const cpcAnt = ant.investimento / ant.cliques
  if (e.cpc != null && (e.cpc - cpcAnt) / cpcAnt >= c.deterioracaoPct) {
    out.push(`CPC subiu de ${reais(cpcAnt)} para ${reais(e.cpc)}`)
  }
  return out
}

function evidenciasBase(a: AnuncioEntrada, e: Economia): string[] {
  const ev: string[] = []
  if (e.acos != null) ev.push(`ACOS atual: ${pct(e.acos)} (equilíbrio: ${pct(e.acosEquilibrio)})`)
  if (e.roas != null) ev.push(`ROAS: ${num(e.roas)} (equilíbrio: ${num(e.roasEquilibrio)}${a.roasObjetivo ? `; meta do ML: ${num(a.roasObjetivo)}` : ''})`)
  if (e.margemPosAds != null) ev.push(`Margem após ads: ${reais(e.margemPosAds)} (${pct(e.margemPosAdsPct)})`)
  ev.push(`Investimento: ${reais(a.investimento)} no período`)
  ev.push(`Receita atribuída a ads: ${reais(a.receitaAds)} · ${e.vendas} venda${e.vendas === 1 ? '' : 's'} · ${a.cliques} cliques`)
  if (e.margemParcial) ev.push('Margem parcial: frete da empresa não incluído no cálculo')
  return ev
}
