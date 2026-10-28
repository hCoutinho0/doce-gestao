# Confeitto — contexto para o Claude Code

App de gestão da **Lavily Confeitaria** (estoque, pedidos, precificação,
financeiro, cardápio online, clientes/fidelidade, equipe). Usado só pelo dono
(Vitor) e pela namorada. Converse sempre em **português do Brasil**, com
linguagem simples (o usuário não é programador).

## Arquitetura

- **Next.js 16 (App Router, Turbopack) + React 19 + Tailwind v4 + shadcn/base-ui.**
  `app/dashboard/page.tsx` é o painel inteiro (arquivo grande, ~5.5k linhas).
- **Banco: Supabase** (plano grátis), via REST em `lib/db.ts`. Tabela
  `app_state(id, value jsonb, version, expires_at)` com RLS sem políticas —
  só a chave secreta acessa. Documentos por confeitaria: `{bakeryId}:{chave}`
  (`doce-orders`, `doce-stock-v2`, `doce-menu`, `doce-loyalty`, `doce-compras`,
  `doce-caixa`, `doce-menu-periodo`…). Chaves permitidas/admin-only/públicas em
  `app/api/data/[key]/route.ts`. Concorrência: `updateStateAtomic` (versão).
- **Login:** NextAuth v5, só email+senha (`auth.ts`), sessão JWT reconferida a
  cada 5 min. Papéis `admin` e `production`. Funcionária entra com **código de
  convite** (`/cadastro` → "Entrar numa confeitaria").
- **Hospedagem única (Vercel, região gru1):** o mesmo código serve o painel
  (`/dashboard`), o cardápio público (`/{slug}`, p.ex. `lavilyconfeitaria`) e as APIs;
  só ele tem `SUPABASE_SERVICE_KEY`. Deploy automático a cada push na `main`
  (GitHub `hCoutinho0/doce-gestao`). `CARDAPIO_ONLY=1` desliga o painel (404).
  Cadastro de confeitaria nova fechado (`ALLOW_SIGNUP`); gente nova entra por convite.
  Painel avisa "Nova versão disponível" (`/api/versao`, `components/aviso-versao.tsx`).
- **App de desktop (Windows) = casca fina** (`electron/`): janela que abre o site, **sem
  servidor, banco ou chave**. Faz backup diário (`/api/backup` com a sessão da janela →
  `%APPDATA%\Confeitto\backups` + OneDrive), lembrete de tarefas (`/api/reminders/daily`)
  e se atualiza sozinha (`electron/bootstrap.cjs` + bucket público `atualizacoes`).
  Ponte com a página: `electron/app/main-preload.cjs`. Menu da conta no canto inferior
  esquerdo (`components/menu-conta.tsx`). Detalhes: `docs/ARQUITETURA.md`.

## Como publicar

- **Painel/site/cardápio/iPhone:** commit + push na `main`. Nada mais.
- **Janela do Windows** (raro: só se mudar `electron/app`): `npm run publicar:casca`
  (sobe a versão, envia o pacote ao bucket `atualizacoes`; os apps baixam sozinhos).
  Instalador novo (`gerar-instalador.bat`) só se mudar a versão do Electron. O
  instalador **não tem segredo** (pode circular).
- A versão do app é a do `package.json` (a mesma em `electron/package.json`).
- Chaves/segredos (Supabase, AUTH_SECRET) só no Vercel e no `.env.local` — nunca no
  repositório, instalador ou conversa.
- Verificação de tipos: `node node_modules/typescript/bin/tsc --noEmit -p .`
- Testes: `npm test` (Node `node:test`, pasta `tests/`; só lógica pura de `lib/`: preço do pedido, pagamento/selos, permissões, validações). O CI (`.github/workflows/ci.yml`) roda tipos + testes + build a cada push. Sugestões e pendências: `docs/ROADMAP.md`.

## Regras e decisões já tomadas

- Segurança: preço de pedido/checkout sempre calculado no servidor; pedido do
  site entra sempre como Novo/Pendente; API pública só expõe campos públicos
  do perfil; upload confere assinatura do arquivo; rate limits em login,
  cadastro, convites, upload, lookup de celular e checkout.
- Segredos só em `.env.local` (gitignored) e nas variáveis do Vercel. Nunca
  imprimir chaves. `.env.local` já não tem as chaves antigas (Azure/Google/WhatsApp/VAPID); falta o
  usuário revogá-las nos serviços de origem.
- **Mercado Pago (cartão no site):** integração pronta (Checkout Pro +
  webhook com assinatura), mas desligada no cardápio ("Cartão — Em breve").
  Não remover. Precisa de `MERCADOPAGO_ACCESS_TOKEN` e
  `MERCADOPAGO_WEBHOOK_SECRET` no Vercel.
- Cliente é identificado pelo **celular** (`lib/phone.ts`): o mesmo número
  nunca vira dois cadastros; todo pedido cria/encontra o cartão fidelidade;
  selos entram quando o pedido é concluído.
- Visual **inspirado na Apple** (vidro fosco, controles
  segmentados, menus estilo macOS), com o **Roxo Profundo da marca Confeitto** (`#6A3F7D`) como destaque. Identidade visual aplicada em `public/assets/brand/` (logos, favicon, manifest), `components/marca.tsx`, `components/icones-interface.tsx` (ícones do menu) e fonte **Poppins**.
  Tokens em `app/globals.css`. Estoque e Ficha técnica mantêm o tema
  terracota com títulos serifados (`.ficha-theme`), a pedido do usuário.
- Acessibilidade: tema claro/escuro/automático e 4 tamanhos de texto
  (`components/preferencias-acessibilidade.tsx`), link "Pular para o conteúdo",
  foco visível, rótulos em todos os campos. Layout em `rem` para escalar com a
  fonte — evite larguras fixas em `px`.
- Cardápio do site: nome do produto em destaque e sabor como subtítulo;
  período do cardápio definido no app; sem produtos ou com período vencido,
  o site mostra a página "Cardápio da semana em preparo"/"Esse cardápio já
  encerrou".

## Funcionalidades recentes (out/2026)

Lista de compras no Estoque (compartilhada, sugestões pelo mínimo, WhatsApp);
relatório do cliente; excluir convite; caixa da empresa no Financeiro; puxar
produtos para o cardápio escolhendo um a um; cadastro de item novo direto na
ficha técnica.

## Dados: gravação com versão (dois computadores)

- Cada documento do `app_state` tem `version`. O painel (`lib/use-painel.ts`)
  manda a versão que leu em `PUT /api/data/[key]`; se mudou, a rota responde 409
  com o valor atual e o painel mescla (`lib/merge.ts`: itens por `id`/`productId`,
  campos um a um, o meu ganha no mesmo campo) e tenta de novo. Leituras em lote por
  `/api/data/bulk` (valores + versões); a cada 30 s e ao voltar para a janela o painel
  busca as versões novas. Gravação sem `version` (só a tela `/configurar`) é cega, mas
  também sobe a versão (`writeDoc` passa por `updateAtomic`).
- Backup diário: feito pela casca de Windows (`%APPDATA%\Confeitto\backups` + `OneDrive\Confeitto\backups`, `pastaBackupExtra` no config.json troca a pasta); qualquer admin baixa pelo menu da conta ("Baixar backup dos dados" → `/api/backup`, só da própria confeitaria). Repor: `scripts/restaurar-backup.mjs` (usa o `.env.local`).
- Conta: "Alterar minha senha" no menu da conta (`/api/auth/change-password`); esqueceu: `scripts/redefinir-senha.mjs`. `passwordChangedAt` derruba sessões antigas.
- Segurança e revogação de chaves: `docs/SEGURANCA.md`.

## Pendências conhecidas

- Usuário: revogar as chaves antigas (Azure/Google/WhatsApp), trocar `AUTH_SECRET` e a chave secreta do Supabase no Vercel (`docs/SEGURANCA.md`).
- Preencher WhatsApp/Instagram em Configurações para os botões aparecerem no site.
- Ativar o cartão (Mercado Pago) quando o usuário quiser.
