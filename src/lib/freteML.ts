// ══════════════════════════════════════════════════════════════
//  Tabela de Frete Mercado Livre FULL
//  Fonte: planilha Custos_FULL.xlsx
// ══════════════════════════════════════════════════════════════

// Faixas de preço de venda (colunas da tabela)
export const FAIXAS_PRECO = [
  { label: 'R$0–18,99',    min: 0,   max: 18.99  },
  { label: 'R$19–28,99',   min: 19,  max: 28.99  },
  { label: 'R$29–48,99',   min: 29,  max: 48.99  },
  { label: 'R$49–78,99',   min: 49,  max: 78.99  },
  { label: 'R$79–98,99',   min: 79,  max: 98.99  },
  { label: 'R$99–198,99',  min: 99,  max: 198.99 },
  { label: 'R$199+',       min: 199, max: Infinity },
]

// Faixas de peso (linhas da tabela)
// [pesoMaxKg, [frete por faixa de preço]]
export const TABELA_FRETE_FULL: [number, number[]][] = [
  [0.3,  [1.25, 1.50, 2.00, 3.00, 4.00,  6.00,  20.95]],
  [0.5,  [1.25, 1.50, 2.00, 3.00, 4.00,  6.00,  22.55]],
  [1.0,  [1.25, 1.50, 2.00, 3.00, 4.00,  6.00,  23.65]],
  [2.0,  [1.75, 2.00, 2.50, 3.50, 4.50,  6.50,  24.65]],
  [3.0,  [2.00, 2.50, 3.00, 4.00, 5.00,  7.00,  26.25]],
  [4.0,  [2.00, 2.50, 3.00, 4.00, 5.00,  7.00,  28.35]],
  [5.0,  [2.50, 3.50, 4.00, 5.00, 6.00,  7.50,  30.75]],
  [6.0,  [2.50, 3.50, 4.00, 5.00, 6.00,  7.50,  39.75]],
  [7.0,  [4.00, 5.00, 5.50, 6.50, 7.00,  7.50,  44.05]],
  [8.0,  [4.00, 5.00, 5.50, 6.50, 7.00,  7.50,  48.05]],
  [9.0,  [5.00, 6.00, 6.50, 7.00, 7.50,  8.00,  49.35]],
  [11.0, [5.00, 6.00, 6.50, 7.00, 7.50,  8.00,  68.65]],
  [13.0, [5.00, 6.00, 6.50, 7.00, 7.50,  8.00,  70.25]],
  [15.0, [5.00, 6.00, 6.50, 7.00, 7.50,  8.00,  74.95]],
  [20.0, [5.00, 6.00, 6.50, 7.00, 7.50,  8.00,  91.15]],
  [25.0, [5.00, 6.00, 6.50, 7.00, 7.50,  8.00, 105.95]],
  [30.0, [5.00, 6.00, 6.50, 7.00, 7.50,  8.00, 106.95]],
]

export type TipoFreteML = 'full' | 'flex' | 'envios'

// Frete Flex e Envios — fixo por peso (estimativas médias)
// Você pode ajustar conforme sua operação real
export const FRETE_FLEX_ENVIOS: [number, number][] = [
  [0.3,  12.00],
  [0.5,  14.00],
  [1.0,  16.00],
  [2.0,  19.00],
  [3.0,  22.00],
  [5.0,  27.00],
  [10.0, 35.00],
  [20.0, 55.00],
  [30.0, 75.00],
]

/**
 * Calcula o custo de frete FULL dado peso em kg e preço de venda.
 */
export function calcFreteFullML(pesoKg: number, precoVenda: number): number {
  // Encontrar a faixa de preço
  const colIdx = FAIXAS_PRECO.findIndex(f => precoVenda >= f.min && precoVenda <= f.max)
  const col = colIdx === -1 ? FAIXAS_PRECO.length - 1 : colIdx

  // Encontrar a faixa de peso
  const linha = TABELA_FRETE_FULL.find(([maxPeso]) => pesoKg <= maxPeso)
  if (!linha) return TABELA_FRETE_FULL[TABELA_FRETE_FULL.length - 1][1][col]
  return linha[1][col]
}

/**
 * Calcula frete Flex/Envios dado peso em kg.
 */
export function calcFreteFlexML(pesoKg: number): number {
  const linha = FRETE_FLEX_ENVIOS.find(([maxPeso]) => pesoKg <= maxPeso)
  if (!linha) return FRETE_FLEX_ENVIOS[FRETE_FLEX_ENVIOS.length - 1][1]
  return linha[1]
}

/**
 * Retorna o frete ML para qualquer tipo.
 */
export function calcFreteML(tipo: TipoFreteML, pesoKg: number, precoVenda = 0): number {
  if (tipo === 'full') return calcFreteFullML(pesoKg, precoVenda)
  return calcFreteFlexML(pesoKg)
}
