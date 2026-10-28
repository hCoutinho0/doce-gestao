# Confeitto

Gestão para confeitaria — pedidos, agenda, estoque, ficha técnica, financeiro,
relatórios, cardápio online e cartão fidelidade. Roda como **site** (Vercel),
com os dados num projeto do **Supabase** em São Paulo, e se usa por:

- **iPhone**: Safari → Compartilhar → Adicionar à Tela de Início;
- **Windows**: aplicativo `Confeitto-Setup.exe` (uma janela do site, com backup
  diário e lembretes);
- **navegador**, em qualquer computador.

O painel e o cardápio público (`www.confeitto.com.br/{confeitaria}`) são o
mesmo código. **Nenhuma chave do banco vai para o instalador nem para o
celular** — só o site as guarda. Como tudo funciona: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Publicar uma alteração

```powershell
git push origin main        # a Vercel publica o site em ~1 minuto
```

Quem está com o painel aberto vê **"Nova versão disponível"** e atualiza com um
toque — sem instalar nada. O aplicativo de Windows só precisa de publicação
própria quando a *janela* muda (`npm run publicar:casca`); o instalador novo só
quando o Electron muda.

## Preparar o Supabase (uma vez só)

1. No projeto do Supabase, **SQL Editor** → cole `supabase/setup.sql` → **Run**
   (cria a tabela `app_state` e o espaço de fotos `fotos`).
2. Anote a **URL** (*Project Settings → Data API*) e a **chave secreta**
   (*API Keys → secret key*).
3. No Vercel (*Settings → Environment Variables*) e no `.env.local` de quem
   desenvolve: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `AUTH_SECRET`
   (veja a tabela completa em `docs/ARQUITETURA.md`).

A chave secreta lê e altera tudo: nunca a coloque em código, instalador,
mensagem ou GitHub. Se vazar, crie uma nova em *API Keys*, apague a antiga e
atualize o Vercel e o `.env.local`. A chave pública (*publishable/anon*) não
funciona no Confeitto, de propósito.

## Instalador de Windows (raramente)

Pré-requisito: [Node.js LTS](https://nodejs.org/) no computador que gera o
instalador. Dois cliques em **`gerar-instalador.bat`** → a pasta `instalador`
abre com **`Confeitto-Setup.exe`** (sem chave, sem servidor, ~100 MB). O Windows
pode mostrar "O Windows protegeu o computador" (sem assinatura digital paga):
**Mais informações → Executar assim mesmo**. Quem instala entra com e-mail e senha.

## Cardápio online

`www.confeitto.com.br/{confeitaria}` abre direto o cardápio; o pedido cai no
Supabase e aparece no painel. O botão **Cardápio → Abrir cardápio do cliente /
Copiar link** usa `NEXT_PUBLIC_CARDAPIO_URL` (padrão `https://www.confeitto.com.br`).
`CARDAPIO_ONLY=1` no Vercel deixa **só** o cardápio no ar (sem painel).

## Onde ficam os dados

| O quê | Onde |
| --- | --- |
| Dados (pedidos, estoque, financeiro, contas…) | Supabase, tabela `app_state` |
| Fotos do cardápio e logotipos | Supabase Storage, bucket `fotos` |
| Backup (1 por dia, últimos 14) | `%APPDATA%\Confeitto\backups` + `OneDrive\Confeitto\backups` (feito pelo app de Windows) |
| Atualizações da janela do Windows | Supabase Storage, bucket público `atualizacoes` (sem segredo) |

Backup manual: menu da conta → **Baixar backup**, ou Arquivo → *Fazer backup
agora* no app de Windows. Restaurar: `node scripts/restaurar-backup.mjs "arquivo.json"`.

## Segurança

- `.env.local` e o instalador não vão para o GitHub; o instalador **não tem
  segredo nenhum**.
- A tabela `app_state` tem RLS ligado e nenhuma política: só a chave secreta
  (no servidor) lê e grava. Pelo site público só saem o cardápio e os dados
  básicos da confeitaria (nome, logo, cidade, redes sociais).
- Pedidos feitos pelo site entram como "Novo / Pendente", com o preço calculado
  no servidor. Cadastro de confeitarias novas fechado (`ALLOW_SIGNUP`).
- Detalhes, chaves a revogar e o que fazer se algo vazar: [`docs/SEGURANCA.md`](docs/SEGURANCA.md).

## Acessibilidade

O botão **Aa** (topo do painel, cardápio, login e cadastro) abre tema (claro,
escuro, automático) e tamanho do texto (A− a A++). Há link "Pular para o
conteúdo", foco visível, campos com rótulo para leitores de tela e animações
desligadas quando o sistema pede menos movimento.

## Pagamento com cartão (Mercado Pago) — a fazer

A integração com o Checkout Pro está no código, mas a opção "Cartão" do
cardápio aparece como "Em breve". Para ligar: crie as credenciais de produção
no Mercado Pago; no Vercel adicione `MERCADOPAGO_ACCESS_TOKEN` e
`MERCADOPAGO_WEBHOOK_SECRET` (webhook para
`https://www.confeitto.com.br/api/checkout/webhook`). O preço é lido do pedido
salvo no banco, nunca do navegador.

## Desenvolvimento

```powershell
npm install
copy .env.example .env.local   # SUPABASE_URL, SUPABASE_SERVICE_KEY, AUTH_SECRET, ALLOW_SIGNUP=1
npm run dev                    # ou iniciar.bat — usa o banco do .env.local!
npm test; npx tsc --noEmit     # o CI (.github/workflows/ci.yml) também roda o build
npm run desktop:abrir          # janela do Windows apontando para o site
npm run publicar:casca         # publica uma versão nova da janela do Windows
```
