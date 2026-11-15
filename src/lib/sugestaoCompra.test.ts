import { test } from 'node:test'
import assert from 'node:assert'
import { calcularGiro, serieSemanal, arredondarCompra, prazoEntrega, SEMANAS } from './sugestaoCompra'

const estavel = (v: number) => new Array<number>(SEMANAS).fill(v)
const base = { diasFoto: 70, diasZerado: 0, prazoDias: 2, coberturaDias: 30 }

test('venda estável: previsão diária é a média e não há estoque de segurança', () => {
  const r = calcularGiro({ ...base, semanas: estavel(7), saldo: 10 })
  assert.equal(r.vendaDia, 1)
  assert.equal(r.estoqueSeguranca, 0)
  assert.equal(r.coberturaAtual, 10)
  // alvo = 1/dia × (2 + 30) = 32; faltam 22
  assert.equal(r.sugestao, 22)
  assert.equal(r.status, 'comprar')
})

test('saldo que não dura até a entrega é urgente', () => {
  const r = calcularGiro({ ...base, semanas: estavel(7), saldo: 1.5 })
  assert.equal(r.status, 'urgente')
})

test('saldo folgado não gera sugestão', () => {
  const r = calcularGiro({ ...base, semanas: estavel(7), saldo: 60 })
  assert.equal(r.sugestao, 0)
  assert.equal(r.status, 'ok')
})

test('cobertura acima de 120 dias é estoque parado', () => {
  assert.equal(calcularGiro({ ...base, semanas: estavel(7), saldo: 200 }).status, 'parado')
})

test('sem venda: parado se tem saldo, sem_venda se não tem', () => {
  assert.equal(calcularGiro({ ...base, semanas: estavel(0), saldo: 5 }).status, 'parado')
  assert.equal(calcularGiro({ ...base, semanas: estavel(0), saldo: 0 }).status, 'sem_venda')
  assert.equal(calcularGiro({ ...base, semanas: estavel(0), saldo: 5 }).sugestao, 0)
})

test('mês recente pesa mais: venda subindo aumenta a previsão e marca tendência positiva', () => {
  const semanas = [14, 14, 14, 14, ...new Array(9).fill(7)]
  const r = calcularGiro({ ...base, semanas, saldo: 0 })
  assert.ok(r.vendaDia > 1.5 && r.vendaDia < 2)
  assert.ok(r.tendencia! > 0)
  assert.ok(r.estoqueSeguranca > 0)
})

test('dias zerados corrigem a venda para cima, limitado ao dobro', () => {
  const semRuptura = calcularGiro({ ...base, semanas: estavel(7), saldo: 0 })
  const comRuptura = calcularGiro({ ...base, semanas: estavel(7), saldo: 0, diasFoto: 70, diasZerado: 35 })
  assert.equal(comRuptura.vendaDia, semRuptura.vendaDia * 2)
  assert.equal(comRuptura.corrigidoRuptura, true)
  const quaseSempreZerado = calcularGiro({ ...base, semanas: estavel(7), saldo: 0, diasFoto: 70, diasZerado: 65 })
  assert.equal(quaseSempreZerado.vendaDia, semRuptura.vendaDia * 2)
})

test('saldo nulo ou negativo conta como zero', () => {
  assert.equal(calcularGiro({ ...base, semanas: estavel(7), saldo: null }).coberturaAtual, 0)
  assert.equal(calcularGiro({ ...base, semanas: estavel(7), saldo: -3 }).coberturaAtual, 0)
})

test('serieSemanal preenche semanas sem venda com zero e ignora fora da janela', () => {
  const s = serieSemanal([{ s: 0, valor: 5 }, { s: 3, valor: 2 }, { s: 13, valor: 99 }])
  assert.equal(s.length, SEMANAS)
  assert.equal(s[0], 5); assert.equal(s[1], 0); assert.equal(s[3], 2)
  assert.equal(s.reduce((a, b) => a + b, 0), 7)
})

test('arredondarCompra sobe para quantidade comprável', () => {
  assert.equal(arredondarCompra(0, 'kg'), 0)
  assert.equal(arredondarCompra(1.2, 'kg'), 1.5)
  assert.equal(arredondarCompra(23.1, 'kg'), 24)
  assert.equal(arredondarCompra(2.1, 'unidade'), 3)
})

test('prazoEntrega: 2 dias no geral, 4 na Gomah, mais nas linhas lentas', () => {
  assert.equal(prazoEntrega('VALLE', 'Colorau'), 2)
  assert.equal(prazoEntrega('gomah ', 'Semente de Chia'), 4)
  assert.equal(prazoEntrega('VALLE', 'Amendoim Drageado Chocolate'), 7)
  assert.equal(prazoEntrega('VALLE', 'Biscoito Amanteigado Goiabada'), 7)
  assert.equal(prazoEntrega(null, 'Lavanda', 'Óleos Essenciais'), 7)
})
