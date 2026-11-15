// Parâmetros da precificação de marketplaces, guardados como JSON em uma linha
// da tabela Configuracao (chave "mkt_config"). Só roda no servidor.
import db from '@/lib/db'
import { CONFIG_MKT_PADRAO, CAMPOS_CONFIG_MKT, gravarCampo, type ConfigMkt } from '@/lib/precificacaoMkt'

const CHAVE = 'mkt_config'
const CAMPOS = CAMPOS_CONFIG_MKT.flatMap(g => g.campos)

/** Aplica sobre o padrão só os campos conhecidos e válidos de `origem`. */
function mesclar(base: ConfigMkt, origem: unknown, estrito: boolean): ConfigMkt {
  let cfg = base
  for (const campo of CAMPOS) {
    const [a, b] = campo.caminho.split('.')
    const bruto = b ? (origem as Record<string, Record<string, unknown>>)?.[a]?.[b] : (origem as Record<string, unknown>)?.[a]
    if (bruto === undefined) continue
    const v = Number(bruto)
    const invalido = !Number.isFinite(v) || v < 0 || (campo.tipo === 'pct' && v > 2) || (campo.tipo === 'num' && (v <= 0 || v > 5))
    if (invalido) { if (estrito) throw new Error(`Valor inválido para "${campo.rotulo}"`); continue }
    cfg = gravarCampo(cfg, campo.caminho, v)
  }
  return cfg
}

export async function lerConfigMkt(): Promise<ConfigMkt> {
  const linha = await db.configuracao.findUnique({ where: { chave: CHAVE } })
  if (!linha) return CONFIG_MKT_PADRAO
  try { return mesclar(CONFIG_MKT_PADRAO, JSON.parse(linha.valor), false) } catch { return CONFIG_MKT_PADRAO }
}

export async function salvarConfigMkt(novo: unknown): Promise<ConfigMkt> {
  const cfg = mesclar(await lerConfigMkt(), novo, true)
  if (cfg.piso > cfg.meta) throw new Error('O piso de margem não pode ser maior que a meta.')
  const valor = JSON.stringify(cfg)
  await db.configuracao.upsert({
    where: { chave: CHAVE },
    update: { valor },
    create: { chave: CHAVE, valor, descricao: 'Precificação de marketplaces' },
  })
  return cfg
}
