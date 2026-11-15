import { test } from 'node:test'
import assert from 'node:assert'
import {
  CONFIG_MKT_PADRAO as C, resultado, precoParaMargem, envioML, taxaFixaShopee,
  precoCadastro, descontoPromocao, lerCampo, gravarCampo,
} from './precificacaoMkt'

const perto = (a: number | null, b: number, tol: number) => assert.ok(a != null && Math.abs(a - b) <= tol, `${a} ≠ ${b}`)

// Exemplo da aba CALCULADORA MKT: custo R$ 16,00, peso 1 kg, preço testado R$ 45,00.
const e = { custo: 16, pesoKg: 1 }

test('Mercado Livre Full Super a R$ 45: linhas e margem como na planilha', () => {
  const r = resultado('ml', 45, e, C)
  const v = Object.fromEntries(r.linhas.map(l => [l.rotulo, l.valor]))
  perto(v['Comissão'], 6.30, 0.005)
  perto(v['Envio (Full Super)'], 3.00, 0.005)
  perto(v['Imposto'], 3.92, 0.006)
  perto(v['Ads'], 4.13, 0.02)
  perto(v['Embalagem e envio ao Full'], 1.50, 0.005)
  perto(r.margem, 10.16, 0.03)
  perto(r.margemPct, 0.226, 0.001)
  assert.equal(r.semaforo, 'AMARELO')
})

test('Shopee a R$ 45: linhas e margem como na planilha', () => {
  const r = resultado('shopee', 45, e, C)
  const v = Object.fromEntries(r.linhas.map(l => [l.rotulo, l.valor]))
  perto(v['Comissão'], 8.37, 0.005)
  perto(v['Taxa fixa por item'], 4.50, 0.005)
  perto(v['Serviço, transação e afiliados'], 3.96, 0.005)
  perto(v['Ads'], 9.12, 0.02)
  perto(v['Embalagem, devolução e frete do pedido'], 3.21, 0.005)
  perto(r.margem, -4.07, 0.03)
  perto(r.margemPct, -0.091, 0.001)
  assert.equal(r.semaforo, 'VERMELHO')
})

test('preço ideal e piso no ML: vale o menor preço coerente com a faixa de envio', () => {
  // planilha: ideal R$ 47,53 e piso R$ 38,58 (diferença de centavos pelo arredondamento do Ads)
  const ideal = precoParaMargem('ml', C.meta, e, C)
  perto(ideal.preco, 47.53, 0.08)
  perto(precoParaMargem('ml', C.piso, e, C).preco, 38.58, 0.08)
  // faixa de R$ 0 a 18,99 pede R$ 45: passa do fim da faixa, não vale
  assert.equal(ideal.faixas[0].valido, null)
  // faixa de R$ 79 em diante pede R$ 53: abaixo do início, vale o início
  assert.equal(ideal.faixas[4].valido, 79)
  // o preço ideal entrega a meta quando aplicado
  perto(resultado('ml', ideal.preco!, e, C).margemPct, C.meta, 0.0005)
})

test('preço ideal e piso na Shopee: a taxa fixa empurra o preço para a faixa de cima', () => {
  // planilha: ideal R$ 242,72 e piso R$ 136,96
  const ideal = precoParaMargem('shopee', C.meta, e, C)
  perto(ideal.preco, 242.72, 0.6)
  perto(precoParaMargem('shopee', C.piso, e, C).preco, 136.96, 0.3)
  perto(resultado('shopee', ideal.preco!, e, C).margemPct, C.meta, 0.0005)
})

test('envio do Full Super: tabela por peso e faixa, com teto de 25% abaixo de R$ 29', () => {
  assert.equal(envioML(45, 1, C), 3.00)
  assert.equal(envioML(45, 0.25, C), 2.40)
  assert.equal(envioML(100, 1, C), 7.80)
  assert.equal(envioML(20, 1, C), 2.40)
  perto(envioML(6, 1, C), 1.50, 0.0001) // 25% de R$ 6 é menor que R$ 1,95
})

test('taxa fixa da Shopee muda por faixa de preço', () => {
  assert.deepEqual([10, 79.99, 80, 150, 200].map(taxaFixaShopee), [4.5, 4.5, 16, 20, 26])
})

test('taxas somando mais de 100% com a margem: não existe preço', () => {
  const r = precoParaMargem('shopee', 0.5, e, C)
  assert.equal(r.preco, null)
})

test('estratégia de cadastro: sobe 30% acima e a promoção de 23,1% volta ao preço de venda', () => {
  perto(precoCadastro(100, C), 130, 0.0001)
  perto(descontoPromocao(C), 0.2308, 0.0001)
  perto(precoCadastro(100, C) * (1 - descontoPromocao(C)), 100, 0.0001)
})

test('comissão e Ads do anúncio substituem o padrão', () => {
  const r = resultado('ml', 45, { ...e, comissaoML: 0.19, adsML: 0 }, C)
  const v = Object.fromEntries(r.linhas.map(l => [l.rotulo, l.valor]))
  perto(v['Comissão'], 8.55, 0.005); assert.equal(v['Ads'], 0)
})

test('ler e gravar parâmetro por caminho não altera o original', () => {
  const novo = gravarCampo(C, 'ml.ads', 0.1)
  assert.equal(lerCampo(novo, 'ml.ads'), 0.1)
  assert.equal(lerCampo(C, 'ml.ads'), 0.092)
  assert.equal(lerCampo(gravarCampo(C, 'meta', 0.2), 'meta'), 0.2)
})
