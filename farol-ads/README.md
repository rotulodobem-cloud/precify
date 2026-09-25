# Farol Ads Multicanal

Painel que responde, produto por produto, **onde a Rótulo do Bem está ganhando e onde está perdendo dinheiro com ads — e o que fazer a respeito.**
Implementa a especificação *"Sistema de Monitoramento de Ads Multicanal — Especificação Técnica"* (24–25/09/2026).

- Métrica principal: **margem de contribuição após ads** (não ROAS isolado).
- Cada anúncio cai num de 6 estados — **ESCALAR · MANTER · OBSERVAR · OTIMIZAR · REDUZIR · PAUSAR** — com gravidade por valor em reais e explicação **Situação → Evidência → Impacto → Ação**.
- Mercado Livre hoje; Shopee e TikTok Shop entram sem mudar tabelas (coluna `canal` em tudo).

> Sem as variáveis do Supabase o painel abre em **modo demonstração**, com os produtos das telas de referência passando pelo mesmo motor.

## Estrutura

```
farol-ads/
├── supabase/migrations/20260925120000_ads_multicanal.sql  # tabelas, view de margem, views do painel, role de leitura
├── src/lib/
│   ├── economia.ts          # seção 5: margem antes/após ads, ACOS/ROAS de equilíbrio, TACOS
│   ├── motor.ts             # seção 6: os 6 estados, travas, gravidade, explicação
│   ├── parserRelatorio.ts   # relatório "Anúncios patrocinados / Padrão" do ML (.xlsx/.csv)
│   ├── ingestao.ts          # seção 4: relatório → Precify → snapshot → motor → alertas → resumo do chat
│   ├── agregacao.ts         # anúncio (várias campanhas) → produto → campanha
│   ├── dados.ts             # leitura das views ads_painel_* (ou demonstração)
│   └── *.test.ts            # testes (npm test)
├── src/app/(painel)/        # Visão Geral, Produtos (+detalhe), Campanhas, Recomendações, Alertas,
│                            # Promoções, Relatórios, Canais, Importar, Configurações
├── src/app/api/ingestao     # POST do relatório pela tarefa diária (token próprio)
└── scripts/ingerir-anuncios.ts
```

## Rodar localmente

```bash
cd farol-ads
npm install
cp .env.example .env.local   # preencha ao menos PAINEL_USUARIO, PAINEL_SENHA, PAINEL_SEGREDO
npm run dev                  # http://localhost:3100
npm test                     # motor, economia e parser
```

## Colocar no ar

### 1. Banco (Supabase, projeto `vqrstpxblbicdfloztzh`)
Aplique `supabase/migrations/20260925120000_ads_multicanal.sql` (SQL Editor ou `supabase db push`). Ela:
- cria `ads_anuncios_snapshot`, `ads_campanhas_snapshot`, `ads_alertas`, `ads_recomendacoes_historico`, `ads_alteracoes`, `ads_sku_depara`, `produtos_custo`, `canais_comissao`, `ads_config`;
- **não mexe** em `ml_campanhas_snapshot` / `ml_alertas`: triggers copiam cada gravação da tarefa diária atual para as tabelas `ads_*`;
- cria a view `ads_anuncios_margem` (todos os campos da seção 3, inclusive `estado_motor`, `gravidade`, `proxima_data_reavaliacao`) e as views `ads_painel_*`;
- cria a role `painel_leitura`, que **só enxerga as views `ads_painel_*`** (nunca tokens do ML/Precify).

É idempotente (pode rodar de novo) e foi validada num Postgres local com as mesmas colunas do Farol.

**Chave de leitura do painel:** gere um JWT assinado com o *JWT secret* do projeto (Settings → API) com o payload
`{"role": "painel_leitura", "iss": "supabase", "exp": <daqui a alguns anos>}` e use como `SUPABASE_PAINEL_KEY`.

### 2. Vercel
Novo projeto apontando para este repositório com **Root Directory = `farol-ads`**. Variáveis (ver `.env.example`):

| Variável | Para quê |
|---|---|
| `PAINEL_USUARIO`, `PAINEL_SENHA`, `PAINEL_SEGREDO` | login próprio (cookie assinado, 7 dias; 5 tentativas erradas bloqueiam 15 min) |
| `SUPABASE_URL`, `SUPABASE_PAINEL_KEY` | leitura das views do painel |
| `SUPABASE_SERVICE_ROLE_KEY` | só ingestão e botões "resolvido / apliquei" |
| `INGESTAO_TOKEN` | token da tarefa diária para `POST /api/ingestao` |
| `PRECIFY_API_URL`, `PRECIFY_API_KEY` | custo por SKU (chave do Precify com escopo "Produtos", em `/chaves-api`) |

### 3. Tarefa diária (8h)
A cada 2 dias, quando houver relatório novo na pasta do Drive:

```bash
curl -X POST https://<painel>/api/ingestao \
  -H "x-ingestao-token: $INGESTAO_TOKEN" \
  -F arquivo=@anuncios.xlsx -F capturado_em=2026-09-25
```

A resposta traz `resumo` pronto para o chat (só o que mudou para REDUZIR/PAUSAR/ESCALAR ou está crítico, no formato situação → evidência → impacto → ação). Sem relatório novo, a tarefa segue só com promoções + campanhas, como hoje. Também dá para importar pela tela **Importar relatório** ou por `npx tsx --env-file=.env scripts/ingerir-anuncios.ts arquivo.xlsx`.

## Integração com o Precify (ponto em aberto da seção 8)
O endpoint é o que já existe neste repositório: `GET /api/gestao?tipo=produtos` com header `x-api-key`.
O Farol usa `custoAtualizado` (SKU principal) e `variacoes[].custoTotal` (SKU de variação) como custo direto.
O imposto vem de `parametros_fiscais` (que o Farol já recebe do Precify); uma chave de escopo "Produtos" basta.

## Decisões que valem conferir
- **Base de receita (5.7):** a margem % usa a receita total do SKU **no canal** (pedidos do ML no Bling, no período do relatório); ACOS/ROAS usam receita atribuída a ads. Sem vendas do Bling para o SKU, cai para a receita de ads e a margem aparece como parcial.
- **Frete da empresa:** ainda não existe por SKU → entra como "não incluído" e a margem é marcada com `*`.
- **Custo não cadastrado:** anúncio vai para OBSERVAR, nunca margem com custo zero.
- **ROAS abaixo da meta do ML** só vira OBSERVAR quando a margem após ads está abaixo da margem saudável (8%) — as metas atuais das campanhas (15–19) estão muito acima do ROAS real, e sem esse filtro quase tudo ficaria em OBSERVAR.
- **Decisão por anúncio:** o motor soma todas as campanhas em que o anúncio aparece; o detalhe do produto mostra a quebra por campanha (caso da Cúrcuma).
- **Estoque:** somado de `estoque_snapshots` pelo SKU; **buy box:** coluna `perdeu_buy_box` fica nula até existir fonte.
- Todos os limites do motor estão em `ads_config` (tela Configurações mostra os valores atuais).
