'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { LogoConfeitto } from '@/components/marca';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import {
  CheckCircle2,
  KeyRound,
  LoaderCircle,
  LogIn,
  Mail,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUserSession } from '@/lib/auth';
import { PreferenciasAcessibilidade } from '@/components/preferencias-acessibilidade';

type FormSubmit = {
  preventDefault: () => void;
};

export default function LoginPage() {
  const { session, isLoading } = useUserSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submittingCredentials, setSubmittingCredentials] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isLoading) return;
    if (session) {
      window.location.replace(session.needsOnboarding ? '/cadastro' : '/dashboard');
    }
  }, [isLoading, session]);

  const submitCredentials = async (event: FormSubmit) => {
    event.preventDefault();
    setError('');
    setSubmittingCredentials(true);
    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });
    setSubmittingCredentials(false);
    if (result?.error) {
      setError('Email ou senha incorretos.');
      return;
    }
    window.location.replace('/dashboard');
  };

  return (
    <main id="conteudo" tabIndex={-1} className="grid min-h-screen bg-background lg:grid-cols-[minmax(380px,0.9fr)_minmax(520px,1.1fr)]">
      <section className="relative hidden overflow-hidden bg-[#6A3F7D] p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -left-24 top-1/4 size-80 rounded-full bg-[#C9B0E3]/30 blur-3xl" />
        <div className="absolute -right-20 bottom-12 size-72 rounded-full bg-[#F2B8C6]/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div>
          <Image
            src="/assets/brand/logo-horizontal-branco.svg"
            alt="Confeitto"
            width={176}
            height={51}
            unoptimized
            className="h-12 w-auto"
          />
            <p className="mt-1 text-xs text-white/75">Gestão para confeitaria</p>
          </div>
        </div>
        <div className="relative my-auto max-w-lg">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-[#e6cdf2]">
            Sua confeitaria sob controle
          </p>
          <h1 className="font-heading text-4xl font-bold leading-tight xl:text-5xl">
            Decisões mais simples. Resultados mais doces.
          </h1>
          <p className="mt-5 max-w-md leading-relaxed text-white/70">
            Pedidos, estoque, preços e financeiro em um só lugar, direto no
            seu computador.
          </p>
          <div className="mt-9 space-y-4 text-sm text-white/85">
            {[
              'Funciona no seu computador, com seus dados guardados nele',
              'Cada confeitaria com seus próprios dados, isolados',
              'Cardápio público independente para seus clientes',
            ].map((item) => (
              <p key={item} className="flex items-center gap-3">
                <CheckCircle2 className="size-5 text-[#ddc0ef]" /> {item}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="relative flex items-center justify-center px-5 py-10 sm:px-10">
        <PreferenciasAcessibilidade className="absolute right-5 top-5" />
        <div className="w-full max-w-md">
          <div className="mb-7 flex items-center justify-center gap-3 lg:hidden">
            <div className="text-left">
              <LogoConfeitto className="h-10 w-auto" />
              <p className="text-xs text-muted-foreground">
                Gestão para confeitaria
              </p>
            </div>
          </div>

          <p className="text-center text-sm font-semibold text-primary">
            Área interna
          </p>
          <h2 className="mt-2 text-center font-heading text-3xl font-bold tracking-tight">
            Bem-vinda de volta
          </h2>

          <div className="mt-7" />

          <form onSubmit={submitCredentials} className="space-y-3">
            <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
              Email
              <span className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 w-full rounded-xl border bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  placeholder="voce@suaconfeitaria.com"
                />
              </span>
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
              Senha
              <span className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 w-full rounded-xl border bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  placeholder="••••••••"
                />
              </span>
            </label>
            {error && (
              <p role="alert" className="text-xs font-medium text-destructive">{error}</p>
            )}
            <Button
              type="submit"
              disabled={submittingCredentials}
              className="h-11 w-full rounded-xl"
            >
              {submittingCredentials ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <LogIn />
              )}
              Entrar
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Ainda não tem conta?{' '}
            <Link href="/cadastro" className="font-semibold text-primary">
              Criar conta
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
