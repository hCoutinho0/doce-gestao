# Confeitto — aplicativo de desktop (Windows)

Gestão para confeitaria — pedidos, estoque, ficha técnica, financeiro,
cardápio e cartão fidelidade — instalado no Windows, com os dados
compartilhados num projeto gratuito do **Supabase** (vários computadores
veem as mesmas informações).

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
   trocar à mão depois: menu **Arquivo → Conexão com o banco de dados…**
   (o menu aparece ao apertar `Alt`).

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
entra na próxima abertura. Para conferir na hora: `Alt` → **Arquivo →
Procurar atualizações**.

Se uma versão nova não abrir, o app volta sozinho para a anterior.

Só é preciso gerar e instalar o `Confeitto-Setup.exe` de novo quando a
versão do Electron mudar — nesse caso o próprio app avisa.

## Cardápio online (www.confeitto.com.br)

O mesmo código roda no Vercel em **modo só cardápio**: o endereço
`www.confeitto.com.br/{sua-confeitaria}` abre direto o cardápio para o
cliente montar o pedido, que cai no Supabase e aparece no aplicativo. No
site não existe login, cadastro nem painel (tudo isso dá 404) — toda a
gestão, inclusive editar o cardápio, é feita no aplicativo.

Variáveis de ambiente no projeto do Vercel (*Settings → Environment
Variables*):

| Nome | Valor |
| --- | --- |
| `CARDAPIO_ONLY` | `1` |
| `SUPABASE_URL` | a mesma do `.env.local` |
| `SUPABASE_SERVICE_KEY` | a mesma do `.env.local` (fica só no servidor do Vercel) |
| `AUTH_SECRET` | um texto aleatório longo |
| `ELECTRON_SKIP_BINARY_DOWNLOAD` | `1` (evita baixar o Electron no build) |
| `CARDAPIO_PADRAO` | opcional: o nome da confeitaria para a raiz do domínio redirecionar para ela |

O botão **Cardápio digital → Abrir cardápio do cliente / Copiar link** do
aplicativo usa `NEXT_PUBLIC_CARDAPIO_URL` (padrão
`https://www.confeitto.com.br`).

## Onde ficam os dados

| O quê | Onde |
| --- | --- |
| Dados (pedidos, estoque, financeiro, contas…) | Supabase, tabela `app_state` |
| Fotos do cardápio e logotipos | Supabase Storage, bucket `fotos` |
| Backups automáticos (1 por dia, últimos 14) | `%APPDATA%\Confeitto\backups` (um `.json` por dia) |
| URL/chave do Supabase e log do servidor | `%APPDATA%\Confeitto` |

O menu **Arquivo → Fazer backup agora** baixa uma cópia na hora.

## O que mudou em relação à versão na nuvem

- **Banco de dados**: o Azure Cosmos DB virou uma tabela no Supabase
  (`lib/db.ts`, pela API REST, sem biblioteca extra), com controle de
  versão por documento para dois computadores gravarem ao mesmo tempo sem
  um apagar a alteração do outro — a mesma API de antes (`readState`,
  `writeState`, `updateStateAtomic`…).
- **Fotos**: o Azure Blob Storage virou o Supabase Storage (bucket `fotos`).
- **Login**: só email e senha. Google e Microsoft Entra ID foram removidos
  (precisavam de endereço público e de conta no Azure).
- **Lembrete de tarefas**: em vez de Web Push + GitHub Actions, o próprio
  aplicativo mostra uma notificação do Windows uma vez por dia, a partir das
  8h, se houver tarefas pendentes.
- **Aplicativo**: o Next.js roda como servidor interno (modo standalone)
  dentro de uma janela Electron (`electron/main.cjs`), só em `127.0.0.1` —
  nada fica acessível pela rede.
- Removidos: `@azure/cosmos`, `@azure/storage-blob`, `web-push` e os
  workflows de deploy do GitHub Actions.

### Limitações de rodar localmente

- O **link público do cardápio** (`/{confeitaria}/cardapio`) só abre neste
  computador — clientes de fora não alcançam o `127.0.0.1`. Para receber
  pedidos online de novo seria preciso publicar o app em algum servidor.
- **Mercado Pago**: o checkout ainda funciona se configurado e houver
  internet, mas a confirmação automática de pagamento (webhook) precisa de
  um endereço público.
- **Vários computadores**: cada instalação tem seus próprios dados; não
  há sincronização entre máquinas.

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
