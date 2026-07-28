'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Search, Package, Tag, Calculator, ShoppingCart, Clock, CornerDownLeft } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { useDebounce } from '@/lib/useDebounce'
import type { Role } from '@/lib/auth'

const brl = (v?: number | null) => v != null ? `R$ ${v.toFixed(2).replace('.', ',')}` : '—'

interface VariacaoBusca {
  id: string; skuVariacao: string; nomeVariacao: string; pesoGramas: number | null; custoTotal: number | null
  canaisAnunciados: { canal: string; nome: string; precoIdeal: number | null }[]
}
interface ProdutoBusca {
  skuPrincipal: string; nome: string; categoria: string; custoAtualizado: number | null
  fornecedorPrincipal: string | null; variacoes: VariacaoBusca[]
}

type Item =
  | { tipo: 'produto'; chave: string; label: string; sub: string; href: string }
  | { tipo: 'variacao'; chave: string; label: string; sub: string; href: string }

interface Recente { label: string; sub: string; href: string }

const CHAVE_RECENTES = 'precify:buscas-recentes'
/** A sidebar dispara este evento para abrir a busca sem precisar do atalho. */
export const EVENTO_ABRIR_BUSCA = 'precify:abrir-busca'

function lerRecentes(): Recente[] {
  try {
    const cru = localStorage.getItem(CHAVE_RECENTES)
    const lista = cru ? JSON.parse(cru) : []
    return Array.isArray(lista) ? lista.slice(0, 6) : []
  } catch {
    return []
  }
}

/** Busca global por SKU ou nome, disponível em qualquer tela por Ctrl+K. */
export default function BuscaGlobal({ role }: { role: Role | null }) {
  const router = useRouter()
  const path = usePathname()
  const [aberto, setAberto] = useState(false)
  const [q, setQ] = useState('')
  const [produtos, setProdutos] = useState<ProdutoBusca[]>([])
  const [carregando, setCarregando] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [recentes, setRecentes] = useState<Recente[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)
  const reqRef = useRef(0)
  const qBusca = useDebounce(q, 300)

  // Só quem é admin busca: o parceiro não tem acesso a /api/busca.
  const escondido = role !== 'admin'

  // Abre com Ctrl+K / ⌘K de qualquer lugar, ou pelo botão da sidebar
  useEffect(() => {
    if (escondido) return
    const atalho = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setAberto(a => !a)
      }
    }
    const pelaSidebar = () => setAberto(true)
    window.addEventListener('keydown', atalho)
    window.addEventListener(EVENTO_ABRIR_BUSCA, pelaSidebar)
    return () => {
      window.removeEventListener('keydown', atalho)
      window.removeEventListener(EVENTO_ABRIR_BUSCA, pelaSidebar)
    }
  }, [escondido])

  useEffect(() => {
    if (!aberto) return
    setRecentes(lerRecentes())
    inputRef.current?.focus()
  }, [aberto])

  // Fecha ao trocar de tela
  useEffect(() => { setAberto(false) }, [path])

  useEffect(() => {
    if (!aberto) return
    if (qBusca.trim().length < 2) { setProdutos([]); setCarregando(false); return }
    const seq = ++reqRef.current
    setCarregando(true)
    fetch(`/api/busca?q=${encodeURIComponent(qBusca.trim())}`)
      .then(r => r.ok ? r.json() : { results: [] })
      .then(d => {
        if (seq !== reqRef.current) return // resposta atrasada: descarta
        setProdutos(d.results ?? [])
        setCursor(0)
        setCarregando(false)
      })
      .catch(() => { if (seq === reqRef.current) setCarregando(false) })
  }, [qBusca, aberto])

  // Lista achatada: produto seguido das suas variações
  const itens: Item[] = []
  for (const p of produtos) {
    itens.push({
      tipo: 'produto',
      chave: `p:${p.skuPrincipal}`,
      label: p.nome,
      sub: [p.skuPrincipal, p.categoria, p.fornecedorPrincipal, `custo ${brl(p.custoAtualizado)}`].filter(Boolean).join(' · '),
      href: `/busca?q=${encodeURIComponent(p.skuPrincipal)}`,
    })
    for (const v of p.variacoes) {
      const preco = v.canaisAnunciados.find(c => c.precoIdeal != null)?.precoIdeal ?? null
      itens.push({
        tipo: 'variacao',
        chave: `v:${v.id}`,
        label: v.nomeVariacao || v.skuVariacao,
        sub: [v.skuVariacao, `custo ${brl(v.custoTotal)}`, preco != null ? `preço ${brl(preco)}` : null].filter(Boolean).join(' · '),
        href: `/precificacao-multicanal?skuVariacao=${encodeURIComponent(v.skuVariacao)}`,
      })
    }
  }

  const abrir = useCallback((destino: { label: string; sub: string; href: string }) => {
    try {
      const anteriores = lerRecentes().filter(r => r.href !== destino.href)
      localStorage.setItem(CHAVE_RECENTES, JSON.stringify([destino, ...anteriores].slice(0, 6)))
    } catch {
      // localStorage indisponível: seguir sem histórico
    }
    setAberto(false)
    setQ('')
    router.push(destino.href)
  }, [router])

  useEffect(() => {
    listaRef.current?.querySelector('[data-ativo="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  if (escondido || !aberto) return null

  const navegaveis: { label: string; sub: string; href: string }[] = q.trim().length < 2 ? recentes : itens

  const teclado = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setAberto(false); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, navegaveis.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    if (e.key === 'Enter') {
      e.preventDefault()
      const alvo = navegaveis[cursor]
      if (alvo) abrir(alvo)
      else if (q.trim()) abrir({ label: q.trim(), sub: 'busca', href: `/busca?q=${encodeURIComponent(q.trim())}` })
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setAberto(false)} />
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[70vh]">
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-rdb-200 shrink-0">
            <Search size={18} className="text-tinta-fraca shrink-0" />
            <input
              ref={inputRef}
              className="flex-1 text-base outline-none bg-transparent placeholder:text-rdb-300"
              placeholder="Buscar produto por SKU ou nome…"
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={teclado}
            />
            {carregando && <Spinner size={16} />}
            <kbd className="text-[10px] text-tinta-fraca border border-rdb-200 rounded px-1.5 py-0.5">esc</kbd>
          </div>

          <div ref={listaRef} className="overflow-y-auto flex-1 py-1.5">
            {q.trim().length < 2 && (
              recentes.length ? (
                <>
                  <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-tinta-fraca uppercase tracking-wider">Consultados recentemente</p>
                  {recentes.map((r, i) => (
                    <Linha key={r.href} icone={<Clock size={14} className="text-rdb-300" />} label={r.label} sub={r.sub}
                      ativo={i === cursor} onClick={() => abrir(r)} onHover={() => setCursor(i)} />
                  ))}
                </>
              ) : (
                <p className="px-4 py-8 text-center text-sm text-tinta-fraca">Digite pelo menos 2 letras do SKU ou do nome do produto.</p>
              )
            )}

            {q.trim().length >= 2 && !carregando && !itens.length && (
              <p className="px-4 py-8 text-center text-sm text-tinta-fraca">Nada encontrado para “{q.trim()}”.</p>
            )}

            {q.trim().length >= 2 && itens.map((item, i) => (
              <Linha
                key={item.chave}
                icone={item.tipo === 'produto'
                  ? <Package size={14} className="text-rdb-700" />
                  : <Tag size={13} className="text-rdb-300" />}
                label={item.label}
                sub={item.sub}
                recuado={item.tipo === 'variacao'}
                acao={item.tipo === 'variacao' ? 'calcular preço' : 'ver tudo'}
                ativo={i === cursor}
                onClick={() => abrir(item)}
                onHover={() => setCursor(i)}
              />
            ))}
          </div>

          <div className="border-t border-rdb-200 px-4 py-2 flex items-center gap-4 text-[10px] text-tinta-fraca shrink-0">
            <span className="flex items-center gap-1"><CornerDownLeft size={11} /> abrir</span>
            <span>↑ ↓ navegar</span>
            <span className="flex items-center gap-1"><Calculator size={11} /> variação abre o Multicanal</span>
            <span className="flex items-center gap-1"><ShoppingCart size={11} /> produto abre a visão completa</span>
          </div>
        </div>
      </div>
    </>
  )
}

function Linha({ icone, label, sub, ativo, recuado, acao, onClick, onHover }: {
  icone: React.ReactNode; label: string; sub: string; ativo: boolean
  recuado?: boolean; acao?: string; onClick: () => void; onHover: () => void
}) {
  return (
    <button
      data-ativo={ativo}
      onClick={onClick}
      onMouseMove={onHover}
      className={`w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors ${recuado ? 'pl-10' : ''} ${ativo ? 'bg-rdb-50' : 'hover:bg-rdb-50'}`}
    >
      <span className="shrink-0">{icone}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-tinta truncate">{label}</span>
        <span className="block text-xs text-tinta-fraca truncate">{sub}</span>
      </span>
      {acao && ativo && <span className="text-[10px] text-rdb-700 shrink-0">{acao}</span>}
    </button>
  )
}
