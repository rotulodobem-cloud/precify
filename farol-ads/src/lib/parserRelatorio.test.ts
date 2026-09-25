import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { numeroBR, parsearArquivo, parsearLinhas } from './parserRelatorio'

test('numeroBR: formatos do relatório', () => {
  assert.equal(numeroBR('R$ 1.234,56'), 1234.56)
  assert.equal(numeroBR('12,5%'), 12.5)
  assert.equal(numeroBR(42), 42)
  assert.equal(numeroBR('-'), 0)
  assert.equal(numeroBR('1234.5'), 1234.5)
})

const RELATORIO = [
  ['Relatório de anúncios patrocinados'],
  ['Período: 26/08/2026 - 24/09/2026'],
  [],
  ['Código do anúncio', 'Título do anúncio', 'Campanha', 'Status', 'Impressões', 'Cliques', 'CPC', 'CTR', 'Investimento (Moeda local)', 'Receita (Moeda local)', 'ACOS', 'ROAS', 'Vendas diretas', 'Vendas indiretas'],
  ['MLB6620253832', 'Cúrcuma com Pimenta Preta 100g', '[R] Snacks - Alto Share - Curva A', 'Ativo', '12.000', '300', 'R$ 0,50', '2,5%', 'R$ 150,00', 'R$ 900,00', '16,7%', '6,00', '20', '4'],
  ['MLB6620253832', 'Cúrcuma com Pimenta Preta 100g', 'Cúrcuma com Pimenta', 'Pausado', '100', '1', 'R$ 0,50', '1%', 'R$ 0,50', 'R$ 0,00', '-', '-', '0', '0'],
  ['MLB-111', 'Psyllium 1kg', '[R] Snacks - Alto Share - Curva A', 'Ativo', 5000, 100, 1, 0.02, 100, 300, 0.33, 3, 5, 1],
  ['MLB-111', 'Psyllium 1kg', '[R] Snacks - Alto Share - Curva A', 'Ativo', 5000, 100, 1, 0.02, 50, 100, 0.5, 2, 1, 0],
  ['Total', '', '', '', 22100, 501, '', '', 300.5, 1300, '', '', 26, 5],
]

test('parser: acha cabeçalho, período e mantém anúncio separado por campanha', () => {
  const r = parsearLinhas(RELATORIO)
  assert.deepEqual(r.periodo, { desde: '2026-08-26', ate: '2026-09-24' })
  assert.equal(r.linhas.length, 3)
  const curcumaSnacks = r.linhas.find(l => l.codigoAnuncio === 'MLB6620253832' && l.campanha.startsWith('[R] Snacks'))!
  assert.equal(curcumaSnacks.impressoes, 12000)
  assert.equal(curcumaSnacks.investimento, 150)
  assert.equal(curcumaSnacks.receita, 900)
  assert.equal(curcumaSnacks.vendasDiretas, 20)
  assert.equal(curcumaSnacks.vendasIndiretas, 4)
  assert.equal(curcumaSnacks.roas, 6)
})

test('parser: soma linhas repetidas e normaliza código MLB', () => {
  const psy = parsearLinhas(RELATORIO).linhas.find(l => l.codigoAnuncio === 'MLB111')!
  assert.equal(psy.investimento, 150)
  assert.equal(psy.receita, 400)
  assert.equal(psy.cliques, 200)
  assert.equal(psy.vendasDiretas, 6)
})

test('parser: lê xlsx de verdade', () => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(RELATORIO), 'Relatório')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  assert.equal(parsearArquivo(buf).linhas.length, 3)
})

test('parser: erro claro quando não é o relatório certo', () => {
  assert.throws(() => parsearLinhas([['a', 'b'], [1, 2]]), /cabeçalho/)
})
