'use client'
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Link2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Spinner } from '@/components/ui'

interface Status {
  configurada: boolean; conectada: boolean
  ambiente?: 'teste' | 'producao'; shopId?: string | null; conectadaEm?: string | null; ambienteDaConexao?: string | null
}
interface Amostra { orderSn: string; status: string | null; valorProdutos?: number | null; comissao?: number | null; taxaServico?: number | null; taxaTransacao?: number | null; repasse?: number | null; erro?: string }

const brl = (v?: number | null) => v != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '—'

/** Ligação da loja com a Shopee: situação, botão de autorizar e leitura de conferência. */
export default function ConexaoShopee() {
  const sp = useSearchParams()
  const [st, setSt] = useState<Status | null>(null)
  const [lendo, setLendo] = useState(false)
  const [amostra, setAmostra] = useState<{ total: number; itens: Amostra[] } | null>(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    try { const r = await fetch('/api/shopee/status'); if (r.ok) setSt(await r.json()) } catch { /* fica sem o cartão */ }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const retorno = sp.get('shopee')
  const motivo = sp.get('motivo')

  const conferir = async () => {
    setLendo(true); setErro(''); setAmostra(null)
    try {
      const r = await fetch('/api/shopee/pedidos?dias=7&limite=8')
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErro(d.error ?? `Erro ao ler pedidos (HTTP ${r.status}).`); return }
      setAmostra({ total: d.totalNoPeriodo, itens: d.amostra })
    } catch { setErro('Falha de conexão ao ler os pedidos.') }
    finally { setLendo(false) }
  }
  const desligar = async () => {
    if (!confirm('Desligar a loja da Shopee deste sistema? Para ligar de novo será preciso autorizar outra vez.')) return
    await fetch('/api/shopee/status', { method: 'DELETE' }); setAmostra(null); carregar()
  }

  if (!st) return null
  const trocouAmbiente = st.conectada && st.ambienteDaConexao && st.ambienteDaConexao !== st.ambiente

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2.5">
          {st.conectada && !trocouAmbiente
            ? <CheckCircle2 size={18} className="text-ok mt-0.5 shrink-0" />
            : <Link2 size={18} className="text-tinta-fraca mt-0.5 shrink-0" />}
          <div>
            <h3 className="section-title">
              Shopee: {!st.configurada ? 'credenciais não configuradas' : st.conectada && !trocouAmbiente ? 'loja ligada' : 'loja ainda não autorizada'}
              {st.configurada && <span className={`ml-2 text-[10px] font-semibold rounded-full border px-2 py-0.5 ${st.ambiente === 'teste' ? 'border-atencao/40 bg-atencao/10 text-atencao' : 'border-ok/40 bg-ok/10 text-ok'}`}>{st.ambiente === 'teste' ? 'ambiente de teste' : 'produção'}</span>}
            </h3>
            <p className="text-xs text-tinta-fraca mt-0.5">
              {!st.configurada && 'Falta cadastrar no servidor o Partner ID e a chave do app da Shopee.'}
              {st.configurada && !st.conectada && 'Clique em "Autorizar loja", entre com a conta da loja na Shopee e confirme. Depois disso as taxas de cada venda passam a ser lidas direto da Shopee.'}
              {st.conectada && !trocouAmbiente && <>Loja {st.shopId}{st.conectadaEm && <>, autorizada em {new Date(st.conectadaEm).toLocaleString('pt-BR')}</>}.{st.ambiente === 'teste' && ' Em teste, a loja é fictícia: serve para validar a ligação, não traz os seus pedidos.'}</>}
              {trocouAmbiente && 'As credenciais mudaram de ambiente desde a última autorização. Autorize a loja de novo.'}
            </p>
          </div>
        </div>
        {st.configurada && (
          <div className="flex gap-2">
            {st.conectada && !trocouAmbiente && <button onClick={conferir} className="btn-ghost text-xs" disabled={lendo}>{lendo && <Spinner size={12} />} Conferir pedidos e taxas</button>}
            <a href="/api/shopee/conectar" className={st.conectada && !trocouAmbiente ? 'btn-ghost text-xs' : 'btn-primary text-xs'}>{st.conectada ? 'Autorizar de novo' : 'Autorizar loja'}</a>
            {st.conectada && <button onClick={desligar} className="text-xs text-perigo hover:underline px-1">Desligar</button>}
          </div>
        )}
      </div>

      {retorno === 'conectada' && <p className="text-xs text-ok mt-2">Autorização concluída: a loja foi ligada.</p>}
      {retorno === 'erro' && <p className="text-xs text-perigo mt-2 flex items-start gap-1"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> A autorização não foi concluída. {motivo}</p>}
      {erro && <p className="text-xs text-perigo mt-2">{erro}</p>}

      {amostra && (
        <div className="mt-3 overflow-auto border border-rdb-100 rounded-lg">
          <table className="w-full">
            <thead className="tbl-head"><tr>
              <th className="th">Pedido</th><th className="th">Situação</th><th className="th-r">Produtos</th>
              <th className="th-r">Comissão</th><th className="th-r">Serviço</th><th className="th-r">Transação</th><th className="th-r">Repasse</th>
            </tr></thead>
            <tbody>
              {!amostra.itens.length && <tr><td colSpan={7} className="td text-center text-tinta-fraca py-6">Nenhum pedido nos últimos 7 dias.</td></tr>}
              {amostra.itens.map(p => (
                <tr key={p.orderSn} className="tr-row">
                  <td className="td font-mono text-xs">{p.orderSn}</td>
                  <td className="td text-xs">{p.status ?? '—'}</td>
                  {p.erro ? <td colSpan={5} className="td text-xs text-perigo whitespace-normal">{p.erro}</td> : (
                    <>
                      <td className="td-r text-xs">{brl(p.valorProdutos)}</td><td className="td-r text-xs">{brl(p.comissao)}</td>
                      <td className="td-r text-xs">{brl(p.taxaServico)}</td><td className="td-r text-xs">{brl(p.taxaTransacao)}</td>
                      <td className="td-r text-xs font-semibold">{brl(p.repasse)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-tinta-fraca px-3 py-2">{amostra.total} pedido(s) nos últimos 7 dias; mostrando até 8.</p>
        </div>
      )}
    </div>
  )
}
