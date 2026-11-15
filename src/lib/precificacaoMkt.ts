// Precificação de marketplaces — mesma conta da planilha PRECIFICAÇÃO_RDB_FINAL
// (abas CALCULADORA MKT e MKT CONFIG): Mercado Livre Full Super e Shopee.
// O TikTok Shop segue a mesma estrutura, com as taxas que o Precify já usava.
//
// Estratégia de cadastro: o anúncio sobe com o preço cheio e depois entra em
// promoção. O preço de cadastro é aquele que, com o desconto da promoção
// (30%), chega ao preço de venda: cadastro = venda ÷ (1 − desconto).
// Todas as taxas incidem sobre o preço que o cliente paga (em promoção), e é
// sobre ele que a margem é calculada.

export interface ConfigMkt {
  imposto: number
  /** meta e piso de margem de contribuição nos marketplaces */
  meta: number
  piso: number
  /** desconto da promoção que leva do preço de cadastro ao preço de venda (0.30 = 30% off) */
  descontoPromocao: number
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
    /** frete médio por pedido, diluído em todos os pedidos (Entrega Padrão não custa nada) */
    frete: number
    /** frete de um pedido em Entrega Direta: motoboy menos o crédito de frete da Shopee */
    freteDireta: number
  }
  tiktok: {
    /** comissão e taxa fixa por item mudam quando o preço chega a `faixaAlta` */
    comissaoBaixa: number
    comissaoAlta: number
    taxaFixaBaixa: number
    taxaFixaAlta: number
    faixaAlta: number
    /** afiliados, serviço e demais taxas percentuais */
    outras: number
    ads: number
    /** R$ por pedido */
    embalagem: number
    frete: number
  }
}

/** Valores da aba MKT CONFIG em 15/11/2026. */
export const CONFIG_MKT_PADRAO: ConfigMkt = {
  imposto: 0.087, meta: 0.25, piso: 0.15, descontoPromocao: 0.30,
  ml: { comissao: 0.14, ads: 0.092, embalagem: 0.90, coleta: 0.60, armazenagem: 0, tetoEnvio: 0.25, tetoAte: 29 },
  shopee: { comissao: 0.186, ads: 0.203, servico: 0.05, transacao: 0.014, afiliados: 0.024, devolucao: 0.49, embalagem: 1.50, frete: 1.22, freteDireta: 3.99 },
  // TikTok: taxas herdadas da calculadora anterior do Precify; Ads sem histórico, começa em zero
  tiktok: { comissaoBaixa: 0.10, comissaoAlta: 0.06, taxaFixaBaixa: 4, taxaFixaAlta: 6, faixaAlta: 50, outras: 0.06, ads: 0, embalagem: 1.50, frete: 0 },
}

export const CAMPOS_CONFIG_MKT: { grupo: string; campos: { caminho: string; rotulo: string; tipo: 'pct' | 'reais' }[] }[] = [
  { grupo: 'Geral', campos: [
    { caminho: 'imposto', rotulo: 'Imposto Simples', tipo: 'pct' },
    { caminho: 'meta', rotulo: 'Meta de margem', tipo: 'pct' },
    { caminho: 'piso', rotulo: 'Piso de margem', tipo: 'pct' },
    { caminho: 'descontoPromocao', rotulo: 'Desconto da promoção (cadastro → venda)', tipo: 'pct' },
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
    { caminho: 'shopee.frete', rotulo: 'Frete médio por pedido (todas as entregas)', tipo: 'reais' },
    { caminho: 'shopee.freteDireta', rotulo: 'Frete na Entrega Direta (motoboy − crédito)', tipo: 'reais' },
  ] },
  { grupo: 'TikTok Shop', campos: [
    { caminho: 'tiktok.comissaoBaixa', rotulo: 'Comissão abaixo da faixa', tipo: 'pct' },
    { caminho: 'tiktok.comissaoAlta', rotulo: 'Comissão a partir da faixa', tipo: 'pct' },
    { caminho: 'tiktok.taxaFixaBaixa', rotulo: 'Taxa fixa abaixo da faixa', tipo: 'reais' },
    { caminho: 'tiktok.taxaFixaAlta', rotulo: 'Taxa fixa a partir da faixa', tipo: 'reais' },
    { caminho: 'tiktok.faixaAlta', rotulo: 'A faixa muda no preço de', tipo: 'reais' },
    { caminho: 'tiktok.outras', rotulo: 'Afiliados e outras taxas', tipo: 'pct' },
    { caminho: 'tiktok.ads', rotulo: 'Ads (% do preço)', tipo: 'pct' },
    { caminho: 'tiktok.embalagem', rotulo: 'Embalagem por pedido', tipo: 'reais' },
    { caminho: 'tiktok.frete', rotulo: 'Custo líquido de frete por pedido', tipo: 'reais' },
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

export type Canal = 'ml' | 'shopee' | 'tiktok'
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
  adsTiktok?: number
  /**
   * Como o pedido da Shopee é entregue. Só a Entrega Direta tem custo de frete:
   * 'media' dilui esse custo em todos os pedidos, 'padrao' não cobra nada e
   * 'direta' cobra o frete inteiro de um pedido com motoboy.
   */
  entregaShopee?: 'media' | 'padrao' | 'direta'
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
export const freteShopee = (e: EntradaMkt, c: ConfigMkt) =>
  e.entregaShopee === 'padrao' ? 0 : e.entregaShopee === 'direta' ? c.shopee.freteDireta : c.shopee.frete
const fixosShopee = (e: EntradaMkt, c: ConfigMkt) => c.shopee.embalagem + c.shopee.devolucao + freteShopee(e, c)
const pctML = (e: EntradaMkt, c: ConfigMkt) => (e.comissaoML ?? c.ml.comissao) + c.imposto + (e.adsML ?? c.ml.ads)
const pctShopee = (e: EntradaMkt, c: ConfigMkt) =>
  c.shopee.comissao + c.shopee.servico + c.shopee.transacao + c.shopee.afiliados + c.imposto + (e.adsShopee ?? c.shopee.ads)
const fixosTiktok = (c: ConfigMkt) => c.tiktok.embalagem + c.tiktok.frete
const altaTiktok = (preco: number, c: ConfigMkt) => preco >= c.tiktok.faixaAlta
const comissaoTiktok = (preco: number, c: ConfigMkt) => (altaTiktok(preco, c) ? c.tiktok.comissaoAlta : c.tiktok.comissaoBaixa)
export const taxaFixaTiktok = (preco: number, c: ConfigMkt) => (altaTiktok(preco, c) ? c.tiktok.taxaFixaAlta : c.tiktok.taxaFixaBaixa)

function semaforo(m: number, c: ConfigMkt): Semaforo {
  // folga de arredondamento: o preço ideal entrega exatamente a meta e não pode cair para amarelo
  const eps = 1e-6
  return m < c.piso - eps ? 'VERMELHO' : m < c.meta - eps ? 'AMARELO' : 'VERDE'
}

/** O que sobra vendendo a `preco` (preço que o cliente paga). */
export function resultado(canal: Canal, preco: number, e: EntradaMkt, c: ConfigMkt): ResultadoMkt {
  const linhas: LinhaCusto[] = canal === 'tiktok'
    ? [
        { rotulo: 'Custo do produto', valor: e.custo },
        { rotulo: 'Comissão', valor: preco * comissaoTiktok(preco, c) },
        { rotulo: 'Taxa fixa por item', valor: taxaFixaTiktok(preco, c) },
        { rotulo: 'Afiliados e outras taxas', valor: preco * c.tiktok.outras },
        { rotulo: 'Imposto', valor: preco * c.imposto },
        { rotulo: 'Ads', valor: preco * (e.adsTiktok ?? c.tiktok.ads) },
        { rotulo: 'Embalagem e frete do pedido', valor: fixosTiktok(c) },
      ]
    : canal === 'ml'
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
        { rotulo: 'Embalagem, devolução e frete do pedido', valor: fixosShopee(e, c) },
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
  const inicios = canal === 'ml' ? FAIXAS_PRECO_ML : canal === 'shopee' ? FAIXAS_PRECO_SHOPEE : [0, c.tiktok.faixaAlta]
  const fixos = e.custo + (canal === 'ml' ? fixosML(c) : canal === 'shopee' ? fixosShopee(e, c) : fixosTiktok(c))

  const faixas = inicios.map((de, i): FaixaPreco => {
    const ate = i + 1 < inicios.length ? inicios[i + 1] - 0.01 : null
    // no TikTok a comissão também muda de faixa; nos outros só o custo fixo
    const pctFaixa = canal === 'ml' ? pctML(e, c) : canal === 'shopee' ? pctShopee(e, c)
      : (i === 0 ? c.tiktok.comissaoBaixa : c.tiktok.comissaoAlta) + c.tiktok.outras + c.imposto + (e.adsTiktok ?? c.tiktok.ads)
    const k = 1 - pctFaixa - margem
    const custoFaixa = canal === 'ml' ? envioTabelaML(e.pesoKg, i) : canal === 'shopee' ? TAXA_FIXA_SHOPEE[i]
      : (i === 0 ? c.tiktok.taxaFixaBaixa : c.tiktok.taxaFixaAlta)
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

/** Preço cheio para cadastrar o anúncio: com o desconto da promoção, chega ao preço de venda. */
export const precoCadastro = (precoVenda: number, c: ConfigMkt) =>
  c.descontoPromocao < 1 ? precoVenda / (1 - c.descontoPromocao) : precoVenda
/** Quanto o preço de cadastro fica acima do preço de venda (30% de desconto = 42,9% acima). */
export const acrescimoCadastro = (c: ConfigMkt) => (c.descontoPromocao < 1 ? 1 / (1 - c.descontoPromocao) - 1 : 0)

/** Lê e grava um valor por caminho ("ml.ads"), para a tela de parâmetros. */
export function lerCampo(c: ConfigMkt, caminho: string): number {
  const [a, b] = caminho.split('.')
  return (b ? (c as unknown as Record<string, Record<string, number>>)[a][b] : (c as unknown as Record<string, number>)[a])
}
export function gravarCampo(c: ConfigMkt, caminho: string, valor: number): ConfigMkt {
  const novo: ConfigMkt = { ...c, ml: { ...c.ml }, shopee: { ...c.shopee }, tiktok: { ...c.tiktok } }
  const [a, b] = caminho.split('.')
  if (b) (novo as unknown as Record<string, Record<string, number>>)[a][b] = valor
  else (novo as unknown as Record<string, number>)[a] = valor
  return novo
}
