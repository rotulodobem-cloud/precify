import { test } from 'node:test'
import assert from 'node:assert'
import { numeroForm } from './kits'

test('numeroForm aceita vírgula, ponto e vazio sem quebrar o salvamento', () => {
  assert.equal(numeroForm('0,80'), 0.8)
  assert.equal(numeroForm('0.80'), 0.8)
  assert.equal(numeroForm('1.234,50'), 1234.5)
  assert.equal(numeroForm(' 250 '), 250)
  assert.equal(numeroForm(2), 2)
  assert.equal(numeroForm(''), null)
  assert.equal(numeroForm('abc'), null)
  assert.equal(numeroForm(undefined), null)
  assert.equal(numeroForm(NaN), null)
})
