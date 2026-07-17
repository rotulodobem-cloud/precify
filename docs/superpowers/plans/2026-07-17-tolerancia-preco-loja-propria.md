# Tolerância de Preço — Loja Própria — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rastrear o preço praticado hoje na Loja Própria (`CalculoMulticanal.precoPraticadoLP`), comparar com o preço calculado dentro de uma tolerância configurável, e avisar quando vale reajustar — alimentado por importação em massa de uma planilha do Bling, não por digitação produto a produto.

**Architecture:** Um novo par de campos em `CalculoMulticanal` guarda o preço praticado e quando foi atualizado. Uma tolerância global fica salva em `Configuracao` (reaproveitando o model key-value já existente). A comparação é sempre recalculada ao vivo (sem job/gatilho), já que o preço calculado da Loja Própria já reage ao custo mais recente automaticamente. Uma nova tela de importação (padrão validar→confirmar, igual à importação de compras) popula o preço praticado em massa a partir de uma planilha exportada do Bling. O Multicanal RdB ganha o campo editável + selo de desvio; o Dashboard troca o sinal aproximado por essa comparação precisa, sempre que disponível.

**Tech Stack:** Next.js 14 (App Router), React 18, Prisma 5, PostgreSQL, TypeScript, biblioteca `xlsx` (já usada em `/importar`).

## Global Constraints

- Sem framework de testes automatizado — verificação por `npx tsc --noEmit`, `npm run build`, testes ao vivo.
- Sem banco de staging — `DATABASE_URL` aponta pra produção.
- Trabalhar direto na branch `main`.
- A página `src/app/precificacao-multicanal/page.tsx` usa CSS customizado via `<style dangerouslySetInnerHTML>` com classes prefixadas `rdb-*`, não Tailwind — seguir esse padrão ao editar esse arquivo especificamente. As demais páginas do sistema usam classes utilitárias já definidas no CSS global (`card`, `btn-primary`, `btn-ghost`, `th`, `td`, `tr-row`, etc.) e componentes de `src/components/ui` (`Alert`, `Spinner`, `StatusBadge`).
- Todas as rotas `/api/*` e páginas já são protegidas por autenticação via `src/middleware.ts` automaticamente — nenhum arquivo novo criado neste plano precisa de configuração extra de auth.
- Fórmula de desvio: `desvio = (precoCalculadoLP - precoPraticadoLP) / precoPraticadoLP`. Positivo → preço calculado subiu acima do praticado (`direcao: 'subir'`); negativo → desceu abaixo (`direcao: 'baixar'`). Fica fora de tolerância quando `Math.abs(desvio) * 100 > tolerância`.

---

### Task 1 (executada pelo controlador, não delegada): Schema — novos campos

**Contexto:** Campos aditivos e nullable — seguro de aplicar direto em produção sem risco de perda de dado. Deve rodar antes de qualquer outra task, já que todas dependem do Prisma Client já conhecer esses campos.

- [ ] **Step 1: Adicionar os campos ao model `CalculoMulticanal`**

Em `prisma/schema.prisma`, dentro do model `CalculoMulticanal`, adicionar duas linhas depois de `canaisAtivos`:

```prisma
model CalculoMulticanal {
  id                            String    @id @default(cuid())
  skuVariacao                   String?
  sku                           String?
  nome                          String
  variacao                      String    @default("")
  custoProduto                  Float
  pesoGramas                    Float?
  despesasVariaveisPct          Float     @default(8)
  despesasFixasPct              Float     @default(0)
  modo                          String    @default("preco")
  precoTeste                    Float?
  canais                        Json
  codigosAnuncio                Json?
  canaisAtivos                  Json?
  precoPraticadoLP              Float?
  precoPraticadoLPAtualizadoEm  DateTime?
  createdAt                     DateTime  @default(now())
  updatedAt                     DateTime  @updatedAt

  @@unique([sku, variacao])
}
```

- [ ] **Step 2: Aplicar no banco**

Run: `npx prisma generate`
Run: `npx prisma db push`
Expected: aplica limpo, sem aviso de perda de dado (campos novos são nullable).

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: sem novos erros (os únicos usos dos campos novos aparecem nas próximas tasks).

- [ ] **Step 4: Backup de confirmação**

Run: `node scripts/backup-db.js`
Expected: roda sem erro, contagem de `calculoMulticanal` igual à de antes desta mudança.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "Schema: adiciona precoPraticadoLP e precoPraticadoLPAtualizadoEm ao CalculoMulticanal"
```

---

### Task 2: Backend — configuração de tolerância + persistência do preço praticado

**Files:**
- Create: `src/app/api/configuracao/tolerancia-loja-propria/route.ts`
- Modify: `src/app/api/calculo-multicanal/route.ts`

**Interfaces:**
- Produces: `GET /api/configuracao/tolerancia-loja-propria` → `{ valor: number }` (percentual, ex: `10` para 10%).
- Produces: `PUT /api/configuracao/tolerancia-loja-propria` (body `{ valor: number }`) → `{ valor: number }`.
- Modifies: `POST /api/calculo-multicanal` agora também persiste `precoPraticadoLP` (e grava `precoPraticadoLPAtualizadoEm` junto).

- [ ] **Step 1: Criar a rota de configuração de tolerância**

Criar `src/app/api/configuracao/tolerancia-loja-propria/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

const CHAVE = 'tolerancia_loja_propria_pct'
const PADRAO = 10

export async function GET() {
  const config = await db.configuracao.findUnique({ where: { chave: CHAVE } })
  const valor = config ? parseFloat(config.valor) : PADRAO
  return NextResponse.json({ valor: isNaN(valor) ? PADRAO : valor })
}

export async function PUT(req: NextRequest) {
  const { valor } = await req.json()
  const num = parseFloat(valor)
  if (isNaN(num) || num < 0)
    return NextResponse.json({ error: 'Valor de tolerância inválido' }, { status: 400 })

  const config = await db.configuracao.upsert({
    where: { chave: CHAVE },
    update: { valor: String(num) },
    create: { chave: CHAVE, valor: String(num), descricao: 'Tolerância de desvio entre preço calculado e preço praticado na Loja Própria (%)' },
  })
  return NextResponse.json({ valor: parseFloat(config.valor) })
}
```

- [ ] **Step 2: Persistir `precoPraticadoLP` no salvamento do Multicanal RdB**

Em `src/app/api/calculo-multicanal/route.ts`, no `POST`, adicionar `precoPraticadoLP`/`precoPraticadoLPAtualizadoEm` ao objeto `data`:

Trocar:
```ts
  const data = {
    sku: sku || null,
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
    canaisAtivos: b.canaisAtivos ?? {},
  }
```

por:
```ts
  const precoPraticadoLP = b.precoPraticadoLP != null && b.precoPraticadoLP !== ''
    ? parseFloat(b.precoPraticadoLP) : null

  const data = {
    sku: sku || null,
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
    canaisAtivos: b.canaisAtivos ?? {},
    precoPraticadoLP,
    precoPraticadoLPAtualizadoEm: precoPraticadoLP != null ? new Date() : null,
  }
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit` e `npm run build`
Expected: ambos sem erros.

- [ ] **Step 4: Verificar ao vivo**

Com `npm run dev` ativo e logado como admin:
`curl http://localhost:3001/api/configuracao/tolerancia-loja-propria` → confirmar `{"valor":10}` (padrão, já que ainda não foi configurado).
`curl -X PUT http://localhost:3001/api/configuracao/tolerancia-loja-propria -H "Content-Type: application/json" -d '{"valor": 8}'` → confirmar `{"valor":8}`, e um novo `GET` confirmando que persistiu.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/configuracao/tolerancia-loja-propria/route.ts src/app/api/calculo-multicanal/route.ts
git commit -m "Backend: configuracao de tolerancia da Loja Propria + persistencia do preco praticado"
```

---

### Task 3: Multicanal RdB — preço praticado e tolerância na tela

**Files:**
- Modify: `src/app/precificacao-multicanal/page.tsx`

**Interfaces:**
- Consumes: `GET/PUT /api/configuracao/tolerancia-loja-propria` (Task 2).
- Consumes: `POST /api/calculo-multicanal` agora aceita `precoPraticadoLP` no body (Task 2).

- [ ] **Step 1: Adicionar estado de preço praticado e tolerância**

Trocar:
```tsx
  // Biblioteca
  const [biblioteca, setBiblioteca] = useState<any[]>([])
  const [libFiltro, setLibFiltro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [msgSalvo, setMsgSalvo] = useState('')
```

por:
```tsx
  // Biblioteca
  const [biblioteca, setBiblioteca] = useState<any[]>([])
  const [libFiltro, setLibFiltro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [msgSalvo, setMsgSalvo] = useState('')

  // Preço praticado (Loja Própria) e tolerância
  const [precoPraticadoLP, setPrecoPraticadoLP] = useState<number | null>(null)
  const [tolerancia, setTolerancia] = useState(10)

  useEffect(() => {
    fetch('/api/configuracao/tolerancia-loja-propria').then(r => r.json()).then(d => setTolerancia(d.valor))
  }, [])

  const salvarTolerancia = async (novoValor: number) => {
    setTolerancia(novoValor)
    await fetch('/api/configuracao/tolerancia-loja-propria', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valor: novoValor }),
    })
  }
```

- [ ] **Step 2: Resetar preço praticado ao limpar produto**

Trocar:
```tsx
  const limparProduto = () => {
    setProdutoSel(null); setSkuVariacaoLigado(null)
    setSku(''); setNome(''); setVariacaoTxt(''); setCustoProduto(0); setPesoGramas(null)
    setQ(''); setSugestoes([])
    setCanaisAtivos({})
  }
```

por:
```tsx
  const limparProduto = () => {
    setProdutoSel(null); setSkuVariacaoLigado(null)
    setSku(''); setNome(''); setVariacaoTxt(''); setCustoProduto(0); setPesoGramas(null)
    setQ(''); setSugestoes([])
    setCanaisAtivos({})
    setPrecoPraticadoLP(null)
  }
```

- [ ] **Step 3: Enviar preço praticado ao salvar**

Trocar:
```tsx
      body: JSON.stringify({
        sku, nome, variacao: variacaoTxt, skuVariacao: skuVariacaoLigado,
        custoProduto, pesoGramas, despesasVariaveisPct: despVarPct, despesasFixasPct: despFixPct,
        modo, precoTeste, canais, canaisAtivos,
      }),
```

por:
```tsx
      body: JSON.stringify({
        sku, nome, variacao: variacaoTxt, skuVariacao: skuVariacaoLigado,
        custoProduto, pesoGramas, despesasVariaveisPct: despVarPct, despesasFixasPct: despFixPct,
        modo, precoTeste, canais, canaisAtivos, precoPraticadoLP,
      }),
```

- [ ] **Step 4: Carregar preço praticado ao abrir item da biblioteca**

Trocar:
```tsx
    setCanais(canaisCompletos)
    setCanaisAtivos(item.canaisAtivos ?? {})
    setProdutoSel(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
```

por:
```tsx
    setCanais(canaisCompletos)
    setCanaisAtivos(item.canaisAtivos ?? {})
    setPrecoPraticadoLP(item.precoPraticadoLP ?? null)
    setProdutoSel(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
```

- [ ] **Step 5: Calcular o desvio antes do `return`**

Trocar:
```tsx
  const resultados: Record<string, ResultadoCanal | null> = {}
  CANAIS_MULTICANAL.forEach(def => {
    const shAuto = autoStates[def.key] ?? true
    resultados[def.key] = modo === 'preco'
      ? calcularCanalModoPreco({ custoProduto, despVarPct, despFixPct, pesoGramas, canal: canais[def.key], def, shAuto })
      : calcularCanalModoAnalise({ custoProduto, despVarPct, despFixPct, pesoGramas, precoTeste, canal: canais[def.key], def, shAuto })
  })

  return (
```

por:
```tsx
  const resultados: Record<string, ResultadoCanal | null> = {}
  CANAIS_MULTICANAL.forEach(def => {
    const shAuto = autoStates[def.key] ?? true
    resultados[def.key] = modo === 'preco'
      ? calcularCanalModoPreco({ custoProduto, despVarPct, despFixPct, pesoGramas, canal: canais[def.key], def, shAuto })
      : calcularCanalModoAnalise({ custoProduto, despVarPct, despFixPct, pesoGramas, precoTeste, canal: canais[def.key], def, shAuto })
  })

  const resultadoLP = resultados.lp
  const desvioLP = (precoPraticadoLP && precoPraticadoLP > 0 && resultadoLP)
    ? (resultadoLP.preco - precoPraticadoLP) / precoPraticadoLP
    : null
  const desvioLPForaTolerancia = desvioLP != null && Math.abs(desvioLP) * 100 > tolerancia

  return (
```

- [ ] **Step 6: CSS — tolerância e bloco de preço praticado**

Trocar:
```css
        .rdb-toggle button.on { background: #055E2B; color: #fff; }
```

por:
```css
        .rdb-toggle button.on { background: #055E2B; color: #fff; }
        .rdb-tol { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 12.5px; font-weight: 600; color: #5C6B60; margin: -8px auto 20px; }
        .rdb-tol input { width: 56px; font-family: 'Poppins'; font-weight: 600; font-size: 13px; border: 1.5px solid #DDE7D4; border-radius: 8px; padding: 6px 8px; text-align: center; background: #fff; }
        .rdb-lp-praticado { margin: 10px 14px 0; }
        .rdb-lp-selo { display: inline-block; margin-top: 6px; }
```

- [ ] **Step 7: Link pra importação em massa no cabeçalho**

Trocar:
```tsx
          <h1>O preço ideal de venda em <span>cada canal</span></h1>
        </div>
```

por:
```tsx
          <h1>O preço ideal de venda em <span>cada canal</span></h1>
          <a href="/precos-praticados" style={{ display: 'inline-block', marginTop: 10, fontSize: 11.5, color: '#CDDE35', textDecoration: 'underline' }}>
            Importar preços praticados em massa (Loja Própria) →
          </a>
        </div>
```

- [ ] **Step 8: Campo de tolerância abaixo do toggle**

Trocar:
```tsx
          <div className="rdb-toggle">
            <button className={modo === 'preco' ? 'on' : ''} onClick={() => setModo('preco')}>Descobrir o preço ideal</button>
            <button className={modo === 'margem' ? 'on' : ''} onClick={() => setModo('margem')}>Analisar um preço</button>
          </div>

          <section className="rdb-card">
```

por:
```tsx
          <div className="rdb-toggle">
            <button className={modo === 'preco' ? 'on' : ''} onClick={() => setModo('preco')}>Descobrir o preço ideal</button>
            <button className={modo === 'margem' ? 'on' : ''} onClick={() => setModo('margem')}>Analisar um preço</button>
          </div>

          <div className="rdb-tol">
            <span>Tolerância de preço (Loja Própria):</span>
            <input type="number" step="1" min="0" value={tolerancia}
              onChange={e => setTolerancia(parseFloat(e.target.value) || 0)}
              onBlur={e => salvarTolerancia(parseFloat(e.target.value) || 0)} />
            <span>%</span>
          </div>

          <section className="rdb-card">
```

- [ ] **Step 9: Campo de preço praticado e selo de desvio no card da Loja Própria**

Trocar:
```tsx
                  <div className="rdb-chan-head">
                    <span className="rdb-chan-ic" style={{ background: def.cor, color: def.corTexto }}>
                      {def.nome.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="rdb-chan-nome">{def.nome}<span>{def.tag}</span></span>
                    {def.key !== 'lp' && !canaisAtivos[def.key] && <span className="rdb-selo" style={{ background: '#EEF2E9', color: '#5C6B60' }}>sem anúncio</span>}
                    {r && r.lucro < 0 && <span className="rdb-selo err">prejuízo</span>}
                  </div>

                  {def.key !== 'lp' && (
```

por:
```tsx
                  <div className="rdb-chan-head">
                    <span className="rdb-chan-ic" style={{ background: def.cor, color: def.corTexto }}>
                      {def.nome.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="rdb-chan-nome">{def.nome}<span>{def.tag}</span></span>
                    {def.key !== 'lp' && !canaisAtivos[def.key] && <span className="rdb-selo" style={{ background: '#EEF2E9', color: '#5C6B60' }}>sem anúncio</span>}
                    {r && r.lucro < 0 && <span className="rdb-selo err">prejuízo</span>}
                  </div>

                  {def.key === 'lp' && (
                    <div className="rdb-lp-praticado">
                      <div className="rdb-field">
                        <label>Preço praticado hoje (R$)</label>
                        <input type="number" step="0.01" value={precoPraticadoLP ?? ''}
                          onChange={e => setPrecoPraticadoLP(e.target.value ? parseFloat(e.target.value) : null)}
                          placeholder="ex: 24.90" />
                      </div>
                      {desvioLPForaTolerancia && (
                        <span className="rdb-selo err rdb-lp-selo">
                          preço calculado {desvioLP! > 0 ? 'subiu' : 'baixou'} {pctf(Math.abs(desvioLP!) * 100)} vs. praticado
                        </span>
                      )}
                    </div>
                  )}

                  {def.key !== 'lp' && (
```

- [ ] **Step 10: Verificar**

Run: `npx tsc --noEmit` e `npm run build`
Expected: ambos sem erros.

- [ ] **Step 11: Verificar ao vivo**

Com `npm run dev`: abrir `/precificacao-multicanal`, confirmar que o campo de tolerância aparece e persiste (recarregar a página, valor deve continuar). Selecionar um produto, no card da Loja Própria digitar um "preço praticado" bem abaixo do preço calculado, confirmar que o selo de desvio aparece. Salvar o cálculo, recarregar da biblioteca ("Carregar"), confirmar que o preço praticado volta preenchido.

- [ ] **Step 12: Commit**

```bash
git add src/app/precificacao-multicanal/page.tsx
git commit -m "Multicanal RdB: campo de preco praticado e tolerancia configuravel na Loja Propria"
```

---

### Task 4: Backend — importação em massa de preços praticados

**Files:**
- Create: `src/app/api/precos-praticados/validar/route.ts`
- Create: `src/app/api/precos-praticados/confirmar/route.ts`

**Interfaces:**
- Produces: `POST /api/precos-praticados/validar` (body `{ linhas: { linha: number, codigo: string, preco: number }[] }`) → `{ linha, codigo, precoNovo, encontrado, calculoId, sku, nome, precoAntigo }[]`.
- Produces: `POST /api/precos-praticados/confirmar` (body `{ linhas: { calculoId: string, precoNovo: number }[] }`) → `{ ok: true, atualizados: number, erros: string[] }`.
- Casamento por `skuVariacao` — o código da planilha do Bling é comparado direto com `CalculoMulticanal.skuVariacao`.

- [ ] **Step 1: Rota de validação**

Criar `src/app/api/precos-praticados/validar/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

interface LinhaRaw {
  linha: number
  codigo: string
  preco: number
}

export async function POST(req: NextRequest) {
  const { linhas }: { linhas: LinhaRaw[] } = await req.json()

  const codigos = [...new Set(linhas.map(l => l.codigo).filter(Boolean))]
  const calculos = codigos.length
    ? await db.calculoMulticanal.findMany({
        where: { skuVariacao: { in: codigos } },
        select: { id: true, skuVariacao: true, sku: true, nome: true, variacao: true, precoPraticadoLP: true },
      })
    : []
  const porCodigo = new Map(calculos.filter(c => c.skuVariacao).map(c => [c.skuVariacao as string, c]))

  const resultado = linhas.map(l => {
    const match = porCodigo.get(l.codigo)
    return {
      linha: l.linha,
      codigo: l.codigo,
      precoNovo: l.preco,
      encontrado: !!match,
      calculoId: match?.id ?? null,
      sku: match?.sku ?? null,
      nome: match ? (match.variacao ? `${match.nome} ${match.variacao}` : match.nome) : null,
      precoAntigo: match?.precoPraticadoLP ?? null,
    }
  })

  return NextResponse.json(resultado)
}
```

- [ ] **Step 2: Rota de confirmação**

Criar `src/app/api/precos-praticados/confirmar/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

interface LinhaConfirmada {
  calculoId: string
  precoNovo: number
}

export async function POST(req: NextRequest) {
  const { linhas }: { linhas: LinhaConfirmada[] } = await req.json()

  let atualizados = 0
  const erros: string[] = []
  const agora = new Date()

  for (const linha of linhas) {
    try {
      await db.calculoMulticanal.update({
        where: { id: linha.calculoId },
        data: { precoPraticadoLP: linha.precoNovo, precoPraticadoLPAtualizadoEm: agora },
      })
      atualizados++
    } catch (e) {
      erros.push(`${linha.calculoId}: ${String(e)}`)
    }
  }

  return NextResponse.json({ ok: true, atualizados, erros })
}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit` e `npm run build`
Expected: ambos sem erros.

- [ ] **Step 4: Verificar ao vivo**

Com `npm run dev` e logado como admin: pegar um `skuVariacao` real existente (ex: consultar `/api/variacoes`), então:

`curl -X POST http://localhost:3001/api/precos-praticados/validar -H "Content-Type: application/json" -d '{"linhas":[{"linha":1,"codigo":"<skuVariacao real>","preco":29.90},{"linha":2,"codigo":"CODIGO-INEXISTENTE","preco":10}]}'`

Expected: primeira linha com `encontrado: true` e `calculoId` preenchido, segunda com `encontrado: false`.

Depois, confirmar com o `calculoId` retornado:
`curl -X POST http://localhost:3001/api/precos-praticados/confirmar -H "Content-Type: application/json" -d '{"linhas":[{"calculoId":"<id retornado>","precoNovo":29.90}]}'`

Expected: `{"ok":true,"atualizados":1,"erros":[]}`. Confirmar no banco (ou reconsultando `validar` com o mesmo código) que `precoAntigo` agora reflete `29.90`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/precos-praticados/validar/route.ts src/app/api/precos-praticados/confirmar/route.ts
git commit -m "Backend: importacao em massa de precos praticados (validar/confirmar)"
```

---

### Task 5: Tela de importação de preços praticados

**Files:**
- Create: `src/app/precos-praticados/page.tsx`
- Modify: `src/components/ui/Sidebar.tsx`

**Interfaces:**
- Consumes: `POST /api/precos-praticados/validar` e `POST /api/precos-praticados/confirmar` (Task 4).

- [ ] **Step 1: Criar a página**

Criar `src/app/precos-praticados/page.tsx`:

```tsx
'use client'
import { useState, useRef } from 'react'
import { Upload, FileSpreadsheet, CheckCircle2, Search, RefreshCw } from 'lucide-react'
import { Alert, Spinner } from '@/components/ui'
import * as XLSX from 'xlsx'

const brl = (v?: number | null) => v != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '—'

interface LinhaRaw { linha: number; codigo: string; preco: number }
interface LinhaValidada extends LinhaRaw {
  precoNovo: number; encontrado: boolean; calculoId: string | null
  sku: string | null; nome: string | null; precoAntigo: number | null
}

type Etapa = 'upload' | 'validacao' | 'concluido'
const PASSOS: Etapa[] = ['upload', 'validacao', 'concluido']

export default function PrecosPraticadosPage() {
  const [etapa, setEtapa] = useState<Etapa>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [linhas, setLinhas] = useState<LinhaValidada[]>([])
  const [loading, setLoading] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [resultado, setResultado] = useState<{ atualizados: number; erros: string[] } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    if (!f.name.match(/\.(xlsx|xls)$/i)) { setError('Apenas .xlsx ou .xls'); return }
    setFile(f); setError('')
  }

  const lerPlanilha = (f: File): Promise<LinhaRaw[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer)
          const wb = XLSX.read(data, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
          const linhasRaw: LinhaRaw[] = rows.map((row, i) => ({
            linha: i + 2,
            codigo: String(row['Código'] ?? row['Codigo'] ?? row['SKU'] ?? row['Sku'] ?? row['codigo'] ?? '').trim(),
            preco: parseFloat(String(row['Preço'] ?? row['Preco'] ?? row['Valor'] ?? row['preco'] ?? '0').replace(',', '.')),
          })).filter(r => r.codigo && r.preco > 0)
          resolve(linhasRaw)
        } catch (err) { reject(err) }
      }
      reader.readAsArrayBuffer(f)
    })
  }

  const validar = async () => {
    if (!file) return
    setLoading(true); setError('')
    try {
      const linhasRaw = await lerPlanilha(file)
      if (!linhasRaw.length) {
        setError('Nenhuma linha válida encontrada — confira se a planilha tem colunas de código e preço.')
        setLoading(false); return
      }
      const r = await fetch('/api/precos-praticados/validar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ linhas: linhasRaw }),
      })
      const validadas: LinhaValidada[] = await r.json()
      setLinhas(validadas)
      setEtapa('validacao')
    } catch { setError('Erro ao ler a planilha.') }
    setLoading(false)
  }

  const confirmar = async () => {
    const encontrados = linhas.filter(l => l.encontrado && l.calculoId)
    if (!encontrados.length) { setError('Nenhuma linha encontrada pra atualizar.'); return }
    setConfirmando(true); setError('')
    const r = await fetch('/api/precos-praticados/confirmar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linhas: encontrados.map(l => ({ calculoId: l.calculoId, precoNovo: l.precoNovo })) }),
    })
    setResultado(await r.json())
    setEtapa('concluido')
    setConfirmando(false)
  }

  const encontrados = linhas.filter(l => l.encontrado)
  const naoEncontrados = linhas.filter(l => !l.encontrado)

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="page-title">Preços praticados — Loja Própria</h1>
        <p className="text-sm text-gray-500 mt-0.5">Suba a planilha exportada do Bling pra atualizar os preços praticados em massa</p>
      </div>

      <div className="flex items-center gap-2 text-xs">
        {['Upload', 'Prévia', 'Concluído'].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${etapa === PASSOS[i] ? 'bg-indigo-600 text-white' : i < PASSOS.indexOf(etapa) ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
              {i < PASSOS.indexOf(etapa) ? '✓' : i + 1}
            </div>
            <span className={etapa === PASSOS[i] ? 'font-semibold text-gray-800' : 'text-gray-400'}>{s}</span>
            {i < 2 && <div className="w-8 h-px bg-gray-200" />}
          </div>
        ))}
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {etapa === 'upload' && (
        <div className="space-y-4">
          <div className="card p-4 bg-blue-50 border-blue-100 text-sm text-blue-700">
            <p className="font-semibold">Colunas esperadas: <strong>Código (ou SKU)</strong> e <strong>Preço</strong></p>
            <p className="mt-1">O código deve bater com o SKU de variação já cadastrado no Multicanal RdB (ex: 242-O1kg).</p>
          </div>
          <div className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            onClick={() => ref.current?.click()}>
            <FileSpreadsheet size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="font-medium text-gray-600">{file ? file.name : 'Arraste a planilha ou clique'}</p>
            <p className="text-xs text-gray-400 mt-1">.xlsx ou .xls</p>
            <input ref={ref} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </div>
          {file && (
            <button onClick={validar} disabled={loading} className="btn-primary w-full justify-center py-3">
              {loading ? <Spinner size={16} /> : <Search size={16} />}{loading ? 'Lendo…' : 'Ler planilha'}
            </button>
          )}
        </div>
      )}

      {etapa === 'validacao' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex gap-3 text-xs">
              <span className="px-2 py-1 rounded-full border bg-emerald-50 border-emerald-200">Encontrados: {encontrados.length}</span>
              <span className="px-2 py-1 rounded-full border bg-red-50 border-red-200">Não encontrados: {naoEncontrados.length}</span>
            </div>
            <button onClick={() => { setEtapa('upload'); setFile(null); setLinhas([]) }} className="btn-ghost text-xs"><RefreshCw size={12} /> Recomeçar</button>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="tbl-head sticky top-0">
                  <tr><th className="th">Código</th><th className="th">Produto</th><th className="th-r">Preço antigo</th><th className="th-r">Preço novo</th></tr>
                </thead>
                <tbody>
                  {encontrados.map((l, i) => (
                    <tr key={i} className="tr-row">
                      <td className="td font-mono text-xs">{l.codigo}</td>
                      <td className="td text-xs">{l.nome}</td>
                      <td className="td-r text-xs text-gray-400">{brl(l.precoAntigo)}</td>
                      <td className="td-r text-xs font-semibold">{brl(l.precoNovo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {naoEncontrados.length > 0 && (
            <div className="card p-3 bg-red-50 border-red-200">
              <p className="text-sm font-semibold text-red-700 mb-2">Códigos não encontrados no Precify ({naoEncontrados.length}) — não serão atualizados</p>
              <div className="flex flex-wrap gap-1.5">
                {naoEncontrados.map((l, i) => <span key={i} className="text-xs font-mono bg-white border border-red-200 rounded px-1.5 py-0.5">{l.codigo}</span>)}
              </div>
            </div>
          )}

          <button onClick={confirmar} disabled={confirmando || !encontrados.length} className="btn-primary w-full justify-center py-3 font-semibold">
            {confirmando ? <Spinner size={16} /> : <CheckCircle2 size={16} />}
            {confirmando ? 'Gravando…' : `Confirmar atualização de ${encontrados.length} preço(s)`}
          </button>
        </div>
      )}

      {etapa === 'concluido' && resultado && (
        <div className="space-y-4">
          <div className="card p-6 text-center">
            <CheckCircle2 size={48} className="mx-auto text-emerald-500 mb-3" />
            <h2 className="text-xl font-bold mb-1">Preços atualizados!</h2>
            <p className="text-sm text-gray-500 mt-2">{resultado.atualizados} produto(s) atualizado(s)</p>
            {resultado.erros.length > 0 && <p className="text-sm text-red-600 mt-2">{resultado.erros.length} erro(s) — confira os logs</p>}
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setEtapa('upload'); setFile(null); setLinhas([]); setResultado(null) }} className="btn-ghost flex-1 justify-center"><Upload size={14} /> Nova importação</button>
            <a href="/precificacao-multicanal" className="btn-primary flex-1 justify-center text-center">Voltar ao Multicanal RdB →</a>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Adicionar link no menu lateral**

Em `src/components/ui/Sidebar.tsx`, adicionar `Percent` aos ícones importados:

Trocar:
```tsx
import {
  LayoutDashboard, Package, Layers, Store, Tag,
  ShoppingCart, Upload, Download, Search, ChevronRight,
  Zap, Truck, Settings, Leaf, LogOut
} from 'lucide-react'
```

por:
```tsx
import {
  LayoutDashboard, Package, Layers, Store, Tag,
  ShoppingCart, Upload, Download, Search, ChevronRight,
  Zap, Truck, Settings, Leaf, LogOut, Percent
} from 'lucide-react'
```

E adicionar o link na seção "Precificação":

Trocar:
```tsx
  { divider: true,           label: 'Precificação' },
  { href: '/precificacao-multicanal', label: 'Multicanal RdB', icon: Leaf },
  { href: '/frete',          label: 'Frete ML',        icon: Truck },
```

por:
```tsx
  { divider: true,           label: 'Precificação' },
  { href: '/precificacao-multicanal', label: 'Multicanal RdB', icon: Leaf },
  { href: '/precos-praticados', label: 'Preços praticados', icon: Percent },
  { href: '/frete',          label: 'Frete ML',        icon: Truck },
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit` e `npm run build`
Expected: ambos sem erros.

- [ ] **Step 4: Verificar ao vivo**

Com `npm run dev`: montar uma planilha de teste (`.xlsx` com colunas "Código"/"Preço", incluindo pelo menos um `skuVariacao` real do banco e um código inexistente), subir em `/precos-praticados`, conferir a prévia (linhas encontradas vs. não encontradas com os valores certos), confirmar, e checar que a etapa final mostra a contagem correta. Reabrir `/precificacao-multicanal`, carregar o produto atualizado, confirmar que o preço praticado bate com o que foi importado.

- [ ] **Step 5: Commit**

```bash
git add src/app/precos-praticados/page.tsx src/components/ui/Sidebar.tsx
git commit -m "Adiciona tela de importacao em massa de precos praticados (Loja Propria)"
```

---

### Task 6: Dashboard — comparação precisa no bloco "produtos pra ajustar"

**Files:**
- Modify: `src/app/api/dashboard/route.ts`

**Interfaces:**
- Modifica o shape de `produtosPraAjustar` em `GET /api/dashboard`: cada item ganha `skuVariacao: string | null`, `fonte: 'preco_praticado' | 'variacao_custo'`, `desvioPct: number | null`; `direcao` passa a usar os valores `'subir'`/`'baixar'` (antes `'aumentou'`/`'diminuiu'`); `variacaoPct` e `dataCompra` continuam existindo mas agora são `null` nos itens de fonte `'preco_praticado'`.

- [ ] **Step 1: Substituir o conteúdo da rota**

Substituir todo o conteúdo de `src/app/api/dashboard/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { CANAIS_MULTICANAL, calcularCanalModoPreco } from '@/lib/calculosMulticanal'

const DIAS_PARADO = 60
const TOLERANCIA_PADRAO = 10

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mes = searchParams.get('mes') || new Date().toISOString().slice(0, 7)
  const fornecedorFiltro = searchParams.get('fornecedor')?.trim()

  const [ano, mesNum] = mes.split('-').map(Number)
  const inicio = new Date(ano, mesNum - 1, 1)
  const fim = new Date(ano, mesNum, 0, 23, 59, 59)

  const whereCompras: Record<string, unknown> = { dataCompra: { gte: inicio, lte: fim } }
  if (fornecedorFiltro) whereCompras.fornecedor = { contains: fornecedorFiltro, mode: 'insensitive' }

  const compras = await db.compra.findMany({ where: whereCompras })

  const gastoTotal = compras.reduce((a, c) => a + c.custoTotal, 0)

  const porFornecedor = new Map<string, number>()
  for (const c of compras) porFornecedor.set(c.fornecedor, (porFornecedor.get(c.fornecedor) ?? 0) + c.custoTotal)
  const fornecedores = [...porFornecedor.entries()]
    .map(([fornecedor, total]) => ({ fornecedor, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total)

  const tolConfig = await db.configuracao.findUnique({ where: { chave: 'tolerancia_loja_propria_pct' } })
  const tolerancia = tolConfig ? parseFloat(tolConfig.valor) : TOLERANCIA_PADRAO

  type ItemAjustar = {
    sku: string; skuVariacao: string | null; nome: string
    direcao: 'subir' | 'baixar'; fonte: 'preco_praticado' | 'variacao_custo'
    desvioPct: number | null; variacaoPct: number | null; dataCompra: string | null
  }

  const defLp = CANAIS_MULTICANAL.find(d => d.key === 'lp')!
  const comPrecoPraticado = await db.calculoMulticanal.findMany({
    where: { precoPraticadoLP: { not: null } },
    select: {
      sku: true, skuVariacao: true, nome: true, variacao: true,
      custoProduto: true, pesoGramas: true, despesasVariaveisPct: true, despesasFixasPct: true,
      canais: true, canaisAtivos: true, precoPraticadoLP: true,
    },
  })

  const skusComSinalPreciso = new Set<string>()
  const produtosPrecisos: ItemAjustar[] = []
  for (const calc of comPrecoPraticado) {
    const ativos = (calc.canaisAtivos ?? {}) as Record<string, boolean>
    if (!ativos.lp || !calc.precoPraticadoLP) continue
    const canaisCfg = (calc.canais ?? {}) as Record<string, Record<string, number>>
    const cfgLp = canaisCfg.lp
    if (!cfgLp) continue
    const r = calcularCanalModoPreco({
      custoProduto: calc.custoProduto, despVarPct: calc.despesasVariaveisPct, despFixPct: calc.despesasFixasPct,
      pesoGramas: calc.pesoGramas, canal: cfgLp as any, def: defLp, shAuto: true,
    })
    if (!r) continue
    if (calc.sku) skusComSinalPreciso.add(calc.sku)
    const desvio = (r.preco - calc.precoPraticadoLP) / calc.precoPraticadoLP
    if (Math.abs(desvio) * 100 <= tolerancia) continue
    produtosPrecisos.push({
      sku: calc.sku ?? '', skuVariacao: calc.skuVariacao ?? null,
      nome: calc.variacao ? `${calc.nome} ${calc.variacao}` : calc.nome,
      direcao: desvio > 0 ? 'subir' : 'baixar',
      fonte: 'preco_praticado',
      desvioPct: Math.round(Math.abs(desvio) * 10000) / 100,
      variacaoPct: null, dataCompra: null,
    })
  }

  const comprasComVariacao = compras.filter(c => c.statusVariacao === 'AUMENTOU > 5%' || c.statusVariacao === 'DIMINUIU > 5%')
  const skusComVariacao = [...new Set(comprasComVariacao.map(c => c.skuPrincipal))]
  const calculosDosSkus = skusComVariacao.length
    ? await db.calculoMulticanal.findMany({
        where: { sku: { in: skusComVariacao } },
        select: { sku: true, nome: true, canaisAtivos: true },
      })
    : []
  const skusComAnuncio = new Set(
    calculosDosSkus
      .filter(c => c.canaisAtivos && Object.values(c.canaisAtivos as Record<string, boolean>).some(Boolean))
      .map(c => c.sku)
  )
  const nomesPorSku = new Map(calculosDosSkus.map(c => [c.sku, c.nome]))
  const produtosAproximados: ItemAjustar[] = comprasComVariacao
    .filter(c => skusComAnuncio.has(c.skuPrincipal) && !skusComSinalPreciso.has(c.skuPrincipal))
    .map(c => ({
      sku: c.skuPrincipal, skuVariacao: null,
      nome: nomesPorSku.get(c.skuPrincipal) ?? c.nomeProduto,
      direcao: (c.statusVariacao === 'AUMENTOU > 5%' ? 'subir' : 'baixar') as 'subir' | 'baixar',
      fonte: 'variacao_custo' as const,
      desvioPct: null,
      variacaoPct: c.variacaoPct != null ? Math.round(c.variacaoPct * 10000) / 100 : null,
      dataCompra: c.dataCompra.toISOString(),
    }))
    .filter((v, i, arr) => arr.findIndex(x => x.sku === v.sku) === i)

  const produtosPraAjustar: ItemAjustar[] = [...produtosPrecisos, ...produtosAproximados]

  const produtos = await db.produto.findMany({ where: { status: 'ativo' }, select: { skuPrincipal: true, categoria: true } })
  const categoriaPorSku = new Map(produtos.map(p => [p.skuPrincipal, p.categoria]))
  const todosCalculos = await db.calculoMulticanal.findMany({
    select: { sku: true, custoProduto: true, pesoGramas: true, despesasVariaveisPct: true, despesasFixasPct: true, canais: true, canaisAtivos: true },
  })
  const margensPorCategoria = new Map<string, number[]>()
  for (const calc of todosCalculos) {
    const categoria = calc.sku ? categoriaPorSku.get(calc.sku) : null
    if (!categoria) continue
    const ativos = (calc.canaisAtivos ?? {}) as Record<string, boolean>
    const canaisCfg = (calc.canais ?? {}) as Record<string, Record<string, number>>
    for (const key of Object.keys(ativos)) {
      if (!ativos[key]) continue
      const def = CANAIS_MULTICANAL.find(d => d.key === key)
      const cfg = canaisCfg[key]
      if (!def || !cfg) continue
      const r = calcularCanalModoPreco({
        custoProduto: calc.custoProduto, despVarPct: calc.despesasVariaveisPct, despFixPct: calc.despesasFixasPct,
        pesoGramas: calc.pesoGramas, canal: cfg as any, def, shAuto: true,
      })
      if (!r) continue
      if (!margensPorCategoria.has(categoria)) margensPorCategoria.set(categoria, [])
      margensPorCategoria.get(categoria)!.push(r.margem)
    }
  }
  const porCategoria = [...margensPorCategoria.entries()]
    .map(([categoria, margens]) => ({
      categoria,
      margemMedia: Math.round((margens.reduce((a, m) => a + m, 0) / margens.length) * 10000) / 100,
      n: margens.length,
    }))
    .sort((a, b) => b.margemMedia - a.margemMedia)

  const limite = new Date()
  limite.setDate(limite.getDate() - DIAS_PARADO)
  const produtosParados = await db.produto.findMany({
    where: { status: 'ativo', OR: [{ dataUltimaCompra: { lt: limite } }, { dataUltimaCompra: null }] },
    select: { skuPrincipal: true, nome: true, dataUltimaCompra: true },
    orderBy: { dataUltimaCompra: 'asc' },
    take: 30,
  })

  return NextResponse.json({
    mes, fornecedorFiltro: fornecedorFiltro ?? null,
    gastoTotal: Math.round(gastoTotal * 100) / 100,
    totalCompras: compras.length,
    fornecedores, produtosPraAjustar, porCategoria, produtosParados,
  })
}
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros em `src/app/api/dashboard/route.ts` (a página `src/app/page.tsx` vai apontar erro de tipo até a Task 7 — esperado, não corrigir aqui).

- [ ] **Step 3: Verificar ao vivo**

Com `npm run dev` e logado: `curl "http://localhost:3001/api/dashboard?mes=2026-07"` — confirmar 200, e que os itens de `produtosPraAjustar` que vieram de produtos com `precoPraticadoLP` preenchido (da Task 5) aparecem com `fonte: "preco_praticado"` e `desvioPct` numérico; os demais continuam com `fonte: "variacao_custo"`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/dashboard/route.ts
git commit -m "Dashboard API: usa comparacao precisa de preco praticado quando disponivel, mantem sinal aproximado como fallback"
```

---

### Task 7: Dashboard — exibir a nova comparação

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: novo shape de `produtosPraAjustar` de `GET /api/dashboard` (Task 6).

- [ ] **Step 1: Atualizar a interface**

Trocar:
```tsx
  produtosPraAjustar: { sku: string; nome: string; direcao: string; variacaoPct: number | null; dataCompra: string }[]
```

por:
```tsx
  produtosPraAjustar: { sku: string; skuVariacao: string | null; nome: string; direcao: string; fonte: string; desvioPct: number | null; variacaoPct: number | null; dataCompra: string | null }[]
```

- [ ] **Step 2: Atualizar o texto do StatCard**

Trocar:
```tsx
        <StatCard title="Produtos pra ajustar preço" value={data?.produtosPraAjustar.length ?? '—'} sub="custo mudou e tem anúncio ativo" icon={AlertTriangle} color="amber" />
```

por:
```tsx
        <StatCard title="Produtos pra ajustar preço" value={data?.produtosPraAjustar.length ?? '—'} sub="preço desatualizado ou custo mudou" icon={AlertTriangle} color="amber" />
```

- [ ] **Step 3: Atualizar a tabela de produtos pra ajustar**

Trocar:
```tsx
          <div className="overflow-auto max-h-80">
            <table className="w-full">
              <thead className="tbl-head sticky top-0">
                <tr><th className="th">Produto</th><th className="th text-center">Custo</th><th className="th-r">Variação</th><th className="th-r">Data</th></tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={4} className="py-8 text-center text-gray-400 text-sm"><Spinner size={16} className="inline" /></td></tr>}
                {!loading && !data?.produtosPraAjustar.length && <tr><td colSpan={4} className="py-8 text-center text-gray-400 text-sm">Nenhum produto sinalizado 🎉</td></tr>}
                {data?.produtosPraAjustar.map((p, i) => (
                  <tr key={i} className="tr-row">
                    <td className="td">
                      <div className="font-medium text-gray-800 text-xs truncate max-w-[160px]">{p.nome}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{p.sku}</div>
                    </td>
                    <td className="td text-center">
                      {p.direcao === 'aumentou'
                        ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600"><TrendingUp size={12} /> subiu</span>
                        : <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><TrendingDown size={12} /> caiu</span>}
                    </td>
                    <td className="td-r text-xs font-semibold">{p.variacaoPct != null ? pct(Math.abs(p.variacaoPct)) : '—'}</td>
                    <td className="td-r text-xs text-gray-400">{fmtData(p.dataCompra)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
```

por:
```tsx
          <div className="overflow-auto max-h-80">
            <table className="w-full">
              <thead className="tbl-head sticky top-0">
                <tr><th className="th">Produto</th><th className="th text-center">Ação</th><th className="th-r">Desvio</th><th className="th-r">Origem</th></tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={4} className="py-8 text-center text-gray-400 text-sm"><Spinner size={16} className="inline" /></td></tr>}
                {!loading && !data?.produtosPraAjustar.length && <tr><td colSpan={4} className="py-8 text-center text-gray-400 text-sm">Nenhum produto sinalizado 🎉</td></tr>}
                {data?.produtosPraAjustar.map((p, i) => (
                  <tr key={p.skuVariacao ?? `${p.sku}-${i}`} className="tr-row">
                    <td className="td">
                      <div className="font-medium text-gray-800 text-xs truncate max-w-[160px]">{p.nome}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{p.sku}</div>
                    </td>
                    <td className="td text-center">
                      {p.direcao === 'subir'
                        ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600"><TrendingUp size={12} /> subir</span>
                        : <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><TrendingDown size={12} /> baixar</span>}
                    </td>
                    <td className="td-r text-xs font-semibold">
                      {p.fonte === 'preco_praticado' ? pct(p.desvioPct) : pct(p.variacaoPct != null ? Math.abs(p.variacaoPct) : null)}
                    </td>
                    <td className="td-r text-xs text-gray-400">
                      {p.fonte === 'preco_praticado' ? 'preço desatualizado' : fmtData(p.dataCompra)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit` e `npm run build`
Expected: ambos sem erros.

- [ ] **Step 5: Verificar ao vivo**

Com `npm run dev`: abrir `/`, confirmar que a tabela "produtos pra ajustar" mostra corretamente as duas origens (produtos com preço praticado desatualizado mostram "preço desatualizado" + desvio%; os demais mostram a data da compra + variação de custo, como antes). Confirmar visualmente que não há erro de console.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx
git commit -m "Dashboard: exibe origem e desvio da comparacao de preco praticado no bloco produtos pra ajustar"
```
