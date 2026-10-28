# Como o Confeitto funciona hoje

```
 App de Windows (programa completo)  ──┐
   servidor interno 127.0.0.1          │
   + chave do banco no PC              ├──►  Supabase (São Paulo): dados + fotos
                                       │
 Site no Vercel (gru1, São Paulo)    ──┘
   cardápio público + painel (iPhone/navegador)
   + chave do banco só no Vercel
```

Os dois lados leem e gravam **o mesmo banco**: o que se faz no app de Windows
aparece no site/iPhone e vice-versa.

## Peças

| Peça | O que é | Como atualiza |
| --- | --- | --- |
| **App de Windows** | Electron com o servidor Next.js dentro (`electron/`). Leva a conexão com o Supabase embutida (URL + chave), então abre direto no login. Faz backup diário, lembrete de tarefas e se atualiza sozinho. | `publicar-atualizacao.bat` (ou `npm run publicar`): sobe a versão, faz o build e envia ao bucket privado `atualizacoes`. Os apps baixam ao abrir e a cada hora e perguntam se querem reiniciar. Instalador novo só se o Electron mudar. |
| **Site (Vercel)** | O mesmo código: cardápio público (`/{confeitaria}`) e, se `CARDAPIO_ONLY` não estiver definido, o painel (`/dashboard`) — é o que o iPhone usa (Safari → Adicionar à Tela de Início). | `git push` na `main`: a Vercel publica sozinha. O painel avisa "Nova versão disponível". |

## Quem entra na confeitaria

- A Lavily já existe no banco. Pessoas novas entram por **código de convite**
  (Equipe → gerar convite → a pessoa usa em `/cadastro` → "Entrar numa
  confeitaria"): a conta nova já nasce ligada à Lavily.
- Criar uma confeitaria **nova** fica fechado por padrão (`ALLOW_SIGNUP` não
  definido). Para abrir: `ALLOW_SIGNUP=1`.
- Cada confeitaria enxerga só os próprios dados (`{confeitaria}:{chave}`).

## Chaves e onde ficam

| Chave | Onde fica |
| --- | --- |
| `SUPABASE_SERVICE_KEY` | `.env.local` (quem desenvolve), **embutida no instalador/app de Windows** e no Vercel |
| `AUTH_SECRET` | Vercel (o app de Windows gera o próprio, em `%APPDATA%\Confeitto\config.json`) |

Como o instalador leva a chave do banco: **entregue-o só a quem usa o app, por
canal privado, e nunca o publique**. Se um instalador vazar (ou um PC for
perdido), crie uma chave nova no Supabase, apague a antiga, atualize o Vercel e
o `.env.local` e gere/publique de novo. (Para vender o sistema no futuro, esse
modelo não serve: cada cliente teria a chave do banco. Aí o caminho é o site.)

## Variáveis do Vercel

| Nome | Para quê |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Banco |
| `AUTH_SECRET` | Assina as sessões do site (texto aleatório longo) |
| `ALLOW_SIGNUP` | `1` abre o cadastro de confeitarias novas (padrão: fechado) |
| `CARDAPIO_ONLY` | `1` deixa **só o cardápio** no ar (painel e login dão 404) |
| `MERCADOPAGO_*` | Cartão (ainda desligado) |
| `CARDAPIO_PADRAO` | Opcional: confeitaria para a raiz do domínio |

`vercel.json` fixa a região `gru1` (São Paulo), ao lado do Supabase.

## Limites a lembrar

- **Vercel Hobby** é gratuito só para uso **não comercial**.
- **Supabase gratuito** pausa depois de ~7 dias sem uso.

## Para quem desenvolve

```powershell
npm install
copy .env.example .env.local   # SUPABASE_URL, SUPABASE_SERVICE_KEY, AUTH_SECRET, ALLOW_SIGNUP=1
npm run dev                    # http://localhost:3000  (cuidado: usa o banco do .env.local)
npm test; npx tsc --noEmit     # o CI também roda o build
npm run desktop:abrir          # build + abre o app de Windows sem criar instalador
```

Scripts de manutenção (usam a chave do `.env.local`): `scripts/redefinir-senha.mjs`,
`scripts/restaurar-backup.mjs`, `scripts/renomear-confeitaria.mjs`.
