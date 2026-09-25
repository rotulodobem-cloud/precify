import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularEconomia } from './economia'
import { diagnosticar, CONFIG_PADRAO } from './motor'
import type { AnuncioEntrada } from './tipos'

const HOJE = new Date('2026-09-25T12:00:00Z')

function anuncio(p: Partial<AnuncioEntrada> = {}): AnuncioEntrada {
  return {
    canal: 'mercado_livre', codigoAnuncio: 'MLB1', sku: 'SKU1', titulo: 'Produto', campanha: 'Camp', categoria: null,
    status: 'Ativo', impressoes: 100_000, cliques: 1_000, investimento: 1_000, receitaAds: 6_000,
    vendasDiretas: 60, vendasIndiretas: 0, receitaTotal: 10_000, unidades: 100, custoUnitario: 40,
    impostoPct: 0.08, comissaoPct: 0.14, taxaFixaUnit: 0, freteEmpresa: 0, roasObjetivo: null,
    estoque: 500, perdeuBuyBox: false, ultimaAlteracaoEm: null, tipoUltimaAlteracao: null, jaTentouAjustar: false,
    ...p,
  }
}
const rodar = (p: Partial<AnuncioEntrada> = {}) => {
  const a = anuncio(p)
  const e = calcularEconomia(a)
  return { e, d: diagnosticar(a, e, CONFIG_PADRAO, HOJE) }
}

test('economia: margens, equilíbrio e métricas de mídia', () => {
  const { e } = rodar()
  // 10.000 − 4.000 custo − 800 imposto − 1.400 comissão = 3.800 (38%)
  assert.equal(e.margemPreAds, 3_800)
  assert.equal(e.margemPreAdsPct, 0.38)
  assert.equal(e.margemPosAds, 2_800)
  assert.equal(e.acosEquilibrio, 0.38)
  assert.ok(Math.abs(e.roasEquilibrio! - 1 / 0.38) < 1e-9)
  assert.equal(e.roas, 6)
  assert.equal(e.tacos, 0.1)
  assert.equal(e.margemParcial, false)
})

test('economia: custo não cadastrado nunca vira custo zero', () => {
  const { e, d } = rodar({ custoUnitario: null })
  assert.equal(e.margemPreAds, null)
  assert.equal(e.margemPosAds, null)
  assert.equal(d.estado, 'OBSERVAR')
  assert.match(d.situacao, /Custo não cadastrado/)
})

test('economia: frete indisponível marca margem parcial', () => {
  assert.equal(rodar({ freteEmpresa: null }).e.margemParcial, true)
})

test('motor: amostra pequena → OBSERVAR com dados insuficientes', () => {
  const { d } = rodar({ cliques: 10, investimento: 5 })
  assert.equal(d.estado, 'OBSERVAR')
  assert.match(d.situacao, /Dados insuficientes/)
})

test('motor: alteração recente trava qualquer mudança', () => {
  const { d } = rodar({ custoUnitario: 70, ultimaAlteracaoEm: '2026-09-22', tipoUltimaAlteracao: 'orçamento' })
  assert.equal(d.estado, 'OBSERVAR')
  assert.equal(d.proximaReavaliacao, '2026-09-29')
})

test('motor: margem após ads negativa → REDUZIR com gravidade por valor', () => {
  // margem antes = 10.000 − 7.000 − 800 − 1.400 = 800; após ads = −200
  const { d, e } = rodar({ custoUnitario: 70 })
  assert.equal(e.margemPosAds, -200)
  assert.equal(d.estado, 'REDUZIR')
  assert.equal(d.gravidade, 'IMPORTANTE')
  assert.ok(d.impacto < 0)
  assert.ok(d.evidencias.some(x => x.startsWith('ACOS atual')))
})

test('motor: perder R$ 8 e perder R$ 800 não têm o mesmo peso', () => {
  const pequeno = rodar({ custoUnitario: 77.2, investimento: 88, receitaAds: 400 }).d
  assert.equal(pequeno.estado, 'REDUZIR')
  assert.equal(pequeno.gravidade, 'INFORMATIVO')
  const grande = rodar({ custoUnitario: 70, investimento: 1_600 }).d
  assert.notEqual(pequeno.gravidade, grande.gravidade)
  assert.equal(grande.gravidade, 'CRITICO')
})

test('motor: PAUSAR só depois de já ter tentado ajustar', () => {
  assert.equal(rodar({ custoUnitario: 70 }).d.estado, 'REDUZIR')
  assert.equal(rodar({ custoUnitario: 70, jaTentouAjustar: true }).d.estado, 'PAUSAR')
})

test('motor: cliques sem venda → OTIMIZAR (conversão) antes de pausar', () => {
  const { d } = rodar({ vendasDiretas: 0, receitaAds: 0, receitaTotal: 0, unidades: 0 })
  assert.equal(d.estado, 'OTIMIZAR')
  assert.equal(d.componente, 'preço/frete/avaliações')
})

test('motor: buy box perdido → OTIMIZAR competitividade', () => {
  const { d } = rodar({ perdeuBuyBox: true })
  assert.equal(d.estado, 'OTIMIZAR')
  assert.equal(d.componente, 'competitividade')
})

test('motor: CTR baixo → OTIMIZAR imagem/título', () => {
  const { d } = rodar({ impressoes: 1_000_000 })
  assert.equal(d.estado, 'OTIMIZAR')
  assert.equal(d.componente, 'imagem/título')
})

test('motor: margem boa, ROAS com folga e volume → ESCALAR', () => {
  const { d } = rodar()
  assert.equal(d.estado, 'ESCALAR')
  assert.ok(d.impacto > 0)
})

test('motor: estoque baixo nunca ESCALAR', () => {
  const { d } = rodar({ estoque: 5 })
  assert.equal(d.estado, 'MANTER')
  assert.ok(d.travas.some(t => t.includes('Estoque')))
})

test('motor: ROAS abaixo da meta mas acima do equilíbrio com margem apertada → OBSERVAR', () => {
  // margem antes 30% (custo 48): após ads = 3.000 − 1.000 = 2.000? usa investimento maior p/ apertar
  const { d, e } = rodar({ custoUnitario: 48, investimento: 2_400, receitaAds: 8_000, roasObjetivo: 6 })
  assert.ok(e.margemPosAdsPct! > 0 && e.margemPosAdsPct! < CONFIG_PADRAO.margemSaudavelPct)
  assert.equal(d.estado, 'OBSERVAR')
})

test('motor: queda forte de conversão vs. período anterior → OBSERVAR', () => {
  const { d } = rodar({ anterior: { cliques: 1_000, investimento: 1_000, vendasDiretas: 120, vendasIndiretas: 0 } })
  assert.equal(d.estado, 'OBSERVAR')
  assert.match(d.situacao, /conversão caiu/)
})

test('motor: ROAS alto não garante lucro', () => {
  // ROAS 8, mas custo altíssimo → margem negativa
  const { d, e } = rodar({ receitaAds: 8_000, custoUnitario: 78 })
  assert.equal(e.roas, 8)
  assert.ok(e.margemPosAds! < 0)
  assert.equal(d.estado, 'REDUZIR')
})
