import { CheckCircle2, Clock } from 'lucide-react'
import { SeloCanal } from '@/components/selos'
import { CANAIS } from '@/lib/tipos'

export default function Canais() {
  return (
    <>
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Canais</h1>
        <p className="mt-1 text-sm text-tinta-fraca">Todas as telas já filtram por canal. Shopee e TikTok Shop entram aqui quando os relatórios deles existirem — sem refazer tabelas.</p>
      </header>
      <section className="grid gap-4 md:grid-cols-3">
        {CANAIS.map(c => (
          <div key={c.slug} className={`card p-5 ${c.ativo ? '' : 'opacity-80'}`}>
            <div className="flex items-center gap-3"><SeloCanal canal={c.slug} /><p className="text-lg font-semibold">{c.nome}</p></div>
            {c.ativo ? (
              <p className="mt-3 flex items-center gap-1.5 text-sm text-emerald-800"><CheckCircle2 size={15} aria-hidden />Ativo: relatório de anúncios a cada 2 dias, promoções diárias pela API.</p>
            ) : (
              <p className="mt-3 flex items-center gap-1.5 text-sm text-tinta-fraca"><Clock size={15} aria-hidden />Preparado: o banco já aceita canal = <code className="rounded bg-rdb-50 px-1">{c.slug}</code>. Falta o parser do relatório de ads deste canal.</p>
            )}
          </div>
        ))}
      </section>
    </>
  )
}
