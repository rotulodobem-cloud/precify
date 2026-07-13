'use client'
import { useEffect, useState } from 'react'

const dt = (d: string) => new Date(d).toLocaleDateString('pt-BR')

interface LoteDetalhe {
  numeroLote: string; dataValidade: string
  compra: { skuPrincipal: string; nomeProduto: string; fornecedor: string; dataCompra: string; numeroNF: string | null; numeroPedido: string | null }
}

// Tamanho da etiqueta — trocar aqui se precisar de outro tamanho no futuro
const ETIQUETA_LARGURA_CM = 8
const ETIQUETA_ALTURA_CM = 8

export default function EtiquetaLotePage({ params }: { params: { id: string } }) {
  const [lote, setLote] = useState<LoteDetalhe | null>(null)

  useEffect(() => {
    fetch(`/api/lotes/${params.id}`).then(r => r.json()).then(setLote)
  }, [params.id])

  useEffect(() => {
    if (lote) setTimeout(() => window.print(), 300)
  }, [lote])

  if (!lote) return <p style={{ padding: 16, fontFamily: 'sans-serif' }}>Carregando…</p>

  return (
    <>
      <style>{`
        @page { size: ${ETIQUETA_LARGURA_CM}cm ${ETIQUETA_ALTURA_CM}cm; margin: 0; }
        html, body { margin: 0; padding: 0; }
        .etiqueta {
          width: ${ETIQUETA_LARGURA_CM}cm; height: ${ETIQUETA_ALTURA_CM}cm;
          box-sizing: border-box; padding: 0.4cm;
          font-family: Arial, Helvetica, sans-serif;
          display: flex; flex-direction: column; justify-content: center; gap: 0.25cm;
        }
        .etiqueta .produto { font-size: 14pt; font-weight: bold; line-height: 1.1; }
        .etiqueta .linha { font-size: 10pt; }
        .etiqueta .lote { font-size: 12pt; font-weight: bold; margin-top: 0.15cm; }
        @media screen { body { background: #eee; } .etiqueta { background: white; margin: 1cm auto; box-shadow: 0 0 8px rgba(0,0,0,0.15); } }

        /* Esta página nasce dentro do layout padrão do app (menu lateral
           incluso), então ao imprimir precisamos esconder tudo que não
           for a etiqueta em si — senão o menu e o restante da tela
           também vão para o papel. */
        @media print {
          aside { display: none !important; }
          main { padding: 0 !important; }
          .etiqueta {
            position: fixed; top: 0; left: 0; margin: 0; box-shadow: none;
          }
        }
      `}</style>
      <div className="etiqueta">
        <div className="produto">{lote.compra.nomeProduto}</div>
        <div className="linha">SKU: {lote.compra.skuPrincipal}</div>
        <div className="linha">Fornecedor: {lote.compra.fornecedor || '—'}</div>
        <div className="linha">
          Compra: {dt(lote.compra.dataCompra)}
          {(lote.compra.numeroNF || lote.compra.numeroPedido) && ` · NF ${lote.compra.numeroNF || lote.compra.numeroPedido}`}
        </div>
        <div className="linha">Validade: {dt(lote.dataValidade)}</div>
        <div className="lote">Lote: {lote.numeroLote}</div>
      </div>
    </>
  )
}
