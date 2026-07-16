# Unificação da Precificação — Onda A — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer do `CalculoMulticanal` a fonte única de preço pros 5 canais (Loja Própria, ML Full, ML Clássico, Shopee, TikTok), com código de anúncio, marcação de canal anunciado, sincronização automática de custo, e a tela `/parceiro` e o painel externo `/api/gestao` lendo dessa fonte única — sem ainda remover o model `Precificacao` (isso só acontece na Onda B, depois que os outros 5 consumidores dela — Dashboard, Variações, Busca, Exportar, Importar — forem repontados também).

**Architecture:** `CalculoMulticanal` ganha 2 campos novos (`codigosAnuncio`, `canaisAtivos`). O motor de cálculo (`calculosMulticanal.ts`) ganha faixa automática pro TikTok (igual à Shopee, generalizada). `saveCompra.ts` passa a também manter `CalculoMulticanal.custoProduto` em dia (além do que já faz com `Precificacao`, que continua rodando em paralelo até a Onda B). A tela principal ganha toggle de "anunciado" por canal. `/api/parceiro/precificacao` e `/api/gestao` passam a ler do `CalculoMulticanal`. Calculadora e Precificação (páginas + rotas editáveis) são removidas — o model e a sincronização continuam intactos.

**Tech Stack:** Next.js 14 (App Router), React 18, Prisma 5, PostgreSQL, TypeScript.

## Global Constraints

- Sem framework de testes automatizado — verificação por `npx tsc --noEmit`, `npm run build`, e testes ao vivo (curl/Playwright).
- Sem banco de staging — `DATABASE_URL` aponta pra produção. `db push` só roda depois da Task 2 (schema), executado pelo controlador, não por subagent.
- Trabalhar direto na branch `main`.
- `Precificacao` **não é removida nesta Onda** — continua existindo, sendo lida pelos 5 pontos ainda não repontados (Dashboard, Variações, Busca, Exportar, Importar — Onda B) e mantida atualizada pela sincronização já existente em `saveCompra.ts`. Só as telas/rotas **editáveis** (`/calculadora`, `/precificacao`) saem nesta Onda.
- Código de anúncio (`codigosAnuncio`) nunca aparece na tela principal (admin) — só na tela do parceiro.
- Canal `lp` (Loja Própria) nunca usa `canaisAtivos` nem `codigosAnuncio` — esses campos só existem pros 4 canais de marketplace (`mlFull`, `mlClassico`, `sh`, `tt`).
- `/api/gestao` é uma integração externa viva (painel HTML que a usuária já usa) — a Task 6 (que a repontua) não é considerada concluída até a usuária confirmar a resposta de exemplo, não só passar no build.

---

### Task 1: Correção do TikTok Shop (faixa automática de comissão)

**Contexto:** O motor trata o TikTok como comissão fixa de 6% + R$4. A regra real é por faixa de preço, igual à Shopee, mas com faixas próprias: abaixo de R$50 → 10% + R$4; a partir de R$50 → 6% + R$6. O mecanismo de faixa automática (`autoBand`) hoje só existe pra Shopee, com a chamada de `shopeeBand` embutida direto no motor — precisa generalizar pra funcionar com qualquer canal que tenha `autoBand: true`.

**Files:**
- Modify: `src/lib/calculosMulticanal.ts`

**Interfaces:**
- Produces: `ttBand(preco: number): { com: number; fix: number }` — exportada, mesmo padrão de `shopeeBand`.
- Consumes: nada de fora deste arquivo.

- [ ] **Step 1: Adicionar `ttBand` e a tabela de faixas por canal**

Logo depois da função `shopeeBand` (linha ~41), adicionar:

```ts
export function ttBand(preco: number): { com: number; fix: number } {
  if (preco < 50) return { com: 10, fix: 4 }
  return { com: 6, fix: 6 }
}

const FAIXAS_POR_CANAL: Record<string, { fn: (preco: number) => { com: number; fix: number }; faixas: { min: number; max: number }[] }> = {
  sh: { fn: shopeeBand, faixas: [{ min: 0, max: 79.99 }, { min: 80, max: 99.99 }, { min: 100, max: 199.99 }, { min: 200, max: Infinity }] },
  tt: { fn: ttBand, faixas: [{ min: 0, max: 49.99 }, { min: 50, max: Infinity }] },
}
```

- [ ] **Step 2: Marcar o TikTok como `autoBand` e ajustar o padrão**

Em `CANAIS_MULTICANAL`, trocar a entrada do TikTok (linha ~32):

```ts
  { key: 'tt', nome: 'TikTok Shop', tag: '6% + frete grátis', cor: '#111111', corTexto: '#fff',
    default: { emb: 1.50, com: 6, out: 6, fix: 4, frete: 12, margem: 20 } },
```

por:

```ts
  { key: 'tt', nome: 'TikTok Shop', tag: 'faixa automática', cor: '#111111', corTexto: '#fff', autoBand: true,
    default: { emb: 1.50, com: 10, out: 6, fix: 4, frete: 12, margem: 20 } },
```

(o padrão `com: 10, fix: 4` reflete a primeira faixa, mesma convenção já usada na Shopee — `out: 6` continua igual, não muda com essa correção)

- [ ] **Step 3: Generalizar o bloco de faixa automática em `calcularCanalModoPreco`**

Substituir o bloco `if (def.autoBand && shAuto) { ... }` dentro de `calcularCanalModoPreco` (linhas ~122-138):

```ts
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
```

por:

```ts
  if (def.autoBand && shAuto) {
    const config = FAIXAS_POR_CANAL[def.key]
    if (!config) return null
    let melhor: { preco: number; com: number; fix: number } | null = null
    let menorDist = Infinity
    for (const b of config.faixas) {
      const banda = config.fn(b.min)
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
```

(a troca de `shopeeBand(b.min === 0 ? 50 : b.min)` por `config.fn(b.min)` é comportamento-preservando pra Shopee — `shopeeBand(0)` e `shopeeBand(50)` caem na mesma faixa, retornam a mesma taxa — e generaliza corretamente pro TikTok, cuja primeira faixa é bem mais estreita)

- [ ] **Step 4: Generalizar o bloco de faixa automática em `calcularCanalModoAnalise`**

Substituir (linhas ~163-166):

```ts
  if (def.autoBand && shAuto) {
    const banda = shopeeBand(precoTeste)
    com = banda.com; fix = banda.fix
  }
```

por:

```ts
  if (def.autoBand && shAuto) {
    const config = FAIXAS_POR_CANAL[def.key]
    if (config) { const banda = config.fn(precoTeste); com = banda.com; fix = banda.fix }
  }
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros em `src/lib/calculosMulticanal.ts` ou em quem o importa (`src/app/precificacao-multicanal/page.tsx`).

Run (verificação manual da matemática, `node -e` depois de `npx prisma generate` se necessário — ou simplesmente conferir por leitura): confirmar que `ttBand(30)` retorna `{com:10, fix:4}` e `ttBand(80)` retorna `{com:6, fix:6}`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/calculosMulticanal.ts
git commit -m "Corrige comissao do TikTok Shop para faixa automatica (10%+R4 abaixo de R50, 6%+R6 acima)"
```

---

### Task 2: Schema — `codigosAnuncio` e `canaisAtivos`

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `CalculoMulticanal.codigosAnuncio Json?`, `CalculoMulticanal.canaisAtivos Json?`.

- [ ] **Step 1: Adicionar os campos**

Em `prisma/schema.prisma`, no model `CalculoMulticanal`, trocar:

```prisma
  precoTeste           Float?
  canais               Json
  createdAt            DateTime @default(now())
```

por:

```prisma
  precoTeste           Float?
  canais               Json
  codigosAnuncio       Json?
  canaisAtivos         Json?
  createdAt            DateTime @default(now())
```

- [ ] **Step 2: Regenerar o Prisma Client (sem tocar no banco)**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client` sem erros.

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "Adiciona codigosAnuncio e canaisAtivos ao CalculoMulticanal"
```

---

### Checkpoint do controlador: aplicar o schema no banco

Antes de seguir pra Task 3 (que depende das colunas existirem de verdade em produção pra teste ao vivo), o controlador roda diretamente (não delegado):

```bash
node scripts/backup-db.js
npx prisma db push
```

Mudança puramente aditiva (2 colunas novas, nullable) — sem risco de perda de dado. Confirmar `✔ Your database is now in sync` antes de prosseguir.

---

### Task 3: Sincronização de custo — `CalculoMulticanal` acompanha compras novas

**Contexto:** `recalcularVariacoesEPrecificacoes` (`src/lib/saveCompra.ts`) já atualiza `Precificacao` toda vez que uma compra muda o custo de um produto (chamada tanto ao criar quanto ao editar uma compra). Passa a também manter `CalculoMulticanal.custoProduto`/`pesoGramas` em dia pros registros ligados à variação que mudou — sem tocar no bloco que já atualiza `Precificacao` (continua rodando, alimenta a Onda B).

**Files:**
- Modify: `src/lib/saveCompra.ts`

**Interfaces:**
- Consumes: `db.calculoMulticanal` (model existente, campos `skuVariacao`, `custoProduto`, `pesoGramas`).

- [ ] **Step 1: Adicionar a sincronização dentro do loop existente**

Em `src/lib/saveCompra.ts`, dentro de `recalcularVariacoesEPrecificacoes`, logo depois do loop `for (const prec of v.precificacoes) { ... }` (que já existe, não mexer nele) e ainda dentro do loop externo `for (const v of variacoes) { ... }`, adicionar:

```ts
    await db.calculoMulticanal.updateMany({
      where: { skuVariacao: v.skuVariacao },
      data: { custoProduto: novoCustoTotal ?? novoCustoCalc ?? 0, pesoGramas: v.pesoGramas },
    })
```

O trecho completo da função fica:

```ts
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

    await db.calculoMulticanal.updateMany({
      where: { skuVariacao: v.skuVariacao },
      data: { custoProduto: novoCustoTotal ?? novoCustoCalc ?? 0, pesoGramas: v.pesoGramas },
    })
  }
}
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros em `src/lib/saveCompra.ts`.

- [ ] **Step 3: Verificar ao vivo**

Com `npm run dev` rodando: escolher um SKU que já tenha um registro em `CalculoMulticanal` com `skuVariacao` preenchido (buscar via `GET /api/calculo-multicanal`), anotar o `custoProduto` atual, lançar uma compra nova pra esse SKU com custo diferente (via `/compras` ou `POST /api/compras`), e conferir com `GET /api/calculo-multicanal` de novo que o `custoProduto` daquele registro mudou.

- [ ] **Step 4: Commit**

```bash
git add src/lib/saveCompra.ts
git commit -m "Sincroniza custoProduto do CalculoMulticanal quando uma compra muda o custo"
```

---

### Task 4: Tela principal — faixa automática por canal, marcação de anunciado

**Contexto:** `shAuto` hoje é um único booleano pra tela inteira, usado só pela Shopee. Com o TikTok também ganhando `autoBand` (Task 1), precisa virar por-canal. Além disso, todo canal de marketplace ganha um controle "anunciado nesta plataforma" — sem isso marcado, o preço mostrado é só cálculo de referência, não uma confirmação de anúncio real.

**Files:**
- Modify: `src/app/precificacao-multicanal/page.tsx`
- Modify: `src/app/api/calculo-multicanal/route.ts`

**Interfaces:**
- Produces: `POST /api/calculo-multicanal` passa a aceitar e persistir `canaisAtivos` no corpo da requisição.

- [ ] **Step 1: Aceitar `canaisAtivos` na rota de salvar**

Em `src/app/api/calculo-multicanal/route.ts`, dentro do objeto `data` do `POST` (dentro da função `POST`), acrescentar o campo. Trocar:

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
  }
```

por:

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

(o campo `codigosAnuncio` não é tocado por essa rota — fica intocado pelo Prisma quando ausente do `data`, preservando o que já estiver salvo; só a rota do parceiro, numa task futura, escreve nele)

- [ ] **Step 2: Trocar `shAuto` por estado por-canal**

Em `src/app/precificacao-multicanal/page.tsx`, trocar (linha ~43):

```ts
  const [shAuto, setShAuto] = useState(true)
```

por:

```ts
  const [autoStates, setAutoStates] = useState<Record<string, boolean>>({ sh: true, tt: true })
  const [canaisAtivos, setCanaisAtivos] = useState<Record<string, boolean>>({})
```

- [ ] **Step 3: Atualizar os usos de `shAuto` nos cálculos**

Trocar (linha ~150, dentro de `calcularPrecosLib`):

```ts
        pesoGramas: item.pesoGramas, canal: item.canais?.[def.key] ?? def.default, def, shAuto: true,
```

(mantém como está — `shAuto: true` aqui é só a prévia da biblioteca, não precisa refletir o toggle da sessão atual)

Trocar (linhas ~159-161):

```ts
  const resultados: Record<string, ResultadoCanal | null> = {}
  CANAIS_MULTICANAL.forEach(def => {
    resultados[def.key] = modo === 'preco'
      ? calcularCanalModoPreco({ custoProduto, despVarPct, despFixPct, pesoGramas, canal: canais[def.key], def, shAuto })
      : calcularCanalModoAnalise({ custoProduto, despVarPct, despFixPct, pesoGramas, precoTeste, canal: canais[def.key], def, shAuto })
  })
```

por:

```ts
  const resultados: Record<string, ResultadoCanal | null> = {}
  CANAIS_MULTICANAL.forEach(def => {
    const shAuto = autoStates[def.key] ?? true
    resultados[def.key] = modo === 'preco'
      ? calcularCanalModoPreco({ custoProduto, despVarPct, despFixPct, pesoGramas, canal: canais[def.key], def, shAuto })
      : calcularCanalModoAnalise({ custoProduto, despVarPct, despFixPct, pesoGramas, precoTeste, canal: canais[def.key], def, shAuto })
  })
```

- [ ] **Step 4: Atualizar o checkbox de faixa automática (agora aparece pra Shopee E TikTok)**

Trocar (linhas ~349, ~355 — os `disabled` dos campos Comissão e Taxa fixa):

```ts
                    <div className="rdb-field"><label>Comissão (%)</label>
                      <input type="number" step="0.1" value={cfg.com} disabled={def.autoBand && shAuto}
                        onChange={e => setCanalField(def.key, 'com', parseFloat(e.target.value) || 0)} /></div>
```

por:

```ts
                    <div className="rdb-field"><label>Comissão (%)</label>
                      <input type="number" step="0.1" value={cfg.com} disabled={def.autoBand && (autoStates[def.key] ?? true)}
                        onChange={e => setCanalField(def.key, 'com', parseFloat(e.target.value) || 0)} /></div>
```

e:

```ts
                    <div className="rdb-field"><label>Taxa fixa (R$)</label>
                      <input type="number" step="0.01" value={cfg.fix} disabled={def.autoBand && shAuto}
                        onChange={e => setCanalField(def.key, 'fix', parseFloat(e.target.value) || 0)} /></div>
```

por:

```ts
                    <div className="rdb-field"><label>Taxa fixa (R$)</label>
                      <input type="number" step="0.01" value={cfg.fix} disabled={def.autoBand && (autoStates[def.key] ?? true)}
                        onChange={e => setCanalField(def.key, 'fix', parseFloat(e.target.value) || 0)} /></div>
```

Trocar (linhas ~360-365, o checkbox em si):

```ts
                    {def.autoBand && (
                      <label className="rdb-autobox">
                        <input type="checkbox" checked={shAuto} onChange={e => setShAuto(e.target.checked)} />
                        Ajustar faixa da Shopee automaticamente (2026)
                      </label>
                    )}
```

por:

```ts
                    {def.autoBand && (
                      <label className="rdb-autobox">
                        <input type="checkbox" checked={autoStates[def.key] ?? true}
                          onChange={e => setAutoStates(s => ({ ...s, [def.key]: e.target.checked }))} />
                        Ajustar faixa automaticamente
                      </label>
                    )}
```

- [ ] **Step 5: Adicionar o toggle "anunciado nesta plataforma" e a indicação visual**

Em `src/app/precificacao-multicanal/page.tsx`, dentro do `.map(def => ...)` dos cartões de canal, trocar o `rdb-chan-head` (linhas ~310-317):

```tsx
                  <div className="rdb-chan-head">
                    <span className="rdb-chan-ic" style={{ background: def.cor, color: def.corTexto }}>
                      {def.nome.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="rdb-chan-nome">{def.nome}<span>{def.tag}</span></span>
                    {r && r.lucro < 0 && <span className="rdb-selo err">prejuízo</span>}
                  </div>
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

                  {def.key !== 'lp' && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: '#5C6B60', padding: '6px 14px 0' }}>
                      <input type="checkbox" checked={canaisAtivos[def.key] ?? false}
                        onChange={e => setCanaisAtivos(s => ({ ...s, [def.key]: e.target.checked }))} />
                      Anunciado nesta plataforma
                    </label>
                  )}
```

- [ ] **Step 6: Carregar e limpar `canaisAtivos` junto com o resto do formulário**

Em `carregarDaLib` (linha ~127-137), depois de `setCanais(canaisCompletos)`, adicionar:

```ts
    setCanaisAtivos(item.canaisAtivos ?? {})
```

Em `limparProduto` (linha ~91-95), depois de `setQ(''); setSugestoes([])`, adicionar:

```ts
    setCanaisAtivos({})
```

- [ ] **Step 7: Enviar `canaisAtivos` ao salvar**

Em `salvarCalculo` (linha ~112-119), trocar:

```ts
      body: JSON.stringify({
        sku, nome, variacao: variacaoTxt, skuVariacao: skuVariacaoLigado,
        custoProduto, pesoGramas, despesasVariaveisPct: despVarPct, despesasFixasPct: despFixPct,
        modo, precoTeste, canais,
      }),
```

por:

```ts
      body: JSON.stringify({
        sku, nome, variacao: variacaoTxt, skuVariacao: skuVariacaoLigado,
        custoProduto, pesoGramas, despesasVariaveisPct: despVarPct, despesasFixasPct: despFixPct,
        modo, precoTeste, canais, canaisAtivos,
      }),
```

- [ ] **Step 8: Verificar**

Run: `npx tsc --noEmit` e `npm run build`
Expected: ambos sem erros.

- [ ] **Step 9: Verificar ao vivo**

Com `npm run dev`: abrir `/precificacao-multicanal`, buscar um produto, marcar "Anunciado nesta plataforma" em ML Full e Shopee, deixar TikTok e ML Clássico desmarcados, salvar. Recarregar a página, carregar o mesmo item da Biblioteca, e confirmar que os checkboxes voltam marcados exatamente como foram salvos. Confirmar visualmente que o selo "sem anúncio" aparece nos canais desmarcados. Testar o checkbox "Ajustar faixa automaticamente" independentemente em Shopee e TikTok (marcar um, desmarcar o outro, confirmar que os campos Comissão/Taxa fixa habilitam/desabilitam de forma independente).

- [ ] **Step 10: Commit**

```bash
git add src/app/precificacao-multicanal/page.tsx src/app/api/calculo-multicanal/route.ts
git commit -m "Tela principal: faixa automatica por canal e marcacao de anunciado por plataforma"
```

---

### Task 5: Repontar `/api/parceiro/precificacao` pro `CalculoMulticanal`

**Contexto:** Hoje lê `Precificacao`. Passa a ler `CalculoMulticanal`, emitindo uma linha por canal de marketplace **marcado como anunciado** (`canaisAtivos[canal] === true`), com rótulo explícito "Mercado Livre FULL"/"Mercado Livre Clássico" em vez de "Mercado Livre" genérico. Preço calculado na hora com o mesmo motor da tela principal — nunca devolve o objeto de configuração do canal inteiro (`canal.emb`, `canal.com` etc.), só os campos permitidos.

**Files:**
- Modify: `src/app/api/parceiro/precificacao/route.ts`
- Modify: `src/app/api/parceiro/precificacao/[id]/route.ts`
- Modify: `src/app/parceiro/page.tsx`

**Interfaces:**
- Produces: `GET /api/parceiro/precificacao?q=...&plataforma=...` → lista de `{ id, codigoAnuncio, precoIdeal, precoPromocional, plataforma: { nome }, variacao: { skuVariacao, nomeVariacao, produto: { nome, skuPrincipal } } }` (mesmo formato de antes — o `id` agora é composto, formato `${calculoMulticanalId}-${canal}`, opaco pro front).
- Produces: `PATCH /api/parceiro/precificacao/[id]` → mesmo contrato de antes (`{ codigoAnuncio }`), decompõe o `id` composto internamente.
- Consumes: `CANAIS_MULTICANAL`, `calcularCanalModoPreco` de `@/lib/calculosMulticanal`.

- [ ] **Step 1: Reescrever a rota de listagem**

Substituir todo o conteúdo de `src/app/api/parceiro/precificacao/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { CANAIS_MULTICANAL, calcularCanalModoPreco } from '@/lib/calculosMulticanal'

const CANAIS_PARCEIRO = ['mlFull', 'mlClassico', 'sh', 'tt']
const ROTULOS: Record<string, string> = {
  mlFull: 'Mercado Livre FULL',
  mlClassico: 'Mercado Livre Clássico',
  sh: 'Shopee',
  tt: 'TikTok Shop',
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  const plataforma = searchParams.get('plataforma')?.trim()

  const where: Record<string, unknown> = {}
  if (q) where.OR = [
    { sku: { contains: q, mode: 'insensitive' } },
    { nome: { contains: q, mode: 'insensitive' } },
  ]

  const calculos = await db.calculoMulticanal.findMany({
    where,
    select: {
      id: true, sku: true, skuVariacao: true, nome: true, variacao: true,
      custoProduto: true, pesoGramas: true,
      despesasVariaveisPct: true, despesasFixasPct: true,
      canais: true, canaisAtivos: true, codigosAnuncio: true,
    },
    orderBy: [{ sku: 'asc' }, { variacao: 'asc' }],
  })

  const linhas: Record<string, unknown>[] = []
  for (const c of calculos) {
    const ativos = (c.canaisAtivos ?? {}) as Record<string, boolean>
    const codigos = (c.codigosAnuncio ?? {}) as Record<string, string | null>
    const canaisCfg = (c.canais ?? {}) as Record<string, Record<string, number>>

    for (const key of CANAIS_PARCEIRO) {
      if (!ativos[key]) continue
      const rotulo = ROTULOS[key]
      if (plataforma && plataforma !== rotulo) continue

      const def = CANAIS_MULTICANAL.find(d => d.key === key)
      const cfg = canaisCfg[key] ?? def?.default
      if (!def || !cfg) continue

      const r = calcularCanalModoPreco({
        custoProduto: c.custoProduto, despVarPct: c.despesasVariaveisPct, despFixPct: c.despesasFixasPct,
        pesoGramas: c.pesoGramas, canal: cfg as any, def, shAuto: true,
      })

      linhas.push({
        id: `${c.id}-${key}`,
        codigoAnuncio: codigos[key] ?? null,
        precoIdeal: r ? r.preco : null,
        precoPromocional: r ? Math.round(r.preco * 1.4 * 100) / 100 : null,
        plataforma: { nome: rotulo },
        variacao: {
          skuVariacao: c.skuVariacao ?? c.sku ?? '',
          nomeVariacao: c.variacao,
          produto: { nome: c.nome, skuPrincipal: c.sku ?? '' },
        },
      })
    }
  }

  return NextResponse.json(linhas)
}
```

- [ ] **Step 2: Reescrever a rota de edição do código do anúncio**

Substituir todo o conteúdo de `src/app/api/parceiro/precificacao/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const separador = params.id.lastIndexOf('-')
  const calculoId = separador > 0 ? params.id.slice(0, separador) : ''
  const canalKey = separador > 0 ? params.id.slice(separador + 1) : ''
  if (!calculoId || !canalKey) return NextResponse.json({ error: 'Identificador inválido' }, { status: 400 })

  const b = await req.json()
  const codigoAnuncio = typeof b.codigoAnuncio === 'string' ? b.codigoAnuncio.trim() : ''

  const atual = await db.calculoMulticanal.findUnique({ where: { id: calculoId }, select: { codigosAnuncio: true } })
  if (!atual) return NextResponse.json({ error: 'Registro não encontrado' }, { status: 404 })

  const codigos = { ...((atual.codigosAnuncio ?? {}) as Record<string, string | null>), [canalKey]: codigoAnuncio || null }

  await db.calculoMulticanal.update({
    where: { id: calculoId },
    data: { codigosAnuncio: codigos },
  })
  return NextResponse.json({ id: params.id, codigoAnuncio: codigoAnuncio || null })
}
```

- [ ] **Step 3: Atualizar a lista de plataformas do filtro na tela do parceiro**

Em `src/app/parceiro/page.tsx`, trocar (linha ~16):

```ts
const PLATAFORMAS = ['Mercado Livre', 'Shopee', 'TikTok Shop']
```

por:

```ts
const PLATAFORMAS = ['Mercado Livre FULL', 'Mercado Livre Clássico', 'Shopee', 'TikTok Shop']
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros nos três arquivos.

Run (com `npm run dev` ativo, logado como admin ou parceiro): marcar um canal como anunciado num produto qualquer via `/precificacao-multicanal` (Task 4), depois `curl "http://localhost:3001/api/parceiro/precificacao?q=<nome do produto>"` — confirmar que aparece exatamente uma linha por canal marcado, com `plataforma.nome` no formato "Mercado Livre FULL"/"Mercado Livre Clássico"/"Shopee"/"TikTok Shop", e nenhum campo de custo/comissão/margem na resposta.

- [ ] **Step 5: Verificar ao vivo na tela do parceiro**

Login como parceiro, abrir `/parceiro`, confirmar que as linhas aparecem certinho, editar um código de anúncio, salvar, recarregar e confirmar que persistiu. Testar o filtro por plataforma com os 4 valores novos.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/parceiro src/app/parceiro/page.tsx
git commit -m "Repontar API do parceiro para ler do CalculoMulticanal, com rotulo Full/Classico explicito"
```

---

### Task 6: Repontar `/api/gestao` pro `CalculoMulticanal`

**Contexto:** Painel externo em HTML que a usuária já usa hoje (endpoint CORS público, sem autenticação — está fora do escopo de proteção de login). Tipos `produtos`, `produto`, `plataformas`, `resumo` leem `Precificacao`/`Plataforma` — passam a ler `CalculoMulticanal`, mantendo o formato de resposta o mais parecido possível do atual. Só emite canais marcados como anunciados (mesma regra da tela do parceiro). **Esta task só é considerada concluída depois que o controlador mostrar a resposta de exemplo pra usuária e ela confirmar** — não é uma decisão que a implementação pode tomar sozinha, é uma integração externa viva.

**Files:**
- Modify: `src/app/api/gestao/route.ts`

**Interfaces:**
- Consumes: `CANAIS_MULTICANAL`, `calcularCanalModoPreco`, `statusMargem` (de `@/lib/calculos`, já existe e é genérica, não específica de `Precificacao`).

- [ ] **Step 1: Adicionar os imports e o mapeamento de canal → rótulo/slug externo**

No topo de `src/app/api/gestao/route.ts`, adicionar (mantendo os imports existentes):

```ts
import { CANAIS_MULTICANAL, calcularCanalModoPreco } from '@/lib/calculosMulticanal'
import { statusMargem } from '@/lib/calculos'

const CANAIS_EXTERNOS = ['lp', 'mlFull', 'mlClassico', 'sh', 'tt']
const SLUG_EXTERNO: Record<string, string> = {
  lp: 'loja_propria', mlFull: 'ml_full', mlClassico: 'ml_classico', sh: 'shopee', tt: 'tiktok',
}

function montarAnuncios(c: {
  custoProduto: number; pesoGramas: number | null
  despesasVariaveisPct: number; despesasFixasPct: number
  canais: unknown; canaisAtivos: unknown
}) {
  const ativos = (c.canaisAtivos ?? {}) as Record<string, boolean>
  const canaisCfg = (c.canais ?? {}) as Record<string, Record<string, number>>
  const anuncios: Record<string, unknown>[] = []

  for (const key of CANAIS_EXTERNOS) {
    if (key !== 'lp' && !ativos[key]) continue
    const def = CANAIS_MULTICANAL.find(d => d.key === key)
    const cfg = canaisCfg[key] ?? def?.default
    if (!def || !cfg) continue

    const r = calcularCanalModoPreco({
      custoProduto: c.custoProduto, despVarPct: c.despesasVariaveisPct, despFixPct: c.despesasFixasPct,
      pesoGramas: c.pesoGramas, canal: cfg as any, def, shAuto: true,
    })

    anuncios.push({
      canal: SLUG_EXTERNO[key],
      precoAtual: null,
      precoMinimo: r ? r.precoMinimo : null,
      precoIdeal: r ? r.preco : null,
      precoMaximo: null,
      precoPromocional: r ? Math.round(r.preco * 1.4 * 100) / 100 : null,
      margemAtual: r ? r.margem : null,
      statusMargem: r ? statusMargem(r.margem) : 'SEM_PRECO',
      comissaoPct: cfg.com != null ? cfg.com / 100 : null,
      impostoPct: null,
    })
  }
  return anuncios
}
```

(`precoAtual` e `precoMaximo` ficam sempre `null` — o `CalculoMulticanal` não tem esses conceitos, é uma mudança de formato deliberada, documentada aqui; `impostoPct` também fica `null` pelo mesmo motivo — a metodologia nova não separa imposto de comissão)

- [ ] **Step 2: Repontar o tipo `produtos`**

Trocar o bloco `if (tipo === 'produtos') { ... }` inteiro (linhas 22-89) por:

```ts
    if (tipo === 'produtos') {
      const produtos = await db.produto.findMany({
        where: { status: 'ativo' },
        select: {
          skuPrincipal: true, nome: true, categoria: true,
          custoAtualizado: true, custoUnitario: true, custoPorKg: true,
          unidadeCompra: true, fornecedorPrincipal: true, dataUltimaCompra: true,
          variacoes: {
            where: { status: 'ativo' },
            select: { skuVariacao: true, nomeVariacao: true, pesoGramas: true, custoTotal: true, custoCalculado: true },
          },
        },
        orderBy: { nome: 'asc' },
      })

      const calculos = await db.calculoMulticanal.findMany({
        select: {
          skuVariacao: true, custoProduto: true, pesoGramas: true,
          despesasVariaveisPct: true, despesasFixasPct: true, canais: true, canaisAtivos: true,
        },
      })
      const porSkuVariacao = new Map(calculos.filter(c => c.skuVariacao).map(c => [c.skuVariacao as string, c]))

      const produtosResposta = produtos.map(produto => ({
        ...produto,
        variacoes: produto.variacoes.map(variacao => {
          const calc = porSkuVariacao.get(variacao.skuVariacao)
          return { ...variacao, anuncios: calc ? montarAnuncios(calc) : [] }
        }),
      }))

      return NextResponse.json({ ok: true, data: produtosResposta }, { headers: CORS_HEADERS })
    }
```

- [ ] **Step 3: Repontar o tipo `produto` (busca por SKU)**

Trocar o bloco `if (tipo === 'produto' && sku) { ... }` inteiro (linhas 92-125) por:

```ts
    if (tipo === 'produto' && sku) {
      const produto = await db.produto.findFirst({
        where: {
          OR: [
            { skuPrincipal: { contains: sku, mode: 'insensitive' } },
            { nome: { contains: sku, mode: 'insensitive' } },
            { variacoes: { some: { skuVariacao: { contains: sku, mode: 'insensitive' } } } },
          ],
        },
        include: { variacoes: { where: { status: 'ativo' } } },
      })

      if (!produto) {
        return NextResponse.json({ ok: false, error: 'Produto não encontrado' }, { status: 404, headers: CORS_HEADERS })
      }

      const skusVariacao = produto.variacoes.map(v => v.skuVariacao)
      const calculos = await db.calculoMulticanal.findMany({
        where: { skuVariacao: { in: skusVariacao } },
        select: {
          skuVariacao: true, custoProduto: true, pesoGramas: true,
          despesasVariaveisPct: true, despesasFixasPct: true, canais: true, canaisAtivos: true,
        },
      })
      const porSkuVariacao = new Map(calculos.filter(c => c.skuVariacao).map(c => [c.skuVariacao as string, c]))

      const produtoResposta = {
        ...produto,
        variacoes: produto.variacoes.map(variacao => {
          const calc = porSkuVariacao.get(variacao.skuVariacao)
          return { ...variacao, anuncios: calc ? montarAnuncios(calc) : [] }
        }),
      }

      return NextResponse.json({ ok: true, data: produtoResposta }, { headers: CORS_HEADERS })
    }
```

- [ ] **Step 4: Repontar o tipo `plataformas`**

Trocar o bloco `if (tipo === 'plataformas') { ... }` (linhas ~165-171) por:

```ts
    if (tipo === 'plataformas') {
      const plataformas = CANAIS_MULTICANAL.map(def => ({
        slug: SLUG_EXTERNO[def.key], nome: def.nome + (def.tag && def.key !== 'lp' ? ` ${def.tag}` : ''),
        comissaoPct: def.default.com / 100, taxaFixa: def.default.fix, impostoPct: null,
      }))
      return NextResponse.json({ ok: true, data: plataformas }, { headers: CORS_HEADERS })
    }
```

- [ ] **Step 5: Repontar o tipo `resumo`**

No bloco `if (tipo === 'resumo') { ... }`, trocar a busca de `plataformas` e o mapeamento final. Trocar:

```ts
      const [totalProdutos, faturamentos, plataformas] = await Promise.all([
        db.produto.count({ where: { status: 'ativo' } }),
        db.faturamento.findMany({ where: { data: { gte: inicio, lte: fim } } }),
        db.plataforma.findMany({ where: { ativa: true } })
      ])
```

por:

```ts
      const [totalProdutos, faturamentos] = await Promise.all([
        db.produto.count({ where: { status: 'ativo' } }),
        db.faturamento.findMany({ where: { data: { gte: inicio, lte: fim } } }),
      ])
```

E trocar:

```ts
          plataformas: plataformas.map(p => ({
            slug: p.slug,
            nome: p.nome,
            comissaoPct: p.comissaoPct,
            taxaFixa: p.taxaFixa,
            impostoPct: p.impostoPct
          }))
```

por:

```ts
          plataformas: CANAIS_MULTICANAL.map(def => ({
            slug: SLUG_EXTERNO[def.key], nome: def.nome,
            comissaoPct: def.default.com / 100, taxaFixa: def.default.fix, impostoPct: null,
          }))
```

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit` e `npm run build`
Expected: ambos sem erros.

- [ ] **Step 7: Gerar resposta de exemplo pro controlador revisar com a usuária**

Com `npm run dev` ativo: `curl "http://localhost:3001/api/gestao?tipo=produtos"` e `curl "http://localhost:3001/api/gestao?tipo=resumo"`, salvar a saída num arquivo, e reportar no relatório da task que essa saída precisa ser confirmada pela usuária antes do deploy final (não decidir sozinho que está correto).

- [ ] **Step 8: Commit**

```bash
git add src/app/api/gestao/route.ts
git commit -m "Repontar /api/gestao para ler do CalculoMulticanal (resolve tambem a distincao ML Full/Classico)"
```

---

### Task 7: Remover Calculadora e Precificação (páginas e rotas editáveis)

**Contexto:** `/calculadora` e `/precificacao` deixam de existir — o Multicanal RdB (`/precificacao-multicanal`) vira a tela única de precificação. O model `Precificacao` e a sincronização em `saveCompra.ts` **não são tocados** (continuam alimentando Dashboard, Variações, Busca, Exportar e Importar até a Onda B).

**Files:**
- Delete: `src/app/calculadora/page.tsx`
- Delete: `src/app/precificacao/page.tsx`
- Delete: `src/app/api/precificacao/route.ts`
- Delete: `src/app/api/precificacao/[id]/route.ts`
- Modify: `src/components/ui/Sidebar.tsx`

- [ ] **Step 1: Remover as páginas e rotas**

```bash
git rm src/app/calculadora/page.tsx
git rm src/app/precificacao/page.tsx
git rm src/app/api/precificacao/route.ts
git rm src/app/api/precificacao/[id]/route.ts
```

- [ ] **Step 2: Remover os links do menu**

Em `src/components/ui/Sidebar.tsx`, no array `links`, remover as duas linhas:

```ts
  { href: '/calculadora',    label: 'Calculadora',     icon: Calculator },
```

e

```ts
  { href: '/precificacao',   label: 'Precificação',    icon: Tag },
```

(o import de `Calculator` de `lucide-react` fica sem uso depois disso — remover do bloco de import também; `Tag` continua em uso em outro link, `/lotes`, não remover)

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit` e `npm run build`
Expected: ambos sem erros. Confirmar no output do build que `/calculadora` e `/precificacao` não aparecem mais na lista de rotas, e que `/precificacao-multicanal`, `/parceiro` continuam aparecendo normalmente.

Run: `grep -rn "'/calculadora'\|'/precificacao'" src` (aspas simples, pra não pegar `/precificacao-multicanal`)
Expected: nenhuma ocorrência.

- [ ] **Step 4: Verificar ao vivo**

Com `npm run dev`: acessar `/calculadora` e `/precificacao` diretamente pela URL — devem dar 404. Conferir que o menu lateral não mostra mais esses dois itens, e que `/precificacao-multicanal` continua funcionando normalmente (busca, cálculo, salvar).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Sidebar.tsx
git commit -m "Remove Calculadora e Precificacao (paginas e rotas editaveis) - Multicanal RdB vira tela unica"
```

---

### Task 8 (executada pelo controlador, não delegada): Migração de dados e deploy

- [ ] **Step 1: Backup**

Run: `node scripts/backup-db.js`

- [ ] **Step 2: Rodar a migração**

Script (`node -e`, contra o banco de produção) que, pra cada registro de `Precificacao`:
1. Mapeia `plataforma.slug` + `tipoFreteML` pro canal (`ml`+`full`→`mlFull`, `ml`+`classico`→`mlClassico`, `shopee`→`sh`, `tiktok`→`tt`).
2. Busca (por `skuVariacao`) ou cria o `CalculoMulticanal` do produto/variação correspondente.
3. Preenche `canais[canal]` com os valores equivalentes (comissão, taxa, frete, embalagem — usar os mesmos nomes de campo de `CanalConfig`: `com`, `fix`, `frete`, `emb`, mais `out: 0` e `margem: 20` como padrão pra completar a estrutura), `codigosAnuncio[canal]` com o `codigoAnuncio` antigo (se houver), `canaisAtivos[canal] = true`.
4. Preço final recalculado do zero pela metodologia nova (não copiado do antigo) — usar `calcularCanalModoPreco` só pra gerar o relatório comparativo, não precisa persistir o preço (o `CalculoMulticanal` nunca guarda preço calculado, só configuração).

Produtos/variações com `status: 'ativo'` sem nenhum registro em `Precificacao` nem em `CalculoMulticanal`: criar um `CalculoMulticanal` com os 5 canais em `CANAIS_MULTICANAL[].default` e `canaisAtivos` todo `false`.

Gerar um relatório (arquivo `.json` ou `.csv`, não só console) com uma linha por SKU×canal migrado: preço antigo (`Precificacao.precoIdeal`) × preço novo (recalculado), pra usuária revisar.

- [ ] **Step 3: Apresentar o relatório pra usuária e aguardar confirmação**

Não seguir pro próximo step sem a usuária confirmar que os preços recalculados fazem sentido. Se ela pedir ajuste em algum valor (ex: uma margem específica que ficou diferente do esperado), ajustar e re-rodar antes de prosseguir.

- [ ] **Step 4: Confirmar a resposta do `/api/gestao` com a usuária**

Mostrar a saída de exemplo gerada na Task 6 (tipo=produtos e tipo=resumo) e confirmar que o painel externo em HTML consegue ler esse formato — ou que ela vai ajustar o painel primeiro.

- [ ] **Step 5: Build final**

Run: `npx tsc --noEmit` e `npm run build`
Expected: ambos sem erros.

- [ ] **Step 6: Push**

```bash
git push origin main
```

- [ ] **Step 7: Verificação em produção**

Depois do deploy do Railway: conferir `/precificacao-multicanal`, `/parceiro`, e o painel externo (se a usuária conseguir testar de imediato) funcionando com dados reais.

- [ ] **Step 8: Atualizar o ledger**

Anotar em `.superpowers/sdd/progress.md` a conclusão da Onda A, e registrar explicitamente que a Onda B (Dashboard, Variações, Busca, Exportar, Importar) ainda está pendente — não marcar a Unificação da Precificação como concluída até a Onda B também terminar.
