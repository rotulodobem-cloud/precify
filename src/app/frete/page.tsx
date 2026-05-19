'use client'
import { useState } from 'react'
import { TABELA_FRETE_FULL, FAIXAS_PRECO, calcFreteFullML, calcFreteFlexML } from '@/lib/freteML'

const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`

const FAIXAS_PESO = [
  'Até 0,3 kg', 'De 0,3 a 0,5 kg', 'De 0,5 a 1 kg', 'De 1 a 2 kg',
  'De 2 a 3 kg', 'De 3 a 4 kg', 'De 4 a 5 kg', 'De 5 a 6 kg',
  'De 6 a 7 kg', 'De 7 a 8 kg', 'De 8 a 9 kg', 'De 9 a 11 kg',
  'De 11 a 13 kg', 'De 13 a 15 kg', 'De 15 a 20 kg', 'De 20 a 25 kg',
  'De 25 a 30 kg',
]

export default function FretePage() {
  const [peso, setPeso] = useState('')
  const [preco, setPreco] = useState('')
  const [tipo, setTipo] = useState<'full' | 'flex'>('full')

  const pesoN = parseFloat(peso) || 0
  const precoN = parseFloat(preco) || 0

  const freteCalc = pesoN > 0
    ? tipo === 'full'
      ? calcFreteFullML(pesoN, precoN)
      : calcFreteFlexML(pesoN)
    : null

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="page-title">Frete Mercado Livre</h1>
        <p className="text-sm text-gray-500 mt-0.5">Simulador de custo de frete FULL, Flex e Mercado Envios</p>
      </div>

      {/* Simulador */}
      <div className="card p-5">
        <h2 className="section-title mb-4">Simulador de frete</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          <div>
            <label className="lbl">Tipo de entrega</label>
            <div className="flex gap-2">
              {[['full', 'FULL'], ['flex', 'Flex / Envios']].map(([val, label]) => (
                <button key={val} onClick={() => setTipo(val as 'full' | 'flex')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all
                    ${tipo === val ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="lbl">Peso do produto (kg)</label>
            <input className="inp" type="number" step="0.01" value={peso}
              onChange={e => setPeso(e.target.value)} placeholder="0.250" />
          </div>
          {tipo === 'full' && (
            <div>
              <label className="lbl">Preço de venda (R$)</label>
              <input className="inp" type="number" step="0.01" value={preco}
                onChange={e => setPreco(e.target.value)} placeholder="29.90" />
            </div>
          )}
        </div>

        {freteCalc !== null && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-indigo-700">Custo de frete estimado ({tipo === 'full' ? 'FULL' : 'Flex/Envios'})</p>
              <p className="text-3xl font-bold text-indigo-700 mt-1">{brl(freteCalc)}</p>
              {tipo === 'full' && precoN > 0 && (
                <p className="text-xs text-indigo-500 mt-1">
                  Peso: {pesoN}kg · Preço: {brl(precoN)} · Faixa de preço: {FAIXAS_PRECO.find(f => precoN >= f.min && precoN <= f.max)?.label ?? 'R$199+'}
                </p>
              )}
            </div>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-3">
          * Flex e Mercado Envios usam uma estimativa média. Para valores exatos, consulte o painel do Mercado Livre.
        </p>
      </div>

      {/* Tabela FULL completa */}
      <div className="card overflow-auto">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h2 className="section-title">Tabela de frete FULL — custo por peso × faixa de preço de venda</h2>
          <p className="text-xs text-gray-400 mt-0.5">Fonte: planilha Custos_FULL.xlsx</p>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead className="tbl-head">
              <tr>
                <th className="th">Peso</th>
                {FAIXAS_PRECO.map(f => (
                  <th key={f.label} className="th text-right whitespace-nowrap">{f.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {TABELA_FRETE_FULL.map(([maxPeso, fretes], i) => {
                const label = FAIXAS_PESO[i] ?? `Até ${maxPeso}kg`
                // Highlight if matches current simulation
                const isMatch = pesoN > 0 && pesoN <= maxPeso &&
                  (i === 0 || pesoN > TABELA_FRETE_FULL[i - 1][0])
                return (
                  <tr key={maxPeso} className={`tr-row ${isMatch ? 'bg-indigo-50 font-semibold' : ''}`}>
                    <td className="td text-xs font-medium text-gray-700 whitespace-nowrap">{label}</td>
                    {fretes.map((frete, j) => {
                      const faixaPreco = FAIXAS_PRECO[j]
                      const isColMatch = precoN >= faixaPreco.min && precoN <= faixaPreco.max
                      return (
                        <td key={j} className={`td-r tabular-nums ${isMatch && isColMatch ? 'text-indigo-700 bg-indigo-100 rounded font-bold' : 'text-gray-600'}`}>
                          {brl(frete)}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info */}
      <div className="card p-4 bg-amber-50 border-amber-100 text-sm text-amber-800 space-y-1">
        <p className="font-semibold">Como o frete é usado na precificação:</p>
        <p>• Na tela de <strong>Precificação</strong>, o campo "Frete/Taxa" de cada SKU pode ser preenchido com o valor da tabela acima.</p>
        <p>• Para produtos FULL, insira o frete correspondente ao peso da variação e ao preço de venda esperado.</p>
        <p>• O sistema recalcula automaticamente o preço mínimo, ideal e promocional após salvar o frete.</p>
      </div>
    </div>
  )
}
