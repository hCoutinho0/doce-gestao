'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { signOut } from '@/lib/auth';

const MENSAGENS: Record<string, string> = {
  wrong_password: 'A senha atual não confere.',
  weak_password: 'A senha nova precisa ter pelo menos 8 caracteres.',
  rate_limited: 'Muitas tentativas. Espere alguns minutos e tente de novo.',
};

// Troca de senha de quem está logado. Ao terminar, sai da conta (as outras
// telas abertas também caem) e a pessoa entra de novo com a senha nova.
export function AlterarSenha({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const trocar = async (evento: { preventDefault: () => void }) => {
    evento.preventDefault();
    setErro('');
    if (nova !== confirmacao) {
      setErro('A confirmação não é igual à senha nova.');
      return;
    }
    setSalvando(true);
    try {
      const resposta = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current: atual, next: nova }),
      });
      if (resposta.ok) {
        await signOut();
        return;
      }
      const { error } = (await resposta.json().catch(() => ({}))) as { error?: string };
      setErro(MENSAGENS[error ?? ''] ?? 'Não foi possível trocar a senha agora.');
    } catch {
      setErro('Não foi possível trocar a senha agora. Verifique a conexão.');
    } finally {
      setSalvando(false);
    }
  };

  const campo =
    'h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15';

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alterar minha senha</DialogTitle>
          <DialogDescription>
            Depois de trocar, você entra de novo com a senha nova.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={trocar} className="grid gap-3">
          <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
            Senha atual
            <input
              type="password"
              required
              autoComplete="current-password"
              value={atual}
              onChange={(e) => setAtual(e.target.value)}
              className={campo}
            />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
            Senha nova (mínimo 8 caracteres)
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              className={campo}
            />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
            Repita a senha nova
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              className={campo}
            />
          </label>
          {erro && (
            <p role="alert" className="text-xs text-destructive">
              {erro}
            </p>
          )}
          <Button type="submit" disabled={salvando} className="justify-self-end rounded-xl">
            {salvando ? 'Trocando…' : 'Trocar senha'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
