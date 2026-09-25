import type { AnuncioEntrada, Economia } from './tipos'

const div = (a: number, b: number): number | null => (b > 0 ? a / b : null)
/** Valores em reais arredondados ao centavo, para não carregar ruído de ponto flutuante. */
const r2 = (v: number) => Math.round(v * 100) / 100

/**
 * Economia do SKU no período (especificação, seção 5).
 *
 * - Margem antes de ads = receita líquida − custo direto − imposto − comissão − taxa fixa − frete da empresa.
 * - Margem após ads = margem antes de ads − investimento em ads (métrica econômica principal).
 * - ACOS de equilíbrio = margem % antes de ads; ROAS de equilíbrio = 1 / ACOS de equilíbrio.
 *
 * Regras de segurança (seção 5.7):
 * - custo não cadastrado → nunca calcula margem com custo zero (margens ficam null);
 * - frete indisponível → entra como "não incluído" e a margem é marcada como parcial.
 *
 * A mesma conta existe em SQL na view ads_anuncios_margem; este arquivo é a referência
 * testada (economia.test.ts) e é o que a ingestão usa ao rodar o motor.
 */
export function calcularEconomia(a: AnuncioEntrada): Economia {
  const vendas = a.vendasDiretas + a.vendasIndiretas
  const semVendasTotais = a.receitaTotal == null
  // Sem dado de vendas totais, a base cai para a receita atribuída a ads (e a margem fica parcial).
  const receitaLiquida = semVendasTotais ? a.receitaAds : a.receitaTotal!
  const unidades = a.unidades ?? vendas

  const impostoValor = receitaLiquida * a.impostoPct
  const comissaoValor = receitaLiquida * a.comissaoPct
  const taxaFixaValor = unidades * a.taxaFixaUnit
  const custoNaoCadastrado = a.custoUnitario == null
  const custoDireto = custoNaoCadastrado ? null : unidades * a.custoUnitario!

  let margemPreAds: number | null = null
  if (custoDireto != null) {
    margemPreAds = r2(receitaLiquida - custoDireto - impostoValor - comissaoValor - taxaFixaValor - (a.freteEmpresa ?? 0))
  }
  const margemPreAdsPct = margemPreAds != null ? div(margemPreAds, receitaLiquida) : null
  const margemPosAds = margemPreAds != null ? r2(margemPreAds - a.investimento) : null
  const margemPosAdsPct = margemPosAds != null ? div(margemPosAds, receitaLiquida) : null

  const acosEquilibrio = margemPreAdsPct != null && margemPreAdsPct > 0 ? margemPreAdsPct : margemPreAdsPct != null ? 0 : null
  const roasEquilibrio = acosEquilibrio != null && acosEquilibrio > 0 ? 1 / acosEquilibrio : null

  return {
    receitaLiquida,
    custoDireto,
    impostoValor,
    comissaoValor,
    taxaFixaValor,
    freteEmpresaValor: a.freteEmpresa,
    margemPreAds,
    margemPreAdsPct,
    investimento: a.investimento,
    margemPosAds,
    margemPosAdsPct,
    acos: div(a.investimento, a.receitaAds),
    roas: div(a.receitaAds, a.investimento),
    tacos: div(a.investimento, receitaLiquida),
    acosEquilibrio,
    roasEquilibrio,
    ctr: div(a.cliques, a.impressoes),
    cvr: div(vendas, a.cliques),
    cpc: div(a.investimento, a.cliques),
    vendas,
    margemParcial: a.freteEmpresa == null || semVendasTotais,
    custoNaoCadastrado,
  }
}
