import { test } from 'node:test'
import assert from 'node:assert'
import { CONFIG_LOJA_PADRAO as C, analisar, gramaturas, promocoes, curvaAbc, precoIdeal } from './precificacaoLoja'

const perto = (a: number | null, b: number, tol = 0.0006) => assert.ok(a != null && Math.abs(a - b) <= tol, `${a} ≠ ${b}`)

// Os números abaixo são os da planilha PRECIFICAÇÃO_RDB_FINAL, aba PRECIFICAR,
// para o SKU 349 (Pimenta do Reino Preta em Pó): custo R$ 18,00/kg, preço R$ 33,00/kg.
const pimenta = { custo: 18, preco: 33, fracionado: true }

test('produto fracionado bate com a planilha: preço ideal, margem, desconto máximo', () => {
  const a = analisar(pimenta, C)
  perto(a.precoIdeal, 32.75, 0.01)
  perto(a.margem, 0.304)
  perto(a.descontoMaximo, 0.175)
  perto(a.descontoMaximoReais, 5.78, 0.01)
  assert.equal(a.semaforo, 'VERDE')
  assert.equal(a.situacao, 'NA_META')
})

test('gramaturas: preço proporcional e margem de cada pacote como na planilha', () => {
  const g = gramaturas(18, 33, C)
  assert.deepEqual(g.map(x => x.preco), [3.3, 8.25, 16.5, 33])
  assert.deepEqual(g.map(x => x.embalagem), [0.5, 0.66, 0.9, 1.15])
  perto(g[0].custo, 1.82, 0.005)
  perto(g[0].margem, 0.188); perto(g[1].margem, 0.259); perto(g[2].margem, 0.285); perto(g[3].margem, 0.304)
  assert.deepEqual(g.map(x => x.semaforo), ['AMARELO', 'VERDE', 'VERDE', 'VERDE'])
})

test('promoções: margem após desconto como na planilha', () => {
  const p = promocoes(pimenta, C)
  perto(p[0].custo, 19.33, 0.005)
  perto(p[0].margem, 0.304); assert.equal(p[0].semaforo, 'VERDE')
  perto(p[1].precoLiquido, 29.7, 0.001); perto(p[1].margem, 0.239); assert.equal(p[1].semaforo, 'AMARELO')
  perto(p[2].precoLiquido, 24.75, 0.001); perto(p[2].margem, 0.109); assert.equal(p[2].semaforo, 'VERMELHO')
})

test('casos da aba ANÁLISE DE PREÇOS: crítico com margem baixa e preço sugerido', () => {
  // Farinha de Amêndoas: custo 72,75, preço 86,00 → margem 2,2%, sugerido 126,45
  const a = analisar({ custo: 72.75, preco: 86, fracionado: true }, C)
  perto(a.margem, 0.022, 0.001)
  perto(a.precoIdeal, 126.45, 0.02)
  perto(a.ajusteParaMeta, 40.45, 0.02)
  assert.equal(a.descontoMaximo, 0)
  assert.equal(a.situacao, 'CRITICO')
})

test('produto por unidade não soma embalagem', () => {
  const ideal = precoIdeal(10, false, C)
  perto(ideal, 10 / 0.99 / (1 - 0.087 - 0.30 - 0.0228), 0.0001)
  assert.equal(gramaturas(null, null, C).length, 0)
})

test('sem custo ou sem preço: sem dados, sem inventar número', () => {
  assert.equal(analisar({ custo: null, preco: 33, fracionado: true }, C).situacao, 'SEM_DADOS')
  const semPreco = analisar({ custo: 18, preco: null, fracionado: true }, C)
  assert.equal(semPreco.situacao, 'SEM_DADOS')
  assert.equal(semPreco.margem, null)
  perto(semPreco.precoIdeal, 32.75, 0.01)
  assert.equal(promocoes({ custo: 18, preco: 0, fracionado: true }, C).length, 0)
})

test('abaixo da meta mas acima do mínimo é amarelo', () => {
  const a = analisar({ custo: 18, preco: 29, fracionado: true }, C)
  assert.equal(a.situacao, 'ABAIXO_DA_META')
  assert.equal(a.semaforo, 'AMARELO')
})

test('curva ABC: A até ~80% do faturamento, B até ~95%, C o resto, sem venda é NOVO', () => {
  const m = curvaAbc([
    { sku: 'a', receita: 700 }, { sku: 'b', receita: 150 }, { sku: 'c', receita: 100 },
    { sku: 'd', receita: 40 }, { sku: 'e', receita: 10 }, { sku: 'f', receita: 0 },
  ])
  assert.equal(m.get('a'), 'A'); assert.equal(m.get('b'), 'A') // 70% acumulado antes de b
  assert.equal(m.get('c'), 'B'); assert.equal(m.get('d'), 'C'); assert.equal(m.get('e'), 'C')
  assert.equal(m.get('f'), 'NOVO')
})
