'use client'
import { useEffect } from 'react'
import { X, AlertCircle, CheckCircle2, AlertTriangle, MinusCircle } from 'lucide-react'

// ── Modal ────────────────────────────────────────────────────
export function Modal({ title, open, onClose, children, wide = false }: {
  title: string; open: boolean; onClose: () => void; children: React.ReactNode; wide?: boolean
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-md'} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

// ── StatusBadge ──────────────────────────────────────────────
const BADGE_MAP: Record<string, { cls: string; label: string; icon?: React.ReactNode }> = {
  SAUDAVEL:      { cls: 'badge-green',  label: 'Saudável',   icon: <CheckCircle2 size={11} /> },
  ATENCAO:       { cls: 'badge-amber',  label: 'Atenção',    icon: <AlertTriangle size={11} /> },
  PREJUIZO:      { cls: 'badge-red',    label: 'Prejuízo',   icon: <AlertCircle size={11} /> },
  SEM_PRECO:     { cls: 'badge-gray',   label: 'Sem preço',  icon: <MinusCircle size={11} /> },
  ativo:         { cls: 'badge-green',  label: 'Ativo' },
  inativo:       { cls: 'badge-gray',   label: 'Inativo' },
  'AUMENTOU > 5%':  { cls: 'badge-red',   label: '↑ +5%' },
  'DIMINUIU > 5%':  { cls: 'badge-green', label: '↓ -5%' },
  'ESTAVEL ± 5%':   { cls: 'badge-gray',  label: '→ Estável' },
  Lucro:         { cls: 'badge-green',  label: 'Lucro' },
  Atenção:       { cls: 'badge-amber',  label: 'Atenção' },
  'Prejuízo':    { cls: 'badge-red',    label: 'Prejuízo' },
  'Sem preço de venda': { cls: 'badge-gray', label: 'Sem preço' },
}

export function StatusBadge({ status }: { status?: string | null }) {
  const cfg = BADGE_MAP[status ?? ''] ?? { cls: 'badge-gray', label: status ?? '—' }
  return (
    <span className={cfg.cls}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

// ── Spinner ──────────────────────────────────────────────────
export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`spin ${className ?? ''}`}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="62" strokeDashoffset="48" strokeLinecap="round" />
    </svg>
  )
}

// ── Empty state ──────────────────────────────────────────────
export function Empty({ msg = 'Nenhum resultado encontrado' }: { msg?: string }) {
  return (
    <tr>
      <td colSpan={99} className="py-14 text-center text-gray-400 text-sm">{msg}</td>
    </tr>
  )
}

// ── Loading row ──────────────────────────────────────────────
export function Loading() {
  return (
    <tr>
      <td colSpan={99} className="py-12 text-center text-gray-400">
        <div className="flex items-center justify-center gap-2">
          <Spinner /> <span className="text-sm">Carregando…</span>
        </div>
      </td>
    </tr>
  )
}

// ── Alert box ────────────────────────────────────────────────
export function Alert({ type, children }: { type: 'error' | 'warning' | 'success' | 'info'; children: React.ReactNode }) {
  const cls = { error: 'bg-red-50 border-red-200 text-red-800', warning: 'bg-amber-50 border-amber-200 text-amber-800', success: 'bg-emerald-50 border-emerald-200 text-emerald-800', info: 'bg-blue-50 border-blue-200 text-blue-700' }[type]
  return <div className={`border rounded-lg px-3 py-2.5 text-sm ${cls}`}>{children}</div>
}
