# Doce Gestão

App de gestão para confeitaria: pedidos, estoque, ficha técnica, financeiro,
cardápio digital com pagamento online e cartão fidelidade.

## O que mudou nesta fase (correção de segurança)

Uma auditoria encontrou quatro falhas críticas no protótipo original, todas
já corrigidas no código:

1. **Login com senha fixa no bundle** — removido. O painel interno agora
   autentica de verdade contra o **Microsoft Entra ID** (`auth.ts`,
   `middleware.ts`).
2. **Sessão falsificável via `localStorage`** — removida. A sessão é um
   cookie assinado pelo NextAuth; o navegador não consegue mais fabricar um
   acesso de administradora editando o armazenamento local.
3. **Login "Google/Apple" simulado** — removido. Existe um único fluxo de
   login real, "Entrar com a Microsoft".
4. **Captura direta de número/CVV de cartão** — removida do cardápio
   público. O pagamento online (Pix, crédito e débito) agora é processado
   pelo **Mercado Pago Checkout Pro**: o cliente digita os dados do cartão
   na página hospedada do Mercado Pago, nunca no nosso servidor ou app.

Isso exige que o app rode em um servidor Node real (para as rotas de API e o
middleware de auth) — por isso a base de build trocou de `vinext` +
Cloudflare Workers (proprietária do scaffold original, não roda no Azure)
para **Next.js padrão**. As páginas e componentes já eram Next.js puro por
baixo, então nada de UI foi reescrito, só a ferramenta de build/execução.

## Rodar localmente

```powershell
npm install
copy .env.example .env.local
npm run dev
```

Abra `http://localhost:3000` para o login, ou
`http://localhost:3000/dashboard` para o painel administrativo (pede login).

### Login e cadastro multi-confeitaria

O Doce Gestão deixou de ser um sistema de uma confeitaria só. Qualquer
pessoa pode criar uma conta em `/cadastro` (Google, Microsoft, ou email e
senha) e ganha um painel isolado — pedidos, estoque, financeiro, cardápio,
clientes e fichas técnicas nunca se misturam entre confeitarias diferentes.
Só quem já tem uma conta consegue entrar em `/login`; quem tenta entrar sem
ter uma é mandado para `/cadastro` automaticamente.

No cadastro, além da conta, pedimos nome completo, CPF ou CNPJ (só
validação de formato/dígito verificador — sem consulta à Receita Federal)
e telefone de quem administra, mais os dados da própria confeitaria.

O cardápio público (`/cardapio`) e o bot do WhatsApp ainda são só da
Lavily por enquanto — cada confeitaria ter seu próprio link público fica
para uma etapa futura.

#### Microsoft Entra ID (login da Lavily)

1. No [Azure Portal](https://portal.azure.com), vá em **Microsoft Entra ID
   → App registrations → New registration**.
2. Redirect URI (Web): `http://localhost:3000/api/auth/callback/microsoft-entra-id`
   (e depois a URL de produção).
3. Em **App roles**, crie dois papéis com value `admin` e `production`.
4. Em **Enterprise applications → (seu app) → Users and groups**, atribua
   cada funcionária ao papel correto.
5. Copie Tenant ID, Client ID e (em **Certificates & secrets**) um Client
   Secret para `.env.local`.

Só quem tem um desses dois papéis atribuídos no Entra ID da Lavily entra
automaticamente no painel da Lavily — qualquer outra conta Microsoft sem
esse papel é tratada como uma confeitaria nova e vai para `/cadastro`.

#### Google (login de qualquer confeitaria)

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um
   projeto (ou use um existente) e configure a **Tela de consentimento
   OAuth** (tipo Externo já serve).
2. Em **APIs e serviços → Credenciais → Criar credenciais → ID do cliente
   OAuth**, tipo **Aplicativo da Web**.
3. Em **URIs de redirecionamento autorizados**, adicione
   `http://localhost:3000/api/auth/callback/google` (e depois
   `https://SEU-DOMINIO/api/auth/callback/google`).
4. Copie o Client ID e o Client Secret para `GOOGLE_CLIENT_ID` e
   `GOOGLE_CLIENT_SECRET` em `.env.local`.

Sem essas variáveis, os botões de login continuam na tela mas o `signIn`
falha — não há credencial de demonstração para nenhum provedor.

### Configurar o pagamento (Mercado Pago)

1. Crie uma conta em [mercadopago.com.br/developers](https://www.mercadopago.com.br/developers).
2. Em **Suas integrações → Credenciais**, copie o Access Token (produção ou
   teste) para `MERCADOPAGO_ACCESS_TOKEN`.
3. Configure a notificação de webhook para `https://SEU-DOMINIO/api/checkout/webhook`
   e copie a chave secreta para `MERCADOPAGO_WEBHOOK_SECRET`.

Sem essas variáveis, o cardápio público continua funcionando, mas o botão
"Ir para pagamento" retorna erro em vez de redirecionar.

## Estado atual

- **Em produção**: https://red-pebble-025f56f0f.3.azurestaticapps.net
  (Azure Static Web Apps, deploy automático a cada push em `main` via
  GitHub Actions — repositório em
  [github.com/hCoutinho0/doce-gestao](https://github.com/hCoutinho0/doce-gestao)).

- Painel interno (`/dashboard`, `/configurar`): protegido por sessão de
  verdade (Google, Microsoft ou email/senha). Pedidos, estoque, financeiro,
  cardápio e fidelidade agora ficam salvos no **Azure Cosmos DB**
  (`lib/cosmos.ts`, `app/api/data/[key]`), num container `app-state` com um
  documento por domínio por confeitaria — cada confeitaria só vê os
  próprios dados.
- Link público de cada confeitaria (`/{bakeryId}`) e seu cardápio
  (`/{bakeryId}/cardapio`): sem login. Lê o cardápio publicado e a marca
  daquela confeitaria no Cosmos DB (`GET /api/data/doce-menu?bakeryId=...`,
  `.../doce-bakery-profile?bakeryId=...`) e cria pedidos por um endpoint
  público específico (`POST /api/orders`) que só permite adicionar um
  pedido, nunca ler ou sobrescrever os pedidos de outra confeitaria. A
  rota antiga `/cardapio` (fixa na Lavily, de antes do app virar
  multi-confeitaria) continua existindo só como redirect de
  compatibilidade para `/lavily/cardapio`. Pagamento online (Mercado
  Pago) está desligado por enquanto — usava um único token global; volta
  quando cada confeitaria puder configurar o próprio.
- Sem as variáveis `AZURE_COSMOS_ENDPOINT`/`AZURE_COSMOS_KEY` configuradas,
  o app continua funcionando com dados de exemplo em memória (não persiste
  entre recarregamentos) em vez de travar — útil para rodar localmente sem
  Azure.

### Configurar o Cosmos DB

1. Crie uma conta **Azure Cosmos DB for NoSQL** no Azure Portal.
2. Copie o **URI** e a **Primary Key** (em "Keys") para `AZURE_COSMOS_ENDPOINT`
   e `AZURE_COSMOS_KEY` em `.env.local`.
3. O banco de dados (`doce-gestao`) e o container (`app-state`) são criados
   automaticamente na primeira chamada, se ainda não existirem.

### Configurar as fotos (Azure Blob Storage)

1. Crie uma **Storage Account** (StorageV2) no Azure Portal, com acesso
   público a blobs habilitado.
2. Copie a **Connection string** (em "Access keys") para
   `AZURE_STORAGE_CONNECTION_STRING`.
3. O container (`cardapio-media` por padrão, ajustável em
   `AZURE_STORAGE_CONTAINER`) é criado automaticamente no primeiro upload.

Sem essa variável, o upload de logotipo e fotos de produto retorna erro em
vez de travar o resto do app.

### Configurar o bot do WhatsApp (Meta WhatsApp Cloud API)

O webhook (`app/api/whatsapp/webhook`) já está pronto no código — hoje ele
responde ao cliente com o link do cardápio e consulta o status de um pedido
pelo número (ex.: cliente manda "2001"). Falta só a conta na Meta:

1. Crie um app em [developers.facebook.com](https://developers.facebook.com/apps)
   → tipo "Business" → adicione o produto **WhatsApp**.
2. Na aba WhatsApp → **API Setup**, copie o **Temporary access token** (ou
   gere um permanente depois, associando a um System User) para
   `WHATSAPP_ACCESS_TOKEN`, e o **Phone number ID** para
   `WHATSAPP_PHONE_NUMBER_ID`.
3. Em **App settings → Basic**, copie o **App Secret** para
   `WHATSAPP_APP_SECRET` (usado para validar que as mensagens vêm mesmo da
   Meta).
4. Escolha um valor qualquer para `WHATSAPP_VERIFY_TOKEN` (uma senha
   inventada por você).
5. Em WhatsApp → **Configuration**, configure o webhook:
   - Callback URL: `https://SEU-DOMINIO/api/whatsapp/webhook`
   - Verify token: o mesmo valor de `WHATSAPP_VERIFY_TOKEN`
   - Inscreva-se no campo `messages`.
6. Para atender clientes de verdade (não só números de teste), a Meta exige
   **verificação da empresa** (Business Verification) — processo à parte,
   que pode levar de horas a dias.

## Próxima etapa (Fase 3 — restante)

- **iOS/Android**: empacotar a mesma interface web (ex.: Capacitor) ou
  avaliar app nativo, a definir conforme o prazo de lançamento.

As variáveis esperadas estão documentadas em `.env.example`.
