import { test } from 'node:test'
import assert from 'node:assert'
import {
  CONFIG_MKT_PADRAO as C, resultado, precoParaMargem, envioML, taxaFixaShopee,
  precoCadastro, acrescimoCadastro, taxaFixaTiktok, lerCampo, gravarCampo, planoAds,
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

test('estratégia de cadastro: o preço cheio com 30% de desconto chega ao preço de venda', () => {
  perto(precoCadastro(47.56, C), 67.94, 0.005)
  perto(precoCadastro(100, C) * (1 - C.descontoPromocao), 100, 0.0001)
  perto(acrescimoCadastro(C), 0.4286, 0.0001)
})

test('TikTok: comissão e taxa fixa mudam na faixa de R$ 50', () => {
  const baixa = resultado('tiktok', 45, e, C)
  const v = Object.fromEntries(baixa.linhas.map(l => [l.rotulo, l.valor]))
  perto(v['Comissão'], 4.50, 0.005); assert.equal(v['Taxa fixa por item'], 4)
  perto(v['Afiliados e outras taxas'], 2.70, 0.005); assert.equal(v['Ads'], 0)
  // 45 − 16 − 4,50 − 4 − 2,70 − 3,915 − 0 − 1,50
  perto(baixa.margem, 12.385, 0.005)
  const alta = Object.fromEntries(resultado('tiktok', 60, e, C).linhas.map(l => [l.rotulo, l.valor]))
  perto(alta['Comissão'], 3.60, 0.005); assert.equal(alta['Taxa fixa por item'], 6)
  assert.deepEqual([49.99, 50].map(p => taxaFixaTiktok(p, C)), [4, 6])
})

test('TikTok: o preço ideal entrega a meta e respeita a faixa', () => {
  const ideal = precoParaMargem('tiktok', C.meta, e, C)
  // faixa baixa: (16 + 1,50 + 4) / (1 − 0,10 − 0,06 − 0,087 − 0,25) = 42,74, dentro da faixa
  perto(ideal.preco, 42.74, 0.01)
  perto(resultado('tiktok', ideal.preco!, e, C).margemPct, C.meta, 0.0005)
  // no preço ideal o semáforo é verde nos três canais, mesmo com arredondamento
  for (const canal of ['ml', 'shopee', 'tiktok'] as const) assert.equal(resultado(canal, precoParaMargem(canal, C.meta, e, C).preco!, e, C).semaforo, 'VERDE')
  // produto caro cai na faixa alta, com comissão menor
  const caro = precoParaMargem('tiktok', C.meta, { custo: 40, pesoKg: 1 }, C)
  assert.ok(caro.preco! >= 50)
  perto(resultado('tiktok', caro.preco!, { custo: 40, pesoKg: 1 }, C).margemPct, C.meta, 0.0005)
})

test('frete da Shopee: só a Entrega Direta custa; a média dilui em todos os pedidos', () => {
  const fixos = (entrega?: 'media' | 'padrao' | 'direta') =>
    resultado('shopee', 45, { ...e, entregaShopee: entrega }, C).linhas.find(l => l.rotulo.startsWith('Embalagem'))!.valor
  perto(fixos(), 3.21, 0.005)          // 1,50 + 0,49 + 1,22 (média)
  perto(fixos('media'), 3.21, 0.005)
  perto(fixos('padrao'), 1.99, 0.005)  // sem frete
  perto(fixos('direta'), 5.98, 0.005)  // 1,50 + 0,49 + 3,99
  // sem o frete, o preço mínimo cai
  const padrao = precoParaMargem('shopee', C.piso, { ...e, entregaShopee: 'padrao' }, C).preco!
  assert.ok(padrao < precoParaMargem('shopee', C.piso, e, C).preco!)
})

test('kit: custo e peso multiplicam, taxas por pedido não — o preço por unidade cai', () => {
  const um = precoParaMargem('shopee', C.piso, e, C).preco!
  const tres = precoParaMargem('shopee', C.piso, { custo: e.custo * 3, pesoKg: e.pesoKg * 3 }, C).preco!
  assert.ok(tres / 3 < um, `${tres / 3} deveria ser menor que ${um}`)
})

test('Ads máximo: sobra antes do Ads menos 8 pontos, e o ROAS mínimo que isso exige', () => {
  // ML a R$ 45: margem 22,5% com Ads de 9,2% → sobra antes do Ads 31,7% → Ads máximo 23,7% → ROAS 4,2
  const r = resultado('ml', 45, e, C)
  perto(r.adsPct, 0.092, 0.0001)
  perto(r.sobraAntesAds, r.margemPct + 0.092, 0.0001)
  perto(r.adsMaximo, r.sobraAntesAds - 0.08, 0.0001)
  perto(r.roasMinimo, 1 / r.adsMaximo, 0.0001)
  perto(r.adsMaximo, 0.237, 0.002)
  // o Ads máximo não depende do Ads que está sendo usado
  perto(resultado('ml', 45, { ...e, adsML: 0 }, C).adsMaximo, r.adsMaximo, 0.0001)
  // Shopee a R$ 45 dá prejuízo mesmo sem Ads: não cabe Ads nenhum
  const s = resultado('shopee', 45, e, C)
  assert.equal(s.adsMaximo > 0.08, false)
  const semSobra = resultado('shopee', 30, e, C)
  assert.equal(semSobra.adsMaximo, 0); assert.equal(semSobra.roasMinimo, null)
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

test('plano de Ads: sem Ads abaixo do piso; meta da Shopee corrigida pelo fator', () => {
  // Kit Frutas 2 kg na Shopee a R$ 62,90 (custo 20,38), conta sem Ads
  const sh = resultado('shopee', 62.9, { custo: 20.38, pesoKg: 2, adsShopee: 0 }, C)
  const p = planoAds('shopee', sh, C)
  assert.equal(p.cabe, true)
  perto(p.adsMaximo, p.sobra - C.reservaAds, 0.0001)
  perto(p.roasReal, 1 / p.adsMaximo, 0.0001)
  perto(p.metaConfigurar, p.roasReal! / 0.75, 0.0001)
  // chá avulso a R$ 23,90 (custo 6,50): sobra abaixo de 15% → sem Ads
  const cha = planoAds('shopee', resultado('shopee', 23.9, { custo: 6.5, pesoKg: 0.1, adsShopee: 0 }, C), C)
  assert.equal(cha.cabe, false); assert.equal(cha.metaConfigurar, null)
  // no ML o fator é 1: meta = ROAS real
  const ml = planoAds('ml', resultado('ml', 45, { ...e, adsML: 0 }, C), C)
  perto(ml.metaConfigurar, ml.roasReal!, 0.0001)
})
