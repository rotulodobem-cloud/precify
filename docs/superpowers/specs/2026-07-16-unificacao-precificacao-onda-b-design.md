# Unificação da Precificação — Onda B — Design

Data: 2026-07-16
Status: Aprovado pela usuária em conversa

## Contexto

A Onda A tornou o `CalculoMulticanal` a fonte única de preço pros canais de marketplace + Loja Própria, mas deliberadamente **não removeu** o model `Precificacao` antigo, porque 5 outros pontos do sistema ainda dependiam dele: `/api/dashboard`, `/variacoes`, `/busca`, `/api/exportar`, `/api/importar` (função de precificação). Essa Onda B repontua os 4 primeiros, remove o quinto (não é mais usado), e só então apaga `Precificacao` de vez.

## Decisões confirmadas com a usuária

1. **Importação de planilha de precificação é removida, não repontada** — a usuária confirmou que não usa essa função (só usa a importação de compras, que é outra função na mesma tela e não é afetada).
2. **Dashboard é redesenhado, não só religado** — a usuária esclareceu que não acompanha preço/margem de marketplace pelo Dashboard (isso ela vê direto nas plataformas). O que ela realmente precisa ali é gestão interna: quanto gastou comprando mercadoria, quais produtos provavelmente precisam de ajuste de preço, e visões estratégicas de decisão. **Nenhuma parte do Dashboard mostra preço específico por canal/anúncio de marketplace** — isso continua sendo função do Multicanal RdB e da tela do parceiro.
3. **Variações e Busca**: o resumo de precificação inline passa a vir do `CalculoMulticanal`, mostrando só os canais marcados como anunciados (`canaisAtivos`) — mesma regra já usada no resto do sistema desde a Onda A.
4. **Exportar XLSX**: a aba "Precificação" muda de uma linha por SKU×Plataforma pra uma linha por SKU×canal anunciado.
5. **Remoção final do model `Precificacao`** só acontece depois que os 4 pontos acima estiverem repontados e confirmados funcionando.

## Arquitetura

### Dashboard (`/api/dashboard`, redesenho completo)

Cinco blocos, a maioria vindo de `Compra` (não depende de `CalculoMulticanal` nem de `Precificacao`):

1. **Gastos com compras do mês** — soma de `custoTotal` das compras no período, com filtro por mês e por fornecedor (`fornecedor` já é um campo direto em `Compra`).
2. **Produtos que provavelmente precisam de ajuste de preço** — usa o sinalizador que já existe em `Compra.statusVariacao` (`'AUMENTOU > 5%'` / `'DIMINUIU > 5%'`, calculado a cada compra lançada), cruzado com "o produto tem pelo menos um canal anunciado" (via `CalculoMulticanal.canaisAtivos`). Mostra **que o custo mudou o suficiente pra pesar no preço**, sem mostrar preço nem canal específico — é um alerta de "vale revisar", não um substituto do Multicanal RdB. (Aproximação deliberada — o planner completo com tolerância configurável e comparação com o preço real da loja, "Parte 2", ainda fica pra depois; isso aqui é o sinal disponível hoje, sem esperar por aquele projeto.)
3. **Margem média por categoria** — mesma ideia de antes, recalculada com o motor novo: pra cada produto com pelo menos um canal anunciado, pega a margem desse(s) canal(is) e tira a média por `categoria`. (Nota: a maioria dos produtos ativos — 615 de ~650 — está na categoria genérica "Geral"; a métrica ainda é válida, só vale saber que "Geral" vai dominar o gráfico.)
4. **Fornecedor com maior gasto no período** — agrupamento de `Compra.custoTotal` por `fornecedor`, mesmo filtro de mês do bloco 1.
5. **Produtos sem compra recente** — produtos ativos cuja `dataUltimaCompra` (campo em `Produto`) passou de um limite (ex: 60 dias, configurável no código) — sinaliza possível estoque parado.

Filtro por mês e por fornecedor se aplica aos blocos 1 e 4 (os dois baseados em `Compra`).

### `/variacoes` e `/busca`

Troca a busca por `precificacoes` (relação com `Precificacao`) por uma busca em `CalculoMulticanal` pelo `skuVariacao` correspondente. Mostra só os canais com `canaisAtivos[canal] === true`, com o preço calculado na hora (mesmo padrão já usado no parceiro/gestão) — rótulo do canal, preço e status (saudável/atenção/prejuízo, pela mesma faixa de margem 25%/20% já usada em `statusMargem`).

### `/api/exportar`

A aba "Precificação" da planilha passa a ter uma linha por SKU×canal anunciado, lendo de `CalculoMulticanal`. Colunas equivalentes às de hoje, adaptadas ao motor novo (sem colunas que não existem mais, como "Preço Atual" e "Preço Máximo" — mesma decisão já tomada no `/api/gestao` na Onda A).

### `/api/importar`

Remove a função `importarPrecificacao` e a lógica de auto-detecção de abas ML/Shopee/TikTok/Magalu. A importação de compras (`importarCompras`) fica intocada.

### Remoção final do `Precificacao`

Depois dos 4 pontos acima repontados e testados: remove o model `Precificacao` do `prisma/schema.prisma` (e as relações `precificacoes` em `Variacao`/`Plataforma`), remove `saveCompra.ts`'s bloco de sincronização antigo (o que ainda atualiza `Precificacao` a cada compra), e remove as funções de `src/lib/calculos.ts` que ficarem sem nenhum uso (`calcPrecificacaoComFreteML`, `calcPrecificacaoCompleta`, `calcPrecoMinimo`, `calcPrecoIdeal`, `calcPrecoMaximo`, `calcPrecoVenda`, `calcMargem`, `calcFreteFlexMLInternal`, `estimarPrecoSemFrete` — confirmado por grep antes de remover cada uma, não por suposição). `db push` final remove a tabela de produção.

## Fora de escopo

- O planner de tolerância pra Loja Própria ("Parte 2") — o bloco 2 do Dashboard é um sinal mais simples, não substitui esse projeto.
- Qualquer preço/margem específico de canal de marketplace no Dashboard — deliberadamente fora, por pedido da usuária.

## Riscos e verificação

- Sem framework de testes automatizado — verificação por `npx tsc --noEmit`, `npm run build`, testes ao vivo.
- A remoção do `Precificacao` é irreversível em produção (`db push` derruba a tabela) — só executar depois de confirmar que os 4 pontos repontados estão funcionando ao vivo, com backup imediatamente antes.
