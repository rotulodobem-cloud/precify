import { test } from 'node:test'
import assert from 'node:assert'
import { serieMensalDeGastos, aparaMesesVazios, distribuirMargens, curvaABC, type CompraAgregavel } from './agregacoes'

function compra(data: string, sku: string, fornecedor: string, custoTotal: number, custoUnitario: number): CompraAgregavel {
  return { dataCompra: new Date(data), skuPrincipal: sku, nomeProduto: `Produto ${sku}`, fornecedor, custoTotal, custoUnitario }
}

test('serieMensalDeGastos devolve os N meses pedidos, do mais antigo ao mais recente', () => {
  const serie = serieMensalDeGastos([], 3, new Date('2026-07-15T12:00:00'))
  assert.deepEqual(serie.map(p => p.mes), ['2026-05', '2026-06', '2026-07'])
})

test('serieMensalDeGastos soma o gasto no mes certo e conta as compras', () => {
  const compras = [
    compra('2026-06-10T12:00:00', '242', 'VALLE', 100, 10),
    compra('2026-06-20T12:00:00', '242', 'VALLE', 50, 10),
    compra('2026-07-01T12:00:00', '242', 'VALLE', 30, 10),
  ]
  const serie = serieMensalDeGastos(compras, 3, new Date('2026-07-15T12:00:00'))
  assert.deepEqual(serie, [
    { mes: '2026-05', total: 0, compras: 0 },
    { mes: '2026-06', total: 150, compras: 2 },
    { mes: '2026-07', total: 30, compras: 1 },
  ])
})

test('serieMensalDeGastos ignora compras fora da janela', () => {
  const compras = [compra('2026-01-10T12:00:00', '242', 'VALLE', 999, 10)]
  const serie = serieMensalDeGastos(compras, 3, new Date('2026-07-15T12:00:00'))
  assert.equal(serie.reduce((s, p) => s + p.total, 0), 0)
})

test('serieMensalDeGastos atravessa a virada de ano', () => {
  const serie = serieMensalDeGastos([], 3, new Date('2026-01-15T12:00:00'))
  assert.deepEqual(serie.map(p => p.mes), ['2025-11', '2025-12', '2026-01'])
})

test('aparaMesesVazios corta so o prefixo sem compras', () => {
  const serie = [
    { mes: '2026-01', total: 0, compras: 0 },
    { mes: '2026-02', total: 0, compras: 0 },
    { mes: '2026-03', total: 100, compras: 2 },
    { mes: '2026-04', total: 0, compras: 0 },   // buraco no meio: preservado
    { mes: '2026-05', total: 50, compras: 1 },
  ]
  assert.deepEqual(aparaMesesVazios(serie).map(p => p.mes), ['2026-03', '2026-04', '2026-05'])
})

test('aparaMesesVazios devolve a serie intacta quando nao ha prefixo vazio', () => {
  const serie = [{ mes: '2026-03', total: 100, compras: 2 }]
  assert.deepEqual(aparaMesesVazios(serie), serie)
})

test('aparaMesesVazios devolve a serie inteira quando nenhum mes tem compra', () => {
  const serie = [{ mes: '2026-03', total: 0, compras: 0 }, { mes: '2026-04', total: 0, compras: 0 }]
  assert.deepEqual(aparaMesesVazios(serie), serie)
})

test('distribuirMargens classifica pelos mesmos cortes de statusMargem', () => {
  // 0.30 saudavel, 0.25 saudavel (limite), 0.22 atencao, 0.20 atencao (limite), 0.10 prejuizo
  const d = distribuirMargens([0.30, 0.25, 0.22, 0.20, 0.10])
  assert.deepEqual(d, { saudavel: 2, atencao: 2, prejuizo: 1, total: 5 })
})

test('distribuirMargens com lista vazia devolve zeros', () => {
  assert.deepEqual(distribuirMargens([]), { saudavel: 0, atencao: 0, prejuizo: 0, total: 0 })
})

test('curvaABC classifica A ate 80% do gasto acumulado', () => {
  const compras = [
    compra('2026-07-01T12:00:00', 'A1', 'VALLE', 800, 8),
    compra('2026-07-01T12:00:00', 'B1', 'VALLE', 150, 15),
    compra('2026-07-01T12:00:00', 'C1', 'VALLE', 50, 5),
  ]
  const curva = curvaABC(compras)
  assert.deepEqual(curva.map(i => [i.sku, i.curva]), [['A1', 'A'], ['B1', 'B'], ['C1', 'C']])
})

test('curvaABC aponta o fornecedor mais barato pelo custo unitario medio', () => {
  const compras = [
    compra('2026-05-01T12:00:00', '242', 'VALLE', 100, 10),
    compra('2026-06-01T12:00:00', '242', 'BRASBOL', 100, 7),
    compra('2026-07-01T12:00:00', '242', 'VALLE', 100, 12),
  ]
  const [item] = curvaABC(compras)
  assert.equal(item.melhorFornecedor?.nome, 'BRASBOL')
  assert.equal(item.melhorFornecedor?.custoUnitario, 7)
  assert.equal(item.fornecedorPrincipal, 'VALLE') // maior gasto, nao menor preco
  assert.deepEqual(item.outrosFornecedores, ['BRASBOL'])
})

test('curvaABC monta o historico de custo em ordem cronologica', () => {
  const compras = [
    compra('2026-07-01T12:00:00', '242', 'VALLE', 100, 12),
    compra('2026-05-01T12:00:00', '242', 'VALLE', 100, 10),
    compra('2026-06-01T12:00:00', '242', 'VALLE', 100, 11),
  ]
  const [item] = curvaABC(compras)
  assert.deepEqual(item.historicoCusto, [10, 11, 12])
  assert.equal(item.custoAtual, 12)
})

test('curvaABC limita o historico aos 12 pontos mais recentes', () => {
  const compras = Array.from({ length: 15 }, (_, i) =>
    compra(`2026-07-${String(i + 1).padStart(2, '0')}T12:00:00`, '242', 'VALLE', 10, i + 1))
  const [item] = curvaABC(compras)
  assert.equal(item.historicoCusto.length, 12)
  assert.deepEqual(item.historicoCusto, [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
})

test('curvaABC com lista vazia devolve lista vazia', () => {
  assert.deepEqual(curvaABC([]), [])
})

test('curvaABC desempata fornecedores de gasto igual pelo nome, nao pela ordem de entrada', () => {
  const gastoIgual = (ordem: 'ab' | 'ba') => {
    const va = compra('2026-07-01T12:00:00', '242', 'VALLE', 76, 10)
    const li = compra('2026-07-02T12:00:00', '242', 'LIBANES', 76, 10)
    return curvaABC(ordem === 'ab' ? [va, li] : [li, va])[0]
  }
  assert.equal(gastoIgual('ab').fornecedorPrincipal, 'LIBANES')
  assert.equal(gastoIgual('ba').fornecedorPrincipal, 'LIBANES')
})
