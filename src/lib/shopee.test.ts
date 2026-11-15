import { test } from 'node:test'
import assert from 'node:assert'
import crypto from 'crypto'
import { assinar, urlAutorizacao, ehSandbox } from './shopee'

// credenciais fictícias: os testes só conferem o formato da assinatura e do link
const C = { host: 'https://exemplo.shopee.test', partnerId: '1000001', partnerKey: 'chave-de-teste' }

test('assinatura de parceiro: HMAC-SHA256 de partner_id + caminho + timestamp', () => {
  const esperado = crypto.createHmac('sha256', 'chave-de-teste').update('1000001/api/v2/shop/auth_partner1700000000').digest('hex')
  assert.equal(assinar(C, '/api/v2/shop/auth_partner', 1700000000), esperado)
  assert.match(esperado, /^[0-9a-f]{64}$/)
})

test('assinatura da loja inclui access_token e shop_id, nessa ordem', () => {
  const esperado = crypto.createHmac('sha256', 'chave-de-teste').update('1000001/api/v2/order/get_order_list1700000000TOKEN555').digest('hex')
  assert.equal(assinar(C, '/api/v2/order/get_order_list', 1700000000, 'TOKEN', '555'), esperado)
  assert.notEqual(assinar(C, '/api/v2/order/get_order_list', 1700000000, 'TOKEN', '555'), assinar(C, '/api/v2/order/get_order_list', 1700000000))
})

test('link de autorização leva parceiro, timestamp, assinatura e o endereço de retorno', () => {
  const u = new URL(urlAutorizacao(C, 'https://meu.site/api/shopee/callback', 1700000000))
  assert.equal(u.origin + u.pathname, 'https://exemplo.shopee.test/api/v2/shop/auth_partner')
  assert.equal(u.searchParams.get('partner_id'), '1000001')
  assert.equal(u.searchParams.get('timestamp'), '1700000000')
  assert.equal(u.searchParams.get('redirect'), 'https://meu.site/api/shopee/callback')
  assert.equal(u.searchParams.get('sign'), assinar(C, '/api/v2/shop/auth_partner', 1700000000))
})

test('reconhece o ambiente de teste pelo host', () => {
  assert.equal(ehSandbox('https://openplatform.sandbox.test-stable.shopee.sg'), true)
  assert.equal(ehSandbox('https://partner.test-stable.shopeemobile.com'), true)
  assert.equal(ehSandbox('https://partner.shopeemobile.com'), false)
})
