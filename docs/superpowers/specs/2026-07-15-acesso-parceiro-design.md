# Acesso de Parceiro (Anúncios/Ads) — Design

Data: 2026-07-15
Status: Aprovado pela usuária em conversa

## Contexto

A usuária tem um parceiro externo que vai cuidar da gestão de anúncios e
ads nos marketplaces (Mercado Livre, Shopee, TikTok Shop). Ele precisa
acessar o preço de venda e o preço promocional (+40%) de cada anúncio
pra saber por quanto subir e depois promocionar o produto — mas **não
pode ver o custo do produto**, nem o resto do sistema (compras,
fornecedores, margem, etc.).

A fonte de dados é a tela Precificação (`/precificacao`, model
`Precificacao` no Prisma), que já guarda por SKU×Plataforma: código do
anúncio, preço ideal e preço promocional. Esses valores **recalculam
sozinhos** sempre que uma nova compra muda o custo do produto (via
`recalcularVariacoesEPrecificacoes` em `saveCompra.ts`) — não é preciso
nenhum trabalho novo pra manter isso atualizado.

## Descoberta relevante: brecha nas rotas /api

O middleware atual (`src/middleware.ts`) só protege páginas — toda rota
`/api/*` responde sem checar o cookie de login. Isso significa que, sem
correção, alguém que descobrisse a URL de `/api/precificacao` acessaria
o custo mesmo sem ter permissão nenhuma na tela. Como o objetivo desse
projeto é justamente impedir que o parceiro veja custo, a proteção
precisa estar também nas rotas de API, não só nas páginas.

## Decisões confirmadas com a usuária

1. **Login próprio pro parceiro** (não link com token) — mais seguro e
   revogável.
2. Fonte de dados: tela Precificação (`Precificacao` model), não o
   Multicanal RdB (que não tem campo de código de anúncio).
3. Parceiro pode **editar só o código do anúncio** — preço não é
   editável por ele (isso permanece controlado pela usuária).
4. A fórmula real de preço promocional (`calcPrecoPromocional` em
   `src/lib/calculos.ts`), usada pela tela Precificação e pelo
   recálculo automático, muda de 1,45 (45%) pra 1,40 (40%) — alinhando
   com o valor já ajustado na Calculadora e no Multicanal RdB. Os
   registros já salvos no banco são recalculados nesse mesmo trabalho.
5. Rotas `/api/*` passam a exigir autenticação (fecha a brecha acima).

## Arquitetura

### Autenticação com papel (role)

- Novo par de credenciais via variável de ambiente: `PARTNER_USER` /
  `PARTNER_PASSWORD` (mesmo padrão do `ADMIN_USER`/`ADMIN_PASSWORD`
  existente). A usuária precisa configurar essas variáveis no Railway
  (fora do alcance de código — instrução separada no final).
- `POST /api/auth/login` passa a checar as duas credenciais e gravar no
  cookie `precify_auth` um valor com o papel embutido:
  `${NEXTAUTH_SECRET}|admin` ou `${NEXTAUTH_SECRET}|partner`.
- `src/middleware.ts` passa a proteger também `/api/*`:
  - Sem cookie válido (não bate com nenhum dos dois valores esperados) →
    página: redireciona pra `/login`; API: `401`.
  - Papel `admin` → acesso total (comportamento atual, sem mudança).
  - Papel `partner` → só pode acessar `/parceiro` (página) e
    `/api/parceiro/*` (API). Qualquer outra rota de página redireciona
    pra `/parceiro`; qualquer outra rota de API retorna `403`.
- Novo `POST /api/auth/logout`, limpa o cookie. Botão "Sair" na tela do
  parceiro (hoje não existe botão de logout em lugar nenhum do sistema;
  não mexe nisso pro admin, só adiciona pro parceiro).

### Página do parceiro — `/parceiro`

- Layout próprio, sem o `Sidebar` padrão do sistema (o `Sidebar` component
  passa a checar `pathname` e não renderizar os links de sempre quando a
  rota é `/parceiro` — mostra só a marca e o botão "Sair").
- Tabela com busca por SKU/nome (mesmo padrão de debounce das outras
  telas), colunas:
  - SKU, Produto, Variação, Plataforma
  - Código do Anúncio — campo de texto editável + botão salvar por linha
  - Preço de venda (preçoIdeal) — somente leitura
  - Preço promocional (+40%) — somente leitura
- Nenhum outro dado do produto ou do sistema aparece nessa tela.

### API — `/api/parceiro/precificacao`

- `GET` — mesmo filtro de busca (`q`, case-insensitive) da rota
  `/api/precificacao`, mas o `select` do Prisma retorna **só**:
  `id, skuVariacao, plataforma.nome, codigoAnuncio, precoIdeal,
  precoPromocional`, mais `variacao.nomeVariacao` e
  `variacao.produto.{nome, skuPrincipal}` pra exibição. Nunca inclui
  custo, comissão, taxas, margem ou lucro — o `select` explícito garante
  isso (não é um filtro de exibição no front, o dado nem sai do banco).
- `PATCH /api/parceiro/precificacao/[id]` — atualiza **só**
  `codigoAnuncio` (campo travado no código do endpoint, ignora qualquer
  outro campo no corpo da requisição mesmo que enviado).

### Correção da fórmula (calculos.ts)

- `calcPrecoPromocional`: `precoIdeal * 1.45` → `precoIdeal * 1.40`.
- Depois do deploy, rodar um script pontual (`node -e`, como já fizemos
  antes nesta sessão) pra recalcular `precoPromocional` de todos os
  registros existentes em `Precificacao` com a fórmula nova — não dá pra
  esperar a próxima compra de cada SKU pra corrigir o valor salvo.

## Fora de escopo

- Múltiplos parceiros ou papéis diferentes (sistema genérico de
  usuários/permissões) — só esse parceiro único, com credencial fixa.
- Editar preço ou qualquer parâmetro de cálculo pelo parceiro.
- Mostrar dados do Multicanal RdB (Loja Própria) pro parceiro — ele só
  cuida de marketplace (ML, Shopee, TikTok), que é onde teria anúncio
  pago.

## Testes / verificação

- `tsc --noEmit` e `npm run build` limpos.
- Testar ao vivo: login como parceiro só enxerga `/parceiro`; tentar
  acessar `/precificacao` ou `/api/produtos` direto com o cookie de
  parceiro deve barrar (403/redirect); login como admin continua com
  acesso total.
- Confirmar que editar código do anúncio como parceiro salva e reflete
  também na tela Precificação (admin), e que preço não é editável nessa
  tela.
- Confirmar que o recálculo da fórmula (1,40) bate nos valores já
  existentes no banco depois do script de correção.
