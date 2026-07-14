import { round2, calcFreteFullML } from './calculos'

export interface CanalConfig {
  emb: number
  com: number
  out: number
  fix: number
  frete: number
  margem: number
}

export interface CanalDef {
  key: string
  nome: string
  tag: string
  cor: string
  corTexto: string
  freteEspecial?: 'full'
  autoBand?: boolean
  default: CanalConfig
}

export const CANAIS_MULTICANAL: CanalDef[] = [
  { key: 'lp', nome: 'Loja Própria', tag: 'seu e-commerce', cor: '#055E2B', corTexto: '#fff',
    default: { emb: 1.50, com: 0, out: 4.99, fix: 0, frete: 0, margem: 25 } },
  { key: 'mlFull', nome: 'Mercado Livre', tag: 'FULL', cor: '#FFE600', corTexto: '#2D3277', freteEspecial: 'full',
    default: { emb: 0, com: 14, out: 0, fix: 0.60, frete: 0, margem: 20 } },
  { key: 'mlClassico', nome: 'Mercado Livre', tag: 'clássico', cor: '#FFE600', corTexto: '#2D3277',
    default: { emb: 1.50, com: 14, out: 0, fix: 6.25, frete: 12, margem: 20 } },
  { key: 'sh', nome: 'Shopee', tag: 'faixa automática', cor: '#EE4D2D', corTexto: '#fff', autoBand: true,
    default: { emb: 1.50, com: 20, out: 0, fix: 4, frete: 12, margem: 20 } },
  { key: 'tt', nome: 'TikTok Shop', tag: '6% + frete grátis', cor: '#111111', corTexto: '#fff',
    default: { emb: 1.50, com: 6, out: 6, fix: 4, frete: 12, margem: 20 } },
]

export function shopeeBand(preco: number): { com: number; fix: number } {
  if (preco <= 79.99) return { com: 20, fix: 4 }
  if (preco <= 99.99) return { com: 14, fix: 16 }
  if (preco <= 199.99) return { com: 14, fix: 20 }
  return { com: 14, fix: 26 }
}

export interface ResultadoCanal {
  preco: number
  custoBase: number
  comR: number
  outR: number
  despVarR: number
  despFixR: number
  fix: number
  frete: number
  lucro: number
  margem: number
  markup: number
  precoMinimo: number
  comEfetivo: number
  fixEfetivo: number
}

function montarResultado(
  preco: number, custoProduto: number, despVarPct: number, despFixPct: number,
  canal: CanalConfig, comEfetivo: number, fixEfetivo: number, freteEfetivo: number,
): ResultadoCanal {
  const custoBase = custoProduto + canal.emb
  const dv = (despVarPct + comEfetivo + canal.out) / 100
  const df = despFixPct / 100
  const comR = comEfetivo / 100 * preco
  const outR = canal.out / 100 * preco
  const despVarR = despVarPct / 100 * preco
  const despFixR = df * preco
  const lucro = round2(preco - custoBase - fixEfetivo - freteEfetivo - dv * preco - despFixR)
  const denomMin = 1 - dv - df
  const precoMinimo = denomMin > 0 ? round2((custoBase + fixEfetivo + freteEfetivo) / denomMin) : 0
  return {
    preco: round2(preco), custoBase: round2(custoBase),
    comR: round2(comR), outR: round2(outR), despVarR: round2(despVarR), despFixR: round2(despFixR),
    fix: round2(fixEfetivo), frete: round2(freteEfetivo),
    lucro, margem: preco > 0 ? lucro / preco : 0,
    markup: custoBase > 0 ? preco / custoBase : 0,
    precoMinimo, comEfetivo, fixEfetivo,
  }
}

function calcularPrecoSimples(
  custoProduto: number, despVarPct: number, despFixPct: number, canal: CanalConfig,
  com: number, out: number, fix: number, frete: number, margemPct: number,
): number | null {
  const custoBase = custoProduto + canal.emb
  const dv = (despVarPct + com + out) / 100
  const df = despFixPct / 100
  const lu = margemPct / 100
  const den = 1 - dv - df - lu
  if (den <= 0) return null
  return (custoBase + fix + frete) / den
}

export function calcularCanalModoPreco(params: {
  custoProduto: number
  despVarPct: number
  despFixPct: number
  pesoGramas: number | null
  canal: CanalConfig
  def: CanalDef
  shAuto: boolean
}): ResultadoCanal | null {
  const { custoProduto, despVarPct, despFixPct, pesoGramas, canal, def, shAuto } = params

  if (def.freteEspecial === 'full') {
    if (!pesoGramas) return null
    const pesoKg = pesoGramas / 1000
    const semFrete = calcularPrecoSimples(custoProduto, despVarPct, despFixPct, canal, canal.com, canal.out, canal.fix, 0, canal.margem)
    if (semFrete === null) return null
    const frete1 = calcFreteFullML(pesoKg, semFrete)
    const comFrete = calcularPrecoSimples(custoProduto, despVarPct, despFixPct, canal, canal.com, canal.out, canal.fix, frete1, canal.margem)
    if (comFrete === null) return null
    const freteFinal = calcFreteFullML(pesoKg, comFrete)
    const precoFinal = calcularPrecoSimples(custoProduto, despVarPct, despFixPct, canal, canal.com, canal.out, canal.fix, freteFinal, canal.margem)
    if (precoFinal === null) return null
    return montarResultado(precoFinal, custoProduto, despVarPct, despFixPct, canal, canal.com, canal.fix, freteFinal)
  }

  if (def.autoBand && shAuto) {
    const bandas = [{ min: 0, max: 79.99 }, { min: 80, max: 99.99 }, { min: 100, max: 199.99 }, { min: 200, max: Infinity }]
    let melhor: { preco: number; com: number; fix: number } | null = null
    let menorDist = Infinity
    for (const b of bandas) {
      const banda = shopeeBand(b.min === 0 ? 50 : b.min)
      const p = calcularPrecoSimples(custoProduto, despVarPct, despFixPct, canal, banda.com, canal.out, banda.fix, canal.frete, canal.margem)
      if (p === null) continue
      if (p >= b.min && p <= b.max) return montarResultado(p, custoProduto, despVarPct, despFixPct, canal, banda.com, banda.fix, canal.frete)
      const dist = p < b.min ? b.min - p : p - b.max
      if (dist < menorDist) {
        menorDist = dist
        melhor = { preco: Math.min(Math.max(p, b.min), b.max === Infinity ? p : b.max), com: banda.com, fix: banda.fix }
      }
    }
    return melhor ? montarResultado(melhor.preco, custoProduto, despVarPct, despFixPct, canal, melhor.com, melhor.fix, canal.frete) : null
  }

  const p = calcularPrecoSimples(custoProduto, despVarPct, despFixPct, canal, canal.com, canal.out, canal.fix, canal.frete, canal.margem)
  return p === null ? null : montarResultado(p, custoProduto, despVarPct, despFixPct, canal, canal.com, canal.fix, canal.frete)
}

export function calcularCanalModoAnalise(params: {
  custoProduto: number
  despVarPct: number
  despFixPct: number
  pesoGramas: number | null
  precoTeste: number
  canal: CanalConfig
  def: CanalDef
  shAuto: boolean
}): ResultadoCanal | null {
  const { custoProduto, despVarPct, despFixPct, pesoGramas, precoTeste, canal, def, shAuto } = params
  if (!precoTeste || precoTeste <= 0) return null

  let com = canal.com, fix = canal.fix, frete = canal.frete

  if (def.freteEspecial === 'full') {
    if (!pesoGramas) return null
    frete = calcFreteFullML(pesoGramas / 1000, precoTeste)
  }
  if (def.autoBand && shAuto) {
    const banda = shopeeBand(precoTeste)
    com = banda.com; fix = banda.fix
  }

  return montarResultado(precoTeste, custoProduto, despVarPct, despFixPct, canal, com, fix, frete)
}
