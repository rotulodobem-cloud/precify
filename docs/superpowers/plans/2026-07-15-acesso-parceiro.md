# Acesso de Parceiro (Anúncios/Ads) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a um parceiro externo (gestão de anúncios/ads) uma tela própria e restrita, com login separado, mostrando só SKU, produto, variação, plataforma, código do anúncio (editável) e os dois preços (venda e promocional) — nunca custo, comissão, margem ou qualquer outro módulo do sistema.

**Architecture:** O login existente (cookie único `precify_auth` comparado a um segredo fixo) passa a carregar um **papel** (`admin` ou `partner`) embutido no valor do cookie. O middleware, que hoje só protege páginas, passa a proteger também `/api/*`, restringindo o papel `partner` a `/parceiro` e `/api/parceiro/*`. Uma API nova (`/api/parceiro/precificacao`) expõe só os campos permitidos via `select` explícito do Prisma — nunca via filtro no front — lendo o model `Precificacao` já existente (sem mudança de schema). Uma página nova (`/parceiro`) consome essa API; o `Sidebar` deixa de mostrar o menu padrão nessa rota.

**Tech Stack:** Next.js 14 (App Router), React 18, Prisma 5, PostgreSQL, TypeScript.

## Global Constraints

- Sem framework de testes automatizado neste projeto — verificação por `npx tsc --noEmit`, `npm run build`, mais passos de verificação manual/ao vivo explícitos.
- Sem banco de staging — `DATABASE_URL` aponta direto pra produção. Este plano **não muda o schema** (nenhuma migration, nenhum `db push`).
- Trabalhar direto na branch `main`.
- Formato do cookie de papel: `${NEXTAUTH_SECRET}|admin` ou `${NEXTAUTH_SECRET}|partner`. O papel é determinado por **comparação exata** contra os dois valores esperados — nunca fazendo parse de um campo de papel não confiável vindo do próprio cookie.
- `/api/auth/login` e `/api/auth/logout` têm que continuar acessíveis **sem** cookie válido — senão ninguém consegue logar (trava o sistema pra todo mundo, inclusive admin).
- Papel `partner`: só acessa a página `/parceiro` e rotas `/api/parceiro/*`. Qualquer outra página redireciona pra `/parceiro`; qualquer outra API retorna `403`.
- Papel `admin`: comportamento inalterado, acesso total.
- O parceiro só pode editar `codigoAnuncio` — nenhuma rota dele aceita escrever preço, custo, comissão, margem ou qualquer campo de cálculo.
- `calcPrecoPromocional` passa de `precoIdeal * 1.45` pra `precoIdeal * 1.40` (alinha com a Calculadora e o Multicanal RdB, já ajustados numa sessão anterior).

---

### Task 1: Corrige fórmula do preço promocional (1,45 → 1,40)

**Contexto:** `src/lib/calculos.ts` tem a função `calcPrecoPromocional`, usada pela tela Precificação e pelo recálculo automático que roda toda vez que uma compra nova muda o custo de um produto (`recalcularVariacoesEPrecificacoes` em `src/lib/saveCompra.ts`). Ela ainda usa 45% — as mudanças de uma sessão anterior só tinham atualizado a Calculadora e o Multicanal RdB (cálculos locais duplicados nessas páginas, não essa função central).

**Files:**
- Modify: `src/lib/calculos.ts`

**Interfaces:**
- Produces: `calcPrecoPromocional(precoIdeal: number): number` — comportamento muda (multiplicador 1.40), assinatura igual.

- [ ] **Step 1: Trocar o multiplicador**

Em `src/lib/calculos.ts`, linha 58-59, trocar:

```ts
export function calcPrecoPromocional(precoIdeal: number): number {
  return round2(precoIdeal * 1.45)
}
```

por:

```ts
export function calcPrecoPromocional(precoIdeal: number): number {
  return round2(precoIdeal * 1.40)
}
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros novos em `src/lib/calculos.ts` ou em quem o importa (`src/app/api/precificacao/route.ts`, `src/app/api/precificacao/[id]/route.ts`, `src/lib/saveCompra.ts`, `src/app/api/importar/route.ts`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/calculos.ts
git commit -m "Corrige formula do preco promocional de 1,45 para 1,40"
```

---

### Task 2: Helper de autenticação com papel + login/logout

**Contexto:** Hoje só existe um par de credenciais (`ADMIN_USER`/`ADMIN_PASSWORD`) e o cookie `precify_auth` guarda literalmente o valor de `NEXTAUTH_SECRET`. Vamos adicionar um segundo par (`PARTNER_USER`/`PARTNER_PASSWORD`) e fazer o cookie carregar também o papel. Um helper central evita duplicar a lógica de montar/comparar o valor do cookie entre o login e o middleware (Task 3).

**Files:**
- Create: `src/lib/auth.ts`
- Modify: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`

**Interfaces:**
- Produces: `type Role = 'admin' | 'partner'`
- Produces: `cookieValueForRole(role: Role): string`
- Produces: `roleFromCookie(value: string | undefined): Role | null`
- Produces: `POST /api/auth/logout` → limpa o cookie `precify_auth`.

- [ ] **Step 1: Criar o helper de papel**

Criar `src/lib/auth.ts`:

```ts
export type Role = 'admin' | 'partner'

export function cookieValueForRole(role: Role): string {
  return `${process.env.NEXTAUTH_SECRET}|${role}`
}

export function roleFromCookie(value: string | undefined): Role | null {
  if (!value) return null
  if (value === cookieValueForRole('admin')) return 'admin'
  if (value === cookieValueForRole('partner')) return 'partner'
  return null
}
```

- [ ] **Step 2: Atualizar o login pra checar as duas credenciais**

Substituir todo o conteúdo de `src/app/api/auth/login/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { cookieValueForRole, Role } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()
  const u = typeof username === 'string' ? username : ''
  const p = typeof password === 'string' ? password : ''

  let role: Role | null = null
  if (u && process.env.ADMIN_USER && u === process.env.ADMIN_USER && p === process.env.ADMIN_PASSWORD) {
    role = 'admin'
  } else if (u && process.env.PARTNER_USER && u === process.env.PARTNER_USER && p === process.env.PARTNER_PASSWORD) {
    role = 'partner'
  }

  if (!role) {
    return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true, role })
  res.cookies.set('precify_auth', cookieValueForRole(role), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 dias
    path: '/',
  })
  return res
}
```

(a checagem `u && process.env.ADMIN_USER && ...` — e o mesmo pro par do parceiro — evita que usuário/senha vazios batam com uma variável de ambiente não configurada, que ficaria `undefined === undefined`; essa checagem não existia antes e corrige os dois pares, não só o novo)

- [ ] **Step 3: Criar a rota de logout**

Criar `src/app/api/auth/logout/route.ts`:

```ts
import { NextResponse } from 'next/server'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set('precify_auth', '', { path: '/', maxAge: 0 })
  return res
}
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros em `src/lib/auth.ts` ou `src/app/api/auth/**`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/app/api/auth/login/route.ts src/app/api/auth/logout/route.ts
git commit -m "Adiciona papel (admin/partner) ao cookie de login e rota de logout"
```

---

### Task 3: Middleware protege /api e restringe o papel parceiro

**Contexto:** O middleware atual (`src/middleware.ts`) libera **toda** rota `/api/*` sem checar cookie nenhum, e só protege páginas. Isso precisa mudar: com o papel `partner` existindo agora, a única forma de garantir que ele nunca veja custo é a API recusar a requisição, não só a tela escondê-lo.

**Files:**
- Modify: `src/middleware.ts`

**Interfaces:**
- Consumes: `roleFromCookie` de `src/lib/auth.ts` (Task 2).

- [ ] **Step 1: Reescrever o middleware**

Substituir todo o conteúdo de `src/middleware.ts`:

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { roleFromCookie } from '@/lib/auth'

const PARTNER_PAGE = '/parceiro'
const PARTNER_API_PREFIX = '/api/parceiro'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isApi = pathname.startsWith('/api')
  const isPublic = pathname === '/login'
    || pathname === '/api/auth/login'
    || pathname === '/api/auth/logout'

  if (isPublic) return NextResponse.next()

  const role = roleFromCookie(request.cookies.get('precify_auth')?.value)

  if (!role) {
    if (isApi) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (role === 'partner') {
    const allowed = isApi ? pathname.startsWith(PARTNER_API_PREFIX) : pathname === PARTNER_PAGE
    if (!allowed) {
      if (isApi) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
      return NextResponse.redirect(new URL(PARTNER_PAGE, request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|favicon.ico).*)'],
}
```

- [ ] **Step 2: Verificar (tipos)**

Run: `npx tsc --noEmit`
Expected: sem erros em `src/middleware.ts`.

- [ ] **Step 3: Verificar ao vivo (build + login manual)**

**Pré-requisito:** localmente, `.env`/`.env.local` não têm `ADMIN_USER`, `ADMIN_PASSWORD`, `NEXTAUTH_SECRET` nem `PARTNER_USER`/`PARTNER_PASSWORD` configurados — sem eles, o middleware hoje não bloqueia nada (`undefined !== undefined` é `false` em JS, então a checagem de cookie vira um no-op). Adicionar ao `.env.local` (gitignored, só uso local, valores de teste quaisquer):

```
ADMIN_USER=admin
ADMIN_PASSWORD=teste123
NEXTAUTH_SECRET=um-segredo-de-teste-qualquer
PARTNER_USER=parceiro
PARTNER_PASSWORD=teste123
```

Run: `npm run build` — Expected: sucesso.

Rodar `npm run dev`, e com um navegador (ou Playwright):
1. Acessar `/produtos` sem cookie → redireciona pra `/login`.
2. Fazer login com `ADMIN_USER`/`ADMIN_PASSWORD` → acessa `/produtos`, `/precificacao`, `/api/produtos` normalmente (sem regressão).
3. Chamar `curl -i http://localhost:3001/api/produtos` sem cookie → `401`.

(o teste com o papel `partner` fica completo só depois da Task 5, quando a página `/parceiro` existir — por enquanto, confirmar que uma requisição com cookie `${NEXTAUTH_SECRET}|partner` forjado à mão bate `403` em `/api/produtos` e passa em `/api/parceiro/qualquer-coisa` — mesmo que essa rota ainda não exista, deve dar 404 do Next, não 403 do middleware, confirmando que o prefixo passou.)

- [ ] **Step 4: Commit**

```bash
git add src/middleware.ts
git commit -m "Middleware passa a proteger rotas /api e restringir o papel parceiro"
```

---

### Task 4: API do parceiro — busca e edição do código do anúncio

**Contexto:** Endpoint novo, isolado, que nunca inclui custo/comissão/margem no retorno — a restrição é no `select` do Prisma, não em filtro de exibição. Espelha o filtro de busca já usado em `src/app/api/precificacao/route.ts`.

**Files:**
- Create: `src/app/api/parceiro/precificacao/route.ts`
- Create: `src/app/api/parceiro/precificacao/[id]/route.ts`

**Interfaces:**
- Produces: `GET /api/parceiro/precificacao?q=...` → lista de `{ id, codigoAnuncio, precoIdeal, precoPromocional, plataforma: { nome }, variacao: { skuVariacao, nomeVariacao, produto: { nome, skuPrincipal } } }`.
- Produces: `PATCH /api/parceiro/precificacao/[id]` → body `{ codigoAnuncio }`, atualiza só esse campo.

- [ ] **Step 1: Criar a rota de listagem**

Criar `src/app/api/parceiro/precificacao/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()

  const where: Record<string, unknown> = {}
  if (q) where.OR = [
    { skuVariacao: { contains: q, mode: 'insensitive' } },
    { variacao: { produto: { nome: { contains: q, mode: 'insensitive' } } } },
    { variacao: { produto: { skuPrincipal: { contains: q, mode: 'insensitive' } } } },
  ]

  const precs = await db.precificacao.findMany({
    where,
    select: {
      id: true,
      codigoAnuncio: true,
      precoIdeal: true,
      precoPromocional: true,
      plataforma: { select: { nome: true } },
      variacao: {
        select: {
          skuVariacao: true,
          nomeVariacao: true,
          produto: { select: { nome: true, skuPrincipal: true } },
        },
      },
    },
    orderBy: [
      { variacao: { skuPrincipal: 'asc' } },
      { variacao: { pesoGramas: 'asc' } },
      { plataforma: { nome: 'asc' } },
    ],
  })
  return NextResponse.json(precs)
}
```

- [ ] **Step 2: Criar a rota de edição do código do anúncio**

Criar `src/app/api/parceiro/precificacao/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json()
  const codigoAnuncio = typeof b.codigoAnuncio === 'string' ? b.codigoAnuncio.trim() : ''

  try {
    const p = await db.precificacao.update({
      where: { id: params.id },
      data: { codigoAnuncio: codigoAnuncio || null },
      select: { id: true, codigoAnuncio: true },
    })
    return NextResponse.json(p)
  } catch {
    return NextResponse.json({ error: 'Registro não encontrado' }, { status: 404 })
  }
}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros nos dois arquivos novos.

Run (com `npm run dev` ativo e cookie de admin salvo): `curl -s "http://localhost:3001/api/parceiro/precificacao?q=aveia" -b cookies.txt`
Expected: lista JSON só com os campos `id, codigoAnuncio, precoIdeal, precoPromocional, plataforma, variacao` — confirmar visualmente que **não** aparece nenhum campo de custo/comissão/margem na resposta.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/parceiro
git commit -m "Adiciona API do parceiro: lista precificacoes e edita codigo do anuncio"
```

---

### Task 5: Página `/parceiro` + Sidebar sem menu nessa rota

**Contexto:** Página nova, autocontida, sem o menu lateral padrão (o `Sidebar` precisa reconhecer essa rota e mostrar só a marca + botão "Sair"). Usa as classes utilitárias já existentes no projeto (`page-title`, `card`, `btn-primary`, `inp-sm`, `tbl-head`, `th`, `th-r` etc. — definidas em `src/app/globals.css`), pra ficar visualmente consistente com o resto do Precify.

**Files:**
- Create: `src/app/parceiro/page.tsx`
- Modify: `src/components/ui/Sidebar.tsx`

**Interfaces:**
- Consumes: `GET /api/parceiro/precificacao?q=...` e `PATCH /api/parceiro/precificacao/[id]` (Task 4).
- Consumes: `POST /api/auth/logout` (Task 2).

- [ ] **Step 1: Criar a página do parceiro**

Criar `src/app/parceiro/page.tsx`:

```tsx
'use client'
import { useEffect, useState, useCallback } from 'react'
import { Search, RefreshCw, Save } from 'lucide-react'

const brl = (v?: number | null) => v != null ? `R$ ${v.toFixed(2).replace('.', ',')}` : '—'

interface LinhaParceiro {
  id: string
  codigoAnuncio: string | null
  precoIdeal: number | null
  precoPromocional: number | null
  plataforma: { nome: string }
  variacao: { skuVariacao: string; nomeVariacao: string; produto: { nome: string; skuPrincipal: string } }
}

export default function ParceiroPage() {
  const [linhas, setLinhas] = useState<LinhaParceiro[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/parceiro/precificacao?q=${encodeURIComponent(q)}`)
    const d = await r.json()
    setLinhas(Array.isArray(d) ? d : [])
    setLoading(false)
  }, [q])
  useEffect(() => { load() }, [load])

  const salvarCodigo = async (id: string) => {
    setSalvando(s => ({ ...s, [id]: true }))
    await fetch(`/api/parceiro/precificacao/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigoAnuncio: edit[id] ?? '' }),
    })
    setSalvando(s => ({ ...s, [id]: false }))
    load()
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Anúncios</h1>
        <p className="text-sm text-gray-500 mt-0.5">Preço de venda, preço promocional e código do anúncio por plataforma</p>
      </div>

      <div className="card p-2.5 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-1 min-w-40 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
          <Search size={13} className="text-gray-400" />
          <input className="flex-1 text-sm outline-none bg-transparent" placeholder="Buscar por SKU ou nome…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <button onClick={load} className="btn-icon btn-ghost"><RefreshCw size={13} /></button>
        <span className="text-xs text-gray-400">{linhas.length} anúncios</span>
      </div>

      <div className="card-tight overflow-auto">
        <table className="w-full">
          <thead className="tbl-head"><tr>
            <th className="th">SKU</th><th className="th">Produto</th><th className="th">Variação</th>
            <th className="th">Plataforma</th><th className="th">Código do anúncio</th>
            <th className="th-r">Preço de venda</th><th className="th-r">Preço promocional</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="text-center text-sm text-gray-400 py-6">Carregando…</td></tr>}
            {!loading && linhas.length === 0 && <tr><td colSpan={7} className="text-center text-sm text-gray-400 py-6">Nenhum anúncio encontrado.</td></tr>}
            {linhas.map(l => (
              <tr key={l.id} className="border-t border-gray-100">
                <td className="px-3 py-2 text-sm">{l.variacao.produto.skuPrincipal}</td>
                <td className="px-3 py-2 text-sm">{l.variacao.produto.nome}</td>
                <td className="px-3 py-2 text-sm">{l.variacao.nomeVariacao || '—'}</td>
                <td className="px-3 py-2 text-sm">{l.plataforma.nome}</td>
                <td className="px-3 py-2 text-sm">
                  <div className="flex items-center gap-1.5">
                    <input
                      className="inp-sm"
                      placeholder="código do anúncio"
                      value={edit[l.id] ?? l.codigoAnuncio ?? ''}
                      onChange={e => setEdit(s => ({ ...s, [l.id]: e.target.value }))}
                    />
                    <button className="btn-icon btn-ghost" disabled={!!salvando[l.id]} onClick={() => salvarCodigo(l.id)}>
                      <Save size={13} />
                    </button>
                  </div>
                </td>
                <td className="px-3 py-2 text-sm text-right font-medium">{brl(l.precoIdeal)}</td>
                <td className="px-3 py-2 text-sm text-right font-medium text-indigo-600">{brl(l.precoPromocional)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Sidebar sem menu na rota `/parceiro`**

Em `src/components/ui/Sidebar.tsx`, adicionar `LogOut` aos imports do `lucide-react` (linha 4-8):

```ts
import {
  LayoutDashboard, Package, Layers, Store, Tag,
  ShoppingCart, Upload, Download, Search, ChevronRight,
  Zap, Truck, Settings, Calculator, Leaf, LogOut
} from 'lucide-react'
```

Logo depois de `export default function Sidebar() {` e `const path = usePathname()`, adicionar o desvio pra rota do parceiro (antes do `return` normal):

```tsx
export default function Sidebar() {
  const path = usePathname()

  if (path === '/parceiro') {
    return (
      <aside className="w-56 shrink-0 bg-gray-900 min-h-screen flex flex-col">
        <div className="px-4 py-5 border-b border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
              <Zap size={15} className="text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-none">Precify</p>
              <p className="text-gray-500 text-[10px] mt-0.5">Parceiro</p>
            </div>
          </div>
        </div>
        <div className="flex-1" />
        <div className="px-2 pb-3 border-t border-gray-800 pt-3">
          <button
            onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login' }}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-all w-full text-left"
          >
            <LogOut size={15} />
            <span>Sair</span>
          </button>
        </div>
      </aside>
    )
  }

  return (
    // ... resto do componente igual ao que já existe hoje
```

(o resto do `return` original do `Sidebar` continua exatamente igual — só entra o `if` novo antes dele)

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit` e `npm run build`
Expected: ambos sem erros; rota `/parceiro` aparece no output do build.

- [ ] **Step 4: Commit**

```bash
git add src/app/parceiro src/components/ui/Sidebar.tsx
git commit -m "Adiciona pagina /parceiro e esconde menu padrao nessa rota"
```

---

### Task 6 (executada pelo controlador, não delegada): Recálculo, deploy e verificação final

**Contexto:** Passo final, fora do padrão de subagent — envolve rodar um script pontual contra o banco de produção e fazer o deploy, igual ao que já foi feito nas Tasks 7/9 dos planos anteriores.

- [ ] **Step 1: Backup antes de mexer no banco**

Run: `node scripts/backup-db.js`
Expected: backup salvo com sucesso.

- [ ] **Step 2: Recalcular `precoPromocional` dos registros já existentes**

Rodar (depois da Task 1 já commitada localmente, sem precisar do deploy ainda — é um `node -e` direto contra o banco, igual aos scripts pontuais já usados nesta sessão):

```bash
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.precificacao.findMany({ where: { precoIdeal: { not: null } } }).then(async rows => {
  let n = 0;
  for (const r of rows) {
    const novo = Math.round(r.precoIdeal * 1.40 * 100) / 100;
    if (novo !== r.precoPromocional) {
      await p.precificacao.update({ where: { id: r.id }, data: { precoPromocional: novo } });
      n++;
    }
  }
  console.log('Atualizados:', n, 'de', rows.length);
  return p.\$disconnect();
});
"
```

Expected: imprime quantos registros foram atualizados.

- [ ] **Step 3: Build final**

Run: `npx tsc --noEmit` e `npm run build`
Expected: ambos sem erros.

- [ ] **Step 4: Testes ao vivo (Playwright ou navegador)**

1. Login como admin → confirmar acesso normal a todas as telas (sem regressão).
2. Login como partner (com `PARTNER_USER`/`PARTNER_PASSWORD` já configurados no `.env.local`, conforme Task 3) → só enxerga `/parceiro`; tentar `/produtos` redireciona pra `/parceiro`; `curl` em `/api/produtos` com o cookie de partner retorna `403`.
3. Na tela `/parceiro`, editar um código de anúncio, salvar, e confirmar que aparece também na tela `/precificacao` (login admin) pro mesmo SKU×plataforma.
4. Confirmar que nenhum campo de custo/comissão/margem aparece em nenhum momento na tela ou na resposta de `/api/parceiro/precificacao`.

- [ ] **Step 5: Push**

```bash
git push origin main
```

- [ ] **Step 6: Configurar variáveis de ambiente no Railway**

Instrução pra usuária (fora do alcance do código): no painel do Railway, projeto Precify → aba Variables, adicionar:
- `PARTNER_USER` — usuário que o parceiro vai digitar pra logar.
- `PARTNER_PASSWORD` — senha dele.

Depois de salvar, o Railway reinicia o serviço sozinho. Só depois disso o login do parceiro funciona em produção.

- [ ] **Step 7: Atualizar o ledger**

Anotar em `.superpowers/sdd/progress.md` a conclusão do plano.
