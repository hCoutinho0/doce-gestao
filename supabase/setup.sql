-- Confeitto: cria a tabela de dados e o espaço das fotos no Supabase.
-- Cole tudo no SQL Editor do projeto e clique em "Run". Pode rodar mais de
-- uma vez sem problema.

create table if not exists public.app_state (
  id          text primary key,
  value       jsonb not null,
  version     bigint not null default 1,
  expires_at  timestamptz,
  updated_at  timestamptz not null default now()
);

create index if not exists app_state_expires_at_idx
  on public.app_state (expires_at)
  where expires_at is not null;

-- RLS ligado e nenhuma política: só a chave secreta (usada pelo aplicativo)
-- consegue ler ou gravar. A chave pública (anon) não enxerga nada.
alter table public.app_state enable row level security;

-- Bucket público para as fotos do cardápio e logotipos (até 4 MB cada).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 4194304, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
