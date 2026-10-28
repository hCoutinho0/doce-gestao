# Migrar o Supabase para São Paulo

Hoje cada leitura/gravação leva 0,2–0,5 s porque o projeto do Supabase está
longe do Brasil. Num projeto na região de São Paulo (`sa-east-1`) fica em
torno de 0,05 s. O script `scripts/migrar-supabase.mjs` copia tudo (dados e
fotos) sem apagar nada do projeto antigo. Leva uns 15 minutos.

## Passo a passo

1. **Criar o projeto novo** (você) — em https://supabase.com/dashboard:
   *New project* → nome `confeitto-sp` → **Region: South America (São Paulo)**
   → defina uma senha do banco e guarde. Aguarde ficar pronto.
2. **Criar a tabela** (você) — no projeto novo: *SQL Editor* → cole todo o
   conteúdo de `supabase/setup.sql` → *Run*.
3. **Pegar a URL e a chave** (você) — no projeto novo: *Project Settings →
   Data API* (URL) e *API Keys → secret key* (`sb_secret_...`).
4. **Simular** — no PowerShell, na pasta do projeto (as chaves ficam só nessa
   janela do terminal, nunca em arquivo):

   ```powershell
   $env:NOVO_SUPABASE_URL = "https://SEU-PROJETO-NOVO.supabase.co"
   $env:NOVO_SUPABASE_KEY = "sb_secret_..."
   node scripts/migrar-supabase.mjs --simular
   ```

   Se mostrar "Simulação concluída", está tudo certo para copiar.
5. **Copiar de verdade** — feche o Confeitto nos dois computadores e rode:

   ```powershell
   node scripts/migrar-supabase.mjs
   ```

   Ele copia os documentos e as fotos, troca os endereços das fotos para o
   projeto novo e confere que tudo chegou.
6. **Apontar o app para o projeto novo** — abra o Confeitto →
   *Arquivo → Conexão com o banco de dados…* e cole a URL e a chave do projeto
   **novo** (nos dois computadores).
7. **Apontar o site do cardápio** — no Vercel: *Settings → Environment
   Variables*: troque `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` pelos do projeto
   novo e faça um novo deploy (*Deployments → Redeploy*).
8. **Publicar a atualização do app** — rode `publicar-atualizacao.bat` (o
   bucket de atualizações é criado de novo no projeto novo).
9. **Conferir**: pedidos, estoque, financeiro, fotos do cardápio e o site
   público. Guarde o projeto antigo por uns 7 dias.
10. **Apagar o projeto antigo** — no painel do Supabase antigo: *Project
    Settings → General → Delete project*. Isso também aposenta a chave antiga
    (que está no seu computador e no instalador).

## Se algo der errado

- O projeto antigo continua intacto: é só abrir *Conexão com o banco de dados…*
  e voltar para a URL/chave antigas.
- Para repor um backup (`%APPDATA%\Confeitto\backups` ou a cópia no OneDrive)
  em qualquer projeto: `node scripts/restaurar-backup.mjs "caminho\do\backup.json"`.
  As fotos não fazem parte do backup.
