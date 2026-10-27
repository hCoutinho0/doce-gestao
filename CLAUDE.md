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
- **App de desktop (Windows):** Electron 39 (`electron/`). O Next roda em modo
  standalone em `127.0.0.1:41730`. `electron/bootstrap.cjs` escolhe a versão
  mais nova (instalada ou baixada em `%APPDATA%\Confeitto\atualizacoes`).
  Ponte com a página em `electron/app/main-preload.cjs` (versão + procurar
  atualizações). Barra de menu do Windows escondida; tudo fica no **menu da
  conta** (canto inferior esquerdo, `components/menu-conta.tsx`).
- **Site do cardápio:** mesmo código no **Vercel** com `CARDAPIO_ONLY=1`
  (`proxy.ts`): só `www.confeitto.com.br/{slug}` (Lavily = `lavilyconfeitaria`)
  e as APIs públicas. Deploy automático a cada push na `main`
  (GitHub `hCoutinho0/doce-gestao`).

## Como publicar

- **Código:** commit + push na `main` → Vercel publica o site sozinho.
- **App instalado:** rodar `publicar-atualizacao.bat` na pasta do PC
  (`C:\Users\hcout\Documents\Codex\confeitaria-app`). Ele limpa arquivos
  antigos, roda `npm install` se as dependências mudaram, sobe a versão
  (patch) no `package.json`, faz o build e envia para o bucket privado
  `atualizacoes` do Supabase. Os apps baixam sozinhos (ao abrir e a cada hora)
  ou pelo menu da conta → **Procurar atualizações**.
- Depois de publicar, **acerte a versão do `package.json` no repositório** para a
  mesma do PC (o .bat incrementa só lá). Versão atual: **1.3.6**.
- Instalador (`gerar-instalador.bat`) só é preciso quando muda a versão do
  Electron. **Nunca publique o .exe**: ele leva a chave do Supabase embutida.
- Verificação de tipos: `node node_modules/typescript/bin/tsc --noEmit -p .`

## Regras e decisões já tomadas

- Segurança: preço de pedido/checkout sempre calculado no servidor; pedido do
  site entra sempre como Novo/Pendente; API pública só expõe campos públicos
  do perfil; upload confere assinatura do arquivo; rate limits em login,
  cadastro, convites, upload, lookup de celular e checkout.
- Segredos só em `.env.local` (gitignored) e nas variáveis do Vercel. Nunca
  imprimir chaves. `.env.local` ainda tem chaves antigas de Azure/Google/
  WhatsApp/VAPID que o usuário deve apagar e revogar.
- **Mercado Pago (cartão no site):** integração pronta (Checkout Pro +
  webhook com assinatura), mas desligada no cardápio ("Cartão — Em breve").
  Não remover. Precisa de `MERCADOPAGO_ACCESS_TOKEN` e
  `MERCADOPAGO_WEBHOOK_SECRET` no Vercel.
- Cliente é identificado pelo **celular** (`lib/phone.ts`): o mesmo número
  nunca vira dois cadastros; todo pedido cria/encontra o cartão fidelidade;
  selos entram quando o pedido é concluído.
- Visual **inspirado na Apple** (fonte SF/Inter, vidro fosco, controles
  segmentados, menus estilo macOS), com o **roxo da Lavily** como destaque.
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

## Pendências conhecidas

- Usuário apagar as chaves antigas do `.env.local` e revogá-las (Azure/Google).
- Trocar o `AUTH_SECRET` do Vercel (o valor de exemplo apareceu numa conversa).
- Preencher WhatsApp/Instagram em Configurações para os botões aparecerem no
  site.
- Ativar o cartão (Mercado Pago) quando o usuário quiser.
