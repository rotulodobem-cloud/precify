// Tipos de domínio do Farol Ads. Espelham as tabelas/views de supabase/migrations.

export type Canal = 'mercado_livre' | 'shopee' | 'tiktok'
export const CANAIS: { slug: Canal; nome: string; ativo: boolean }[] = [
  { slug: 'mercado_livre', nome: 'Mercado Livre', ativo: true },
  { slug: 'shopee', nome: 'Shopee', ativo: false },
  { slug: 'tiktok', nome: 'TikTok Shop', ativo: false },
]
export const nomeCanal = (c: string) => CANAIS.find(x => x.slug === c)?.nome ?? c

export type Estado = 'ESCALAR' | 'MANTER' | 'OBSERVAR' | 'OTIMIZAR' | 'REDUZIR' | 'PAUSAR'
export const ESTADOS: Estado[] = ['REDUZIR', 'PAUSAR', 'OTIMIZAR', 'OBSERVAR', 'ESCALAR', 'MANTER']

export type Gravidade = 'INFORMATIVO' | 'ATENCAO' | 'IMPORTANTE' | 'CRITICO'
export const GRAVIDADES: Gravidade[] = ['CRITICO', 'IMPORTANTE', 'ATENCAO', 'INFORMATIVO']

/** Dados brutos de um anúncio no período (relatório de anúncios + custo Precify + vendas Bling). */
export interface AnuncioEntrada {
  canal: Canal
  codigoAnuncio: string
  sku: string | null
  titulo: string
  campanha: string
  categoria: string | null
  status: string
  impressoes: number
  cliques: number
  investimento: number
  /** Receita atribuída a ads (relatório do ML). */
  receitaAds: number
  vendasDiretas: number
  vendasIndiretas: number
  /** Receita total do SKU no período (ads + orgânico, via Bling/Nuvemshop). null = sem dado de vendas. */
  receitaTotal: number | null
  /** Unidades vendidas no período (todas as origens). */
  unidades: number | null
  /** Custo direto/CMV unitário (Precify). null = custo não cadastrado. */
  custoUnitario: number | null
  impostoPct: number
  comissaoPct: number
  taxaFixaUnit: number
  /** Frete suportado pela empresa no período. null = não disponível ("não incluído"). */
  freteEmpresa: number | null
  roasObjetivo: number | null
  estoque: number | null
  perdeuBuyBox: boolean | null
  ultimaAlteracaoEm: string | null
  tipoUltimaAlteracao: string | null
  /** Já houve recomendação OTIMIZAR/REDUZIR aplicada antes (pré-condição de PAUSAR). */
  jaTentouAjustar: boolean
  /** Métricas do período anterior equivalente, para comparação. */
  anterior?: Partial<Pick<AnuncioEntrada, 'impressoes' | 'cliques' | 'investimento' | 'receitaAds' | 'vendasDiretas' | 'vendasIndiretas' | 'receitaTotal'>> & { margemPosAds?: number | null }
}

/** Economia do SKU/anúncio — o que a view ads_anuncios_margem entrega. */
export interface Economia {
  receitaLiquida: number
  custoDireto: number | null
  impostoValor: number
  comissaoValor: number
  taxaFixaValor: number
  freteEmpresaValor: number | null
  margemPreAds: number | null
  margemPreAdsPct: number | null
  investimento: number
  margemPosAds: number | null
  margemPosAdsPct: number | null
  acos: number | null
  roas: number | null
  tacos: number | null
  acosEquilibrio: number | null
  roasEquilibrio: number | null
  ctr: number | null
  cvr: number | null
  cpc: number | null
  vendas: number
  /** Algum componente de custo ficou de fora (frete etc.) — margem parcial. */
  margemParcial: boolean
  custoNaoCadastrado: boolean
}

export interface Diagnostico {
  estado: Estado
  gravidade: Gravidade
  /** Valor em reais: negativo = perda/risco, positivo = potencial. */
  impacto: number
  titulo: string
  situacao: string
  evidencias: string[]
  impactoTexto: string
  acao: string
  /** Componente mais provável do problema (OTIMIZAR). */
  componente?: 'imagem/título' | 'preço/frete/avaliações' | 'competitividade' | 'custo de mídia'
  travas: string[]
  proximaReavaliacao: string | null
  /** Registro em ads_recomendacoes_historico (só quando a decisão foi gravada pela ingestão). */
  recomendacaoId?: string
  statusRecomendacao?: 'pendente' | 'aplicada' | 'ignorada' | 'resolvida'
}

export interface AnuncioAnalisado extends AnuncioEntrada {
  economia: Economia
  diagnostico: Diagnostico
}

export interface CampanhaResumo {
  canal: Canal
  nome: string
  status: string
  orcamento: number | null
  roasObjetivo: number | null
  impressoes: number
  cliques: number
  investimento: number
  receita: number
  vendas: number
  anuncios: number
  margemPosAds: number | null
  margemPosAdsPct: number | null
  anterior?: { investimento: number; receita: number }
  estado: Estado
  gravidade: Gravidade
}

export type TipoAlerta =
  | 'anuncio_sem_venda' | 'anuncio_margem_negativa' | 'conflito_catalogo_classico'
  | 'promocao_encerrada' | 'campanha_sem_performance' | 'mudanca_estado' | 'custo_nao_cadastrado'

export const ROTULO_TIPO: Record<TipoAlerta, string> = {
  anuncio_sem_venda: 'Sem vendas',
  anuncio_margem_negativa: 'Margem negativa',
  conflito_catalogo_classico: 'Conflito catálogo × clássico',
  promocao_encerrada: 'Promoção encerrada',
  campanha_sem_performance: 'Sem performance',
  mudanca_estado: 'Mudou de estado',
  custo_nao_cadastrado: 'Custo não cadastrado',
}

export interface Alerta {
  id: string
  canal: Canal
  tipo: TipoAlerta
  criadoEm: string
  codigoAnuncio: string | null
  sku: string | null
  titulo: string
  campanha: string | null
  gravidade: Gravidade
  status: 'aberto' | 'em_analise' | 'resolvido'
  problema: string
  causa: string
  acao: string
  resolvidoEm: string | null
}

export interface Promocao {
  canal: Canal
  itemId: string
  titulo: string
  sku: string | null
  preco: number
  precoOriginal: number | null
  desconto: number | null
  status: 'ativa' | 'encerrada'
  desde: string
  encerradaEm: string | null
  diasAtiva: number | null
}

export interface PontoSerie { data: string; receita: number; investimento: number; margemPosAds: number }

export interface RecomendacaoHistorico {
  geradoEm: string
  codigoAnuncio: string
  sku: string | null
  titulo: string
  estado: Estado
  gravidade: Gravidade
  motivo: string
  acao: string
  status: 'pendente' | 'aplicada' | 'ignorada' | 'resolvida'
  resolvidoEm: string | null
}
