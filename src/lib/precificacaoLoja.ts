// Precificação de loja física e site próprio — mesma conta da planilha
// PRECIFICAÇÃO_RDB_FINAL (aba PRECIFICAR). Marketplaces têm tela e regras próprias.
//
// Regra comercial: o preço por kg é o mesmo em todas as gramaturas
// (100 g = 10%, 250 g = 25%, 500 g = 50%, 1 kg = 100%). A embalagem muda a
// margem de cada pacote, não o preço por kg.

export interface ConfigLoja {
  /** Imposto Simples sobre a receita (0.087 = 8,7%) */
  imposto: number
  /** Taxa variável média dos canais próprios: pagamento + caixa (0.0228) */
  taxaVariavel: number
  /** Meta de margem de contribuição (0.30) */
  meta: number
  /** Piso por produto; abaixo disso é vermelho (0.20) */
  minimo: number
  /** Zona de atenção por pacote (0.25) */
  atencao: number
  /** Perda no fracionamento (0.01) */
  perda: number
  emb100: number; emb250: number; emb500: number; emb1kg: number
  /** Etiqueta cobrada à parte da embalagem; zero se já está inclusa */
  etiquetaExtra: number
}

/**
 * Valores da aba CONFIGURAÇÕES em 15/11/2026, com a margem mínima de 20%
 * definida pela Michele no mesmo dia (a planilha usava 18%).
 */
export const CONFIG_LOJA_PADRAO: ConfigLoja = {
  imposto: 0.087, taxaVariavel: 0.0228, meta: 0.30, minimo: 0.20, atencao: 0.25, perda: 0.01,
  emb100: 0.50, emb250: 0.66, emb500: 0.90, emb1kg: 1.15, etiquetaExtra: 0,
}

export const CAMPOS_CONFIG_LOJA: { chave: keyof ConfigLoja; rotulo: string; tipo: 'pct' | 'reais' }[] = [
  { chave: 'imposto', rotulo: 'Imposto Simples', tipo: 'pct' },
  { chave: 'taxaVariavel', rotulo: 'Taxa variável média (pagamento + caixa)', tipo: 'pct' },
  { chave: 'meta', rotulo: 'Meta de margem', tipo: 'pct' },
  { chave: 'minimo', rotulo: 'Margem mínima por produto', tipo: 'pct' },
  { chave: 'atencao', rotulo: 'Zona de atenção', tipo: 'pct' },
  { chave: 'perda', rotulo: 'Perda no fracionamento', tipo: 'pct' },
  { chave: 'emb100', rotulo: 'Embalagem 100 g', tipo: 'reais' },
  { chave: 'emb250', rotulo: 'Embalagem 250 g', tipo: 'reais' },
  { chave: 'emb500', rotulo: 'Embalagem 500 g', tipo: 'reais' },
  { chave: 'emb1kg', rotulo: 'Embalagem 1 kg', tipo: 'reais' },
  { chave: 'etiquetaExtra', rotulo: 'Etiqueta extra por pacote', tipo: 'reais' },
]

export type Semaforo = 'VERDE' | 'AMARELO' | 'VERMELHO'
export type Situacao = 'CRITICO' | 'ABAIXO_DA_META' | 'NA_META' | 'SEM_DADOS'

export interface EntradaPreco {
  /** custo por kg (fracionado) ou por unidade */
  custo: number | null
  /** preço cadastrado (R$/kg ou R$/unidade) */
  preco: number | null
  /** true = granel vendido por gramatura; false = produto por unidade */
  fracionado: boolean
}

const valido = (v: number | null | undefined): v is number => v != null && Number.isFinite(v) && v > 0

/** Custo do item pronto para vender: compra corrigida pela perda + embalagem de 1 kg (só fracionado). */
export function custoBase(custo: number, fracionado: boolean, c: ConfigLoja): number {
  return custo / (1 - c.perda) + (fracionado ? c.emb1kg + c.etiquetaExtra : 0)
}

/** Preço que entrega exatamente a meta de margem. */
export function precoIdeal(custo: number | null, fracionado: boolean, c: ConfigLoja): number | null {
  if (!valido(custo)) return null
  const divisor = 1 - c.imposto - c.meta - c.taxaVariavel
  return divisor > 0 ? custoBase(custo, fracionado, c) / divisor : null
}

/** Margem de contribuição de um preço: o que sobra depois de custo, embalagem, imposto e taxas. */
export function margem(preco: number | null, custoComEmbalagem: number | null, c: ConfigLoja): number | null {
  if (!valido(preco) || custoComEmbalagem == null) return null
  return (preco - custoComEmbalagem - preco * (c.imposto + c.taxaVariavel)) / preco
}

/** Maior desconto que ainda mantém a margem mínima (0.175 = 17,5%). */
export function descontoMaximo(custo: number | null, preco: number | null, fracionado: boolean, c: ConfigLoja): number | null {
  if (!valido(custo) || !valido(preco)) return null
  const sobra = preco * (1 - c.imposto - c.taxaVariavel - c.minimo)
  return sobra > 0 ? Math.max(0, 1 - custoBase(custo, fracionado, c) / sobra) : 0
}

/** Semáforo do produto: vermelho abaixo do mínimo, amarelo abaixo da meta. */
export function semaforoProduto(m: number | null, c: ConfigLoja): Semaforo | null {
  if (m == null) return null
  return m < c.minimo ? 'VERMELHO' : m < c.meta ? 'AMARELO' : 'VERDE'
}
/** Semáforo de pacote ou promoção: amarelo abaixo da zona de atenção. */
export function semaforoPacote(m: number | null, c: ConfigLoja): Semaforo | null {
  if (m == null) return null
  return m < c.minimo ? 'VERMELHO' : m < c.atencao ? 'AMARELO' : 'VERDE'
}

export function situacao(m: number | null, c: ConfigLoja): Situacao {
  if (m == null) return 'SEM_DADOS'
  return m < c.minimo ? 'CRITICO' : m < c.meta ? 'ABAIXO_DA_META' : 'NA_META'
}

const GRAMATURAS = [
  { rotulo: '100 g', fator: 0.1, emb: 'emb100' },
  { rotulo: '250 g', fator: 0.25, emb: 'emb250' },
  { rotulo: '500 g', fator: 0.5, emb: 'emb500' },
  { rotulo: '1 kg', fator: 1, emb: 'emb1kg' },
] as const

const r2 = (v: number) => Math.round(v * 100) / 100

/** Preços proporcionais por gramatura e a margem real de cada pacote. */
export function gramaturas(custoKg: number | null, precoKg: number | null, c: ConfigLoja) {
  if (!valido(precoKg)) return []
  return GRAMATURAS.map(g => {
    const preco = r2(precoKg * g.fator)
    const embalagem = c[g.emb] + c.etiquetaExtra
    const custo = valido(custoKg) ? (custoKg * g.fator) / (1 - c.perda) : null
    const m = custo == null ? null : margem(preco, custo + embalagem, c)
    return { rotulo: g.rotulo, preco, embalagem, custo, margem: m, semaforo: semaforoPacote(m, c) }
  })
}

const PROMOCOES = [
  { nome: 'Sem desconto', fator: 1, obs: 'Venda normal' },
  { nome: 'Desconto de 10%', fator: 0.9, obs: 'Redução no preço' },
  { nome: 'Leve 4 pague 3', fator: 0.75, obs: '25% de desconto efetivo, antes de frete' },
  { nome: 'Desconto de 10% + cashback', fator: 0.9, obs: 'Cashback só no site; o custo depende do resgate' },
]

/** Margem que sobra em cada promoção, pelo preço líquido equivalente por kg ou unidade. */
export function promocoes(e: EntradaPreco, c: ConfigLoja) {
  if (!valido(e.custo) || !valido(e.preco)) return []
  const custo = custoBase(e.custo, e.fracionado, c)
  return PROMOCOES.map(p => {
    const precoLiquido = e.preco! * p.fator
    const m = margem(precoLiquido, custo, c)
    return { nome: p.nome, obs: p.obs, precoLiquido, custo, margem: m, semaforo: semaforoPacote(m, c) }
  })
}

/** Tudo o que a análise de preços precisa de um produto. */
export function analisar(e: EntradaPreco, c: ConfigLoja) {
  const ideal = precoIdeal(e.custo, e.fracionado, c)
  const m = valido(e.custo) ? margem(e.preco, custoBase(e.custo, e.fracionado, c), c) : null
  const descMax = descontoMaximo(e.custo, e.preco, e.fracionado, c)
  return {
    precoIdeal: ideal,
    margem: m,
    semaforo: semaforoProduto(m, c),
    situacao: situacao(m, c),
    descontoMaximo: descMax,
    descontoMaximoReais: descMax != null && valido(e.preco) ? r2(e.preco * descMax) : null,
    ajusteParaMeta: ideal != null && valido(e.preco) ? ideal - e.preco : null,
  }
}

/** Curva ABC por faturamento: A concentra ~80%, B os ~15% seguintes, C o resto; sem venda = NOVO. */
export function curvaAbc(receitas: { sku: string; receita: number }[]): Map<string, 'A' | 'B' | 'C' | 'NOVO'> {
  const mapa = new Map<string, 'A' | 'B' | 'C' | 'NOVO'>()
  const comVenda = receitas.filter(r => r.receita > 0).sort((a, b) => b.receita - a.receita)
  const total = comVenda.reduce((s, r) => s + r.receita, 0)
  let acumulado = 0
  for (const r of comVenda) {
    // classifica pelo acumulado ANTES do item: o produto que cruza os 80% ainda é A
    const antes = total > 0 ? acumulado / total : 1
    mapa.set(r.sku, antes < 0.8 ? 'A' : antes < 0.95 ? 'B' : 'C')
    acumulado += r.receita
  }
  for (const r of receitas) if (!mapa.has(r.sku)) mapa.set(r.sku, 'NOVO')
  return mapa
}
