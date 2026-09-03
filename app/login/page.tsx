'use client';

import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { CakeSlice, CheckCircle2, LoaderCircle, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUserSession } from '@/lib/auth';

export default function LoginPage() {
  const { session, isLoading } = useUserSession();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && session) window.location.replace('/painel');
  }, [isLoading, session]);

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(380px,0.9fr)_minmax(520px,1.1fr)]">
      <section className="relative hidden overflow-hidden bg-[#611b3a] p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -left-24 top-1/4 size-80 rounded-full bg-[#e8a0c0]/25 blur-3xl" />
        <div className="absolute -right-20 bottom-12 size-72 rounded-full bg-[#f2c6de]/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-white/15 backdrop-blur">
            <CakeSlice className="size-6" />
          </span>
          <div>
            <p className="font-heading text-xl font-bold">Doce Gestão</p>
            <p className="text-xs text-white/65">Gestão para confeitaria</p>
          </div>
        </div>
        <div className="relative my-auto max-w-lg">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-[#f7cbe0]">
            Sua confeitaria sob controle
          </p>
          <h1 className="font-heading text-4xl font-bold leading-tight xl:text-5xl">
            Decisões mais simples. Resultados mais doces.
          </h1>
          <p className="mt-5 max-w-md leading-relaxed text-white/70">
            Pedidos, estoque, preços e financeiro em um só lugar, com acesso
            controlado pela sua conta Microsoft.
          </p>
          <div className="mt-9 space-y-4 text-sm text-white/85">
            {[
              'Login corporativo real via Microsoft Entra ID',
              'Acessos separados para administração e produção',
              'Cardápio público independente para seus clientes',
            ].map((item) => (
              <p key={item} className="flex items-center gap-3">
                <CheckCircle2 className="size-5 text-[#f5bcd8]" /> {item}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md text-center">
          <div className="mb-7 flex items-center justify-center gap-3 lg:hidden">
            <span className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <CakeSlice className="size-5" />
            </span>
            <div className="text-left">
              <p className="font-heading text-lg font-bold">Doce Gestão</p>
              <p className="text-xs text-muted-foreground">
                Gestão para confeitaria
              </p>
            </div>
          </div>

          <p className="text-sm font-semibold text-primary">Área interna</p>
          <h2 className="mt-2 font-heading text-3xl font-bold tracking-tight">
            Bem-vinda de volta
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Entre com a conta Microsoft da sua confeitaria. O perfil
            (Administradora ou Produção) é definido pelo administrador do
            Entra ID, não por esta tela.
          </p>

          <Button
            type="button"
            disabled={submitting}
            className="mt-8 h-11 w-full rounded-xl"
            onClick={() => {
              setSubmitting(true);
              void signIn('microsoft-entra-id', { redirectTo: '/painel' });
            }}
          >
            {submitting ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <LogIn />
            )}
            Entrar com a Microsoft
          </Button>

          <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-foreground">
            Precisa de acesso? Peça para a administradora da confeitaria criar
            sua conta no Microsoft Entra ID.
          </p>
        </div>
      </section>
    </main>
  );
}
