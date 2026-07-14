# Precificação Multicanal (Rótulo do Bem) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trazer para dentro do Precify, como página nova, a ferramenta de precificação multicanal que a usuária já usava como HTML standalone — com SKU/nome/custo puxados do cadastro real de produtos e cálculos salvos no banco de dados.

**Architecture:** Página nova auto-contida (`/precificacao-multicanal`), com motor de cálculo próprio em `src/lib/calculosMulticanal.ts` (porta as fórmulas do HTML original para TypeScript), um model novo no banco (`CalculoMulticanal`, independente de `Precificacao`/`Plataforma` para evitar o limite de 1-linha-por-plataforma que impediria guardar ML Full e ML Clássico do mesmo produto simultaneamente), e reaproveita a busca fuzzy por SKU/nome já existente (`/api/busca`) e a tabela de frete FULL já usada em produção (`src/lib/calculos.ts`).

**Tech Stack:** Next.js 14 (App Router), React 18, Prisma 5, PostgreSQL, TypeScript, CSS própria (não usa Tailwind nesta página — visual distinto e intencional).

## Global Constraints

- Sem framework de testes automatizado neste projeto — verificação por `npx tsc --noEmit` e `npm run build`, mais passos de verificação manual explícitos.
- Sem banco de staging — `DATABASE_URL` aponta direto pra produção. Mudanças de schema só entram no banco na Task 7, depois de todas as tasks de código.
- Rodar `npm run db:backup` antes de qualquer `prisma db push`.
- Visual desta página é intencionalmente diferente do resto do Precify (verde `#055E2B`/lima `#CDDE35`, fontes Poppins/Montserrat via Google Fonts, marca "Rótulo do Bem") — não adaptar para o padrão indigo/Tailwind das outras páginas.
- ML Full usa a tabela de frete por peso×preço; ML Clássico usa o modelo simples (frete R$ editável) — confirmado com a usuária, a tabela por peso é exclusiva do FULL.
- Trabalhar direto na branch `main`.

---

### Task 1: Exportar a função de frete FULL já usada em produção

**Contexto:** `src/lib/calculos.ts` já tem uma função privada `calcFreteFullMLInternal` com a tabela de frete FULL completa (15 faixas de peso — mais precisa que a versão simplificada de 8 faixas dentro de `src/app/calculadora/page.tsx`), usada hoje pelo cálculo real de Precificação. Vamos reaproveitar exatamente essa função (a mais precisa/autoritativa), exportando-a.

**Files:**
- Modify: `src/lib/calculos.ts`

**Interfaces:**
- Produces: `calcFreteFullML(pesoKg: number, precoVenda: number): number` — exportada.

- [ ] **Step 1: Renomear e exportar a função**

Em `src/lib/calculos.ts`, trocar a assinatura da função (linha ~160):

```ts
// ── Tabela FULL (usada também pela Precificação Multicanal) ──
export function calcFreteFullML(pesoKg: number, precoVenda: number): number {
```

(era `function calcFreteFullMLInternal(pesoKg: number, precoVenda: number): number {` — só adiciona `export` e renomeia `calcFreteFullMLInternal` → `calcFreteFullML`, mantendo o corpo da função idêntico)

- [ ] **Step 2: Atualizar a única chamada interna**

Na mesma função, dentro de `calcPrecificacaoComFreteML` (linha ~149), trocar:
```ts
freteResolvido = calcFreteFullMLInternal(pesoKg, precoRef)
```
por:
```ts
freteResolvido = calcFreteFullML(pesoKg, precoRef)
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros em `src/lib/calculos.ts` ou em qualquer arquivo que o importe (rota de precificação, `saveCompra.ts`, calculadora).

Run: `grep -rn "calcFreteFullMLInternal" src`
Expected: nenhuma ocorrência (todas substituídas).

- [ ] **Step 4: Commit**

```bash
git add src/lib/calculos.ts
git commit -m "Exporta calcFreteFullML de calculos.ts para reuso na Precificacao Multicanal"
```

---

### Task 2: Model `CalculoMulticanal` + API

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/app/api/calculo-multicanal/route.ts`
- Create: `src/app/api/calculo-multicanal/[id]/route.ts`

**Interfaces:**
- Produces: `GET /api/calculo-multicanal?q=...` → lista de `CalculoMulticanal`, mais recentes primeiro.
- Produces: `POST /api/calculo-multicanal` → cria ou atualiza por `(sku, variacao)`, aceita `{ sku, nome, variacao?, skuVariacao?, custoProduto, despesasVariaveisPct, despesasFixasPct, modo, precoTeste?, canais }`.
- Produces: `DELETE /api/calculo-multicanal/[id]`.

- [ ] **Step 1: Adicionar o model ao schema**

Em `prisma/schema.prisma`, adicionar ao final do arquivo:

```prisma
// ─── PRECIFICAÇÃO MULTICANAL (Rótulo do Bem) ──────────────────
// Independente de Precificacao/Plataforma: guarda os 5 canais
// (Loja Própria, ML Full, ML Clássico, Shopee, TikTok Shop) lado
// a lado por SKU+Variação, o que o model Precificacao não permite
// (lá só cabe 1 linha por SKU×Plataforma).
model CalculoMulticanal {
  id                   String   @id @default(cuid())
  skuVariacao          String?
  sku                  String
  nome                 String
  variacao             String   @default("")
  custoProduto         Float
  pesoGramas           Float?
  despesasVariaveisPct Float    @default(8)
  despesasFixasPct     Float    @default(0)
  modo                 String   @default("preco")
  precoTeste           Float?
  canais               Json
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  @@unique([sku, variacao])
}
```

- [ ] **Step 2: Regenerar o Prisma Client (sem tocar no banco)**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client` sem erros.

- [ ] **Step 3: Criar a rota de listagem/criação**

Criar `src/app/api/calculo-multicanal/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()

  const where: Record<string, unknown> = {}
  if (q) where.OR = [{ sku: { contains: q } }, { nome: { contains: q } }]

  const calculos = await db.calculoMulticanal.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 500,
  })
  return NextResponse.json(calculos)
}

export async function POST(req: NextRequest) {
  const b = await req.json()
  if (!b.sku?.trim() && !b.nome?.trim())
    return NextResponse.json({ error: 'Informe o SKU ou o nome do produto' }, { status: 400 })
  if (b.custoProduto == null)
    return NextResponse.json({ error: 'Custo do produto é obrigatório' }, { status: 400 })

  const sku = String(b.sku ?? '').trim()
  const variacao = String(b.variacao ?? '').trim()

  const data = {
    sku,
    nome: String(b.nome ?? '').trim(),
    variacao,
    skuVariacao: b.skuVariacao || null,
    custoProduto: parseFloat(b.custoProduto),
    pesoGramas: b.pesoGramas != null ? parseFloat(b.pesoGramas) : null,
    despesasVariaveisPct: parseFloat(b.despesasVariaveisPct ?? 8),
    despesasFixasPct: parseFloat(b.despesasFixasPct ?? 0),
    modo: b.modo === 'margem' ? 'margem' : 'preco',
    precoTeste: b.precoTeste != null ? parseFloat(b.precoTeste) : null,
    canais: b.canais ?? {},
  }

  const calculo = await db.calculoMulticanal.upsert({
    where: { sku_variacao: { sku, variacao } },
    update: data,
    create: data,
  })
  return NextResponse.json(calculo, { status: 201 })
}
```

**Nota:** `variacao` é `String @default("")` no schema (não `String?`) de propósito — no Postgres, valores `NULL` não colidem entre si em constraints únicas, então duas linhas com `variacao = NULL` não seriam tratadas como duplicatas pelo `@@unique([sku, variacao])`. Com string vazia como valor padrão em vez de `NULL`, o upsert por SKU+Variação funciona corretamente mesmo quando a variação fica em branco.

- [ ] **Step 4: Criar a rota de item individual**

Criar `src/app/api/calculo-multicanal/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await db.calculoMulticanal.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma src/app/api/calculo-multicanal
git commit -m "Adiciona model CalculoMulticanal e API (listar, salvar, excluir)"
```

---

### Task 3: Motor de cálculo (5 canais, 2 modos)

**Files:**
- Create: `src/lib/calculosMulticanal.ts`

**Interfaces:**
- Consumes: `calcFreteFullML(pesoKg, precoVenda)` de `src/lib/calculos.ts` (Task 1).
- Produces: `CANAIS_MULTICANAL: CanalDef[]`, `shopeeBand(preco)`, `calcularCanalModoPreco(params)`, `calcularCanalModoAnalise(params)`, tipos `CanalConfig`, `CanalDef`, `ResultadoCanal`.

- [ ] **Step 1: Criar o arquivo**

Criar `src/lib/calculosMulticanal.ts`:

```ts
import { round2, calcFreteFullML } from './calculos'

export interface CanalConfig {
  emb: number
  com: number
  out: number
  fix: number
  frete: number
  margem: number
}

export interface CanalDef {
  key: string
  nome: string
  tag: string
  cor: string
  corTexto: string
  freteEspecial?: 'full'
  autoBand?: boolean
  default: CanalConfig
}

export const CANAIS_MULTICANAL: CanalDef[] = [
  { key: 'lp', nome: 'Loja Própria', tag: 'seu e-commerce', cor: '#055E2B', corTexto: '#fff',
    default: { emb: 1.50, com: 0, out: 4.99, fix: 0, frete: 0, margem: 25 } },
  { key: 'mlFull', nome: 'Mercado Livre', tag: 'FULL', cor: '#FFE600', corTexto: '#2D3277', freteEspecial: 'full',
    default: { emb: 0, com: 14, out: 0, fix: 0.60, frete: 0, margem: 20 } },
  { key: 'mlClassico', nome: 'Mercado Livre', tag: 'clássico', cor: '#FFE600', corTexto: '#2D3277',
    default: { emb: 1.50, com: 14, out: 0, fix: 6.25, frete: 12, margem: 20 } },
  { key: 'sh', nome: 'Shopee', tag: 'faixa automática', cor: '#EE4D2D', corTexto: '#fff', autoBand: true,
    default: { emb: 1.50, com: 20, out: 0, fix: 4, frete: 12, margem: 20 } },
  { key: 'tt', nome: 'TikTok Shop', tag: '6% + frete grátis', cor: '#111111', corTexto: '#fff',
    default: { emb: 1.50, com: 6, out: 6, fix: 4, frete: 12, margem: 20 } },
]

export function shopeeBand(preco: number): { com: number; fix: number } {
  if (preco <= 79.99) return { com: 20, fix: 4 }
  if (preco <= 99.99) return { com: 14, fix: 16 }
  if (preco <= 199.99) return { com: 14, fix: 20 }
  return { com: 14, fix: 26 }
}

export interface ResultadoCanal {
  preco: number
  custoBase: number
  comR: number
  outR: number
  despVarR: number
  despFixR: number
  fix: number
  frete: number
  lucro: number
  margem: number
  markup: number
  precoMinimo: number
  comEfetivo: number
  fixEfetivo: number
}

function montarResultado(
  preco: number, custoProduto: number, despVarPct: number, despFixPct: number,
  canal: CanalConfig, comEfetivo: number, fixEfetivo: number, freteEfetivo: number,
): ResultadoCanal {
  const custoBase = custoProduto + canal.emb
  const dv = (despVarPct + comEfetivo + canal.out) / 100
  const df = despFixPct / 100
  const comR = comEfetivo / 100 * preco
  const outR = canal.out / 100 * preco
  const despVarR = despVarPct / 100 * preco
  const despFixR = df * preco
  const lucro = round2(preco - custoBase - fixEfetivo - freteEfetivo - dv * preco - despFixR)
  const denomMin = 1 - dv - df
  const precoMinimo = denomMin > 0 ? round2((custoBase + fixEfetivo + freteEfetivo) / denomMin) : 0
  return {
    preco: round2(preco), custoBase: round2(custoBase),
    comR: round2(comR), outR: round2(outR), despVarR: round2(despVarR), despFixR: round2(despFixR),
    fix: round2(fixEfetivo), frete: round2(freteEfetivo),
    lucro, margem: preco > 0 ? lucro / preco : 0,
    markup: custoBase > 0 ? preco / custoBase : 0,
    precoMinimo, comEfetivo, fixEfetivo,
  }
}

function calcularPrecoSimples(
  custoProduto: number, despVarPct: number, despFixPct: number, canal: CanalConfig,
  com: number, out: number, fix: number, frete: number, margemPct: number,
): number | null {
  const custoBase = custoProduto + canal.emb
  const dv = (despVarPct + com + out) / 100
  const df = despFixPct / 100
  const lu = margemPct / 100
  const den = 1 - dv - df - lu
  if (den <= 0) return null
  return (custoBase + fix + frete) / den
}

export function calcularCanalModoPreco(params: {
  custoProduto: number
  despVarPct: number
  despFixPct: number
  pesoGramas: number | null
  canal: CanalConfig
  def: CanalDef
  shAuto: boolean
}): ResultadoCanal | null {
  const { custoProduto, despVarPct, despFixPct, pesoGramas, canal, def, shAuto } = params

  if (def.freteEspecial === 'full') {
    if (!pesoGramas) return null
    const pesoKg = pesoGramas / 1000
    const semFrete = calcularPrecoSimples(custoProduto, despVarPct, despFixPct, canal, canal.com, canal.out, canal.fix, 0, canal.margem)
    if (semFrete === null) return null
    const frete1 = calcFreteFullML(pesoKg, semFrete)
    const comFrete = calcularPrecoSimples(custoProduto, despVarPct, despFixPct, canal, canal.com, canal.out, canal.fix, frete1, canal.margem)
    if (comFrete === null) return null
    const freteFinal = calcFreteFullML(pesoKg, comFrete)
    const precoFinal = calcularPrecoSimples(custoProduto, despVarPct, despFixPct, canal, canal.com, canal.out, canal.fix, freteFinal, canal.margem)
    if (precoFinal === null) return null
    return montarResultado(precoFinal, custoProduto, despVarPct, despFixPct, canal, canal.com, canal.fix, freteFinal)
  }

  if (def.autoBand && shAuto) {
    const bandas = [{ min: 0, max: 79.99 }, { min: 80, max: 99.99 }, { min: 100, max: 199.99 }, { min: 200, max: Infinity }]
    let melhor: { preco: number; com: number; fix: number } | null = null
    let menorDist = Infinity
    for (const b of bandas) {
      const banda = shopeeBand(b.min === 0 ? 50 : b.min)
      const p = calcularPrecoSimples(custoProduto, despVarPct, despFixPct, canal, banda.com, canal.out, banda.fix, canal.frete, canal.margem)
      if (p === null) continue
      if (p >= b.min && p <= b.max) return montarResultado(p, custoProduto, despVarPct, despFixPct, canal, banda.com, banda.fix, canal.frete)
      const dist = p < b.min ? b.min - p : p - b.max
      if (dist < menorDist) {
        menorDist = dist
        melhor = { preco: Math.min(Math.max(p, b.min), b.max === Infinity ? p : b.max), com: banda.com, fix: banda.fix }
      }
    }
    return melhor ? montarResultado(melhor.preco, custoProduto, despVarPct, despFixPct, canal, melhor.com, melhor.fix, canal.frete) : null
  }

  const p = calcularPrecoSimples(custoProduto, despVarPct, despFixPct, canal, canal.com, canal.out, canal.fix, canal.frete, canal.margem)
  return p === null ? null : montarResultado(p, custoProduto, despVarPct, despFixPct, canal, canal.com, canal.fix, canal.frete)
}

export function calcularCanalModoAnalise(params: {
  custoProduto: number
  despVarPct: number
  despFixPct: number
  pesoGramas: number | null
  precoTeste: number
  canal: CanalConfig
  def: CanalDef
  shAuto: boolean
}): ResultadoCanal | null {
  const { custoProduto, despVarPct, despFixPct, pesoGramas, precoTeste, canal, def, shAuto } = params
  if (!precoTeste || precoTeste <= 0) return null

  let com = canal.com, fix = canal.fix, frete = canal.frete

  if (def.freteEspecial === 'full') {
    if (!pesoGramas) return null
    frete = calcFreteFullML(pesoGramas / 1000, precoTeste)
  }
  if (def.autoBand && shAuto) {
    const banda = shopeeBand(precoTeste)
    com = banda.com; fix = banda.fix
  }

  return montarResultado(precoTeste, custoProduto, despVarPct, despFixPct, canal, com, fix, frete)
}
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros em `src/lib/calculosMulticanal.ts`.

- [ ] **Step 3: Verificação manual dos cálculos (sem framework de teste, confirmar por conta)**

Rodar isso com `node` (depois de compilar mentalmente ou via um script ad-hoc) não é necessário — a verificação real acontece na Task 5, quando a tela mostrar os números. Mas confirmar agora, só lendo o código: para `lp` (sem freteEspecial, sem autoBand), com `custoProduto=15.96, despVarPct=8, despFixPct=0, canal=default (emb:1.50,com:0,out:4.99,fix:0,frete:0,margem:25)`, o preço esperado é `(15.96+1.50+0+0) / (1 - (8+0+4.99)/100 - 0 - 25/100) = 17.46 / (1 - 0.1299 - 0.25) = 17.46 / 0.6201 ≈ 28.16`. Confirmar mentalmente que `calcularPrecoSimples` produz essa conta.

- [ ] **Step 4: Commit**

```bash
git add src/lib/calculosMulticanal.ts
git commit -m "Adiciona motor de calculo da Precificacao Multicanal (5 canais, 2 modos)"
```

---

### Task 4: Página nova — estrutura, estilos, dados do produto

**Files:**
- Create: `src/app/precificacao-multicanal/page.tsx`
- Modify: `src/components/ui/Sidebar.tsx`

**Interfaces:**
- Consumes: `GET /api/busca?q=...` → `{ results: Produto[] }` (já existente, usado pela Calculadora), `Produto` inclui `variacoes: { skuVariacao, nomeVariacao, pesoGramas, custoTotal, custoCalculado }[]`.
- Consumes: `CANAIS_MULTICANAL`, tipos de `src/lib/calculosMulticanal.ts` (Task 3).
- Produces: componente de página em `/precificacao-multicanal` com state de produto/canais que a Task 5 vai consumir e completar.

- [ ] **Step 1: Adicionar o link no menu**

Em `src/components/ui/Sidebar.tsx`, adicionar `Leaf` ao import de ícones:
```ts
import {
  LayoutDashboard, Package, Layers, Store, Tag,
  ShoppingCart, Upload, Download, Search, ChevronRight,
  Zap, Truck, Settings, Calculator, Leaf
} from 'lucide-react'
```
E adicionar o link na seção "Precificação", depois de `/calculadora`:
```ts
  { href: '/calculadora',    label: 'Calculadora',     icon: Calculator },
  { href: '/precificacao-multicanal', label: 'Multicanal RdB', icon: Leaf },
  { href: '/precificacao',   label: 'Precificação',    icon: Tag },
```

- [ ] **Step 2: Criar a página com estrutura, estilos e "Dados do produto"**

Criar `src/app/precificacao-multicanal/page.tsx`:

```tsx
'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { CANAIS_MULTICANAL, CanalConfig, CanalDef, ResultadoCanal, calcularCanalModoPreco, calcularCanalModoAnalise } from '@/lib/calculosMulticanal'

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pctf = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'

interface VariacaoBusca { skuVariacao: string; nomeVariacao: string; pesoGramas: number | null; custoTotal: number | null; custoCalculado: number | null }
interface ProdutoBusca { skuPrincipal: string; nome: string; custoAtualizado: number | null; variacoes: VariacaoBusca[] }

type CanaisState = Record<string, CanalConfig>

function canaisIniciais(): CanaisState {
  const s: CanaisState = {}
  CANAIS_MULTICANAL.forEach(c => { s[c.key] = { ...c.default } })
  return s
}

export default function PrecificacaoMulticanalPage() {
  const [modo, setModo] = useState<'preco' | 'margem'>('preco')

  // Dados do produto
  const [sku, setSku] = useState('')
  const [nome, setNome] = useState('')
  const [variacaoTxt, setVariacaoTxt] = useState('')
  const [skuVariacaoLigado, setSkuVariacaoLigado] = useState<string | null>(null)
  const [custoProduto, setCustoProduto] = useState(0)
  const [pesoGramas, setPesoGramas] = useState<number | null>(null)
  const [despVarPct, setDespVarPct] = useState(8)
  const [despFixPct, setDespFixPct] = useState(0)
  const [margemPadrao, setMargemPadrao] = useState(25)
  const [precoTeste, setPrecoTeste] = useState(0)

  // Busca de produto
  const [q, setQ] = useState('')
  const [sugestoes, setSugestoes] = useState<ProdutoBusca[]>([])
  const [produtoSel, setProdutoSel] = useState<ProdutoBusca | null>(null)
  const [buscando, setBuscando] = useState(false)
  const buscaTimer = useRef<NodeJS.Timeout>()

  // Canais
  const [canais, setCanais] = useState<CanaisState>(canaisIniciais())
  const [shAuto, setShAuto] = useState(true)

  const buscarProduto = useCallback((valor: string) => {
    setQ(valor)
    clearTimeout(buscaTimer.current)
    if (valor.length < 2) { setSugestoes([]); return }
    setBuscando(true)
    buscaTimer.current = setTimeout(async () => {
      const r = await fetch(`/api/busca?q=${encodeURIComponent(valor)}`)
      const { results } = r.ok ? await r.json() : { results: [] }
      setBuscando(false)
      if (results.length === 1) { selecionarProduto(results[0]); return }
      setSugestoes(results)
    }, 400)
  }, [])

  const selecionarProduto = (p: ProdutoBusca) => {
    setProdutoSel(p)
    setSugestoes([])
    setSku(p.skuPrincipal)
    setNome(p.nome)
    setQ('')
    if (p.variacoes.length === 1) selecionarVariacao(p.variacoes[0])
    else { setCustoProduto(p.custoAtualizado ?? 0); setSkuVariacaoLigado(null); setPesoGramas(null); setVariacaoTxt('') }
  }

  const selecionarVariacao = (v: VariacaoBusca) => {
    setSkuVariacaoLigado(v.skuVariacao)
    setVariacaoTxt(v.nomeVariacao)
    setCustoProduto(v.custoTotal ?? v.custoCalculado ?? 0)
    setPesoGramas(v.pesoGramas)
  }

  const limparProduto = () => {
    setProdutoSel(null); setSkuVariacaoLigado(null)
    setSku(''); setNome(''); setVariacaoTxt(''); setCustoProduto(0); setPesoGramas(null)
    setQ(''); setSugestoes([])
  }

  const setCanalField = (key: string, field: keyof CanalConfig, valor: number) => {
    setCanais(prev => ({ ...prev, [key]: { ...prev[key], [field]: valor } }))
  }

  const aplicarMargemTodos = () => {
    setCanais(prev => {
      const n = { ...prev }
      CANAIS_MULTICANAL.forEach(c => { n[c.key] = { ...n[c.key], margem: margemPadrao } })
      return n
    })
  }

  const resultados: Record<string, ResultadoCanal | null> = {}
  CANAIS_MULTICANAL.forEach(def => {
    resultados[def.key] = modo === 'preco'
      ? calcularCanalModoPreco({ custoProduto, despVarPct, despFixPct, pesoGramas, canal: canais[def.key], def, shAuto })
      : calcularCanalModoAnalise({ custoProduto, despVarPct, despFixPct, pesoGramas, precoTeste, canal: canais[def.key], def, shAuto })
  })

  return (
    <>
      <style>{`
        .rdb { font-family: 'Montserrat', system-ui, sans-serif; background: #F4F7EF; color: #16241C; margin: -24px; padding: 0 0 40px; min-height: 100vh; }
        .rdb h1, .rdb h2, .rdb h3 { font-family: 'Poppins', sans-serif; }
        .rdb-header { background: #055E2B; color: #fff; padding: 26px 24px 30px; }
        .rdb-header .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
        .rdb-header .brand strong { font-family: 'Poppins'; font-weight: 600; font-size: 15px; }
        .rdb-header .brand small { display: block; font-size: 10px; letter-spacing: .16em; text-transform: uppercase; color: #CDDE35; font-weight: 600; }
        .rdb-header h1 { font-size: 22px; font-weight: 700; }
        .rdb-header h1 span { color: #CDDE35; }
        .rdb-main { max-width: 1180px; margin: 0 auto; padding: 0 20px; }
        .rdb-toggle { display: flex; gap: 6px; background: #fff; border: 1px solid #DDE7D4; border-radius: 14px; padding: 6px; margin: -20px auto 20px; max-width: 560px; box-shadow: 0 8px 24px rgba(4,43,20,.06); }
        .rdb-toggle button { flex: 1; border: none; background: transparent; padding: 12px 10px; border-radius: 9px; cursor: pointer; font-family: 'Poppins'; font-weight: 600; font-size: 13px; color: #5C6B60; }
        .rdb-toggle button.on { background: #055E2B; color: #fff; }
        .rdb-card { background: #fff; border: 1px solid #DDE7D4; border-radius: 16px; box-shadow: 0 8px 24px rgba(4,43,20,.06); padding: 16px 20px; margin-bottom: 18px; }
        .rdb-card h2 { font-size: 15px; font-weight: 600; margin-bottom: 12px; }
        .rdb-field label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 5px; }
        .rdb-field input { width: 100%; font-family: 'Poppins'; font-weight: 500; font-size: 14px; color: #16241C; border: 1.5px solid #DDE7D4; border-radius: 10px; padding: 9px 11px; background: #FCFDFB; }
        .rdb-field input:focus { outline: none; border-color: #055E2B; box-shadow: 0 0 0 3px rgba(5,94,43,.13); }
        .rdb-grid3 { display: grid; grid-template-columns: 1fr 2fr 1fr; gap: 12px; margin-bottom: 14px; }
        .rdb-grid-metas { display: grid; grid-template-columns: repeat(auto-fit,minmax(150px,1fr)); gap: 12px; }
        .rdb-sugestoes { border: 1px solid #DDE7D4; border-radius: 10px; margin-top: 4px; overflow: hidden; }
        .rdb-sugestoes button { display: block; width: 100%; text-align: left; padding: 8px 12px; background: #fff; border: none; border-bottom: 1px solid #EEF2E9; cursor: pointer; font-size: 13px; }
        .rdb-sugestoes button:hover { background: #F7FAF3; }
      `}</style>
      <div className="rdb">
        <div className="rdb-header">
          <div className="brand">
            <span>🍃</span>
            <div><small>Rótulo do Bem</small><strong>Central de Precificação</strong></div>
          </div>
          <h1>O preço ideal de venda em <span>cada canal</span></h1>
        </div>

        <div className="rdb-main">
          <div className="rdb-toggle">
            <button className={modo === 'preco' ? 'on' : ''} onClick={() => setModo('preco')}>Descobrir o preço ideal</button>
            <button className={modo === 'margem' ? 'on' : ''} onClick={() => setModo('margem')}>Analisar um preço</button>
          </div>

          <section className="rdb-card">
            <h2>Dados do produto</h2>
            <div className="rdb-grid3">
              <div className="rdb-field">
                <label>SKU / nome</label>
                <input value={q || sku} onChange={e => { buscarProduto(e.target.value); setSku(e.target.value) }}
                  placeholder="Digite o SKU ou nome…" />
                {sugestoes.length > 0 && (
                  <div className="rdb-sugestoes">
                    {sugestoes.map(p => (
                      <button key={p.skuPrincipal} onClick={() => selecionarProduto(p)}>{p.nome} — {p.skuPrincipal}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="rdb-field"><label>Nome do produto</label>
                <input value={nome} onChange={e => setNome(e.target.value)} placeholder="ex: Cúrcuma em pó" /></div>
              <div className="rdb-field"><label>Variação</label>
                <input value={variacaoTxt} onChange={e => setVariacaoTxt(e.target.value)} placeholder="ex: 250g" /></div>
            </div>

            {produtoSel && produtoSel.variacoes.length > 1 && (
              <div className="rdb-sugestoes" style={{ marginBottom: 14 }}>
                {produtoSel.variacoes.map(v => (
                  <button key={v.skuVariacao} onClick={() => selecionarVariacao(v)}>
                    {v.nomeVariacao} {skuVariacaoLigado === v.skuVariacao ? '✓' : ''}
                  </button>
                ))}
              </div>
            )}
            {produtoSel && (
              <button onClick={limparProduto} style={{ marginBottom: 14, fontSize: 12, color: '#5C6B60', background: 'none', border: 'none', cursor: 'pointer' }}>
                Limpar produto selecionado
              </button>
            )}

            <div className="rdb-grid-metas">
              <div className="rdb-field"><label>Custo do produto (R$)</label>
                <input type="number" step="0.01" value={custoProduto} onChange={e => setCustoProduto(parseFloat(e.target.value) || 0)} /></div>
              <div className="rdb-field"><label>Peso (g) — necessário pro ML Full</label>
                <input type="number" step="1" value={pesoGramas ?? ''} onChange={e => setPesoGramas(e.target.value ? parseFloat(e.target.value) : null)} /></div>
              <div className="rdb-field"><label>Despesas variáveis gerais (%)</label>
                <input type="number" step="0.1" value={despVarPct} onChange={e => setDespVarPct(parseFloat(e.target.value) || 0)} /></div>
              <div className="rdb-field"><label>Despesas fixas rateio (%)</label>
                <input type="number" step="0.1" value={despFixPct} onChange={e => setDespFixPct(parseFloat(e.target.value) || 0)} /></div>
              {modo === 'preco' ? (
                <div className="rdb-field">
                  <label>Margem padrão (%)</label>
                  <input type="number" step="1" value={margemPadrao} onChange={e => setMargemPadrao(parseFloat(e.target.value) || 0)} />
                  <button type="button" onClick={aplicarMargemTodos} style={{ marginTop: 6, width: '100%', fontSize: 12, padding: '6px 10px', border: '1.5px solid #DDE7D4', borderRadius: 8, background: 'transparent', cursor: 'pointer' }}>
                    Aplicar a todos os canais
                  </button>
                </div>
              ) : (
                <div className="rdb-field"><label>Preço a testar (R$)</label>
                  <input type="number" step="0.01" value={precoTeste} onChange={e => setPrecoTeste(parseFloat(e.target.value) || 0)} /></div>
              )}
            </div>
          </section>

          {/* Canais e biblioteca entram nas próximas tasks */}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros em `src/app/precificacao-multicanal/page.tsx` ou `Sidebar.tsx`.

Verificação manual (`npm run dev`): abrir `/precificacao-multicanal`, digitar um SKU/nome real de um produto cadastrado, confirmar que aparece sugestão (se houver mais de um resultado) ou seleciona direto, preenchendo nome/custo/peso automaticamente.

- [ ] **Step 4: Commit**

```bash
git add src/app/precificacao-multicanal src/components/ui/Sidebar.tsx
git commit -m "Adiciona pagina de Precificacao Multicanal: estrutura, estilos e dados do produto"
```

---

### Task 5: Cartões dos 5 canais

**Files:**
- Modify: `src/app/precificacao-multicanal/page.tsx`

**Interfaces:**
- Consumes: `resultados` (calculado na Task 4's render, reusa o mesmo objeto), `canais`/`setCanalField` (Task 4).

- [ ] **Step 1: Adicionar os estilos dos cartões de canal**

No `<style>` já criado na Task 4, adicionar ao final (antes do fechamento do template string):

```css
        .rdb-chans { display: grid; grid-template-columns: repeat(auto-fit,minmax(270px,1fr)); gap: 16px; margin-top: 4px; }
        .rdb-chan { background: #fff; border: 1px solid #DDE7D4; border-radius: 16px; box-shadow: 0 8px 24px rgba(4,43,20,.06); overflow: hidden; }
        .rdb-chan-head { display: flex; align-items: center; gap: 8px; padding: 12px 14px 0; }
        .rdb-chan-ic { width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-family: 'Poppins'; font-weight: 700; font-size: 11px; }
        .rdb-chan-nome { font-family: 'Poppins'; font-weight: 600; font-size: 13px; line-height: 1.15; }
        .rdb-chan-nome span { display: block; font-family: 'Montserrat'; font-weight: 600; font-size: 10px; color: #5C6B60; }
        .rdb-price { margin: 10px 14px; background: #055E2B; color: #fff; border-radius: 12px; padding: 13px 15px; }
        .rdb-price.neg { background: #C0392B; }
        .rdb-price .lb { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: #CDDE35; font-weight: 700; }
        .rdb-price.neg .lb { color: #fff; opacity: .85; }
        .rdb-price .big { font-family: 'Poppins'; font-weight: 700; font-size: 28px; margin-top: 2px; }
        .rdb-price .sub { font-size: 11.5px; color: #DCEAD9; margin-top: 2px; }
        .rdb-price.neg .sub { color: #fff; }
        .rdb-fees { padding: 10px 14px 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; border-top: 1px solid #DDE7D4; margin-top: 4px; }
        .rdb-fees .rdb-field { margin: 0; }
        .rdb-fees .rdb-field label { font-size: 10.5px; }
        .rdb-fees input { font-size: 12.5px; padding: 7px 9px; }
        .rdb-autobox { grid-column: 1/-1; display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 600; background: #F7FAF3; border: 1px solid #DDE7D4; border-radius: 9px; padding: 7px 9px; cursor: pointer; }
        .rdb-selo { margin-left: auto; font-size: 9.5px; font-weight: 700; padding: 3px 7px; border-radius: 20px; background: #055E2B; color: #CDDE35; }
        .rdb-selo.err { background: #FBE6E3; color: #C0392B; }
```

- [ ] **Step 2: Adicionar a grade de cartões após a seção "Dados do produto"**

Substituir o comentário `{/* Canais e biblioteca entram nas próximas tasks */}` por:

```tsx
          <div className="rdb-chans">
            {CANAIS_MULTICANAL.map(def => {
              const r = resultados[def.key]
              const cfg = canais[def.key]
              return (
                <div key={def.key} className="rdb-chan">
                  <div className="rdb-chan-head">
                    <span className="rdb-chan-ic" style={{ background: def.cor, color: def.corTexto }}>
                      {def.nome.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="rdb-chan-nome">{def.nome}<span>{def.tag}</span></span>
                    {r && r.lucro < 0 && <span className="rdb-selo err">prejuízo</span>}
                  </div>

                  {!r ? (
                    <div className={`rdb-price neg`}>
                      <div className="lb">Preço ideal de venda</div>
                      <div className="big">—</div>
                      <div className="sub">Taxas + margem passam de 100%. Reduza a margem ou os custos.</div>
                    </div>
                  ) : (
                    <div className={`rdb-price ${r.lucro < 0 ? 'neg' : ''}`}>
                      <div className="lb">Preço ideal de venda</div>
                      <div className="big">{brl(r.preco)}</div>
                      <div className="sub">margem de {pctf(r.margem * 100)} · sobra {brl(r.lucro)}</div>
                    </div>
                  )}

                  <div className="rdb-fees">
                    <div className="rdb-field"><label>Margem desejada (%)</label>
                      <input type="number" step="1" value={cfg.margem}
                        onChange={e => setCanalField(def.key, 'margem', parseFloat(e.target.value) || 0)} /></div>
                    <div className="rdb-field"><label>Embalagem (R$)</label>
                      <input type="number" step="0.01" value={cfg.emb}
                        onChange={e => setCanalField(def.key, 'emb', parseFloat(e.target.value) || 0)} /></div>
                    <div className="rdb-field"><label>Comissão (%)</label>
                      <input type="number" step="0.1" value={cfg.com} disabled={def.autoBand && shAuto}
                        onChange={e => setCanalField(def.key, 'com', parseFloat(e.target.value) || 0)} /></div>
                    <div className="rdb-field"><label>Outras taxas (%)</label>
                      <input type="number" step="0.1" value={cfg.out}
                        onChange={e => setCanalField(def.key, 'out', parseFloat(e.target.value) || 0)} /></div>
                    <div className="rdb-field"><label>Taxa fixa (R$)</label>
                      <input type="number" step="0.01" value={cfg.fix} disabled={def.autoBand && shAuto}
                        onChange={e => setCanalField(def.key, 'fix', parseFloat(e.target.value) || 0)} /></div>
                    <div className="rdb-field"><label>Frete (R$)</label>
                      <input type="number" step="0.01" value={cfg.frete} disabled={def.freteEspecial === 'full'}
                        onChange={e => setCanalField(def.key, 'frete', parseFloat(e.target.value) || 0)} /></div>
                    {def.autoBand && (
                      <label className="rdb-autobox">
                        <input type="checkbox" checked={shAuto} onChange={e => setShAuto(e.target.checked)} />
                        Ajustar faixa da Shopee automaticamente (2026)
                      </label>
                    )}
                    {def.freteEspecial === 'full' && !pesoGramas && (
                      <div style={{ gridColumn: '1/-1', fontSize: 11, color: '#C0392B' }}>
                        Informe o peso do produto (campo acima) pra calcular o frete FULL.
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
```

(essa grade substitui o comentário; a `</div>` de fechamento de `.rdb-main` já existente na Task 4 continua depois dela)

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros.

Verificação manual: com um produto selecionado e peso preenchido, todos os 5 cartões devem mostrar um preço (não "—"), o cartão Shopee muda comissão/taxa fixa sozinho conforme o preço calculado, e desmarcar "ajustar faixa automaticamente" libera esses dois campos pra edição manual. Trocar pra "Analisar um preço" e digitar um valor deve recalcular a margem em todos os canais.

- [ ] **Step 4: Commit**

```bash
git add src/app/precificacao-multicanal/page.tsx
git commit -m "Adiciona cartoes dos 5 canais na Precificacao Multicanal"
```

---

### Task 6: Salvar cálculo + Biblioteca

**Files:**
- Modify: `src/app/precificacao-multicanal/page.tsx`

**Interfaces:**
- Consumes: `POST /api/calculo-multicanal`, `GET /api/calculo-multicanal?q=...`, `DELETE /api/calculo-multicanal/[id]` (Task 2).

- [ ] **Step 1: Adicionar estilos da biblioteca**

No `<style>`, adicionar:

```css
        .rdb-lib-ctrls { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
        .rdb-lib-ctrls input { padding: 8px 12px; font-size: 13px; border: 1.5px solid #DDE7D4; border-radius: 10px; min-width: 200px; }
        .rdb-btn { font-family: 'Poppins'; font-weight: 600; font-size: 12.5px; border-radius: 10px; padding: 9px 14px; cursor: pointer; border: 1.5px solid #DDE7D4; background: #fff; }
        .rdb-btn.prim { background: #055E2B; border-color: #055E2B; color: #fff; }
        .rdb-libtbl { width: 100%; border-collapse: collapse; font-size: 12px; }
        .rdb-libtbl th { text-align: left; font-size: 10px; text-transform: uppercase; color: #5C6B60; padding: 8px 10px; background: #F7FAF3; border-bottom: 1px solid #DDE7D4; }
        .rdb-libtbl th.r, .rdb-libtbl td.r { text-align: right; }
        .rdb-libtbl td { padding: 8px 10px; border-bottom: 1px solid #EEF2E9; }
        .rdb-iact { border: 1.5px solid #DDE7D4; background: #fff; border-radius: 8px; padding: 4px 8px; font-size: 11px; cursor: pointer; margin-left: 4px; }
```

- [ ] **Step 2: Adicionar state, funções de salvar/carregar/excluir e a seção da biblioteca**

No componente, adicionar os states (perto dos outros, no topo da função):

```tsx
  const [biblioteca, setBiblioteca] = useState<any[]>([])
  const [libFiltro, setLibFiltro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [msgSalvo, setMsgSalvo] = useState('')

  const carregarBiblioteca = useCallback(async (filtro: string) => {
    const params = new URLSearchParams()
    if (filtro) params.set('q', filtro)
    const r = await fetch('/api/calculo-multicanal?' + params)
    setBiblioteca(r.ok ? await r.json() : [])
  }, [])

  useEffect(() => { carregarBiblioteca(libFiltro) }, [libFiltro, carregarBiblioteca])
```

Adicionar as funções de ação, perto de `aplicarMargemTodos`:

```tsx
  const salvarCalculo = async () => {
    if (!sku.trim() && !nome.trim()) { setMsgSalvo('Informe o SKU ou o nome do produto.'); return }
    setSalvando(true)
    const r = await fetch('/api/calculo-multicanal', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sku, nome, variacao: variacaoTxt, skuVariacao: skuVariacaoLigado,
        custoProduto, pesoGramas, despesasVariaveisPct: despVarPct, despesasFixasPct: despFixPct,
        modo, precoTeste, canais,
      }),
    })
    setSalvando(false)
    if (!r.ok) { const d = await r.json(); setMsgSalvo(d.error ?? 'Erro ao salvar'); return }
    setMsgSalvo('Cálculo salvo na biblioteca.')
    carregarBiblioteca(libFiltro)
    setTimeout(() => setMsgSalvo(''), 3000)
  }

  const carregarDaLib = (item: any) => {
    setSku(item.sku); setNome(item.nome); setVariacaoTxt(item.variacao || '')
    setSkuVariacaoLigado(item.skuVariacao); setCustoProduto(item.custoProduto); setPesoGramas(item.pesoGramas)
    setDespVarPct(item.despesasVariaveisPct); setDespFixPct(item.despesasFixasPct)
    setModo(item.modo === 'margem' ? 'margem' : 'preco'); setPrecoTeste(item.precoTeste || 0)
    if (item.canais) setCanais(item.canais)
    setProdutoSel(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const excluirDaLib = async (item: any) => {
    if (!confirm(`Excluir ${item.sku || item.nome}${item.variacao ? ' (' + item.variacao + ')' : ''}?`)) return
    await fetch(`/api/calculo-multicanal/${item.id}`, { method: 'DELETE' })
    carregarBiblioteca(libFiltro)
  }

  const calcularPrecosLib = (item: any): Record<string, number | null> => {
    const out: Record<string, number | null> = {}
    CANAIS_MULTICANAL.forEach(def => {
      const r = calcularCanalModoPreco({
        custoProduto: item.custoProduto, despVarPct: item.despesasVariaveisPct, despFixPct: item.despesasFixasPct,
        pesoGramas: item.pesoGramas, canal: item.canais?.[def.key] ?? def.default, def, shAuto: true,
      })
      out[def.key] = r ? r.preco : null
    })
    return out
  }
```

Adicionar o botão "Salvar cálculo" logo abaixo da grade de canais (depois do `</div>` que fecha `.rdb-chans`, ainda dentro de `.rdb-main`):

```tsx
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
            <button className="rdb-btn prim" onClick={salvarCalculo} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar cálculo'}
            </button>
            {msgSalvo && <span style={{ fontSize: 12.5, color: '#5C6B60' }}>{msgSalvo}</span>}
          </div>

          <section className="rdb-card">
            <h2>Biblioteca de produtos</h2>
            <div className="rdb-lib-ctrls">
              <input placeholder="Filtrar por SKU ou nome" value={libFiltro} onChange={e => setLibFiltro(e.target.value)} />
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="rdb-libtbl">
                <thead>
                  <tr>
                    <th>SKU</th><th>Produto</th><th>Variação</th><th className="r">Custo</th>
                    {CANAIS_MULTICANAL.map(c => <th key={c.key} className="r">{c.nome}{c.tag === 'FULL' ? ' Full' : c.tag === 'clássico' ? ' Clássico' : ''}</th>)}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {biblioteca.length === 0 && (
                    <tr><td colSpan={4 + CANAIS_MULTICANAL.length + 1} style={{ textAlign: 'center', padding: 20, color: '#5C6B60' }}>
                      Nenhum cálculo salvo ainda.
                    </td></tr>
                  )}
                  {biblioteca.map(item => {
                    const precos = calcularPrecosLib(item)
                    return (
                      <tr key={item.id}>
                        <td>{item.sku || '—'}</td>
                        <td>{item.nome || '—'}</td>
                        <td>{item.variacao || '—'}</td>
                        <td className="r">{brl(item.custoProduto)}</td>
                        {CANAIS_MULTICANAL.map(c => (
                          <td key={c.key} className="r">{precos[c.key] != null ? brl(precos[c.key]!) : '—'}</td>
                        ))}
                        <td>
                          <button className="rdb-iact" onClick={() => carregarDaLib(item)}>Carregar</button>
                          <button className="rdb-iact" onClick={() => excluirDaLib(item)}>Excluir</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros.

Verificação manual: com um produto calculado, clicar "Salvar cálculo", confirmar que aparece na tabela da biblioteca logo abaixo com os 6 preços (LP, ML Full, ML Clássico, Shopee, TikTok). Clicar "Carregar" deve preencher tudo de volta no formulário. Clicar "Excluir" deve remover da lista (com confirmação).

- [ ] **Step 4: Commit**

```bash
git add src/app/precificacao-multicanal/page.tsx
git commit -m "Adiciona salvar calculo e biblioteca na Precificacao Multicanal"
```

---

### Task 7: Aplicar schema no banco de produção

**Pré-requisito:** Task 2 concluída (model `CalculoMulticanal` já no schema).

- [ ] **Step 1: Backup manual**

Run: `npm run db:backup`
Expected: saída confirmando contagem de todas as tabelas.

- [ ] **Step 2: Revisar o diff do schema**

Run: `git diff <commit-antes-da-task-2>..HEAD -- prisma/schema.prisma`
Expected: só a adição do model `CalculoMulticanal` (novo, sem remoções, sem alterar nenhum model existente).

- [ ] **Step 3: Aplicar no banco**

Run: `npx prisma db push`
Expected: `Your database is now in sync with your Prisma schema.` Não deve pedir confirmação de perda de dados (só está criando uma tabela nova). Se pedir, **parar e investigar antes de confirmar**.

- [ ] **Step 4: Verificar em runtime**

Rodar `npm run dev`, abrir `/precificacao-multicanal`, fazer um cálculo completo com um produto real, salvar, confirmar que aparece na biblioteca sem erro 500.

---

### Task 8: Verificação final e deploy

- [ ] **Step 1: Build completo**

Run: `npm run build`
Expected: build sem erros, com `/precificacao-multicanal` e `/api/calculo-multicanal` na lista de rotas geradas.

- [ ] **Step 2: Backup pós-mudanças**

Run: `npm run db:backup`

- [ ] **Step 3: Push para produção**

```bash
git push origin main
```

- [ ] **Step 4: Verificar o deploy no Railway**

Acompanhar o deploy automático. Depois de "Online", repetir manualmente a verificação da Task 7 Step 4 na URL de produção.

---

## Self-Review

**Cobertura do spec** (`docs/superpowers/specs/2026-07-13-precificacao-multicanal-design.md`):
- Item 1 (5 canais, ML Full reaproveitando frete existente, ML Clássico simples, Shopee com faixa automática, TikTok) → Tasks 1, 3, 5. ✅
- Item 2 (2 modos de cálculo) → Task 3 (`calcularCanalModoPreco`/`calcularCanalModoAnalise`) + Task 4 (toggle) + Task 5 (exibição). ✅
- Item 3 (autopreenchimento por SKU — o pedido original) → Task 4 (busca fuzzy + seleção de variação preenchendo custo/nome/peso, tudo editável depois). ✅
- Item 4 (salvar no banco real + biblioteca pesquisável) → Tasks 2, 6. ✅
- Item 5 (visual próprio verde/lima, marca Rótulo do Bem) → Tasks 4, 5, 6 (CSS embutido na página). ✅

**Placeholder scan:** nenhum "TBD"/"TODO". A observação sobre `variacao` opcional vs `@default("")` na Task 2 é uma decisão técnica explícita com o ajuste já resolvido no próprio texto da task, não um placeholder em aberto.

**Type consistency:** `CanalConfig`/`CanalDef`/`ResultadoCanal` (Task 3) usados com os mesmos nomes de campo em Tasks 4, 5 e 6. `calcularCanalModoPreco`/`calcularCanalModoAnalise` chamados com a mesma assinatura de parâmetros em todos os pontos de uso (cartões na Task 5, cálculo da biblioteca na Task 6). Campos do model `CalculoMulticanal` (Task 2) usados de forma consistente no `POST` (Task 6) e na leitura da biblioteca (Task 6).
