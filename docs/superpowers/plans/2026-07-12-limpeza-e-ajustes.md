# Limpeza e Ajustes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover o módulo Anúncios e a área de precificação multicanal nunca concluída, consolidar TikTok e futuras plataformas na Calculadora via tabela `Plataforma`, adicionar código de anúncio à Precificação, e permitir excluir plataformas (incluindo Magalu) pela UI.

**Architecture:** Next.js 14 App Router + Prisma + Postgres (produção, sem banco de staging separado — `DATABASE_URL` em `.env` e `.env.local` apontam para o mesmo banco `zephyr`). Mudanças de schema são acumuladas em `prisma/schema.prisma` ao longo das tasks e aplicadas numa única `prisma db push` (Task 7), para minimizar o número de migrações direto em produção.

**Tech Stack:** Next.js 14 (App Router), React 18, Prisma 5, PostgreSQL, TypeScript, Tailwind CSS.

## Global Constraints

- Este projeto **não tem framework de testes automatizados** (sem jest/vitest/playwright no `package.json`). Seguindo o padrão já estabelecido no repositório, a verificação de cada task é manual: `npx tsc --noEmit` (type-check) e `npm run build` (build completo), mais um passo de verificação manual explícito quando aplicável. Não introduzir um framework de testes novo neste plano — fora de escopo do que foi pedido.
- **Não existe banco de staging.** `DATABASE_URL` em `.env` e `.env.local` apontam para o mesmo Postgres de produção (`zephyr.proxy.rlwy.net`). Mudanças de schema só podem ser verificadas em runtime depois da Task 7 (`prisma db push`). Tasks anteriores que tocam schema são verificadas só por type-check/build.
- Rodar `npm run db:backup` antes de qualquer `prisma db push` neste plano.
- Push para a branch `main` dispara redeploy automático no Railway (confirmado seguro em sessão anterior — o Custom Start Command do serviço "precify" está vazio, usa `next start` padrão, sem `prisma migrate deploy`).
- Seguir o padrão de código já existente no projeto: componentes `'use client'`, Tailwind com classes utilitárias já definidas em `globals.css` (`.card`, `.btn-primary`, `.inp`, `.lbl`, etc.), fetch direto (sem lib de data-fetching), `db` importado de `@/lib/db`.

---

### Task 1: Adicionar `codigoAnuncio` ao model Precificacao

**Files:**
- Modify: `prisma/schema.prisma` (model `Precificacao`)
- Modify: `src/app/api/precificacao/route.ts`
- Modify: `src/app/api/precificacao/[id]/route.ts`
- Modify: `src/app/precificacao/page.tsx`

**Interfaces:**
- Produces: campo `codigoAnuncio: string | null` em todo objeto `Precificacao` retornado pela API e usado no front.

- [ ] **Step 1: Adicionar o campo ao schema**

Em `prisma/schema.prisma`, no model `Precificacao`, adicionar a linha `codigoAnuncio` logo após `precoAtual`:

```prisma
  tipoFreteML      String     @default("full")
  precoAtual       Float?
  codigoAnuncio    String?
  custoTotalCalc   Float?
```

- [ ] **Step 2: Regenerar o Prisma Client (sem tocar no banco)**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client` sem erros. Isso atualiza os tipos TypeScript para incluir `codigoAnuncio`, mas **não** altera o banco — a coluna só existe de fato depois da Task 7.

- [ ] **Step 3: Aceitar o campo nas rotas de API**

Em `src/app/api/precificacao/route.ts`, dentro de `POST`, adicionar `codigoAnuncio: b.codigoAnuncio || null,` tanto no bloco `update:` quanto no bloco `create:` (mesma posição, logo após `precoAtual`):

```ts
    update: {
      custoEmbalagem: parseFloat(b.custoEmbalagem ?? 0),
      custoFrete:     calc.custoFrete,
      custoColeta:    parseFloat(b.custoColeta ?? 0),
      comissaoPct:    parseFloat(b.comissaoPct ?? plataforma.comissaoPct),
      impostoPct:     parseFloat(b.impostoPct ?? plataforma.impostoPct ?? 0.08),
      tipoFreteML:    b.tipoFreteML ?? 'full',
      precoAtual:     b.precoAtual ? parseFloat(b.precoAtual) : null,
      codigoAnuncio:  b.codigoAnuncio || null,
      custoTotalCalc: calc.custoTotalCalc,
```

```ts
    create: {
      skuVariacao:    b.skuVariacao,
      plataformaId:   b.plataformaId,
      custoEmbalagem: parseFloat(b.custoEmbalagem ?? 0),
      custoFrete:     calc.custoFrete,
      custoColeta:    parseFloat(b.custoColeta ?? 0),
      comissaoPct:    parseFloat(b.comissaoPct ?? plataforma.comissaoPct),
      impostoPct:     parseFloat(b.impostoPct ?? plataforma.impostoPct ?? 0.08),
      tipoFreteML:    b.tipoFreteML ?? 'full',
      precoAtual:     b.precoAtual ? parseFloat(b.precoAtual) : null,
      codigoAnuncio:  b.codigoAnuncio || null,
      custoTotalCalc: calc.custoTotalCalc,
```

Em `src/app/api/precificacao/[id]/route.ts`, dentro de `PUT`, adicionar ao bloco `data:` (logo após `precoAtual`):

```ts
    data: {
      precoAtual,
      codigoAnuncio:  b.codigoAnuncio !== undefined ? (b.codigoAnuncio || null) : ex.codigoAnuncio,
      custoEmbalagem: parseFloat(String(b.custoEmbalagem ?? ex.custoEmbalagem)),
```

- [ ] **Step 4: Expor o campo na UI**

Em `src/app/precificacao/page.tsx`:

1. Na interface `Prec`, adicionar depois de `precoAtual: number | null;`:
```ts
  codigoAnuncio: string | null
```

2. Adicionar novo state, logo abaixo de `const [precoInput, setPrecoInput] = useState('')`:
```ts
  const [codigoAnuncioInput, setCodigoAnuncioInput] = useState('')
```

3. No `addForm` state inicial, adicionar `codigoAnuncio: ''` depois de `precoAtual: '',`:
```ts
  const [addForm, setAddForm] = useState({
    skuVariacao: '', plataformaId: '', custoEmbalagem: '',
    custoFrete: '', custoColeta: '', comissaoPct: '',
    impostoPct: '0.08', precoAtual: '', codigoAnuncio: '', tipoFreteML: 'full',
  })
```

4. No botão "Nova" (linha que reseta `addForm` para abrir o modal), adicionar `codigoAnuncio: ''` no mesmo objeto:
```ts
          <button onClick={() => {
            setAddForm({ skuVariacao: '', plataformaId: '', custoEmbalagem: '', custoFrete: '', custoColeta: '', comissaoPct: '', impostoPct: '0.08', precoAtual: '', codigoAnuncio: '', tipoFreteML: 'full' })
            setError(''); setAddModal(true)
          }} className="btn-primary text-xs">
```

5. Em `openEdit`, adicionar a inicialização do novo state:
```ts
  const openEdit = (p: Prec) => {
    setEditModal(p)
    setPrecoInput(String(p.precoAtual ?? ''))
    setCodigoAnuncioInput(p.codigoAnuncio ?? '')
    setTipoFreteEdit(p.tipoFreteML ?? 'full')
    setError('')
  }
```

6. Em `savePrice`, incluir o campo no body do PUT:
```ts
  const savePrice = async () => {
    if (!editModal) return
    setSaving(true)
    const r = await fetch(`/api/precificacao/${editModal.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ precoAtual: precoInput || null, codigoAnuncio: codigoAnuncioInput || null, tipoFreteML: tipoFreteEdit }),
    })
```

7. No modal "Atualizar precificação", adicionar o input logo abaixo do campo "Preço praticado" (depois do bloco `<p className="text-xs text-gray-400 mt-1">...</p>` que fecha a div do preço, antes de `{error && <Alert type="error">{error}</Alert>}`):
```tsx
            <div>
              <label className="lbl">Código do anúncio</label>
              <input className="inp" value={codigoAnuncioInput} onChange={e => setCodigoAnuncioInput(e.target.value)}
                placeholder="Ex: MLB6620253832" />
            </div>

            {error && <Alert type="error">{error}</Alert>}
```

8. No modal "Nova precificação", adicionar o input logo abaixo do campo "Preço atual R$ (opcional)" (antes da div `flex justify-end gap-2 pt-1` dos botões):
```tsx
          <div><label className="lbl">Preço atual R$ (opcional)</label>
            <input className="inp" type="number" step="0.01" value={addForm.precoAtual} onChange={e => setAddForm(p => ({ ...p, precoAtual: e.target.value }))} placeholder="Deixe em branco para calcular depois" /></div>
          <div><label className="lbl">Código do anúncio (opcional)</label>
            <input className="inp" value={addForm.codigoAnuncio} onChange={e => setAddForm(p => ({ ...p, codigoAnuncio: e.target.value }))} placeholder="Ex: MLB6620253832" /></div>
          <div className="flex justify-end gap-2 pt-1">
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros relacionados a `precificacao/page.tsx` ou às rotas de API (erros pré-existentes em outros arquivos do projeto, se houver, não fazem parte desta task — não corrigir).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma src/app/api/precificacao src/app/precificacao/page.tsx
git commit -m "Adiciona codigoAnuncio ao model Precificacao e expoe na UI"
```

---

### Task 2: Corrigir `importar/validar` para usar Precificacao em vez de Anuncio

**Contexto:** encontrado durante o levantamento — `src/app/api/importar/validar/route.ts` consulta `db.anuncio.findFirst(...)` para mostrar o último preço de venda conhecido ao validar uma importação de XLSX. Isso precisa ser corrigido **antes** de remover o model `Anuncio` (Task 5), senão a importação quebra.

**Files:**
- Modify: `src/app/api/importar/validar/route.ts`

**Interfaces:**
- Consumes: model `Precificacao` (já existente, campo `precoAtual`, relação `plataforma.nome`).

- [ ] **Step 1: Substituir as duas consultas a `db.anuncio`**

Em `src/app/api/importar/validar/route.ts`, primeira ocorrência (dentro do bloco `if (linha.skuInformado?.trim())`):

```ts
      // Buscar último preço de venda conhecido
      const ultimaPrecificacao = await db.precificacao.findFirst({
        where: { variacao: { skuPrincipal: linha.skuInformado.trim() } },
        orderBy: { updatedAt: 'desc' },
        select: { precoAtual: true, plataforma: { select: { nome: true } } },
      })

      resultado.push({
        ...linha,
        status: produto ? 'confirmado' : 'sku_nao_encontrado',
        skuSugerido: produto?.skuPrincipal ?? null,
        nomeCadastrado: produto?.nome ?? null,
        custoPorKg: produto?.custoPorKg ?? null,
        precoVenda: ultimaPrecificacao?.precoAtual ?? null,
        canalPreco: ultimaPrecificacao?.plataforma.nome ?? null,
        sugestoes: [],
      })
      continue
```

Segunda ocorrência (dentro do bloco `if (sugestoes.length > 0)`):

```ts
    let precoVenda = null
    let canalPreco = null
    if (sugestoes.length > 0) {
      const ultimaPrecificacao = await db.precificacao.findFirst({
        where: { variacao: { skuPrincipal: sugestoes[0].skuPrincipal } },
        orderBy: { updatedAt: 'desc' },
        select: { precoAtual: true, plataforma: { select: { nome: true } } },
      })
      precoVenda = ultimaPrecificacao?.precoAtual ?? null
      canalPreco = ultimaPrecificacao?.plataforma.nome ?? null
    }
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros em `importar/validar/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/importar/validar/route.ts
git commit -m "Importar XLSX passa a usar Precificacao em vez de Anuncio para preco de referencia"
```

---

### Task 3: Adicionar `custoEmbalagem` ao model Plataforma

**Files:**
- Modify: `prisma/schema.prisma` (model `Plataforma`)
- Modify: `src/app/api/plataformas/route.ts`
- Modify: `src/app/api/plataformas/[id]/route.ts`
- Modify: `src/app/plataformas/page.tsx`

**Interfaces:**
- Produces: campo `custoEmbalagem: number` (default 0) em todo objeto `Plataforma`, usado pela Calculadora na Task 4.

- [ ] **Step 1: Adicionar o campo ao schema**

Em `prisma/schema.prisma`, no model `Plataforma`, adicionar depois de `custoColeta`:

```prisma
  custoFrete      Float    @default(0)
  custoColeta     Float    @default(0)
  custoEmbalagem  Float    @default(0)
  impostoPct      Float    @default(0.0829)
```

- [ ] **Step 2: Regenerar o Prisma Client**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client` sem erros.

- [ ] **Step 3: Aceitar o campo nas rotas de API**

Em `src/app/api/plataformas/route.ts`, dentro de `POST`, adicionar depois de `custoColeta`:

```ts
      custoFrete: parseFloat(b.custoFrete ?? 0),
      custoColeta: parseFloat(b.custoColeta ?? 0),
      custoEmbalagem: parseFloat(b.custoEmbalagem ?? 0),
      impostoPct: parseFloat(b.impostoPct ?? 0.08),
```

Em `src/app/api/plataformas/[id]/route.ts`, dentro de `PUT`, adicionar depois de `custoColeta`:

```ts
      taxaFixa: parseFloat(b.taxaFixa ?? 0), custoFrete: parseFloat(b.custoFrete ?? 0),
      custoColeta: parseFloat(b.custoColeta ?? 0), custoEmbalagem: parseFloat(b.custoEmbalagem ?? 0),
      impostoPct: parseFloat(b.impostoPct ?? 0.08),
```

- [ ] **Step 4: Expor o campo na UI de Plataformas**

Em `src/app/plataformas/page.tsx`:

1. Na interface `Plataforma`, adicionar `custoEmbalagem: number` depois de `custoColeta: number`:
```ts
interface Plataforma { id: string; nome: string; slug: string; comissaoPct: number; taxaFixa: number; custoFrete: number; custoColeta: number; custoEmbalagem: number; impostoPct: number; corHex: string; ativa: boolean; observacoes: string | null }
```

2. No const `empty`, adicionar `custoEmbalagem: ''`:
```ts
const empty = { nome: '', slug: '', comissaoPct: '', taxaFixa: '', custoFrete: '', custoColeta: '', custoEmbalagem: '', impostoPct: '0.08', corHex: '#6366f1', observacoes: '' }
```

3. Em `openEdit`, adicionar `custoEmbalagem: String(p.custoEmbalagem)`:
```ts
  const openEdit = (p: Plataforma) => {
    setForm({ nome: p.nome, slug: p.slug, comissaoPct: String(p.comissaoPct), taxaFixa: String(p.taxaFixa), custoFrete: String(p.custoFrete), custoColeta: String(p.custoColeta), custoEmbalagem: String(p.custoEmbalagem), impostoPct: String(p.impostoPct), corHex: p.corHex, observacoes: p.observacoes ?? '' })
    setEditing(p.id); setError(''); setModal(true)
  }
```

4. No card de exibição, adicionar a linha de resumo depois de `['Taxa fixa', ...]`:
```tsx
                {[['Comissão', pct(p.comissaoPct)], ['Taxa fixa', brl(p.taxaFixa)], ['Embalagem', brl(p.custoEmbalagem)], ['Frete médio', brl(p.custoFrete)], ['Imposto s/ receita', pct(p.impostoPct)]].map(([k, v]) => (
```

5. No formulário do modal, trocar o grid de 3 colunas (Taxa fixa / Frete médio / Cor hex) por um grid de 2 colunas em duas linhas, incluindo o novo campo:
```tsx
          <div className="grid grid-cols-2 gap-3">
            <div><label className="lbl">Taxa fixa R$</label><input className="inp" type="number" step="0.01" value={form.taxaFixa} onChange={f('taxaFixa')} /></div>
            <div><label className="lbl">Frete médio R$</label><input className="inp" type="number" step="0.01" value={form.custoFrete} onChange={f('custoFrete')} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="lbl">Custo embalagem R$</label><input className="inp" type="number" step="0.01" value={form.custoEmbalagem} onChange={f('custoEmbalagem')} placeholder="0,60" /></div>
            <div><label className="lbl">Cor hex</label><input className="inp h-9 p-0.5 cursor-pointer" type="color" value={form.corHex} onChange={f('corHex')} /></div>
          </div>
```

(remove o `<div className="grid grid-cols-3 gap-2">...</div>` original que continha esses três campos)

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros em `plataformas/page.tsx` ou nas rotas de API de plataformas.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma src/app/api/plataformas src/app/plataformas/page.tsx
git commit -m "Adiciona custoEmbalagem ao model Plataforma e ao formulario de cadastro"
```

---

### Task 4: Calculadora usa Plataformas dinâmicas e salva em Precificacao

**Contexto:** `Mercado Livre` é um único registro em `Plataforma` (slug `ml`), mas a Calculadora precisa diferenciar FULL de Clássico (fórmulas de frete completamente diferentes). Decisão confirmada com a usuária: manter ML Full e ML Clássico como entradas fixas no código (como já são hoje), e buscar dinamicamente da tabela `Plataforma` todas as demais plataformas ativas (Shopee, TikTok Shop, e qualquer uma cadastrada no futuro) — essas usam o modelo de frete "fixo" (sem tabela de peso, só taxa fixa + embalagem + coleta).

**Files:**
- Modify: `src/app/calculadora/page.tsx`

**Interfaces:**
- Consumes: `GET /api/plataformas` → `{ id, nome, slug, comissaoPct, taxaFixa, custoFrete, custoColeta, custoEmbalagem, impostoPct, ativa }[]` (Task 3 adicionou `custoEmbalagem`).
- Consumes: `POST /api/precificacao` com body `{ skuVariacao, plataformaId, custoEmbalagem, custoColeta, custoFrete, comissaoPct, impostoPct, precoAtual, tipoFreteML, codigoAnuncio }` (rota já existente, ver Task 1).

- [ ] **Step 1: Substituir a lista fixa de canais por ML fixo + Plataformas dinâmicas**

Em `src/app/calculadora/page.tsx`, substituir o bloco `CANAIS_PADRAO`:

```ts
const CANAIS_PADRAO: Canal[] = [
  { key: 'ml_full',     label: 'ML FULL',     comissao: 0.14, imposto: 0.0829, embalagem: 0,    coleta: 0.60, taxaFixa: 0,    tipoFrete: 'full' },
  { key: 'ml_classico', label: 'ML Clássico', comissao: 0.14, imposto: 0.0829, embalagem: 0.60, coleta: 0,    taxaFixa: 1.25, tipoFrete: 'classico' },
  { key: 'shopee',      label: 'Shopee',      comissao: 0.20, imposto: 0.0829, embalagem: 0.60, coleta: 0,    taxaFixa: 4.00, tipoFrete: 'fixo' },
]
```

por:

```ts
const CANAIS_ML: Canal[] = [
  { key: 'ml_full',     label: 'ML FULL',     comissao: 0.14, imposto: 0.0829, embalagem: 0,    coleta: 0.60, taxaFixa: 0,    tipoFrete: 'full' },
  { key: 'ml_classico', label: 'ML Clássico', comissao: 0.14, imposto: 0.0829, embalagem: 0.60, coleta: 0,    taxaFixa: 1.25, tipoFrete: 'classico' },
]

interface PlataformaAPI {
  id: string; nome: string; slug: string; comissaoPct: number; taxaFixa: number
  custoFrete: number; custoColeta: number; custoEmbalagem: number; impostoPct: number; ativa: boolean
}
```

- [ ] **Step 2: Buscar plataformas ao montar a página e derivar os canais**

Adicionar `useEffect` ao import do React (`import { useState, useRef, useCallback, useEffect } from 'react'`), e trocar a inicialização do state `canais` e adicionar um novo state `plataformas`:

```ts
  const [q, setQ]               = useState('')
  const [produto, setProduto]   = useState<Produto | null>(null)
  const [loading, setLoading]   = useState(false)
  const [plataformas, setPlataformas] = useState<PlataformaAPI[]>([])
  const [canais, setCanais]     = useState<Canal[]>(CANAIS_ML)
```

Adicionar logo abaixo da declaração de states, antes de `buscarProduto`:

```ts
  // ── Buscar plataformas cadastradas (Shopee, TikTok Shop, etc.) ──
  useEffect(() => {
    fetch('/api/plataformas').then(r => r.json()).then((plats: PlataformaAPI[]) => {
      setPlataformas(plats)
      const dinamicos: Canal[] = plats
        .filter(p => p.ativa && p.slug !== 'ml')
        .map(p => ({
          key: p.slug, label: p.nome, comissao: p.comissaoPct, imposto: p.impostoPct,
          embalagem: p.custoEmbalagem, coleta: p.custoColeta, taxaFixa: p.taxaFixa, tipoFrete: 'fixo',
        }))
      setCanais([...CANAIS_ML, ...dinamicos])
    })
  }, [])
```

- [ ] **Step 3: Salvar em Precificacao em vez de Anuncio**

Substituir a função `salvarAnuncio` inteira (de `const salvarAnuncio = async (rv, col) => {` até o fechamento `}` antes de `salvarTodos`) por:

```ts
  // ── Salvar como precificação ───────────────────────────────
  const plataformaIdPorCanal = (canalKey: string): string | null => {
    if (canalKey === 'ml_full' || canalKey === 'ml_classico') {
      return plataformas.find(p => p.slug === 'ml')?.id ?? null
    }
    return plataformas.find(p => p.slug === canalKey)?.id ?? null
  }

  const salvarPrecificacao = async (rv: ResultadoVariacao, col: ResultadoVariacao['canais'][0]) => {
    const key = `${rv.skuVariacao}_${col.canal.key}`
    setSalvando(p => ({ ...p, [key]: 'Salvo!' }))
    setError('')

    const plataformaId = plataformaIdPorCanal(col.canal.key)
    if (!plataformaId) {
      setError(`Plataforma "${col.canal.label}" não encontrada para salvar. Cadastre-a em Plataformas.`)
      setSalvando(p => ({ ...p, [key]: '' }))
      return
    }

    const tipoFreteML = col.canal.tipoFrete === 'full' ? 'full'
      : col.canal.tipoFrete === 'classico' ? 'flex'
      : 'fixo'

    const r = await fetch('/api/precificacao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skuVariacao:    rv.skuVariacao,
        plataformaId,
        custoEmbalagem: col.canal.embalagem,
        custoColeta:    col.canal.coleta,
        custoFrete:     col.frete || col.canal.taxaFixa,
        comissaoPct:    col.canal.comissao,
        impostoPct:     col.canal.imposto,
        precoAtual:     col.precoPromocional, // sobe com preço promocional
        tipoFreteML,
      }),
    })

    const text = await r.text()
    if (!r.ok) {
      let msg = 'Erro ao salvar precificação'
      try { msg = JSON.parse(text)?.error ?? msg } catch {}
      setError(msg)
    } else {
      setSalvos(p => ({ ...p, [key]: 'Salvo!' }))
      setTimeout(() => setSalvos(p => ({ ...p, [key]: '' })), 4000)
    }
    setSalvando(p => ({ ...p, [key]: '' }))
  }

  const salvarTodos = async (rv: ResultadoVariacao) => {
    for (const col of rv.canais) {
      await salvarPrecificacao(rv, col)
    }
  }
```

(a função `salvarTodos` já existe logo depois — remover a duplicata antiga e manter só esta versão, que chama `salvarPrecificacao` em vez de `salvarAnuncio`)

- [ ] **Step 4: Trocar a tabela horizontal (8 colunas) por cartões empilhados por canal**

**Contexto confirmado por print da usuária:** com 8 colunas (Canal, Frete, Custo total, Mínimo, Ideal, Máximo, Promoção, Salvar), a tabela passa da largura da tela e obriga rolagem lateral pra ver Máximo/Promoção/Salvar. Substituir por um card por canal, com os 4 preços num grid que quebra linha (sem tabela, sem `overflow-auto`/scroll horizontal).

Substituir todo o bloco, de `{/* Tabela por canal */}` até o `</div>` que fecha `<div className="overflow-auto">` (o bloco `<table>...</table>` inteiro, linhas correspondentes ao `<thead>`/`<tbody>` com as 8 colunas), por:

```tsx
              {/* Cartões por canal */}
              <div className="divide-y divide-gray-100">
                {rv.canais.map(col => {
                  const key = `${rv.skuVariacao}_${col.canal.key}`
                  const isSalvando = salvando[key]
                  const isSalvo    = !!salvos[key]
                  return (
                    <div key={col.canal.key} className="p-4">
                      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                        <div>
                          <span className={`badge text-xs font-semibold ${col.canal.key.startsWith('ml_') ? 'bg-yellow-100 text-yellow-800' : 'bg-slate-100 text-slate-700'}`}>
                            {col.canal.label}
                          </span>
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            {pct(col.canal.comissao)} comissão · {pct(col.canal.imposto)} imposto
                            {col.canal.embalagem > 0 && ` · embal. ${brl(col.canal.embalagem)}`}
                            {col.canal.coleta > 0 && ` · coleta ${brl(col.canal.coleta)}`}
                            {col.canal.taxaFixa > 0 && ` · taxa fixa ${brl(col.canal.taxaFixa)}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-600">
                          <span>Frete: <strong className="text-indigo-600">{brl(col.frete)}</strong></span>
                          <span>Custo total: <strong className="text-gray-800">{brl(col.custoFinal)}</strong></span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="rounded-lg bg-amber-50 p-2 text-center">
                          <div className="text-[10px] text-amber-600 font-medium">Mínimo (20%)</div>
                          <div className="font-semibold text-amber-700">{brl(col.precoMinimo)}</div>
                        </div>
                        <div className="rounded-lg bg-indigo-50 p-2 text-center">
                          <div className="text-[10px] text-indigo-600 font-medium">Ideal (25%) ★</div>
                          <div className="font-bold text-indigo-700 text-base">{brl(col.precoIdeal)}</div>
                        </div>
                        <div className="rounded-lg bg-emerald-50 p-2 text-center">
                          <div className="text-[10px] text-emerald-600 font-medium">Máximo (30%)</div>
                          <div className="font-semibold text-emerald-700">{brl(col.precoMaximo)}</div>
                        </div>
                        <div className="rounded-lg bg-purple-50 p-2 text-center">
                          <div className="text-[10px] text-purple-600 font-medium">Promoção</div>
                          <div className="font-bold text-purple-700 text-base">{brl(col.precoPromocional)}</div>
                        </div>
                      </div>

                      <div className="mt-3 flex justify-end">
                        {isSalvo ? (
                          <span className="text-emerald-500 flex items-center gap-1 text-xs">
                            <CheckCircle2 size={14} /> {salvos[key]}
                          </span>
                        ) : (
                          <button onClick={() => salvarPrecificacao(rv, col)} disabled={!!isSalvando}
                            className="btn-sm bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200">
                            {isSalvando ? <Spinner size={12} /> : <Save size={12} />}
                            {isSalvando ? '…' : 'Salvar'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros em `calculadora/page.tsx`.

Run: `npm run build`
Expected: build completo sem erros (avisos pré-existentes de outras páginas não fazem parte desta task).

Verificação manual (depois do deploy ou com `npm run dev` local): buscar um SKU com múltiplas variações, calcular, confirmar que **nenhuma** informação exige rolagem horizontal — Mínimo/Ideal/Máximo/Promoção devem estar todos visíveis sem scroll lateral em qualquer largura de tela razoável.

- [ ] **Step 6: Commit**

```bash
git add src/app/calculadora/page.tsx
git commit -m "Calculadora usa plataformas cadastradas (Shopee, TikTok Shop...), salva em Precificacao e troca tabela horizontal por cartoes por canal"
```

---

### Task 5: Remover módulo Anúncios

**Pré-requisito:** Tasks 2 e 4 concluídas (nada mais depende de `Anuncio` ou de `/api/anuncios`).

**Files:**
- Delete: `src/app/anuncios/page.tsx`
- Delete: `src/app/api/anuncios/route.ts`
- Delete: `src/app/api/anuncios/[id]/route.ts`
- Modify: `src/components/ui/Sidebar.tsx`
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Confirmar que nada mais referencia `/api/anuncios` ou `db.anuncio`**

Run: `grep -rn "api/anuncios\|db\.anuncio\." src --include=*.ts --include=*.tsx`
Expected: nenhuma ocorrência fora de `src/app/anuncios/` e `src/app/api/anuncios/` (os próprios arquivos que serão apagados neste task).

- [ ] **Step 2: Apagar página e rotas**

```bash
rm -rf src/app/anuncios src/app/api/anuncios
```

- [ ] **Step 3: Remover o link do menu**

Em `src/components/ui/Sidebar.tsx`, remover a linha:
```ts
  { href: '/anuncios',       label: 'Anúncios',        icon: Megaphone },
```
E remover `Megaphone` do import de ícones (não é mais usado em nenhum outro lugar do arquivo — conferir com `grep -n Megaphone src/components/ui/Sidebar.tsx` antes de remover, deve sobrar só a linha do import).

- [ ] **Step 4: Remover o model Anuncio do schema**

Em `prisma/schema.prisma`:
1. Remover o model `Anuncio` inteiro (do comentário `// ─── ANÚNCIOS ───...` até o `}` de fechamento do model).
2. No model `Variacao`, remover a linha `anuncios      Anuncio[]`.

- [ ] **Step 5: Regenerar o Prisma Client**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client` sem erros.

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros. Se aparecer erro referenciando `Anuncio` em algum arquivo não previsto neste plano, parar e investigar antes de continuar (não deletar/ignorar cegamente).

- [ ] **Step 7: Commit**

```bash
git add -A src/app/anuncios src/app/api/anuncios src/components/ui/Sidebar.tsx prisma/schema.prisma
git commit -m "Remove modulo Anuncios (consolidado em Precificacao)"
```

---

### Task 6: Remover área Multicanal (Config Multicanal, Lista de Ação, Simulador de Frete Grátis)

**Files:**
- Delete: `src/app/configuracao-multicanal/page.tsx`
- Delete: `src/app/lista-acao/page.tsx`
- Delete: `src/app/simulador-frete-gratis/page.tsx`
- Delete: `src/app/api/canais/route.ts`, `src/app/api/canais/[id]/route.ts`
- Delete: `src/app/api/configuracao-precificacao/route.ts`
- Delete: `src/app/api/faixas-embalagem/route.ts`, `src/app/api/faixas-embalagem/[id]/route.ts`
- Delete: `src/app/api/faixas-frete/route.ts`, `src/app/api/faixas-frete/[id]/route.ts`
- Delete: `src/app/api/lista-acao/route.ts`, `src/app/api/lista-acao/[id]/route.ts`, `src/app/api/lista-acao/gerar/route.ts`
- Delete: `src/lib/precificacaoMulticanal.ts`
- Modify: `src/components/ui/Sidebar.tsx`
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Apagar páginas, rotas e lib**

```bash
rm -rf src/app/configuracao-multicanal src/app/lista-acao src/app/simulador-frete-gratis
rm -rf src/app/api/canais src/app/api/configuracao-precificacao src/app/api/faixas-embalagem src/app/api/faixas-frete src/app/api/lista-acao
rm -f src/lib/precificacaoMulticanal.ts
```

- [ ] **Step 2: Remover os 3 links e ícones não mais usados do menu**

Em `src/components/ui/Sidebar.tsx`, remover o divider e as 3 linhas:
```ts
  { divider: true,           label: 'Multicanal' },
  { href: '/configuracao-multicanal', label: 'Config. Multicanal',     icon: SlidersHorizontal },
  { href: '/lista-acao',              label: 'Lista de Ação',          icon: Play },
  { href: '/simulador-frete-gratis',  label: 'Simulador Frete Grátis', icon: Gift },
```
E remover `SlidersHorizontal, Play, Gift` do import de ícones (ficam sem uso no arquivo depois dessa remoção).

- [ ] **Step 3: Remover os models do schema**

Em `prisma/schema.prisma`, remover a seção inteira `// ─── PRECIFICAÇÃO MULTICANAL ───...`, incluindo: enum `TipoAcaoPrecificacao`, e os models `Canal`, `ComissaoCategoria`, `FaixaEmbalagem`, `FaixaFrete`, `ConfiguracaoPrecificacao`, `ListaAcaoPrecificacao` — do comentário de abertura da seção até o `}` de fechamento de `ListaAcaoPrecificacao` (tudo antes da seção `// ─── FATURAMENTO DIÁRIO ───`, que permanece).

- [ ] **Step 4: Regenerar o Prisma Client**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client` sem erros.

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `grep -rn "precificacaoMulticanal\|api/canais\|api/lista-acao\|api/faixas-embalagem\|api/faixas-frete\|api/configuracao-precificacao" src --include=*.ts --include=*.tsx`
Expected: nenhuma ocorrência.

- [ ] **Step 6: Commit**

```bash
git add -A prisma/schema.prisma src/components/ui/Sidebar.tsx
git commit -m "Remove area de precificacao multicanal (nunca concluida, sem uso)"
```

---

### Task 7: Aplicar mudanças de schema no banco de produção

**Pré-requisito:** Tasks 1, 3, 5 e 6 concluídas (todas as edições de `prisma/schema.prisma` deste plano já feitas).

**Files:** nenhum arquivo novo — só comandos.

- [ ] **Step 1: Backup manual antes de tocar no banco**

Run: `npm run db:backup`
Expected: saída `Backup salvo em: ...` com contagem de registros de todas as 20 tabelas (confirmar que `produto` e `compra` aparecem com números > 0, batendo com o uso real do sistema).

- [ ] **Step 2: Revisar o diff completo do schema antes de aplicar**

Run: `git diff HEAD~6 -- prisma/schema.prisma` (ajustar o número de commits conforme quantos commits este plano gerou até aqui) ou simplesmente `git log -p -- prisma/schema.prisma` para conferir visualmente: campo `codigoAnuncio` adicionado, campo `custoEmbalagem` adicionado, model `Anuncio` removido, models multicanal removidos. Nenhuma outra mudança deve aparecer.

- [ ] **Step 3: Aplicar no banco**

Run: `npx prisma db push`
Expected: prompt pode avisar sobre remoção de tabelas (`Anuncio`, `Canal`, `ComissaoCategoria`, `FaixaEmbalagem`, `FaixaFrete`, `ConfiguracaoPrecificacao`, `ListaAcaoPrecificacao`) — confirmar que são exatamente essas 7 tabelas e nenhuma outra (`Produto`, `Compra`, `Precificacao` etc. não devem aparecer na lista de remoção). Se aparecer qualquer tabela inesperada na lista, **cancelar e investigar antes de confirmar**.
Ao final: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 4: Verificar em runtime**

Rodar localmente: `npm run dev`, abrir `http://localhost:3000/precificacao`, clicar em "Nova", confirmar que o campo "Código do anúncio" aparece no formulário e salva sem erro (testar com um SKU de variação real existente). Abrir `http://localhost:3000/plataformas`, confirmar que o campo "Custo embalagem" aparece e edita sem erro. Abrir `http://localhost:3000/calculadora`, buscar um SKU, clicar "Calcular preços", confirmar que aparecem ML FULL, ML Clássico, Shopee e TikTok Shop na lista de canais.

- [ ] **Step 5: Commit (se algo mudou além do schema já commitado — normalmente nada, já que o push só afeta o banco)**

Nada a commitar nesta task — o schema já foi commitado nas tasks anteriores. Esta task só aplica no banco.

---

### Task 8: Excluir plataforma pela UI + remover Magalu

**Files:**
- Modify: `src/app/plataformas/page.tsx`

**Interfaces:**
- Consumes: `DELETE /api/plataformas/[id]` (rota já existe, sem alteração necessária).

- [ ] **Step 1: Adicionar botão de excluir com confirmação**

Em `src/app/plataformas/page.tsx`:

1. Adicionar `Trash2` ao import de ícones:
```ts
import { Plus, Pencil, Trash2 } from 'lucide-react'
```

2. Adicionar a função de exclusão, logo depois de `const f = (k: string) => ...`:
```ts
  const remover = async (p: Plataforma) => {
    if (!confirm(`Excluir a plataforma "${p.nome}"? Isso apaga também todo o histórico de precificação ligado a ela. Essa ação não pode ser desfeita.`)) return
    const r = await fetch(`/api/plataformas/${p.id}`, { method: 'DELETE' })
    if (!r.ok) { alert('Erro ao excluir plataforma'); return }
    load()
  }
```

3. No card de cada plataforma, adicionar o botão ao lado do botão de editar existente:
```tsx
                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(p)} className="text-gray-300 hover:text-indigo-600 transition-colors"><Pencil size={15} /></button>
                  <button onClick={() => remover(p)} className="text-gray-300 hover:text-red-600 transition-colors"><Trash2 size={15} /></button>
                </div>
```
(substituindo o `<button onClick={() => openEdit(p)} className="text-gray-300 hover:text-indigo-600 transition-colors"><Pencil size={15} /></button>` original, que hoje é filho direto da div `flex items-start justify-between mb-4` — envolver os dois botões numa nova div `flex items-center gap-2` no lugar do botão único)

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/plataformas/page.tsx
git commit -m "Adiciona botao de excluir plataforma (com confirmacao)"
```

- [ ] **Step 4: Excluir a Magalu (ação manual, feita pela usuária ou pelo executor do plano)**

Depois do deploy em produção: acessar `/plataformas`, localizar o card "Magalu", clicar no novo ícone de lixeira, confirmar a exclusão no diálogo. Verificar que o card desaparece da lista.

---

### Task 9: Busca por nome também na Calculadora

**Contexto:** confirmado com a usuária — a página dedicada "Busca por SKU" (`/busca`) já busca por SKU e por nome (via `/api/busca`). Mas o campo de busca **dentro da Calculadora** usa `GET /api/produtos/[id]`, que só faz `findUnique` por `skuPrincipal` exato — não encontra nada se ela digitar um nome de produto ali. Trocar para usar `/api/busca` (mesma rota fuzzy já usada em `/busca`), com uma lista de sugestões quando houver mais de um resultado.

**Files:**
- Modify: `src/app/calculadora/page.tsx`

**Interfaces:**
- Consumes: `GET /api/busca?q=...` → `{ results: Produto[] }` (rota já existente, `src/app/api/busca/route.ts`, retorna produtos com `variacoes` já incluídas — mesmo formato usado por `GET /api/produtos/[id]`).

- [ ] **Step 1: Adicionar state para as sugestões de busca**

Logo abaixo de `const [loading, setLoading]   = useState(false)`, adicionar:
```ts
  const [sugestoes, setSugestoes] = useState<Produto[]>([])
```

- [ ] **Step 2: Trocar `buscarProduto` para usar `/api/busca` (SKU ou nome)**

Substituir a função `buscarProduto` inteira por:

```ts
  const buscarProduto = useCallback(async (q: string) => {
    if (q.length < 2) { setProduto(null); setSugestoes([]); setResultados([]); setCalculado(false); return }
    setLoading(true)

    const rBusca = await fetch(`/api/busca?q=${encodeURIComponent(q)}`)
    const { results } = rBusca.ok ? await rBusca.json() : { results: [] }

    if (results.length === 1) {
      setProduto(results[0])
      setSugestoes([])
      setResultados([])
      setCalculado(false)
      setLoading(false)
      return
    }

    if (results.length > 1) {
      setProduto(null)
      setSugestoes(results)
      setResultados([])
      setCalculado(false)
      setLoading(false)
      return
    }

    // Nada encontrado por SKU/nome — tentar como kit (busca exata)
    setSugestoes([])
    const rKit = await fetch(`/api/kits/${encodeURIComponent(q)}`)
    if (rKit.ok) {
      const kit = await rKit.json()
      const kitComoProduto = {
        skuPrincipal: kit.skuKit,
        nome: kit.nome,
        categoria: kit.categoria,
        custoAtualizado: kit.custoTotal,
        isKit: true,
        variacoes: [{
          skuVariacao: kit.skuKit + '-OKit',
          nomeVariacao: kit.nome,
          pesoGramas: null,
          custoTotal: kit.custoTotal,
          custoCalculado: kit.custoTotal,
          status: 'ativo',
        }],
      }
      setProduto(kitComoProduto as any)
      setResultados([])
      setCalculado(false)
    } else {
      setProduto(null)
    }
    setLoading(false)
  }, [])

  const selecionarSugestao = (p: Produto) => {
    setProduto(p)
    setSugestoes([])
    setResultados([])
    setCalculado(false)
  }
```

- [ ] **Step 3: Atualizar o placeholder e mostrar a lista de sugestões**

No painel de busca, trocar o placeholder do input:
```tsx
              <input className="inp pl-9 pr-8" value={q} onChange={e => handleQ(e.target.value)}
                placeholder="Digite o SKU ou nome do produto…" autoFocus />
```

Logo depois do bloco `{produto && (...)}` que mostra o card do produto encontrado, e antes de `{q.length >= 2 && !produto && !loading && (...)}`, adicionar a lista de sugestões:

```tsx
            {sugestoes.length > 0 && (
              <div className="mt-3 border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
                {sugestoes.map(s => (
                  <button key={s.skuPrincipal} onClick={() => selecionarSugestao(s)}
                    className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors">
                    <div className="text-sm font-medium text-gray-800">{s.nome}</div>
                    <div className="text-xs text-gray-400">{s.categoria} · SKU {s.skuPrincipal}</div>
                  </button>
                ))}
              </div>
            )}
```

E atualizar a condição da mensagem de "não encontrado" para não aparecer quando há sugestões:
```tsx
            {q.length >= 2 && !produto && !loading && sugestoes.length === 0 && (
              <p className="text-xs text-red-500 mt-2">Nenhum produto encontrado com esse SKU ou nome.</p>
            )}
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros em `calculadora/page.tsx`.

Verificação manual (`npm run dev`): digitar parte do **nome** de um produto (não o SKU) no campo de busca da Calculadora — deve aparecer a lista de sugestões (ou selecionar direto, se só houver um resultado). Digitar um SKU exato continua funcionando como antes.

- [ ] **Step 5: Commit**

```bash
git add src/app/calculadora/page.tsx
git commit -m "Calculadora passa a buscar produto por nome, alem do SKU exato"
```

---

### Task 10: Verificação final e deploy

**Files:** nenhum.

- [ ] **Step 1: Build completo**

Run: `npm run build`
Expected: build completo sem erros novos (comparar com o resultado de uma build anterior a este plano, se necessário, para isolar erros pré-existentes não relacionados).

- [ ] **Step 2: Backup pós-mudanças**

Run: `npm run db:backup`
Expected: novo backup gerado, confirmando que o sistema continua salvando dados normalmente depois de todas as mudanças de schema.

- [ ] **Step 3: Push para produção**

```bash
git push origin main
```

- [ ] **Step 4: Verificar o deploy no Railway**

Acompanhar o deploy automático dado o push (aba Deployments do serviço "precify" no Railway). Depois de "Online", acessar a URL de produção e conferir manualmente: menu lateral sem Anúncios/Multicanal, Calculadora mostrando TikTok Shop, Precificação com campo de código de anúncio, Plataformas com botão de excluir e sem a Magalu.

---

## Self-Review

**Cobertura do spec** (`docs/superpowers/specs/2026-07-12-limpeza-e-ajustes-design.md`):
- Item 1 (remover Anúncios + codigoAnuncio em Precificação) → Tasks 1, 2, 5. ✅
- Item 2 (remover Config Multicanal/Lista de Ação/Simulador) → Task 6. ✅
- Item 3 (TikTok + Calculadora via Plataformas) → Tasks 3, 4. ✅ (usando a abordagem híbrida ML-fixo + Plataformas-dinâmicas, confirmada com a usuária depois da descoberta de que "Mercado Livre" é um único registro)
- Item 4 (layout da Calculadora) → Task 4, Step 4. ✅ Print da usuária confirmou que o problema real era a tabela de 8 colunas exigindo rolagem lateral (não variações lado a lado, como a formulação original do spec sugeria) — corrigido trocando a tabela por cartões empilhados por canal com os preços num grid que quebra linha, sem scroll horizontal.
- Item 5 (excluir Magalu + botão excluir Plataformas) → Task 8. ✅
- Itens extras descobertos durante a conversa e o levantamento de arquivos (não estavam no spec original):
  - `importar/validar` dependia de `Anuncio` → Task 2 (necessidade técnica, achado ao mapear arquivos).
  - Busca por nome não funcionava dentro da Calculadora (só na página dedicada `/busca`) → Task 9 (a usuária esclareceu que o pedido original de "busca por nome" era sobre a Calculadora, não sobre `/busca`, que já funcionava).

**Placeholder scan:** nenhum "TBD"/"TODO" nos steps.

**Type consistency:** `PlataformaAPI` (Task 4) usa os mesmos nomes de campo retornados pela rota `GET /api/plataformas` (Task 3 adicionou `custoEmbalagem` a essa resposta). `salvarPrecificacao` usa exatamente os nomes de campo aceitos por `POST /api/precificacao` (Task 1/já existente). `codigoAnuncio` usado de forma consistente em schema, rotas e UI (Task 1).
