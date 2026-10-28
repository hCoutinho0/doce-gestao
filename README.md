# Confeitto

Gestão para confeitaria — pedidos, estoque, ficha técnica, financeiro,
cardápio e cartão fidelidade — instalado no Windows, com os dados
compartilhados num projeto gratuito do **Supabase** (vários computadores
veem as mesmas informações). O mesmo código roda também como **site** no Vercel
(cardápio para os clientes e painel para o iPhone). Visão geral: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Preparar o Supabase (uma vez só)

1. No projeto do Supabase, abra **SQL Editor**, cole o conteúdo de
   `supabase/setup.sql` e clique em **Run**. Isso cria a tabela `app_state`
   e o espaço de fotos `fotos`.
2. Anote a **URL** (*Project Settings → Data API → Project URL*) e a
   **chave secreta** (*Project Settings → API Keys → secret key*, ou a
   *service_role* nas chaves antigas).
3. Coloque no `.env.local` do projeto:
   ```
   SUPABASE_URL=https://xxxxxxxx.supabase.co
   SUPABASE_SERVICE_KEY=sb_secret_...
   ```
   O `gerar-instalador.bat` embute essa conexão no instalador
   (`electron/conexao.json`), então quem instala já abre direto no login.
   Sem essas linhas, o app pede a URL e a chave na primeira abertura. Para
   trocar depois, gere e instale um instalador novo.

Não publique o instalador nem compartilhe a chave secreta: com ela dá para
ler e alterar tudo. Se o instalador vazar, crie uma secret key nova no
Supabase, apague a antiga, atualize o `.env.local` e gere o instalador de
novo. A chave
pública (*publishable/anon*) não funciona no Confeitto, de propósito.

O plano gratuito pausa o projeto depois de 7 dias sem uso. Se acontecer, o
Confeitto avisa que não conseguiu conectar: entre em supabase.com e clique
em **Restore** no projeto.

## Instalar (uma vez só)

Pré-requisito: [Node.js LTS](https://nodejs.org/) no computador que gera o
instalador (quem só instala o Confeitto não precisa).

1. Dê dois cliques em **`gerar-instalador.bat`**.
2. A pasta **`instalador`** abre com um único arquivo,
   **`Confeitto-Setup.exe`**. Instale com ele (e mande para quem mais for
   usar, por um canal privado — ele leva a chave do Supabase).

O Windows pode mostrar "O Windows protegeu o computador" (o instalador não
tem assinatura digital paga): **Mais informações → Executar assim mesmo**.

## Publicar alterações (sem reinstalar)

Depois de mudar o app, dê dois cliques em **`publicar-atualizacao.bat`**.
Ele aumenta a versão (ex.: 1.3.0 → 1.3.1), gera o app e envia a versão nova
para o Supabase (bucket privado `atualizacoes`).

Os Confeittos instalados conferem ao abrir e a cada hora: baixam a versão
nova sozinhos e perguntam se querem reiniciar. Se escolher "Depois", ela
entra na próxima abertura. Para conferir na hora: menu da conta (canto inferior
esquerdo, no seu nome) → **Procurar atualizações**.

Se uma versão nova não abrir, o app volta sozinho para a anterior.

Só é preciso gerar e instalar o `Confeitto-Setup.exe` de novo quando a
versão do Electron mudar — nesse caso o próprio app avisa.

## Site: cardápio e iPhone (www.confeitto.com.br)

O mesmo código roda no Vercel (região São Paulo). O endereço
`www.confeitto.com.br/{sua-confeitaria}` abre direto o cardápio para o cliente
montar o pedido, que cai no Supabase e aparece no aplicativo. Sem
`CARDAPIO_ONLY`, o site também serve o painel (`/login` → `/dashboard`): é o
que o **iPhone** usa (Safari → Compartilhar → Adicionar à Tela de Início). Com
`CARDAPIO_ONLY=1` só o cardápio fica no ar (login e painel dão 404).

O site se atualiza a cada `git push` na `main`; quem está com o painel aberto
vê "Nova versão disponível". Criar confeitarias novas fica fechado
(`ALLOW_SIGNUP`); funcionárias entram por **código de convite** (Equipe).

Variáveis de ambiente no projeto do Vercel (*Settings → Environment
Variables*):

| Nome | Valor |
| --- | --- |
| `SUPABASE_URL` | a mesma do `.env.local` |
| `SUPABASE_SERVICE_KEY` | a mesma do `.env.local` (fica só no servidor) |
| `AUTH_SECRET` | um texto aleatório longo |
| `CARDAPIO_ONLY` | `1` só para esconder o painel; não definir = painel no ar |
| `ELECTRON_SKIP_BINARY_DOWNLOAD` | `1` (evita baixar o Electron no build) |
| `CARDAPIO_PADRAO` | opcional: a confeitaria para a raiz do domínio redirecionar |

O botão **Cardápio digital → Abrir cardápio do cliente / Copiar link** do
aplicativo usa `NEXT_PUBLIC_CARDAPIO_URL` (padrão
`https://www.confeitto.com.br`).

## Onde ficam os dados

| O quê | Onde |
| --- | --- |
| Dados (pedidos, estoque, financeiro, contas…) | Supabase, tabela `app_state` |
| Fotos do cardápio e logotipos | Supabase Storage, bucket `fotos` |
| Backups automáticos (1 por dia, últimos 14) | `%APPDATA%\Confeitto\backups` + cópia em `OneDrive\Confeitto\backups` |
| URL/chave do Supabase e log do servidor | `%APPDATA%\Confeitto` |

O backup é automático (um por dia, quando o administrador abre o painel) e só
traz os dados da própria confeitaria. Manual: menu da conta → **Baixar backup
dos dados**. Restaurar: `node scripts/restaurar-backup.mjs "arquivo.json"`
(usa o `.env.local`).

## Acessibilidade

O botão **Aa** (no topo do painel, do cardápio, do login e do cadastro)
abre as preferências de leitura:

- **Tema**: claro, escuro ou automático (segue o Windows/celular).
- **Tamanho do texto**: A−, A, A+ e A++ (aumenta texto e espaçamentos).

As escolhas ficam salvas no próprio computador/celular. Também há link
"Pular para o conteúdo" (aparece ao apertar Tab), foco visível em todos os
controles, campos com rótulo para leitores de tela e animações desligadas
quando o sistema pede menos movimento.

## Pagamento com cartão (Mercado Pago) — a fazer

A integração com o Checkout Pro já está no código, mas a opção "Cartão" do
cardápio ainda aparece como "Em breve". Para ligar:

1. Crie as credenciais de produção no Mercado Pago (Suas integrações).
2. No Vercel, adicione `MERCADOPAGO_ACCESS_TOKEN` e
   `MERCADOPAGO_WEBHOOK_SECRET` (a assinatura secreta do webhook, apontado
   para `https://www.confeitto.com.br/api/checkout/webhook`).
3. No cardápio, o pedido é gravado primeiro e depois o site chama
   `POST /api/checkout/preference` com `{ bakeryId, orderId }`. O preço é
   lido do pedido salvo no banco, nunca do navegador. Quando o Mercado Pago
   confirma, o webhook marca o pedido como **Pago**.

O token do Mercado Pago fica só no servidor do Vercel — nunca no
aplicativo instalado nem no código.

## Segurança

- `.env.local`, `electron/conexao.json` e o instalador **não** vão para o
  GitHub (estão no `.gitignore`).
- O instalador leva a chave do Supabase embutida: entregue só para quem
  usa o app (não publique o `.exe` na internet).
- A tabela `app_state` tem RLS ligado e nenhuma política — só a chave
  secreta (servidor) lê e grava. Pelo site público só saem o cardápio e os
  dados básicos da confeitaria (nome, logo, cidade, redes sociais).
- Pedidos feitos pelo site entram sempre como "Novo / Pendente", com o
  preço calculado pelo servidor a partir do cardápio.

## Testar alterações antes de publicar

`iniciar.bat` abre o app no navegador (`http://localhost:3000`) e recarrega
sozinho a cada arquivo salvo. Ele usa o Supabase do `.env.local` — se for o
mesmo projeto do app instalado, mexe nos dados reais. Quando estiver bom,
rode `publicar-atualizacao.bat`.

## Desenvolvimento

```powershell
npm install
copy .env.example .env.local   # defina AUTH_SECRET e o Supabase
npm run dev                    # ou iniciar.bat
```

Outros comandos:

- `npm run desktop:abrir` — gera o servidor e abre a janela do Electron sem
  criar instalador (bom para testar).
- `npm run desktop:instalador` — o mesmo que o `gerar-instalador.bat`.
- `npm run publicar` — o mesmo que o `publicar-atualizacao.bat`.
