// Precificação de marketplaces — mesma conta da planilha PRECIFICAÇÃO_RDB_FINAL
// (abas CALCULADORA MKT e MKT CONFIG): Mercado Livre Full Super e Shopee.
//
// Estratégia de cadastro: o anúncio sobe com o preço cheio (acréscimo sobre o
// preço de venda) e depois entra em promoção. Todas as taxas incidem sobre o
// preço que o cliente paga (o preço em promoção), e é sobre ele que a margem
// é calculada. O preço de cadastro é só o preço em promoção × (1 + acréscimo).

export interface ConfigMkt {
  imposto: number
  /** meta e piso de margem de contribuição nos marketplaces */
  meta: number
  piso: number
  /** acréscimo sobre o preço de venda para cadastrar o anúncio (0.30 = sobe 30% acima) */
  acrescimoCadastro: number
  ml: {
    comissao: number
    ads: number
    /** R$ por unidade enviada ao Full */
    embalagem: number
    coleta: number
    armazenagem: number
    /** Full Super: abaixo de `tetoAte`, o envio custa no máximo `tetoEnvio` do preço */
    tetoEnvio: number
    tetoAte: number
  }
  shopee: {
    comissao: number
    ads: number
    servico: number
    transacao: number
    afiliados: number
    /** R$ por pedido */
    devolucao: number
    embalagem: number
    frete: number
  }
}

/** Valores da aba MKT CONFIG em 15/11/2026. */
export const CONFIG_MKT_PADRAO: ConfigMkt = {
  imposto: 0.087, meta: 0.25, piso: 0.15, acrescimoCadastro: 0.30,
  ml: { comissao: 0.14, ads: 0.092, embalagem: 0.90, coleta: 0.60, armazenagem: 0, tetoEnvio: 0.25, tetoAte: 29 },
  shopee: { comissao: 0.186, ads: 0.203, servico: 0.05, transacao: 0.014, afiliados: 0.024, devolucao: 0.49, embalagem: 1.50, frete: 1.22 },
}

export const CAMPOS_CONFIG_MKT: { grupo: string; campos: { caminho: string; rotulo: string; tipo: 'pct' | 'reais' }[] }[] = [
  { grupo: 'Geral', campos: [
    { caminho: 'imposto', rotulo: 'Imposto Simples', tipo: 'pct' },
    { caminho: 'meta', rotulo: 'Meta de margem', tipo: 'pct' },
    { caminho: 'piso', rotulo: 'Piso de margem', tipo: 'pct' },
    { caminho: 'acrescimoCadastro', rotulo: 'Acréscimo no preço de cadastro', tipo: 'pct' },
  ] },
  { grupo: 'Mercado Livre Full Super', campos: [
    { caminho: 'ml.comissao', rotulo: 'Comissão', tipo: 'pct' },
    { caminho: 'ml.ads', rotulo: 'Ads (% do preço)', tipo: 'pct' },
    { caminho: 'ml.embalagem', rotulo: 'Embalagem por unidade', tipo: 'reais' },
    { caminho: 'ml.coleta', rotulo: 'Coleta / envio ao Full por unidade', tipo: 'reais' },
    { caminho: 'ml.armazenagem', rotulo: 'Armazenagem por unidade', tipo: 'reais' },
    { caminho: 'ml.tetoEnvio', rotulo: 'Teto do envio (% do preço)', tipo: 'pct' },
    { caminho: 'ml.tetoAte', rotulo: 'Teto vale para preço abaixo de', tipo: 'reais' },
  ] },
  { grupo: 'Shopee', campos: [
    { caminho: 'shopee.comissao', rotulo: 'Comissão', tipo: 'pct' },
    { caminho: 'shopee.ads', rotulo: 'Ads (% do preço)', tipo: 'pct' },
    { caminho: 'shopee.servico', rotulo: 'Taxa de serviço adicional', tipo: 'pct' },
    { caminho: 'shopee.transacao', rotulo: 'Taxa de transação', tipo: 'pct' },
    { caminho: 'shopee.afiliados', rotulo: 'Afiliados (média)', tipo: 'pct' },
    { caminho: 'shopee.devolucao', rotulo: 'Devolução Fácil por pedido', tipo: 'reais' },
    { caminho: 'shopee.embalagem', rotulo: 'Embalagem por pedido', tipo: 'reais' },
    { caminho: 'shopee.frete', rotulo: 'Custo líquido de frete por pedido', tipo: 'reais' },
  ] },
]

// Full Super: custo de envio por unidade, por peso (linhas) e faixa de preço (colunas).
export const FAIXAS_PRECO_ML = [0, 19, 29, 49, 79, 99, 199]
const PESOS_ML = [0, 0.3, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 7, 8, 9]
const ENVIO_ML: number[][] = [
  [1.40, 1.80, 2.40, 3.60, 4.80, 7.20, 21.65],
  [1.40, 1.80, 2.40, 3.60, 4.80, 7.20, 23.25],
  [1.40, 1.80, 2.40, 3.60, 4.80, 7.20, 24.45],
  [1.95, 2.40, 3.00, 4.20, 5.40, 7.80, 25.45],
  [1.95, 2.40, 3.00, 4.20, 5.40, 7.80, 25.55],
  [2.20, 3.00, 3.60, 4.80, 6.00, 8.40, 27.05],
  [2.20, 3.00, 3.60, 4.80, 6.00, 8.40, 29.25],
  [3.00, 4.38, 5.00, 6.25, 7.50, 9.38, 32.45],
  [3.00, 4.38, 5.00, 6.25, 7.50, 9.38, 40.85],
  [4.80, 6.25, 6.88, 8.13, 8.75, 9.38, 45.25],
  [4.80, 6.25, 6.88, 8.13, 8.75, 9.38, 49.35],
  [5.00, 7.50, 9.10, 9.80, 10.50, 11.20, 50.75],
  [5.00, 7.50, 9.10, 9.80, 10.50, 11.20, 65.85],
]
// Shopee: taxa fixa por item conforme a faixa de preço.
export const FAIXAS_PRECO_SHOPEE = [0, 80, 100, 200]
const TAXA_FIXA_SHOPEE = [4.50, 16.00, 20.00, 26.00]

const faixaDe = (inicios: number[], preco: number) => {
  let i = 0
  for (let k = 0; k < inicios.length; k++) if (preco >= inicios[k]) i = k
  return i
}
const linhaPeso = (pesoKg: number) => {
  let i = 0
  for (let k = 0; k < PESOS_ML.length; k++) if (pesoKg >= PESOS_ML[k]) i = k
  return i
}

/** Envio do Full Super pela tabela, sem o teto. */
export function envioTabelaML(pesoKg: number, faixa: number): number {
  return ENVIO_ML[linhaPeso(pesoKg)][faixa]
}
/** Envio do Full Super no preço dado, já com o teto de 25% para preços baixos. */
export function envioML(preco: number, pesoKg: number, c: ConfigMkt): number {
  const tabela = envioTabelaML(pesoKg, faixaDe(FAIXAS_PRECO_ML, preco))
  return preco < c.ml.tetoAte ? Math.min(tabela, c.ml.tetoEnvio * preco) : tabela
}
export function taxaFixaShopee(preco: number): number {
  return TAXA_FIXA_SHOPEE[faixaDe(FAIXAS_PRECO_SHOPEE, preco)]
}

export type Canal = 'ml' | 'shopee'
export type Semaforo = 'VERDE' | 'AMARELO' | 'VERMELHO'

export interface EntradaMkt {
  /** custo do item anunciado (o pacote inteiro, não o kg) */
  custo: number
  /** peso tarifado em kg (só o Mercado Livre usa) */
  pesoKg: number
  /** comissão do anúncio no ML e % de Ads, quando diferentes do padrão */
  comissaoML?: number
  adsML?: number
  adsShopee?: number
}

export interface LinhaCusto { rotulo: string; valor: number }
export interface ResultadoMkt {
  preco: number
  linhas: LinhaCusto[]
  margem: number
  margemPct: number
  semaforo: Semaforo
}

const fixosML = (c: ConfigMkt) => c.ml.embalagem + c.ml.coleta + c.ml.armazenagem
const fixosShopee = (c: ConfigMkt) => c.shopee.embalagem + c.shopee.devolucao + c.shopee.frete
const pctML = (e: EntradaMkt, c: ConfigMkt) => (e.comissaoML ?? c.ml.comissao) + c.imposto + (e.adsML ?? c.ml.ads)
const pctShopee = (e: EntradaMkt, c: ConfigMkt) =>
  c.shopee.comissao + c.shopee.servico + c.shopee.transacao + c.shopee.afiliados + c.imposto + (e.adsShopee ?? c.shopee.ads)

function semaforo(m: number, c: ConfigMkt): Semaforo {
  return m < c.piso ? 'VERMELHO' : m < c.meta ? 'AMARELO' : 'VERDE'
}

/** O que sobra vendendo a `preco` (preço que o cliente paga). */
export function resultado(canal: Canal, preco: number, e: EntradaMkt, c: ConfigMkt): ResultadoMkt {
  const linhas: LinhaCusto[] = canal === 'ml'
    ? [
        { rotulo: 'Custo do produto', valor: e.custo },
        { rotulo: 'Comissão', valor: preco * (e.comissaoML ?? c.ml.comissao) },
        { rotulo: 'Envio (Full Super)', valor: envioML(preco, e.pesoKg, c) },
        { rotulo: 'Imposto', valor: preco * c.imposto },
        { rotulo: 'Ads', valor: preco * (e.adsML ?? c.ml.ads) },
        { rotulo: 'Embalagem e envio ao Full', valor: fixosML(c) },
      ]
    : [
        { rotulo: 'Custo do produto', valor: e.custo },
        { rotulo: 'Comissão', valor: preco * c.shopee.comissao },
        { rotulo: 'Taxa fixa por item', valor: taxaFixaShopee(preco) },
        { rotulo: 'Serviço, transação e afiliados', valor: preco * (c.shopee.servico + c.shopee.transacao + c.shopee.afiliados) },
        { rotulo: 'Imposto', valor: preco * c.imposto },
        { rotulo: 'Ads', valor: preco * (e.adsShopee ?? c.shopee.ads) },
        { rotulo: 'Embalagem, devolução e frete do pedido', valor: fixosShopee(c) },
      ]
  const margem = preco - linhas.reduce((s, l) => s + l.valor, 0)
  const margemPct = preco > 0 ? margem / preco : 0
  return { preco, linhas, margem, margemPct, semaforo: semaforo(margemPct, c) }
}

export interface FaixaPreco {
  de: number; ate: number | null
  /** envio (ML) ou taxa fixa (Shopee) que vale na faixa */
  custoFaixa: number
  /** preço que entregaria a margem com o custo dessa faixa */
  preco: number | null
  /** preço que de fato vale: o calculado se cai na faixa, o início dela se ficou abaixo, null se passou do fim */
  valido: number | null
}

/**
 * Menor preço que entrega a margem pedida. O custo de envio do Full Super e a
 * taxa fixa da Shopee mudam por faixa de preço, então a conta é feita faixa a
 * faixa e vale o menor preço coerente com a própria faixa.
 */
export function precoParaMargem(canal: Canal, margem: number, e: EntradaMkt, c: ConfigMkt): { preco: number | null; faixas: FaixaPreco[] } {
  const inicios = canal === 'ml' ? FAIXAS_PRECO_ML : FAIXAS_PRECO_SHOPEE
  const k = 1 - (canal === 'ml' ? pctML(e, c) : pctShopee(e, c)) - margem
  const fixos = e.custo + (canal === 'ml' ? fixosML(c) : fixosShopee(c))

  const faixas = inicios.map((de, i): FaixaPreco => {
    const ate = i + 1 < inicios.length ? inicios[i + 1] - 0.01 : null
    const custoFaixa = canal === 'ml' ? envioTabelaML(e.pesoKg, i) : TAXA_FIXA_SHOPEE[i]
    if (k <= 0) return { de, ate, custoFaixa, preco: null, valido: null }
    let preco = (fixos + custoFaixa) / k
    // no Full Super, preço baixo paga no máximo 25% de envio: refaz a conta se o teto valer
    if (canal === 'ml' && preco < c.ml.tetoAte && c.ml.tetoEnvio * preco < custoFaixa && k - c.ml.tetoEnvio > 0) {
      const comTeto = fixos / (k - c.ml.tetoEnvio)
      if (comTeto < c.ml.tetoAte && c.ml.tetoEnvio * comTeto < custoFaixa) preco = comTeto
    }
    const valido = ate != null && preco > ate ? null : Math.max(preco, de)
    return { de, ate, custoFaixa, preco, valido }
  })
  const validos = faixas.flatMap(f => (f.valido != null ? [f.valido] : []))
  return { preco: validos.length ? Math.min(...validos) : null, faixas }
}

/** Preço cheio para cadastrar o anúncio, deixando espaço para a promoção. */
export const precoCadastro = (precoVenda: number, c: ConfigMkt) => precoVenda * (1 + c.acrescimoCadastro)
/** Desconto que a promoção precisa mostrar para voltar ao preço de venda. */
export const descontoPromocao = (c: ConfigMkt) => 1 - 1 / (1 + c.acrescimoCadastro)

/** Lê e grava um valor por caminho ("ml.ads"), para a tela de parâmetros. */
export function lerCampo(c: ConfigMkt, caminho: string): number {
  const [a, b] = caminho.split('.')
  return (b ? (c as unknown as Record<string, Record<string, number>>)[a][b] : (c as unknown as Record<string, number>)[a])
}
export function gravarCampo(c: ConfigMkt, caminho: string, valor: number): ConfigMkt {
  const novo: ConfigMkt = { ...c, ml: { ...c.ml }, shopee: { ...c.shopee } }
  const [a, b] = caminho.split('.')
  if (b) (novo as unknown as Record<string, Record<string, number>>)[a][b] = valor
  else (novo as unknown as Record<string, number>)[a] = valor
  return novo
}
