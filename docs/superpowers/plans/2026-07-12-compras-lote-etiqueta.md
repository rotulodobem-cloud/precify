# Compras Multi-Produto + Lote/Validade + Etiqueta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir registrar vários produtos de uma mesma NF/pedido numa única ação em Compras, editar compras já lançadas, e adicionar um módulo de lote/validade (com geração automática de código, busca e etiqueta térmica) para rastreabilidade de vigilância sanitária.

**Architecture:** `Compra` continua um registro por produto (preserva os relatórios/dashboards existentes que já consultam esse formato). Um novo campo `numeroNF`/`numeroPedido` agrupa logicamente vários registros de `Compra` criados na mesma submissão. `Lote` é uma tabela nova, filha de `Compra` (1 compra → N lotes), lançada em um momento separado da compra em si.

**Tech Stack:** Next.js 14 (App Router), React 18, Prisma 5, PostgreSQL, TypeScript, Tailwind CSS.

## Global Constraints

- Mesma observação do plano anterior: **sem framework de testes automatizado** neste projeto — verificação por `npx tsc --noEmit` + `npm run build` + passos manuais explícitos.
- **Sem banco de staging** — `DATABASE_URL` aponta direto para produção. Mudanças de schema só são testáveis em runtime depois do `prisma db push` (Task 9).
- Rodar `npm run db:backup` antes de qualquer `prisma db push`.
- Este plano assume que o [Plano "Limpeza e Ajustes"](2026-07-12-limpeza-e-ajustes.md) já foi executado (schema já sem `Anuncio`/models multicanal). Não é um requisito rígido de dependência técnica — só evita conflito se os dois forem aplicados fora de ordem com `db push` intercalados.
- Reusar exatamente os componentes/padrões já existentes: `Modal`, `Alert`, `Spinner`, `StatusBadge`, `Loading`, `Empty` de `@/components/ui`; classes `.card`, `.btn-primary`, `.btn-ghost`, `.inp`, `.lbl`, `.badge` de `globals.css`; formatação de moeda com `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })` (padrão `brl()` já usado em todas as páginas).

---

### Task 1: Compra com múltiplos produtos por NF/Pedido

**Files:**
- Modify: `prisma/schema.prisma` (model `Compra`)
- Modify: `src/lib/saveCompra.ts`
- Modify: `src/app/api/compras/route.ts`
- Modify: `src/app/compras/page.tsx`

**Interfaces:**
- Produces: `POST /api/compras` aceita `{ dataCompra, fornecedor, numeroNF?, numeroPedido?, frete?, itens: [{ skuPrincipal, nomeProduto, quantidade, custoTotal, outrosCustos?, precoVenda? }] }`, retorna `Compra[]` (uma por item).
- Produces: `recalcularVariacoesEPrecificacoes(skuPrincipal: string, custoUnit: number): Promise<void>` exportada de `src/lib/saveCompra.ts`, reusada na Task 2.

- [ ] **Step 1: Adicionar campos ao model Compra**

Em `prisma/schema.prisma`, no model `Compra`, adicionar antes de `createdAt`:
```prisma
  fonte            String   @default("manual")
  numeroNF         String?
  numeroPedido     String?
  createdAt        DateTime @default(now())

  lotes            Lote[]
}
```
(a linha `fonte` já existe — só adicionar `numeroNF`, `numeroPedido` e a relação `lotes` logo abaixo de `createdAt`, mantendo o restante do model como está)

- [ ] **Step 2: Regenerar o Prisma Client**

Run: `npx prisma generate`
Expected: pode dar erro se o model `Lote` referenciado em `lotes Lote[]` ainda não existir — **normal nesta etapa**, o model `Lote` é criado na Task 3. Se der erro `Type "Lote" is neither a built-in type...`, é esperado; seguir para a Task 3 antes de tentar `generate` de novo. (Alternativa: se preferir manter o build passando a cada task, adicionar o campo `lotes Lote[]` apenas na Task 3, junto com o model `Lote`, e nesta Task 1 adicionar só `numeroNF`/`numeroPedido`.)

- [ ] **Step 3: Extrair a lógica de recálculo de `saveCompra` para uma função reusável**

Em `src/lib/saveCompra.ts`, extrair o loop de variações/precificações (o bloco `for (const v of variacoes) { ... }`, atualmente linhas 60-100) para uma função exportada separada, e fazer `saveCompra` chamá-la. Substituir o arquivo inteiro por:

```ts
import db from '@/lib/db'
import { calcCustoVariacao, calcPrecificacaoComFreteML, round2 } from '@/lib/calculos'

export async function recalcularVariacoesEPrecificacoes(skuPrincipal: string, custoUnit: number) {
  const variacoes = await db.variacao.findMany({
    where: { skuPrincipal },
    include: { precificacoes: { include: { plataforma: true } } },
  })

  for (const v of variacoes) {
    let novoCustoCalc = v.custoCalculado
    let novoCustoTotal = v.custoTotal

    if (v.pesoGramas) {
      novoCustoCalc = round2(calcCustoVariacao(custoUnit, v.pesoGramas, 0))
      novoCustoTotal = round2(novoCustoCalc + (v.custoAdicional ?? 0))
    } else {
      novoCustoCalc = custoUnit
      novoCustoTotal = round2(custoUnit + (v.custoAdicional ?? 0))
    }

    await db.variacao.update({
      where: { id: v.id },
      data: { custoCalculado: novoCustoCalc, custoTotal: novoCustoTotal },
    })

    for (const prec of v.precificacoes) {
      const isML = prec.plataforma.slug === 'ml'
      const tipoFreteML = (prec as Record<string, unknown>).tipoFreteML as string ?? 'full'

      const calc = calcPrecificacaoComFreteML({
        custoProduto: novoCustoTotal ?? novoCustoCalc ?? 0,
        custoEmbalagem: prec.custoEmbalagem, custoFrete: prec.custoFrete,
        custoColeta: prec.custoColeta, comissaoPct: prec.comissaoPct,
        impostoPct: prec.impostoPct, precoAtual: prec.precoAtual,
        isML, tipoFreteML, pesoGramas: v.pesoGramas,
      })

      await db.precificacao.update({
        where: { id: prec.id },
        data: {
          custoFrete: calc.custoFrete, custoTotalCalc: calc.custoTotalCalc,
          precoMinimo: calc.precoMinimo, precoIdeal: calc.precoIdeal,
          precoMaximo: calc.precoMaximo, precoPromocional: calc.precoPromocional,
          lucroBruto: calc.lucroBruto, margemAtual: calc.margemAtual,
          statusMargem: calc.statusMargem,
        },
      })
    }
  }
}

export async function saveCompra(data: {
  dataCompra: string; skuPrincipal: string; nomeProduto: string; fornecedor: string
  quantidade: number; custoTotal: number; frete?: number; outrosCustos?: number
  precoVenda?: number | null; impostoPct?: number; fonte?: string
  numeroNF?: string; numeroPedido?: string
}) {
  const frete     = data.frete ?? 0
  const outros    = data.outrosCustos ?? 0
  const imposto   = data.impostoPct ?? 0.0829
  const custoUnit = round2(data.custoTotal / data.quantidade)

  const ultima = await db.compra.findFirst({
    where: { skuPrincipal: data.skuPrincipal },
    orderBy: { dataCompra: 'desc' },
  })

  let variacaoPct: number | null = null
  let statusVariacao: string | null = null
  if (ultima?.custoUnitario) {
    variacaoPct = (custoUnit - ultima.custoUnitario) / ultima.custoUnitario
    statusVariacao = Math.abs(variacaoPct) <= 0.05
      ? 'ESTAVEL ± 5%'
      : variacaoPct > 0 ? 'AUMENTOU > 5%' : 'DIMINUIU > 5%'
  }

  let margem: number | null = null
  let statusFinanceiro: string | null = null
  if (data.precoVenda && data.precoVenda > 0) {
    const receitaLiq = data.precoVenda * (1 - imposto)
    margem = (receitaLiq - custoUnit) / data.precoVenda
    statusFinanceiro = margem >= 0.25 ? 'Lucro' : margem >= 0 ? 'Atenção' : 'Prejuízo'
  } else {
    statusFinanceiro = 'Sem preço de venda'
  }

  await db.produto.upsert({
    where: { skuPrincipal: data.skuPrincipal },
    update: {
      custoPorKg: custoUnit, custoAtualizado: custoUnit,
      dataUltimaCompra: new Date(data.dataCompra),
      fornecedorPrincipal: data.fornecedor || undefined,
    },
    create: {
      skuPrincipal: data.skuPrincipal, nome: data.nomeProduto,
      categoria: 'Geral', unidadeCompra: 'kg',
      custoPorKg: custoUnit, custoAtualizado: custoUnit,
      dataUltimaCompra: new Date(data.dataCompra),
      fornecedorPrincipal: data.fornecedor || null,
      tipoPrecificacao: 'peso_proporcional', status: 'ativo',
    },
  })

  await recalcularVariacoesEPrecificacoes(data.skuPrincipal, custoUnit)

  const dataFinal = data.dataCompra.includes('T')
    ? new Date(data.dataCompra)
    : new Date(data.dataCompra + 'T12:00:00')

  return db.compra.create({
    data: {
      dataCompra: dataFinal, skuPrincipal: data.skuPrincipal,
      nomeProduto: data.nomeProduto, fornecedor: data.fornecedor,
      quantidade: data.quantidade, custoTotal: data.custoTotal,
      frete, outrosCustos: outros, custoUnitario: custoUnit,
      custoAnterior: ultima?.custoUnitario ?? null,
      variacaoPct, statusVariacao,
      precoVenda: data.precoVenda ?? null,
      impostoPct: imposto, margem, statusFinanceiro,
      fonte: data.fonte ?? 'manual',
      numeroNF: data.numeroNF || null,
      numeroPedido: data.numeroPedido || null,
    },
  })
}
```

- [ ] **Step 4: Reescrever `POST /api/compras` para múltiplos itens com rateio de frete**

Substituir `src/app/api/compras/route.ts` inteiro por:

```ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { round2 } from '@/lib/calculos'
import { saveCompra } from '@/lib/saveCompra'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q          = searchParams.get('q')
  const fornecedor = searchParams.get('fornecedor')
  const status     = searchParams.get('status')
  const dataInicio = searchParams.get('dataInicio')
  const dataFim    = searchParams.get('dataFim')

  const where: Record<string, unknown> = {}
  if (q) where.OR = [{ skuPrincipal: { contains: q } }, { nomeProduto: { contains: q } }]
  if (fornecedor) where.fornecedor = { contains: fornecedor }
  if (status) where.statusVariacao = status
  if (dataInicio || dataFim) {
    where.dataCompra = {}
    if (dataInicio) (where.dataCompra as Record<string,unknown>).gte = new Date(dataInicio)
    if (dataFim) {
      const fim = new Date(dataFim)
      fim.setHours(23, 59, 59, 999)
      ;(where.dataCompra as Record<string,unknown>).lte = fim
    }
  }

  const compras = await db.compra.findMany({
    where,
    include: { produto: { select: { nome: true, categoria: true } } },
    orderBy: { dataCompra: 'desc' },
    take: 500,
  })
  return NextResponse.json(compras)
}

interface ItemCompra {
  skuPrincipal: string; nomeProduto: string; quantidade: string | number; custoTotal: string | number
  outrosCustos?: string | number; precoVenda?: string | number
}

export async function POST(req: NextRequest) {
  const b = await req.json()
  const itens: ItemCompra[] = b.itens ?? []

  if (!b.fornecedor) return NextResponse.json({ error: 'Fornecedor é obrigatório' }, { status: 400 })
  if (!itens.length) return NextResponse.json({ error: 'Adicione ao menos um produto' }, { status: 400 })
  for (const it of itens) {
    if (!it.skuPrincipal || !it.nomeProduto || !it.quantidade || !it.custoTotal)
      return NextResponse.json({ error: 'SKU, produto, quantidade e custo total são obrigatórios em cada item' }, { status: 400 })
  }

  const freteTotal = parseFloat(b.frete ?? 0)
  const somaCusto  = itens.reduce((s, it) => s + parseFloat(String(it.custoTotal)), 0)

  const compras = []
  for (const it of itens) {
    const custoItem = parseFloat(String(it.custoTotal))
    const freteItem = freteTotal > 0 && somaCusto > 0 ? round2(freteTotal * (custoItem / somaCusto)) : 0
    const compra = await saveCompra({
      dataCompra: b.dataCompra || new Date().toISOString(),
      skuPrincipal: it.skuPrincipal, nomeProduto: it.nomeProduto,
      fornecedor: b.fornecedor,
      quantidade: parseFloat(String(it.quantidade)), custoTotal: custoItem,
      frete: freteItem, outrosCustos: parseFloat(String(it.outrosCustos ?? 0)),
      precoVenda: it.precoVenda ? parseFloat(String(it.precoVenda)) : null,
      numeroNF: b.numeroNF || undefined, numeroPedido: b.numeroPedido || undefined,
    })
    compras.push(compra)
  }

  return NextResponse.json(compras, { status: 201 })
}
```

- [ ] **Step 5: Reescrever o modal "Registrar compra" para múltiplos produtos**

Em `src/app/compras/page.tsx`:

1. Trocar a interface `Compra` para incluir os novos campos, logo após `fonte: string`:
```ts
interface Compra {
  id: string; dataCompra: string; skuPrincipal: string; nomeProduto: string; fornecedor: string
  quantidade: number; custoTotal: number; custoUnitario: number; custoAnterior: number | null
  variacaoPct: number | null; statusVariacao: string | null; precoVenda: number | null
  margem: number | null; statusFinanceiro: string | null; fonte: string
  numeroNF: string | null; numeroPedido: string | null
}
```

2. Substituir `const emptyF = {...}` por dois novos consts, no mesmo lugar:
```ts
const emptyItem = { skuPrincipal: '', nomeProduto: '', quantidade: '', custoTotal: '' }
const emptyFormCompra = { dataCompra: new Date().toISOString().slice(0, 10), fornecedor: '', numeroNF: '', numeroPedido: '', frete: '0' }
```

3. Trocar o state `const [form, setForm] = useState(emptyF)` (linha 102) por:
```ts
  const [formCompra, setFormCompra] = useState(emptyFormCompra)
  const [itensCompra, setItensCompra] = useState([{ ...emptyItem }])
```

4. Trocar o state de SKU lookup (linha 109, `const [skuLookup, setSkuLookup] = useState...`) para ser indexado por linha:
```ts
  const [skuLookups, setSkuLookups] = useState<Record<number, { nome?: string; fornecedor?: string; custo?: number } | null>>({})
  const [skuLoadingIdx, setSkuLoadingIdx] = useState<number | null>(null)
```

5. Substituir a função `handleSkuChange` (linhas 160-182) por:
```ts
  const handleItemSkuChange = (idx: number, val: string) => {
    setItensCompra(prev => prev.map((it, i) => i === idx ? { ...it, skuPrincipal: val, nomeProduto: '' } : it))
    setSkuLookups(prev => ({ ...prev, [idx]: null }))
    clearTimeout(skuTimer.current)
    if (val.length < 2) return
    setSkuLoadingIdx(idx)
    skuTimer.current = setTimeout(async () => {
      const r = await fetch(`/api/compras/sku?sku=${encodeURIComponent(val)}`)
      const d = await r.json()
      setSkuLoadingIdx(null)
      if (d?.produto || d?.ultimaCompra) {
        const nome = d.produto?.nome || d.ultimaCompra?.nomeProduto || ''
        const forn = d.produto?.fornecedorPrincipal || d.ultimaCompra?.fornecedor || ''
        const custo = d.produto?.custoPorKg || d.ultimaCompra?.custoUnitario || null
        setSkuLookups(prev => ({ ...prev, [idx]: { nome, fornecedor: forn, custo } }))
        setItensCompra(prev => prev.map((it, i) => i === idx ? { ...it, nomeProduto: nome } : it))
        setFormCompra(p => p.fornecedor ? p : { ...p, fornecedor: forn || p.fornecedor })
      }
    }, 400)
  }

  const addItemRow = () => setItensCompra(prev => [...prev, { ...emptyItem }])
  const removeItemRow = (idx: number) => {
    setItensCompra(prev => prev.filter((_, i) => i !== idx))
    setSkuLookups(prev => { const n = { ...prev }; delete n[idx]; return n })
  }

  const somaCustoItens = itensCompra.reduce((s, it) => s + (parseFloat(it.custoTotal) || 0), 0)
  const freteRateio = (custoTotalItem: string) => {
    const freteTotal = parseFloat(formCompra.frete) || 0
    const c = parseFloat(custoTotalItem) || 0
    if (freteTotal <= 0 || somaCustoItens <= 0) return 0
    return Math.round(freteTotal * (c / somaCustoItens) * 100) / 100
  }
```

6. Substituir a função `save` (linhas 185-196) por:
```ts
  const save = async () => {
    setSaving(true); setError('')
    if (!formCompra.fornecedor) { setError('Fornecedor é obrigatório'); setSaving(false); return }
    const itensValidos = itensCompra.filter(it => it.skuPrincipal && it.nomeProduto && it.quantidade && it.custoTotal)
    if (!itensValidos.length) { setError('Adicione ao menos um produto com SKU, quantidade e custo total'); setSaving(false); return }

    const r = await fetch('/api/compras', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...formCompra, itens: itensValidos }),
    })
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'Erro'); setSaving(false); return }
    setModal(false)
    setFormCompra(emptyFormCompra)
    setItensCompra([{ ...emptyItem }])
    setSkuLookups({})
    load(); setSaving(false)
  }
```

7. Trocar a função `f` (linha 208-209, `const f = (k: string) => ...`) — ela ficava sobre `form`, agora precisa operar sobre `formCompra`:
```ts
  const f  = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setFormCompra(p => ({ ...p, [k]: e.target.value }))
```

8. Remover a linha `const custoUnit = form.quantidade && form.custoTotal ? ... : null` (linhas 213-215) — não é mais usada (cada item tem seu próprio cálculo, mostrado por linha no modal).

9. No botão "Registrar compra" do header (linha ~386), trocar o reset:
```tsx
          <button onClick={() => { setFormCompra(emptyFormCompra); setItensCompra([{ ...emptyItem }]); setSkuLookups({}); setError(''); setModal(true) }} className="btn-primary">
            <Plus size={14} /> Registrar compra
          </button>
```

10. Substituir o `<Modal title="Registrar compra" ...>` inteiro (linhas 1268-1341) por:
```tsx
      {/* ── MODAL REGISTRAR COMPRA ── */}
      <Modal title="Registrar compra" open={modal} onClose={() => setModal(false)} wide>
        <div className="space-y-3">
          {error && <Alert type="error">{error}</Alert>}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="lbl">Data *</label>
              <input className="inp" type="date" value={formCompra.dataCompra} onChange={f('dataCompra')} />
            </div>
            <div>
              <label className="lbl">Fornecedor *</label>
              <input className="inp" list="forn-list" value={formCompra.fornecedor}
                onChange={f('fornecedor')} placeholder="Selecione ou digite" />
              <datalist id="forn-list">
                {fornecedores.map(fn => <option key={fn.id} value={fn.nome} />)}
              </datalist>
            </div>
            <div>
              <label className="lbl">Nº NF ou Pedido</label>
              <input className="inp" value={formCompra.numeroNF} onChange={f('numeroNF')} placeholder="Ex: 12345" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="lbl mb-0">Produtos</label>
              <button onClick={addItemRow} className="btn-ghost text-xs"><Plus size={12} /> Adicionar produto</button>
            </div>
            {itensCompra.map((item, idx) => {
              const lookup = skuLookups[idx]
              const rateio = freteRateio(item.custoTotal)
              return (
                <div key={idx} className="border border-gray-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <div className="relative">
                        <label className="lbl">SKU Principal *</label>
                        <input className="inp pr-7" value={item.skuPrincipal}
                          onChange={e => handleItemSkuChange(idx, e.target.value)} placeholder="Ex: 242" />
                        {skuLoadingIdx === idx && <div className="absolute right-2 top-7"><Spinner size={14} /></div>}
                      </div>
                      <div>
                        <label className="lbl">Nome do produto *</label>
                        <input className="inp" value={item.nomeProduto}
                          onChange={e => setItensCompra(prev => prev.map((it, i) => i === idx ? { ...it, nomeProduto: e.target.value } : it))}
                          placeholder={lookup ? '' : 'Digite o nome do produto'} />
                      </div>
                    </div>
                    {itensCompra.length > 1 && (
                      <button onClick={() => removeItemRow(idx)} className="mt-6 text-gray-300 hover:text-red-600">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>

                  {lookup && (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5 text-xs text-indigo-700">
                      ✓ {lookup.nome} {lookup.custo && <span className="text-indigo-500">· último custo: {num(lookup.custo)}</span>}
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="lbl">Quantidade (kg/un) *</label>
                      <input className="inp" type="number" step="0.01" value={item.quantidade}
                        onChange={e => setItensCompra(prev => prev.map((it, i) => i === idx ? { ...it, quantidade: e.target.value } : it))} />
                    </div>
                    <div>
                      <label className="lbl">Custo total R$ *</label>
                      <input className="inp" type="number" step="0.01" value={item.custoTotal}
                        onChange={e => setItensCompra(prev => prev.map((it, i) => i === idx ? { ...it, custoTotal: e.target.value } : it))} />
                    </div>
                    <div>
                      <label className="lbl">Frete rateado</label>
                      <div className="inp bg-gray-50 text-gray-500">{brl(rateio)}</div>
                    </div>
                  </div>
                  {item.quantidade && item.custoTotal && parseFloat(item.quantidade) > 0 && (
                    <p className="text-xs text-indigo-600">
                      Custo unitário: <strong>{num(parseFloat(item.custoTotal) / parseFloat(item.quantidade))}</strong>
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          <div>
            <label className="lbl">Frete total da compra R$ (dividido proporcionalmente entre os produtos acima)</label>
            <input className="inp" type="number" step="0.01" value={formCompra.frete} onChange={f('frete')} />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button className="btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? <Spinner size={13} /> : null} Registrar {itensCompra.length > 1 ? `(${itensCompra.length} produtos)` : ''}
            </button>
          </div>
        </div>
      </Modal>
```

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros em `compras/page.tsx`, `saveCompra.ts` ou `api/compras/route.ts`.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma src/lib/saveCompra.ts src/app/api/compras/route.ts src/app/compras/page.tsx
git commit -m "Compra aceita multiplos produtos por NF/Pedido com rateio automatico de frete"
```

---

### Task 2: Editar compra no histórico

**Files:**
- Create: `src/app/api/compras/[id]/route.ts` (adicionar `PATCH` ao arquivo existente, que hoje só tem `DELETE`)
- Modify: `src/app/compras/page.tsx`

**Interfaces:**
- Consumes: `recalcularVariacoesEPrecificacoes` de `src/lib/saveCompra.ts` (Task 1).
- Produces: `PATCH /api/compras/[id]` aceita qualquer subconjunto de `{ dataCompra, nomeProduto, fornecedor, quantidade, custoTotal, frete, outrosCustos, precoVenda, numeroNF, numeroPedido }`, retorna a `Compra` atualizada.

- [ ] **Step 1: Adicionar PATCH à rota existente**

Em `src/app/api/compras/[id]/route.ts`, adicionar ao lado do `DELETE` já existente:

```ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { round2 } from '@/lib/calculos'
import { recalcularVariacoesEPrecificacoes } from '@/lib/saveCompra'

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await db.compra.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json()
  const existing = await db.compra.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Compra não encontrada' }, { status: 404 })

  const dataCompra = b.dataCompra
    ? (String(b.dataCompra).includes('T') ? new Date(b.dataCompra) : new Date(b.dataCompra + 'T12:00:00'))
    : existing.dataCompra
  const quantidade = b.quantidade != null ? parseFloat(b.quantidade) : existing.quantidade
  const custoTotal = b.custoTotal != null ? parseFloat(b.custoTotal) : existing.custoTotal
  const custoUnit  = round2(custoTotal / quantidade)
  const precoVenda = b.precoVenda !== undefined ? (b.precoVenda ? parseFloat(b.precoVenda) : null) : existing.precoVenda

  const updated = await db.compra.update({
    where: { id: params.id },
    data: {
      dataCompra,
      nomeProduto:  b.nomeProduto ?? existing.nomeProduto,
      fornecedor:   b.fornecedor ?? existing.fornecedor,
      quantidade, custoTotal, custoUnitario: custoUnit,
      frete:        b.frete != null ? parseFloat(b.frete) : existing.frete,
      outrosCustos: b.outrosCustos != null ? parseFloat(b.outrosCustos) : existing.outrosCustos,
      numeroNF:     b.numeroNF !== undefined ? (b.numeroNF || null) : existing.numeroNF,
      numeroPedido: b.numeroPedido !== undefined ? (b.numeroPedido || null) : existing.numeroPedido,
      precoVenda,
    },
  })

  // Só recalcula produto/variações/precificações se esta for a compra mais recente do SKU
  const maisRecente = await db.compra.findFirst({
    where: { skuPrincipal: existing.skuPrincipal },
    orderBy: { dataCompra: 'desc' },
  })
  if (maisRecente?.id === params.id) {
    await db.produto.update({
      where: { skuPrincipal: existing.skuPrincipal },
      data: { custoPorKg: custoUnit, custoAtualizado: custoUnit, dataUltimaCompra: dataCompra },
    })
    await recalcularVariacoesEPrecificacoes(existing.skuPrincipal, custoUnit)
  }

  return NextResponse.json(updated)
}
```

- [ ] **Step 2: Adicionar ícone de editar e modal no histórico**

Em `src/app/compras/page.tsx`:

1. Adicionar `Pencil` ao import de ícones (linha 3).

2. Adicionar states para o modal de edição, próximo aos states de `modal`/`form`:
```ts
  const [editModal, setEditModal] = useState<Compra | null>(null)
  const [editForm, setEditForm]   = useState(emptyFormCompra)
  const [editItem, setEditItem]   = useState({ quantidade: '', custoTotal: '', frete: '', outrosCustos: '' })
```

3. Adicionar as funções de abrir/salvar edição, próximas a `save`:
```ts
  const openEditCompra = (c: Compra) => {
    setEditModal(c)
    setEditForm({
      dataCompra: c.dataCompra.slice(0, 10), fornecedor: c.fornecedor,
      numeroNF: c.numeroNF ?? '', numeroPedido: c.numeroPedido ?? '', frete: String(c.frete ?? 0),
    })
    setEditItem({ quantidade: String(c.quantidade), custoTotal: String(c.custoTotal), frete: '', outrosCustos: '' })
    setError('')
  }

  const saveEditCompra = async () => {
    if (!editModal) return
    setSaving(true); setError('')
    const r = await fetch(`/api/compras/${editModal.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dataCompra: editForm.dataCompra, fornecedor: editForm.fornecedor,
        numeroNF: editForm.numeroNF, numeroPedido: editForm.numeroPedido,
        quantidade: editItem.quantidade, custoTotal: editItem.custoTotal,
      }),
    })
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'Erro ao salvar'); setSaving(false); return }
    setEditModal(null); load(); setSaving(false)
  }
```

4. Na tabela do histórico (linhas 519-558), adicionar uma coluna de ações. Trocar o cabeçalho:
```tsx
                <th className="th-r">Margem</th><th className="th text-center">Status</th><th className="th w-8"></th>
              </tr></thead>
```
E a última célula de cada linha (depois de `<td className="td text-center"><StatusBadge status={c.statusFinanceiro} /></td>`):
```tsx
                    <td className="td text-center"><StatusBadge status={c.statusFinanceiro} /></td>
                    <td className="td">
                      <button onClick={() => openEditCompra(c)} className="text-gray-300 hover:text-indigo-600 transition-colors">
                        <Pencil size={13} />
                      </button>
                    </td>
```

5. Adicionar o modal de edição, logo depois do `</Modal>` que fecha "Registrar compra":
```tsx
      {/* ── MODAL EDITAR COMPRA ── */}
      <Modal title="Editar compra" open={!!editModal} onClose={() => setEditModal(null)}>
        {editModal && (
          <div className="space-y-3">
            {error && <Alert type="error">{error}</Alert>}
            <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-500">
              {editModal.skuPrincipal} — {editModal.nomeProduto}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="lbl">Data *</label>
                <input className="inp" type="date" value={editForm.dataCompra}
                  onChange={e => setEditForm(p => ({ ...p, dataCompra: e.target.value }))} />
              </div>
              <div>
                <label className="lbl">Fornecedor</label>
                <input className="inp" list="forn-list" value={editForm.fornecedor}
                  onChange={e => setEditForm(p => ({ ...p, fornecedor: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="lbl">Nº NF ou Pedido</label>
              <input className="inp" value={editForm.numeroNF}
                onChange={e => setEditForm(p => ({ ...p, numeroNF: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="lbl">Quantidade *</label>
                <input className="inp" type="number" step="0.01" value={editItem.quantidade}
                  onChange={e => setEditItem(p => ({ ...p, quantidade: e.target.value }))} />
              </div>
              <div>
                <label className="lbl">Custo total R$ *</label>
                <input className="inp" type="number" step="0.01" value={editItem.custoTotal}
                  onChange={e => setEditItem(p => ({ ...p, custoTotal: e.target.value }))} />
              </div>
            </div>
            {editItem.quantidade && editItem.custoTotal && parseFloat(editItem.quantidade) > 0 && (
              <p className="text-xs text-indigo-600">
                Novo custo unitário: <strong>{num(parseFloat(editItem.custoTotal) / parseFloat(editItem.quantidade))}</strong>
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={() => setEditModal(null)}>Cancelar</button>
              <button className="btn-primary" onClick={saveEditCompra} disabled={saving}>
                {saving ? <Spinner size={13} /> : null} Salvar
              </button>
            </div>
          </div>
        )}
      </Modal>
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/compras/[id]/route.ts src/app/compras/page.tsx
git commit -m "Permite editar compras ja lancadas no historico"
```

---

### Task 3: Model Lote no schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Adicionar o model Lote**

Em `prisma/schema.prisma`, adicionar depois do model `Compra` (e confirmar que a relação `lotes Lote[]` já foi adicionada em `Compra` na Task 1 — se não foi, adicionar agora):

```prisma
// ─── LOTES (rastreabilidade / vigilância sanitária) ───────────
model Lote {
  id            String    @id @default(cuid())
  compraId      String
  compra        Compra    @relation(fields: [compraId], references: [id], onDelete: Cascade)
  numeroLote    String
  geradoAuto    Boolean   @default(false)
  quantidade    Float
  dataValidade  DateTime
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([numeroLote])
  @@index([compraId])
}
```

- [ ] **Step 2: Regenerar o Prisma Client**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client` sem erros (agora que `Lote` existe, a referência `lotes Lote[]` em `Compra` resolve corretamente).

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "Adiciona model Lote (rastreabilidade de compras)"
```

---

### Task 4: API de Lotes (criar, listar, buscar, geração automática de código)

**Files:**
- Create: `src/app/api/lotes/route.ts`
- Create: `src/app/api/lotes/[id]/route.ts`

**Interfaces:**
- Produces: `GET /api/lotes?q=...` → lista de lotes (com `compra` incluída), ordenada por validade crescente.
- Produces: `GET /api/lotes?vencendo=1` → só lotes vencidos ou vencendo em até 30 dias.
- Produces: `POST /api/lotes` aceita `{ compraId, numeroLote?, quantidade, dataValidade }`, gera código automático se `numeroLote` vier vazio.
- Produces: `DELETE /api/lotes/[id]`.

- [ ] **Step 1: Criar a rota de listagem/criação**

Criar `src/app/api/lotes/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  const vencendo = searchParams.get('vencendo')

  const where: Record<string, unknown> = {}
  if (q) where.numeroLote = { contains: q }
  if (vencendo) {
    const limite = new Date()
    limite.setDate(limite.getDate() + 30)
    where.dataValidade = { lte: limite }
  }

  const lotes = await db.lote.findMany({
    where,
    include: { compra: { select: { skuPrincipal: true, nomeProduto: true, fornecedor: true, dataCompra: true, numeroNF: true, numeroPedido: true } } },
    orderBy: { dataValidade: 'asc' },
    take: 500,
  })
  return NextResponse.json(lotes)
}

export async function POST(req: NextRequest) {
  const b = await req.json()
  if (!b.compraId) return NextResponse.json({ error: 'Compra é obrigatória' }, { status: 400 })
  if (!b.quantidade) return NextResponse.json({ error: 'Quantidade é obrigatória' }, { status: 400 })
  if (!b.dataValidade) return NextResponse.json({ error: 'Data de validade é obrigatória' }, { status: 400 })

  const compra = await db.compra.findUnique({ where: { id: b.compraId } })
  if (!compra) return NextResponse.json({ error: 'Compra não encontrada' }, { status: 404 })

  let numeroLote = String(b.numeroLote ?? '').trim()
  let geradoAuto = false

  if (!numeroLote) {
    geradoAuto = true
    const stamp = compra.dataCompra.toISOString().slice(0, 10).replace(/-/g, '')
    const base = `${stamp}-${compra.skuPrincipal}`
    let candidato = base
    let sufixo = 1
    while (await db.lote.findFirst({ where: { numeroLote: candidato } })) {
      sufixo += 1
      candidato = `${base}-${sufixo}`
    }
    numeroLote = candidato
  }

  const lote = await db.lote.create({
    data: {
      compraId: b.compraId,
      numeroLote, geradoAuto,
      quantidade: parseFloat(b.quantidade),
      dataValidade: new Date(String(b.dataValidade).includes('T') ? b.dataValidade : b.dataValidade + 'T12:00:00'),
    },
    include: { compra: { select: { skuPrincipal: true, nomeProduto: true, fornecedor: true, dataCompra: true, numeroNF: true, numeroPedido: true } } },
  })
  return NextResponse.json(lote, { status: 201 })
}
```

- [ ] **Step 2: Criar a rota de item individual**

Criar `src/app/api/lotes/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const lote = await db.lote.findUnique({
    where: { id: params.id },
    include: { compra: { select: { skuPrincipal: true, nomeProduto: true, fornecedor: true, dataCompra: true, numeroNF: true, numeroPedido: true } } },
  })
  if (!lote) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(lote)
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await db.lote.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/lotes
git commit -m "Adiciona API de lotes (criar, listar, buscar, geracao automatica de codigo)"
```

---

### Task 5: Botão "Lançar lote" no histórico de Compras

**Files:**
- Modify: `src/app/compras/page.tsx`

**Interfaces:**
- Consumes: `POST /api/lotes` (Task 4).

- [ ] **Step 1: Adicionar state e função do modal de lote**

Adicionar `Tag` ao import de ícones em `src/app/compras/page.tsx` (linha 3) — confirmado que esse arquivo ainda não importa `Tag`, sem colisão:
```ts
import { Plus, Search, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Minus, Users, BarChart2, ShoppingCart, Star, Calendar, UserPlus, Package, Trash2, Building2, Download, Check, X, Upload, FileSpreadsheet, Tag } from 'lucide-react'
```
Adicionar os states, próximos aos de `editModal`:

```ts
  const [loteModal, setLoteModal] = useState<Compra | null>(null)
  const [loteForm, setLoteForm]   = useState({ numeroLote: '', quantidade: '', dataValidade: '' })
  const [loteError, setLoteError] = useState('')
  const [loteSaving, setLoteSaving] = useState(false)
```

Adicionar as funções, próximas a `saveEditCompra`:
```ts
  const openLote = (c: Compra) => {
    setLoteModal(c)
    setLoteForm({ numeroLote: '', quantidade: String(c.quantidade), dataValidade: '' })
    setLoteError('')
  }

  const saveLote = async () => {
    if (!loteModal) return
    if (!loteForm.dataValidade) { setLoteError('Data de validade é obrigatória'); return }
    setLoteSaving(true); setLoteError('')
    const r = await fetch('/api/lotes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ compraId: loteModal.id, numeroLote: loteForm.numeroLote, quantidade: loteForm.quantidade, dataValidade: loteForm.dataValidade }),
    })
    if (!r.ok) { const d = await r.json(); setLoteError(d.error ?? 'Erro ao salvar lote'); setLoteSaving(false); return }
    setLoteModal(null); setLoteSaving(false)
  }
```

- [ ] **Step 2: Adicionar o botão na tabela do histórico**

Na mesma célula de ações adicionada na Task 2 (Step 2.4), acrescentar o botão de lote ao lado do de editar:

```tsx
                    <td className="td flex items-center gap-2">
                      <button onClick={() => openEditCompra(c)} className="text-gray-300 hover:text-indigo-600 transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => openLote(c)} className="text-gray-300 hover:text-emerald-600 transition-colors" title="Lançar lote">
                        <Tag size={13} />
                      </button>
                    </td>
```

(isso substitui a célula de ações mais simples criada na Task 2 — se as tasks forem executadas em ordem, editar essa célula em vez de duplicá-la)

- [ ] **Step 3: Adicionar o modal de lançar lote**

Adicionar depois do modal "Editar compra":

```tsx
      {/* ── MODAL LANÇAR LOTE ── */}
      <Modal title="Lançar lote" open={!!loteModal} onClose={() => setLoteModal(null)}>
        {loteModal && (
          <div className="space-y-3">
            {loteError && <Alert type="error">{loteError}</Alert>}
            <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-500 space-y-0.5">
              <div><strong className="text-gray-700">{loteModal.nomeProduto}</strong> — SKU {loteModal.skuPrincipal}</div>
              <div>Fornecedor: {loteModal.fornecedor || '—'}</div>
              <div>Data da compra: {dt(loteModal.dataCompra)}</div>
              <div>NF/Pedido: {loteModal.numeroNF || loteModal.numeroPedido || '—'}</div>
            </div>
            <div>
              <label className="lbl">Número do lote (deixe em branco para gerar automaticamente)</label>
              <input className="inp" value={loteForm.numeroLote}
                onChange={e => setLoteForm(p => ({ ...p, numeroLote: e.target.value }))}
                placeholder="Se vazio, gera AAAAMMDD-SKU" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="lbl">Quantidade coberta por esse lote</label>
                <input className="inp" type="number" step="0.01" value={loteForm.quantidade}
                  onChange={e => setLoteForm(p => ({ ...p, quantidade: e.target.value }))} />
              </div>
              <div>
                <label className="lbl">Data de validade *</label>
                <input className="inp" type="date" value={loteForm.dataValidade}
                  onChange={e => setLoteForm(p => ({ ...p, dataValidade: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={() => setLoteModal(null)}>Cancelar</button>
              <button className="btn-primary" onClick={saveLote} disabled={loteSaving}>
                {loteSaving ? <Spinner size={13} /> : null} Salvar lote
              </button>
            </div>
          </div>
        )}
      </Modal>
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros.

Verificação manual (depois da Task 9, com banco migrado): `npm run dev`, ir em Compras → Histórico, clicar no ícone de lote de uma compra, deixar número do lote em branco, preencher validade, salvar. Conferir que não dá erro.

- [ ] **Step 5: Commit**

```bash
git add src/app/compras/page.tsx
git commit -m "Adiciona botao e modal de lancar lote no historico de compras"
```

---

### Task 6: Aba "Lotes" dedicada (lista, busca, alerta de vencimento)

**Files:**
- Create: `src/app/lotes/page.tsx`
- Modify: `src/components/ui/Sidebar.tsx`

**Interfaces:**
- Consumes: `GET /api/lotes?q=...` (Task 4).

- [ ] **Step 1: Criar a página**

Criar `src/app/lotes/page.tsx`:

```tsx
'use client'
import { useEffect, useState, useCallback } from 'react'
import { Search, RefreshCw, Tag, Printer } from 'lucide-react'
import { Loading, Empty } from '@/components/ui'
import Link from 'next/link'

const dt = (d: string) => new Date(d).toLocaleDateString('pt-BR')

interface LoteItem {
  id: string; numeroLote: string; geradoAuto: boolean; quantidade: number; dataValidade: string
  compra: { skuPrincipal: string; nomeProduto: string; fornecedor: string; dataCompra: string; numeroNF: string | null; numeroPedido: string | null }
}

function statusValidade(dataValidade: string): 'vencido' | 'vencendo' | 'ok' {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const val = new Date(dataValidade)
  const dias = Math.floor((val.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
  if (dias < 0) return 'vencido'
  if (dias <= 30) return 'vencendo'
  return 'ok'
}

export default function LotesPage() {
  const [lotes, setLotes] = useState<LoteItem[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    const r = await fetch('/api/lotes?' + params)
    setLotes(await r.json())
    setLoading(false)
  }, [q])

  useEffect(() => { load() }, [load])

  const rowCls: Record<string, string> = { vencido: 'bg-red-50', vencendo: 'bg-amber-50/60', ok: '' }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2"><Tag size={20} className="text-indigo-500" /> Lotes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Rastreabilidade de lote e validade para vigilância sanitária</p>
        </div>
      </div>

      <div className="card p-2.5 flex items-center gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-40 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
          <Search size={13} className="text-gray-400" />
          <input className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400"
            placeholder="Buscar por número do lote…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <button onClick={load} className="btn-icon btn-ghost"><RefreshCw size={13} /></button>
      </div>

      <div className="card-tight overflow-auto">
        <table className="w-full min-w-[800px]">
          <thead className="tbl-head">
            <tr>
              <th className="th">Produto</th>
              <th className="th">Lote</th>
              <th className="th">Fornecedor</th>
              <th className="th-r">Qtd</th>
              <th className="th">Validade</th>
              <th className="th">Compra</th>
              <th className="th w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && <Loading />}
            {!loading && !lotes.length && <Empty msg="Nenhum lote lançado ainda" />}
            {lotes.map(l => {
              const status = statusValidade(l.dataValidade)
              return (
                <tr key={l.id} className={`tr-row ${rowCls[status]}`}>
                  <td className="td">
                    <div className="text-sm font-medium text-gray-800">{l.compra.nomeProduto}</div>
                    <div className="text-xs text-gray-400 font-mono">{l.compra.skuPrincipal}</div>
                  </td>
                  <td className="td">
                    <span className="font-mono text-xs">{l.numeroLote}</span>
                    {l.geradoAuto && <span className="ml-1 text-[10px] text-gray-400">(gerado)</span>}
                  </td>
                  <td className="td text-xs text-gray-600">{l.compra.fornecedor || '—'}</td>
                  <td className="td-r text-xs">{l.quantidade}</td>
                  <td className="td">
                    <span className={`text-xs font-semibold ${status === 'vencido' ? 'text-red-700' : status === 'vencendo' ? 'text-amber-700' : 'text-gray-600'}`}>
                      {dt(l.dataValidade)}
                    </span>
                  </td>
                  <td className="td text-xs text-gray-400">
                    {dt(l.compra.dataCompra)} {(l.compra.numeroNF || l.compra.numeroPedido) && `· NF ${l.compra.numeroNF || l.compra.numeroPedido}`}
                  </td>
                  <td className="td">
                    <Link href={`/lotes/${l.id}/etiqueta`} target="_blank" className="text-gray-300 hover:text-indigo-600 transition-colors">
                      <Printer size={14} />
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Adicionar o link no menu**

Em `src/components/ui/Sidebar.tsx`, `Tag` já está importado (usado pelo link "Precificação") — não precisa adicionar de novo. Adicionar o link na seção "Operacional", depois de `/compras`:
```ts
  { href: '/compras',        label: 'Compras',         icon: ShoppingCart },
  { href: '/lotes',          label: 'Lotes',           icon: Tag },
  { href: '/importar',       label: 'Importar XLSX',   icon: Upload },
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/lotes/page.tsx src/components/ui/Sidebar.tsx
git commit -m "Adiciona aba dedicada de Lotes com busca e alerta visual de vencimento"
```

---

### Task 7: Etiqueta térmica

**Files:**
- Create: `src/app/lotes/[id]/etiqueta/page.tsx`

**Interfaces:**
- Consumes: `GET /api/lotes/[id]` (Task 4).

- [ ] **Step 1: Criar a página de etiqueta**

Criar `src/app/lotes/[id]/etiqueta/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'

const dt = (d: string) => new Date(d).toLocaleDateString('pt-BR')

interface LoteDetalhe {
  numeroLote: string; dataValidade: string
  compra: { nomeProduto: string; fornecedor: string; dataCompra: string }
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
      `}</style>
      <div className="etiqueta">
        <div className="produto">{lote.compra.nomeProduto}</div>
        <div className="linha">Fornecedor: {lote.compra.fornecedor || '—'}</div>
        <div className="linha">Compra: {dt(lote.compra.dataCompra)}</div>
        <div className="linha">Validade: {dt(lote.dataValidade)}</div>
        <div className="lote">Lote: {lote.numeroLote}</div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros.

Verificação manual (depois da Task 9): abrir `/lotes`, clicar no ícone de impressora de um lote, confirmar que abre uma aba nova já formatada no tamanho 8x8cm e que o diálogo de impressão do navegador abre automaticamente.

- [ ] **Step 3: Commit**

```bash
git add src/app/lotes/[id]/etiqueta
git commit -m "Adiciona etiqueta termica imprimivel por lote (8x8cm, formato ajustavel)"
```

---

### Task 8: Alerta de lotes vencendo no Dashboard

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `GET /api/lotes?vencendo=1` (Task 4).

- [ ] **Step 1: Buscar lotes vencendo ao carregar o Dashboard**

Em `src/app/page.tsx`, adicionar novo state logo abaixo de `const [loading, setLoading] = useState(true)`:
```ts
  const [lotesVencendo, setLotesVencendo] = useState<number | null>(null)
```

Na função `load`, adicionar a busca em paralelo:
```ts
  const load = useCallback(async () => {
    setLoading(true)
    const [r, rLotes] = await Promise.all([
      fetch('/api/dashboard'),
      fetch('/api/lotes?vencendo=1'),
    ])
    setData(await r.json())
    const lotes = await rLotes.json()
    setLotesVencendo(Array.isArray(lotes) ? lotes.length : 0)
    setLoading(false)
  }, [])
```

- [ ] **Step 2: Mostrar o alerta**

Adicionar o banner logo depois do header (antes do bloco `{/* Métricas */}`):
```tsx
      {!!lotesVencendo && (
        <Link href="/lotes" className="block bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 hover:bg-amber-100 transition-colors">
          <strong>{lotesVencendo}</strong> {lotesVencendo === 1 ? 'lote está vencido ou vence' : 'lotes estão vencidos ou vencem'} nos próximos 30 dias — clique para ver.
        </Link>
      )}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "Adiciona alerta de lotes vencendo no Dashboard"
```

---

### Task 9: Aplicar mudanças de schema no banco de produção

**Pré-requisito:** Tasks 1 e 3 concluídas (campos `numeroNF`/`numeroPedido` em `Compra` e model `Lote` já no schema).

- [ ] **Step 1: Backup manual**

Run: `npm run db:backup`
Expected: saída confirmando contagem de todas as tabelas, incluindo `compra` com o número real de registros.

- [ ] **Step 2: Revisar o diff do schema**

Run: `git log -p -- prisma/schema.prisma` (desde o início deste plano) e conferir visualmente: `Compra` ganhou `numeroNF`, `numeroPedido`, `lotes Lote[]`; novo model `Lote` inteiro. Nenhuma remoção de campo/model deve aparecer neste plano (diferente do plano de Limpeza, este só adiciona).

- [ ] **Step 3: Aplicar no banco**

Run: `npx prisma db push`
Expected: `Your database is now in sync with your Prisma schema.` Como este plano só adiciona campos opcionais e uma tabela nova, não deve pedir confirmação de perda de dados — se pedir, **parar e investigar antes de confirmar**.

- [ ] **Step 4: Verificar em runtime**

Rodar `npm run dev`:
1. Ir em Compras → "Registrar compra", adicionar 2 produtos na mesma compra com um frete total, confirmar que salva sem erro e que os dois aparecem no Histórico com o mesmo NF.
2. No Histórico, clicar em editar uma compra, mudar a quantidade, salvar, confirmar que não dá erro.
3. No Histórico, clicar no ícone de lote de uma compra, deixar o número em branco, preencher validade, salvar — confirmar que gera um código tipo `AAAAMMDD-SKU`.
4. Ir em `/lotes`, confirmar que o lote lançado aparece na lista.
5. Clicar no ícone de impressora do lote, confirmar que abre a etiqueta formatada.
6. Ir no Dashboard (`/`), lançar (via Prisma Studio ou pelo próprio fluxo) um lote com validade próxima (ex: daqui a 10 dias) e confirmar que o alerta aparece.

- [ ] **Step 5:** Nada a commitar nesta task — só aplica no banco.

---

### Task 10: Verificação final e deploy

- [ ] **Step 1: Build completo**

Run: `npm run build`
Expected: build completo sem erros novos.

- [ ] **Step 2: Backup pós-mudanças**

Run: `npm run db:backup`

- [ ] **Step 3: Push para produção**

```bash
git push origin main
```

- [ ] **Step 4: Verificar o deploy no Railway**

Acompanhar o deploy (aba Deployments do serviço "precify"). Depois de "Online", repetir manualmente os passos de verificação da Task 9, Step 4, agora na URL de produção.

---

## Self-Review

**Cobertura do spec** (`docs/superpowers/specs/2026-07-12-compras-lote-etiqueta-design.md`):
- Item 1 (Compra com múltiplos produtos + rateio de frete) → Task 1. ✅
- Item 2 (editar compras no histórico) → Task 2. ✅
- Item 3 (model Lote) → Task 3. ✅
- Item 4 (fluxo de lançamento do lote, opcional por compra) → Task 5. ✅ (nenhuma compra é forçada a ter lote — "Lançar lote" é uma ação independente por linha do histórico)
- Item 5 (geração automática de código) → Task 4, `POST /api/lotes`. ✅
- Item 6 (aba Lotes dedicada + alerta de vencimento 30 dias) → Task 6 (lista/busca/cores) + Task 8 (contador no Dashboard). ✅
- Item 7 (etiqueta térmica via navegador, 8x8cm, tamanho ajustável) → Task 7. ✅

**Placeholder scan:** nenhum "TBD"/"TODO". A Task 5 nota explicitamente que sua célula de ações substitui (não duplica) a da Task 2, para quem executar as duas tasks em sequência.

**Type consistency:** `LoteItem`/`LoteDetalhe` (Tasks 6 e 7) usam os mesmos nomes de campo retornados por `GET /api/lotes` e `GET /api/lotes/[id]` (Task 4): `numeroLote`, `geradoAuto`, `quantidade`, `dataValidade`, `compra: { skuPrincipal, nomeProduto, fornecedor, dataCompra, numeroNF, numeroPedido }`. `recalcularVariacoesEPrecificacoes` (Task 1) é usada com a mesma assinatura em `saveCompra` e na Task 2 (`PATCH /api/compras/[id]`). `Compra` (interface do front, Task 1 Step 5.1) inclui `numeroNF`/`numeroPedido` usados por `openEditCompra`/`openLote` (Tasks 2 e 5).
