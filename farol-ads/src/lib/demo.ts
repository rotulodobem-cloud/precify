/**
 * Dados de demonstração — usados quando o Supabase ainda não está configurado.
 * Não são decisões prontas: geram linhas no MESMO formato da view ads_painel_anuncios
 * e passam pelo mesmo motor que os dados reais. Os produtos e números seguem as
 * telas de referência (Psyllium, Cúrcuma, Ômega 3…).
 */
import type { CampanhaView, LinhaView } from './agregacao'
import type { Alerta, Gravidade, Promocao, RecomendacaoHistorico } from './tipos'

interface ProdutoDemo {
  codigo: string; sku: string; titulo: string; categoria: string
  campanhas: { nome: string; parte: number; status?: string }[]
  receitaTotal: number; receitaAds: number; investimento: number
  /** margem % antes de ads — o custo unitário é derivado disso */
  margemPrePct: number | null
  preco: number; impressoes: number; cliques: number; vendas: number
  estoque?: number | null; perdeuBuyBox?: boolean; alteracao?: { diasAtras: number; tipo: string }
  /** fator do período anterior sobre (investimento, receita ads, cliques, vendas) */
  anterior?: [number, number, number, number]
}

const IMPOSTO = 0.0829
const COMISSAO = 0.14

const CAMPANHAS: Omit<CampanhaView, 'capturado_em' | 'impressoes' | 'cliques' | 'investimento' | 'receita' | 'vendas' | 'anuncios'>[] = [
  { canal: 'mercado_livre', nome_campanha: '[R] Snacks - Alto Share - Curva A', status: 'Ativa', orcamento: 200, roas_objetivo: 8 },
  { canal: 'mercado_livre', nome_campanha: 'Vitaminas - Curva B', status: 'Ativa', orcamento: 130, roas_objetivo: 6 },
  { canal: 'mercado_livre', nome_campanha: 'Ofertas e Sazonais', status: 'Ativa', orcamento: 100, roas_objetivo: 5 },
  { canal: 'mercado_livre', nome_campanha: 'Marca Própria', status: 'Ativa', orcamento: 85, roas_objetivo: 6 },
  { canal: 'mercado_livre', nome_campanha: 'Teste - Novos Produtos', status: 'Ativa', orcamento: 65, roas_objetivo: 5 },
  { canal: 'mercado_livre', nome_campanha: 'Catálogo - Clássico', status: 'Ativa', orcamento: 50, roas_objetivo: 5 },
  { canal: 'mercado_livre', nome_campanha: 'Campanha sem Performance', status: 'Ativa', orcamento: 35, roas_objetivo: 5 },
  { canal: 'mercado_livre', nome_campanha: 'Cúrcuma com Pimenta', status: 'Pausada', orcamento: 0, roas_objetivo: 6 },
]

const PRODUTOS: ProdutoDemo[] = [
  { codigo: 'MLB6620253832', sku: 'PSY-001', titulo: 'Psyllium 1kg', categoria: 'Farinhas e Fibras',
    campanhas: [{ nome: '[R] Snacks - Alto Share - Curva A', parte: 1 }],
    receitaTotal: 12430, receitaAds: 7880, investimento: 3950, margemPrePct: 0.28, preco: 55,
    impressoes: 310000, cliques: 3900, vendas: 142, estoque: 220, anterior: [0.84, 1.09, 0.92, 1.05] },
  { codigo: 'MLB4410098721', sku: 'VITD-2000', titulo: 'Vitamina D3 2.000 UI', categoria: 'Suplementos',
    campanhas: [{ nome: 'Vitaminas - Curva B', parte: 1 }],
    receitaTotal: 4220, receitaAds: 3120, investimento: 1280, margemPrePct: 0.23, preco: 42,
    impressoes: 150000, cliques: 1900, vendas: 64, estoque: 90, anterior: [0.95, 1.07, 1, 1.08] },
  { codigo: 'MLB3302871145', sku: 'MAC-500', titulo: 'Maca Negra 500 mg', categoria: 'Suplementos',
    campanhas: [{ nome: 'Marca Própria', parte: 1 }],
    receitaTotal: 8760, receitaAds: 7920, investimento: 2140, margemPrePct: 0.338, preco: 69,
    impressoes: 400000, cliques: 4200, vendas: 58, estoque: 140, anterior: [0.9, 0.85, 0.9, 0.9] },
  { codigo: 'MLB5518840077', sku: 'CUR-001', titulo: 'Cúrcuma com Pimenta Preta', categoria: 'Temperos e Condimentos',
    campanhas: [{ nome: '[R] Snacks - Alto Share - Curva A', parte: 0.97 }, { nome: 'Cúrcuma com Pimenta', parte: 0.03, status: 'Pausada' }],
    receitaTotal: 15230, receitaAds: 11800, investimento: 2980, margemPrePct: 0.336, preco: 29,
    impressoes: 520000, cliques: 5200, vendas: 260, estoque: 600, anterior: [0.7, 0.95, 0.96, 0.96] },
  { codigo: 'MLB2209934410', sku: 'OME-003', titulo: 'Ômega 3 Premium', categoria: 'Suplementos',
    campanhas: [{ nome: 'Ofertas e Sazonais', parte: 1 }],
    receitaTotal: 18450, receitaAds: 16200, investimento: 3120, margemPrePct: 0.432, preco: 76,
    impressoes: 610000, cliques: 6100, vendas: 240, estoque: 400, anterior: [0.92, 0.8, 0.9, 0.82] },
  { codigo: 'MLB7781200356', sku: 'COL-002', titulo: 'Colágeno Tipo II', categoria: 'Suplementos',
    campanhas: [{ nome: 'Catálogo - Clássico', parte: 1 }],
    receitaTotal: 6840, receitaAds: 5980, investimento: 1540, margemPrePct: 0.31, preco: 78,
    impressoes: 230000, cliques: 2600, vendas: 88, estoque: 180, anterior: [0.97, 0.83, 0.95, 0.85] },
  { codigo: 'MLB6012337789', sku: 'CRE-300', titulo: 'Creatina 300g', categoria: 'Suplementos',
    campanhas: [{ nome: 'Marca Própria', parte: 1 }],
    receitaTotal: 9620, receitaAds: 8430, investimento: 1960, margemPrePct: 0.355, preco: 89,
    impressoes: 260000, cliques: 3000, vendas: 120, estoque: 12, anterior: [0.9, 0.88, 0.92, 0.9] },
  { codigo: 'MLB9912004513', sku: 'MAG-001', titulo: 'Magnésio Quelato', categoria: 'Suplementos',
    campanhas: [{ nome: 'Teste - Novos Produtos', parte: 1 }],
    receitaTotal: 3980, receitaAds: 2250, investimento: 1120, margemPrePct: 0.342, preco: 49,
    impressoes: 900000, cliques: 1200, vendas: 46, estoque: 260, anterior: [1.1, 1.12, 1.1, 1.1] },
  { codigo: 'MLB1180045923', sku: 'PRO-030', titulo: 'Probiótico 30 caps', categoria: 'Suplementos',
    campanhas: [{ nome: 'Ofertas e Sazonais', parte: 1 }],
    receitaTotal: 5430, receitaAds: 4860, investimento: 980, margemPrePct: 0.374, preco: 64,
    impressoes: 180000, cliques: 1700, vendas: 70, estoque: 150, anterior: [0.95, 0.76, 0.93, 0.78] },
  { codigo: 'MLB8830291176', sku: 'MIX-250', titulo: 'Mix de Sementes 250g', categoria: 'Sementes e Grãos',
    campanhas: [{ nome: 'Teste - Novos Produtos', parte: 1 }],
    receitaTotal: 2940, receitaAds: 1980, investimento: 860, margemPrePct: 0.333, preco: 24,
    impressoes: 140000, cliques: 1500, vendas: 80, estoque: 300, alteracao: { diasAtras: 3, tipo: 'lance' }, anterior: [0.8, 1.15, 0.9, 1.1] },
  { codigo: 'MLB2271190034', sku: 'CHI-100', titulo: 'Chá de Hibisco 100g', categoria: 'Chás e Ervas',
    campanhas: [{ nome: 'Catálogo - Clássico', parte: 1 }],
    receitaTotal: 980, receitaAds: 120, investimento: 18, margemPrePct: 0.4, preco: 19,
    impressoes: 9000, cliques: 30, vendas: 6, estoque: 80 },
  { codigo: 'MLB4409921887', sku: 'GRA-040', titulo: 'Granola Funcional 400g', categoria: 'Snacks e Liofilizados',
    campanhas: [{ nome: '[R] Snacks - Alto Share - Curva A', parte: 1 }],
    receitaTotal: 2410, receitaAds: 1720, investimento: 410, margemPrePct: null, preco: 32,
    impressoes: 70000, cliques: 900, vendas: 52, estoque: 110 },
  { codigo: 'MLB3390187765', sku: 'FAR-UVA-250', titulo: 'Farinha de Uva 250g', categoria: 'Farinhas e Fibras',
    campanhas: [{ nome: 'Campanha sem Performance', parte: 1 }],
    receitaTotal: 640, receitaAds: 0, investimento: 960, margemPrePct: 0.3, preco: 32,
    impressoes: 60000, cliques: 420, vendas: 0, estoque: 70, anterior: [0.6, 0, 0.6, 0] },
  { codigo: 'MLB5561230098', sku: 'LIN-500', titulo: 'Linhaça Dourada 500g', categoria: 'Sementes e Grãos',
    campanhas: [{ nome: 'Catálogo - Clássico', parte: 1 }],
    receitaTotal: 3100, receitaAds: 2400, investimento: 620, margemPrePct: 0.3, preco: 18,
    impressoes: 120000, cliques: 1400, vendas: 130, estoque: 500, perdeuBuyBox: true },
  { codigo: 'MLB6678120045', sku: 'TMP-CHI', titulo: 'Tempero Chimichurri 100g', categoria: 'Temperos e Condimentos',
    campanhas: [{ nome: '[R] Snacks - Alto Share - Curva A', parte: 1 }],
    receitaTotal: 4100, receitaAds: 3200, investimento: 520, margemPrePct: 0.38, preco: 22,
    impressoes: 90000, cliques: 500, vendas: 9, estoque: 260 },
  { codigo: 'MLB7709945521', sku: 'CHIA-500', titulo: 'Chia 500g', categoria: 'Sementes e Grãos',
    campanhas: [{ nome: 'Ofertas e Sazonais', parte: 1 }],
    receitaTotal: 3600, receitaAds: 3000, investimento: 900, margemPrePct: 0.3, preco: 21,
    impressoes: 110000, cliques: 1300, vendas: 140, estoque: 420 },
]

// Pseudo-aleatório determinístico (os números não mudam a cada recarga)
function rng(semente: number) {
  let s = semente >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 }
}
const hash = (t: string) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
const DIA = 86_400_000
const isoDia = (t: number) => new Date(t).toISOString().slice(0, 10)

/** Multiplicador diário (média ~1) para distribuir o total de 30 dias ao longo do tempo. */
function fatorDia(sku: string, data: string): number {
  const r = rng(hash(sku + data))()
  const t = new Date(data).getTime() / DIA
  return 0.55 + 0.9 * r + 0.25 * Math.sin(t / 3.1 + (hash(sku) % 7))
}

function fatorPeriodo(sku: string, de: string, ate: string): number {
  let soma = 0
  for (let t = new Date(de).getTime(); t <= new Date(ate).getTime(); t += DIA) soma += fatorDia(sku, isoDia(t))
  return soma / 30
}

function linhasDoPeriodo(de: string, ate: string, anterior: boolean): LinhaView[] {
  const linhas: LinhaView[] = []
  const hoje = ate
  for (const p of PRODUTOS) {
    const f = fatorPeriodo(p.sku, de, ate)
    const [fi, fr, fc, fv] = anterior ? (p.anterior ?? [0.95, 0.95, 0.95, 0.95]) : [1, 1, 1, 1]
    const unidades = Math.round((p.receitaTotal / p.preco) * f)
    const custoUnit = p.margemPrePct == null ? null
      : (p.receitaTotal * (1 - IMPOSTO - COMISSAO) - p.receitaTotal * p.margemPrePct) / (p.receitaTotal / p.preco)
    for (const c of p.campanhas) {
      const k = c.parte * f
      const vendas = Math.round(p.vendas * k * fv)
      linhas.push({
        canal: 'mercado_livre', codigo_anuncio: p.codigo, nome_campanha: c.nome, capturado_em: hoje,
        sku: p.sku, titulo_anuncio: p.titulo, status: c.status ?? 'Ativo', categoria: p.categoria,
        impressoes: Math.round(p.impressoes * k * fc), cliques: Math.round(p.cliques * k * fc),
        investimento_ads: Math.round(p.investimento * k * fi * 100) / 100,
        receita_ads: Math.round(p.receitaAds * k * fr * 100) / 100,
        vendas_diretas: Math.round(vendas * 0.85), vendas_indiretas: vendas - Math.round(vendas * 0.85),
        perdeu_buy_box: p.perdeuBuyBox ?? false, estoque: p.estoque ?? null,
        receita_total: Math.round(p.receitaTotal * f * fr * 100) / 100, unidades: Math.round(unidades * fr),
        custo_unitario: custoUnit == null ? null : Math.round(custoUnit * 100) / 100,
        imposto_pct: IMPOSTO, comissao_pct: COMISSAO, taxa_fixa_unit: 0,
        ultima_alteracao_em: p.alteracao && !anterior ? isoDia(new Date(`${hoje}T12:00:00Z`).getTime() - p.alteracao.diasAtras * DIA) : null,
        tipo_ultima_alteracao: p.alteracao && !anterior ? p.alteracao.tipo : null,
        estado_motor: null, gravidade: null, impacto: null, proxima_data_reavaliacao: null, motivo: null,
        evidencias: null, impacto_texto: null, acao_recomendada: null, componente: null, travas: null,
      })
    }
  }
  return linhas
}

function campanhasDe(linhas: LinhaView[], capturado: string): CampanhaView[] {
  return CAMPANHAS.map(c => {
    const ls = linhas.filter(l => l.nome_campanha === c.nome_campanha)
    const s = (f: (l: LinhaView) => number) => ls.reduce((a, l) => a + f(l), 0)
    return {
      ...c, capturado_em: capturado, impressoes: s(l => l.impressoes), cliques: s(l => l.cliques),
      investimento: Math.round(s(l => l.investimento_ads) * 100) / 100, receita: Math.round(s(l => l.receita_ads) * 100) / 100,
      vendas: s(l => l.vendas_diretas + l.vendas_indiretas), anuncios: new Set(ls.map(l => l.codigo_anuncio)).size,
    }
  })
}

export function demoPeriodo(de: string, ate: string, ant: { de: string; ate: string }) {
  const linhas = linhasDoPeriodo(de, ate, false)
  const anteriores = linhasDoPeriodo(ant.de, ant.ate, true)
  return {
    linhas, anteriores,
    campanhas: campanhasDe(linhas, ate), campanhasAnt: campanhasDe(anteriores, ant.ate),
  }
}

/** Série diária (demo) por anúncio: receita ads, investimento, margem após ads. */
export function demoSerie(de: string, ate: string, codigos?: Set<string>) {
  const pontos: { data: string; receita: number; investimento: number; margemPosAds: number }[] = []
  for (let t = new Date(de).getTime(); t <= new Date(ate).getTime(); t += DIA) {
    const data = isoDia(t)
    let receita = 0, investimento = 0, margem = 0
    for (const p of PRODUTOS) {
      if (codigos && !codigos.has(p.codigo)) continue
      const f = fatorDia(p.sku, data) / 30
      const r = p.receitaAds * f
      const i = p.investimento * f * (0.9 + 0.2 * rng(hash(data + p.codigo))())
      receita += r; investimento += i; margem += (p.margemPrePct ?? 0) * r - i
    }
    pontos.push({ data, receita: Math.round(receita), investimento: Math.round(investimento), margemPosAds: Math.round(margem) })
  }
  return pontos
}

const HORA = 3_600_000
function quando(hoje: string, horasAtras: number) {
  return new Date(new Date(`${hoje}T11:00:00Z`).getTime() - horasAtras * HORA).toISOString()
}

export function demoAlertas(hoje: string): Alerta[] {
  const a = (id: string, h: number, tipo: Alerta['tipo'], sku: string, titulo: string, campanha: string, gravidade: Gravidade,
    status: Alerta['status'], problema: string, causa: string, acao: string, codigo: string | null = null): Alerta => ({
    id, canal: 'mercado_livre', tipo, criadoEm: quando(hoje, h), codigoAnuncio: codigo ?? PRODUTOS.find(p => p.sku === sku)?.codigo ?? null,
    sku, titulo, campanha, gravidade, status, problema, causa, acao, resolvidoEm: status === 'resolvido' ? quando(hoje, h - 20) : null,
  })
  return [
    a('d1', 3, 'anuncio_margem_negativa', 'PSY-001', 'Psyllium 1kg', '[R] Snacks - Alto Share - Curva A', 'IMPORTANTE', 'aberto',
      'Margem após ads ficou negativa no período.', 'ACOS acima do equilíbrio de 28%: os ads consomem mais margem do que o produto suporta.',
      'Reduzir gradualmente o orçamento e reavaliar em 7 dias.'),
    a('d2', 4, 'anuncio_sem_venda', 'FAR-UVA-250', 'Farinha de Uva 250g', 'Campanha sem Performance', 'CRITICO', 'aberto',
      'Investiu R$ 960 e não teve vendas por ads no período.', '420 cliques sem nenhuma conversão — provável problema de preço, frete ou avaliações.',
      'Revisar a página do anúncio antes de mexer no orçamento; se seguir sem vender, avaliar pausa.'),
    a('d3', 6, 'mudanca_estado', 'VITD-2000', 'Vitamina D3 2.000 UI', 'Vitaminas - Curva B', 'IMPORTANTE', 'aberto',
      'Mudou de REDUZIR para PAUSAR.', 'Margem após ads segue negativa mesmo após a redução de orçamento de 05/09.',
      'Avaliar a pausa do anúncio — a decisão final é sua.'),
    a('d4', 14, 'promocao_encerrada', 'CUR-001', 'Cúrcuma com Pimenta Preta', '[R] Snacks - Alto Share - Curva A', 'IMPORTANTE', 'aberto',
      'A Oferta do Dia terminou hoje às 00:00.', 'Fim do prazo da promoção no Mercado Livre.',
      'Decidir se reativa a promoção — o produto vendeu bem durante o período.'),
    a('d5', 18, 'conflito_catalogo_classico', 'CUR-001', 'Cúrcuma com Pimenta Preta', 'Cúrcuma com Pimenta', 'ATENCAO', 'em_analise',
      'O mesmo anúncio está em duas campanhas: uma ativa e lucrativa, outra parada.', 'Campanha "Cúrcuma com Pimenta" pausada com o anúncio ainda vinculado.',
      'Manter o anúncio só em "[R] Snacks - Alto Share - Curva A" e arquivar a campanha parada.'),
    a('d6', 26, 'campanha_sem_performance', 'MAG-001', 'Magnésio Quelato', 'Teste - Novos Produtos', 'ATENCAO', 'aberto',
      'CTR de 0,13%, bem abaixo do normal da conta.', 'Anúncio aparece muito e quase ninguém clica — foto/título pouco atrativos.',
      'Testar nova foto principal e título antes de mexer no orçamento.'),
    a('d7', 30, 'custo_nao_cadastrado', 'GRA-040', 'Granola Funcional 400g', '[R] Snacks - Alto Share - Curva A', 'ATENCAO', 'aberto',
      'Sem custo no Precify — margem não calculada.', 'SKU GRA-040 não tem custo cadastrado.',
      'Cadastrar o custo no Precify; o Farol não recomenda mudanças enquanto isso.'),
    a('d8', 40, 'anuncio_margem_negativa', 'LIN-500', 'Linhaça Dourada 500g', 'Catálogo - Clássico', 'ATENCAO', 'aberto',
      'Perdeu o catálogo para outra oferta.', 'Outro vendedor está com preço/frete mais competitivo no catálogo.',
      'Rever preço e frete; não aumentar investimento enquanto outra oferta estiver vencendo.'),
    a('d9', 52, 'mudanca_estado', 'CRE-300', 'Creatina 300g', 'Marca Própria', 'INFORMATIVO', 'resolvido',
      'Performance positiva: receita atribuída +34% com margem saudável.', 'Ajuste de lance de 12/09 funcionou.',
      'Nada a fazer — o estoque baixo impede escalar por enquanto.'),
    a('d10', 70, 'promocao_encerrada', 'PSY-001', 'Psyllium 1kg', '[R] Snacks - Alto Share - Curva A', 'IMPORTANTE', 'resolvido',
      'Oferta Relâmpago encerrada.', 'Fim do prazo da promoção.', 'Promoção reativada em 22/09.'),
  ]
}

export function demoPromocoes(hoje: string): Promocao[] {
  const d = (dias: number) => isoDia(new Date(`${hoje}T12:00:00Z`).getTime() - dias * DIA)
  const p = (sku: string, preco: number, desconto: number, status: Promocao['status'], desde: number, fim: number | null): Promocao => {
    const prod = PRODUTOS.find(x => x.sku === sku)
    return {
      canal: 'mercado_livre', itemId: prod?.codigo ?? sku, titulo: prod?.titulo ?? sku, sku, preco,
      precoOriginal: Math.round((preco / (1 - desconto)) * 100) / 100, desconto, status,
      desde: d(desde), encerradaEm: fim == null ? null : d(fim), diasAtiva: (fim == null ? desde : desde - fim),
    }
  }
  return [
    p('CUR-001', 24.65, 0.15, 'encerrada', 5, 0),
    p('PSY-001', 44, 0.2, 'encerrada', 6, 0),
    p('COL-002', 68.6, 0.12, 'encerrada', 14, 7),
    p('MAC-500', 62.1, 0.1, 'ativa', 4, null),
    p('OME-003', 64.6, 0.15, 'ativa', 4, null),
    p('MIX-250', 18, 0.25, 'ativa', 6, null),
    p('CRE-300', 72.98, 0.18, 'ativa', 8, null),
    p('VITD-2000', 33.6, 0.2, 'ativa', 10, null),
    p('CHI-100', 16.15, 0.15, 'ativa', 15, null),
    p('LIN-500', 16.2, 0.1, 'encerrada', 20, 12),
  ]
}

export function demoHistorico(hoje: string): RecomendacaoHistorico[] {
  const d = (dias: number) => new Date(new Date(`${hoje}T11:00:00Z`).getTime() - dias * DIA).toISOString()
  return [
    { geradoEm: d(20), codigoAnuncio: 'MLB4410098721', sku: 'VITD-2000', titulo: 'Vitamina D3 2.000 UI', estado: 'REDUZIR', gravidade: 'IMPORTANTE',
      motivo: 'A publicidade está consumindo mais margem do que o produto suporta.', acao: 'Reduzir o orçamento de R$ 180 para R$ 130/dia.', status: 'aplicada', resolvidoEm: d(19) },
    { geradoEm: d(13), codigoAnuncio: 'MLB6012337789', sku: 'CRE-300', titulo: 'Creatina 300g', estado: 'OTIMIZAR', gravidade: 'ATENCAO',
      motivo: 'Muitos cliques e poucas vendas.', acao: 'Ajustar preço e revisar fotos.', status: 'resolvida', resolvidoEm: d(9) },
    { geradoEm: d(8), codigoAnuncio: 'MLB2209934410', sku: 'OME-003', titulo: 'Ômega 3 Premium', estado: 'ESCALAR', gravidade: 'ATENCAO',
      motivo: 'Boa margem depois dos ads e ROAS bem acima do equilíbrio.', acao: 'Testar +20% de orçamento.', status: 'ignorada', resolvidoEm: null },
    { geradoEm: d(4), codigoAnuncio: 'MLB6620253832', sku: 'PSY-001', titulo: 'Psyllium 1kg', estado: 'OBSERVAR', gravidade: 'ATENCAO',
      motivo: 'ROAS caindo nos últimos dias.', acao: 'Continuar acompanhando.', status: 'resolvida', resolvidoEm: d(2) },
    { geradoEm: d(3), codigoAnuncio: 'MLB8830291176', sku: 'MIX-250', titulo: 'Mix de Sementes 250g', estado: 'REDUZIR', gravidade: 'ATENCAO',
      motivo: 'ACOS acima do equilíbrio.', acao: 'Reduzir lance.', status: 'aplicada', resolvidoEm: d(3) },
  ]
}
