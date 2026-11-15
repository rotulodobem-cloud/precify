// Parâmetros da precificação de loja e site, guardados na tabela Configuracao
// (uma linha por parâmetro, chave "precificar_<nome>"). Só roda no servidor.
import db from '@/lib/db'
import { CONFIG_LOJA_PADRAO, type ConfigLoja } from '@/lib/precificacaoLoja'

const PREFIXO = 'precificar_'
const CHAVES = Object.keys(CONFIG_LOJA_PADRAO) as (keyof ConfigLoja)[]

export async function lerConfigLoja(): Promise<ConfigLoja> {
  const linhas = await db.configuracao.findMany({ where: { chave: { startsWith: PREFIXO } } })
  const cfg = { ...CONFIG_LOJA_PADRAO }
  for (const l of linhas) {
    const chave = l.chave.slice(PREFIXO.length) as keyof ConfigLoja
    const v = parseFloat(l.valor)
    if (CHAVES.includes(chave) && Number.isFinite(v)) cfg[chave] = v
  }
  return cfg
}

export async function salvarConfigLoja(novo: Partial<Record<keyof ConfigLoja, unknown>>): Promise<ConfigLoja> {
  for (const chave of CHAVES) {
    if (!(chave in novo)) continue
    const v = Number(novo[chave])
    // percentuais ficam entre 0 e 90%; valores em reais não podem ser negativos
    const ehPct = !chave.startsWith('emb') && chave !== 'etiquetaExtra'
    if (!Number.isFinite(v) || v < 0 || (ehPct && v > 0.9)) throw new Error(`Valor inválido para ${chave}`)
    await db.configuracao.upsert({
      where: { chave: PREFIXO + chave },
      update: { valor: String(v) },
      create: { chave: PREFIXO + chave, valor: String(v), descricao: 'Precificação loja e site' },
    })
  }
  return lerConfigLoja()
}
