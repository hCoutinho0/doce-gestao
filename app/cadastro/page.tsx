'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, type ComponentProps } from 'react';
import { signIn } from 'next-auth/react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CakeSlice,
  Check,
  Globe,
  IdCard,
  LoaderCircle,
  LogIn,
  Mail,
  MapPin,
  Palette,
  Phone,
  Settings2,
  Upload,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { StepHeading, SetupInput } from '@/components/onboarding-fields';
import { formatCpfCnpj, isValidCpfCnpj } from '@/lib/cpfCnpj';
import { useUserSession } from '@/lib/auth';
import type { BakeryProfile } from '@/lib/bakery';

type Method = 'google' | 'microsoft-entra-id' | 'credentials';

const icons = ['🧁', '🍰', '🎂', '🍪', '🍫', '🥐'];
const teamSizes = [
  '1 pessoa',
  '2 a 5 pessoas',
  '6 a 10 pessoas',
  'Mais de 10 pessoas',
];
const specialties = [
  'Bolos e doces variados',
  'Bolos personalizados',
  'Doces finos e eventos',
  'Confeitaria artesanal',
  'Padaria e confeitaria',
];
const salesModels = [
  'Encomendas e pronta entrega',
  'Somente encomendas',
  'Somente pronta entrega',
  'Loja física e delivery',
];

const initialBakery: BakeryProfile = {
  name: '',
  legalName: '',
  founded: '',
  teamSize: '1 pessoa',
  phone: '',
  city: '',
  specialty: 'Bolos e doces variados',
  salesModel: 'Encomendas e pronta entrega',
  icon: '🧁',
  logo: '',
};

export default function CadastroPage() {
  const { session, isLoading: sessionLoading, refresh } = useUserSession();
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<Method | null>(null);
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState('');
  const [fullName, setFullName] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [phone, setPhone] = useState('');
  const [bakery, setBakery] = useState(initialBakery);
  const [logoError, setLogoError] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // An OAuth account (Google/Microsoft) that just came back here already
  // has a session — needsOnboarding true means it has no confeitaria yet.
  // Skip straight to the personal-info step with its name prefilled.
  useEffect(() => {
    if (sessionLoading) return;
    if (session && !session.needsOnboarding) {
      window.location.replace('/painel');
      return;
    }
    if (session?.needsOnboarding && step === 0) {
      setMethod(
        session.provider === 'google' ? 'google' : 'microsoft-entra-id',
      );
      setFullName(session.name || '');
      setStep(1);
    }
  }, [session, sessionLoading, step]);

  const setBakeryField = (field: keyof BakeryProfile, value: string) => {
    setBakery((current) => ({ ...current, [field]: value }));
  };

  const readLogo: NonNullable<ComponentProps<'input'>['onChange']> = (
    event,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setLogoError('Escolha uma imagem de até 4 MB.');
      return;
    }
    setLogoError('');
    setUploadingLogo(true);
    const body = new FormData();
    body.append('file', file);
    fetch('/api/upload', { method: 'POST', body })
      .then((response) => {
        if (!response.ok) throw new Error('upload_failed');
        return response.json() as Promise<{ url: string }>;
      })
      .then(({ url }) => setBakeryField('logo', url))
      .catch(() =>
        setLogoError('Não foi possível enviar a imagem. Tente novamente.'),
      )
      .finally(() => setUploadingLogo(false));
  };

  const credentialsReady =
    /.+@.+\..+/.test(signupEmail) &&
    signupPassword.length >= 8 &&
    signupPassword === signupPasswordConfirm;

  const personalReady =
    fullName.trim().length > 2 && isValidCpfCnpj(cpfCnpj) && phone.trim();

  const canContinue =
    step === 2
      ? Boolean(bakery.name.trim() && bakery.founded && bakery.city.trim())
      : step === 3
        ? Boolean(bakery.icon || bakery.logo)
        : step === 4
          ? Boolean(bakery.specialty && bakery.salesModel)
          : true;

  const finish = async () => {
    setSubmitting(true);
    setSubmitError('');
    try {
      const response = await fetch('/api/auth/complete-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: method,
          email: method === 'credentials' ? signupEmail.trim() : session?.email,
          password: method === 'credentials' ? signupPassword : undefined,
          name: fullName.trim(),
          cpfCnpj,
          phone: phone.trim(),
          bakery,
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setSubmitError(
          data.error === 'email_already_registered'
            ? 'Esse email já tem uma conta cadastrada — faça login em vez de criar outra.'
            : 'Não foi possível concluir o cadastro. Confira os dados e tente de novo.',
        );
        setSubmitting(false);
        return;
      }
      if (method === 'credentials') {
        await signIn('credentials', {
          email: signupEmail.trim(),
          password: signupPassword,
          redirect: false,
        });
      } else {
        await refresh();
      }
      window.location.replace('/painel');
    } catch {
      setSubmitError('Não foi possível concluir o cadastro. Tente de novo.');
      setSubmitting(false);
    }
  };

  if (sessionLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Carregando…
      </main>
    );
  }

  const steps = [
    { number: 1, label: 'Sua conta', icon: UserRound },
    { number: 2, label: 'Confeitaria', icon: Building2 },
    { number: 3, label: 'Identidade', icon: Palette },
    { number: 4, label: 'Operação', icon: Settings2 },
  ];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-5">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <CakeSlice className="size-5" />
          </span>
          <div>
            <p className="font-heading font-bold">Doce Gestão</p>
            <p className="text-[11px] text-muted-foreground">
              Cadastro da confeitaria
            </p>
          </div>
          {step > 0 && (
            <span className="ml-auto rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
              Etapa {step} de 4
            </span>
          )}
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:py-12">
        <aside>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
            Bem-vindo(a)
          </p>
          <h1 className="mt-3 font-heading text-3xl font-bold leading-tight">
            Vamos criar o painel da sua confeitaria.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Leva menos de 5 minutos. Você poderá alterar tudo depois.
          </p>
          {step > 0 && (
            <ol className="mt-8 flex gap-2 lg:flex-col">
              {steps.map(({ number, label, icon: Icon }) => (
                <li
                  key={number}
                  className={`flex flex-1 items-center gap-3 rounded-xl border p-3 transition ${step === number ? 'border-primary bg-primary/5 text-primary' : number < step ? 'border-transparent text-foreground' : 'border-transparent text-muted-foreground'}`}
                >
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-lg ${number < step ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}
                  >
                    {number < step ? <Check /> : <Icon className="size-4" />}
                  </span>
                  <span className="hidden text-sm font-semibold sm:inline">
                    {label}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </aside>

        <div className="rounded-3xl border bg-card p-5 shadow-sm sm:p-8">
          {step === 0 && (
            <section>
              <StepHeading
                title="Como você quer entrar?"
                description="Escolha Google, Microsoft, ou crie um email e senha só para o Doce Gestão."
              />
              <div className="mt-7 space-y-3">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full rounded-xl"
                  onClick={() => void signIn('google', { redirectTo: '/cadastro' })}
                >
                  <Globe /> Continuar com o Google
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full rounded-xl"
                  onClick={() =>
                    void signIn('microsoft-entra-id', { redirectTo: '/cadastro' })
                  }
                >
                  <LogIn /> Continuar com a Microsoft
                </Button>
                <div className="flex items-center gap-3 pt-2 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  ou crie um email e senha
                  <span className="h-px flex-1 bg-border" />
                </div>
                <SetupInput
                  id="signup-email"
                  label="Email"
                  type="email"
                  icon={<Mail />}
                  value={signupEmail}
                  onChange={setSignupEmail}
                  placeholder="voce@suaconfeitaria.com"
                  required
                />
                <SetupInput
                  id="signup-password"
                  label="Senha (mínimo 8 caracteres)"
                  type="password"
                  value={signupPassword}
                  onChange={setSignupPassword}
                  required
                />
                <SetupInput
                  id="signup-password-confirm"
                  label="Confirmar senha"
                  type="password"
                  value={signupPasswordConfirm}
                  onChange={setSignupPasswordConfirm}
                  required
                />
                <Button
                  type="button"
                  disabled={!credentialsReady}
                  className="h-11 w-full rounded-xl"
                  onClick={() => {
                    setMethod('credentials');
                    setStep(1);
                  }}
                >
                  Continuar <ArrowRight />
                </Button>
              </div>
              <p className="mt-6 text-center text-sm text-muted-foreground">
                Já tem conta?{' '}
                <Link href="/login" className="font-semibold text-primary">
                  Entrar
                </Link>
              </p>
            </section>
          )}

          {step === 1 && (
            <section>
              <StepHeading
                title="Seus dados"
                description="Usados para identificar quem administra essa confeitaria no sistema."
              />
              <div className="mt-7 grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <SetupInput
                    id="full-name"
                    label="Nome completo"
                    icon={<UserRound />}
                    value={fullName}
                    onChange={setFullName}
                    placeholder="Seu nome e sobrenome"
                    required
                  />
                </div>
                <SetupInput
                  id="cpf-cnpj"
                  label="CPF ou CNPJ"
                  icon={<IdCard />}
                  value={cpfCnpj}
                  onChange={(value) => setCpfCnpj(formatCpfCnpj(value))}
                  placeholder="000.000.000-00"
                  required
                />
                <SetupInput
                  id="owner-phone"
                  label="Telefone"
                  icon={<Phone />}
                  value={phone}
                  onChange={setPhone}
                  placeholder="(11) 99999-9999"
                  required
                />
                {cpfCnpj && !isValidCpfCnpj(cpfCnpj) && (
                  <p className="text-xs font-medium text-destructive sm:col-span-2">
                    Esse CPF/CNPJ não parece válido — confira os números.
                  </p>
                )}
              </div>
            </section>
          )}

          {step === 2 && (
            <section>
              <StepHeading
                title="Dados da confeitaria"
                description="As informações principais do negócio que você irá administrar."
              />
              <div className="mt-7 grid gap-5 sm:grid-cols-2">
                <SetupInput
                  id="bakery-name"
                  label="Nome da confeitaria"
                  value={bakery.name}
                  onChange={(value) => setBakeryField('name', value)}
                  placeholder="Ex.: Ateliê da Gabi"
                  required
                />
                <SetupInput
                  id="legal-name"
                  label="Razão social (opcional)"
                  value={bakery.legalName}
                  onChange={(value) => setBakeryField('legalName', value)}
                  placeholder="Nome cadastrado da empresa"
                />
                <SetupInput
                  id="founded"
                  label="Data de fundação"
                  type="date"
                  value={bakery.founded}
                  onChange={(value) => setBakeryField('founded', value)}
                  required
                />
                <div className="space-y-2">
                  <Label htmlFor="team-size">Tamanho da equipe</Label>
                  <NativeSelect
                    id="team-size"
                    value={bakery.teamSize}
                    onChange={(event) =>
                      setBakeryField('teamSize', event.target.value)
                    }
                    className="w-full [&_select]:h-11 [&_select]:rounded-xl"
                  >
                    {teamSizes.map((option) => (
                      <NativeSelectOption key={option} value={option}>
                        {option}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <SetupInput
                  id="bakery-phone"
                  label="WhatsApp comercial"
                  value={bakery.phone}
                  onChange={(value) => setBakeryField('phone', value)}
                  placeholder="(11) 99999-9999"
                  required
                />
                <SetupInput
                  id="city"
                  label="Cidade e estado"
                  icon={<MapPin />}
                  value={bakery.city}
                  onChange={(value) => setBakeryField('city', value)}
                  placeholder="São Paulo, SP"
                  required
                />
              </div>
            </section>
          )}

          {step === 3 && (
            <section>
              <StepHeading
                title="Identidade da marca"
                description="Escolha um ícone rápido ou envie seu logotipo para personalizar a aplicação."
              />
              <div className="mt-7 grid gap-7 md:grid-cols-[1fr_220px]">
                <div>
                  <Label>Ícone da confeitaria</Label>
                  <div className="mt-3 grid grid-cols-6 gap-2">
                    {icons.map((icon) => (
                      <button
                        key={icon}
                        type="button"
                        onClick={() => setBakeryField('icon', icon)}
                        className={`grid aspect-square place-items-center rounded-xl border text-2xl transition ${bakery.icon === icon ? 'border-primary bg-primary/10 ring-2 ring-primary/15' : 'hover:border-primary/40'}`}
                        aria-label={`Usar ícone ${icon}`}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                  <div className="mt-6 space-y-2">
                    <Label htmlFor="logo">Logotipo ou ícone personalizado</Label>
                    <label
                      htmlFor="logo"
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-4 transition hover:border-primary/50 hover:bg-primary/5"
                    >
                      <Upload className="size-5 text-primary" />
                      <span>
                        <span className="block text-sm font-semibold">
                          {uploadingLogo ? 'Enviando...' : 'Selecionar uma imagem'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          PNG, JPG ou WebP de até 4 MB
                        </span>
                      </span>
                    </label>
                    <input
                      id="logo"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={readLogo}
                      disabled={uploadingLogo}
                      className="sr-only"
                    />
                    {logoError && (
                      <p className="text-xs text-destructive">{logoError}</p>
                    )}
                  </div>
                </div>
                <div className="rounded-2xl bg-secondary/55 p-5 text-center">
                  <p className="text-xs font-semibold text-muted-foreground">
                    Prévia no sistema
                  </p>
                  <span className="mx-auto mt-5 grid size-20 place-items-center overflow-hidden rounded-3xl bg-primary text-4xl text-primary-foreground shadow-lg">
                    {bakery.logo ? (
                      <Image
                        src={bakery.logo}
                        alt="Prévia do logotipo"
                        width={80}
                        height={80}
                        unoptimized
                        className="size-full object-cover"
                      />
                    ) : (
                      bakery.icon
                    )}
                  </span>
                  <p className="mt-4 font-heading text-xl font-bold">
                    {bakery.name || 'Sua confeitaria'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Administrado com Doce Gestão
                  </p>
                </div>
              </div>
            </section>
          )}

          {step === 4 && (
            <section>
              <StepHeading
                title="Como você trabalha"
                description="Essas escolhas ajudam a preparar o painel para sua rotina."
              />
              <div className="mt-7 grid gap-5 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="specialty">Especialidade principal</Label>
                  <NativeSelect
                    id="specialty"
                    value={bakery.specialty}
                    onChange={(event) =>
                      setBakeryField('specialty', event.target.value)
                    }
                    className="w-full [&_select]:h-11 [&_select]:rounded-xl"
                  >
                    {specialties.map((option) => (
                      <NativeSelectOption key={option} value={option}>
                        {option}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="sales-model">Modelo de vendas</Label>
                  <NativeSelect
                    id="sales-model"
                    value={bakery.salesModel}
                    onChange={(event) =>
                      setBakeryField('salesModel', event.target.value)
                    }
                    className="w-full [&_select]:h-11 [&_select]:rounded-xl"
                  >
                    {salesModels.map((option) => (
                      <NativeSelectOption key={option} value={option}>
                        {option}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <div className="sm:col-span-2 rounded-2xl border bg-secondary/40 p-5">
                  <div className="flex items-start gap-3">
                    <UsersRound className="mt-0.5 size-5 text-primary" />
                    <div>
                      <p className="font-semibold">Tudo pronto para começar</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        O painel será criado para{' '}
                        <strong>{bakery.name}</strong>, administrado por{' '}
                        {fullName || 'você'}.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {step > 0 && (
            <div className="mt-9 flex items-center justify-between border-t pt-5">
              <Button
                type="button"
                variant="ghost"
                disabled={step === 1 && Boolean(session)}
                onClick={() => setStep((current) => current - 1)}
              >
                <ArrowLeft /> Voltar
              </Button>
              {step < 4 ? (
                <Button
                  type="button"
                  disabled={step === 1 ? !personalReady : !canContinue}
                  onClick={() => setStep((current) => current + 1)}
                >
                  Continuar <ArrowRight />
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={!canContinue || submitting}
                  onClick={() => void finish()}
                >
                  {submitting ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Check />
                  )}
                  {submitting ? 'Criando…' : 'Criar minha conta'}
                </Button>
              )}
            </div>
          )}
          {submitError && (
            <p className="mt-3 text-right text-xs text-destructive">
              {submitError}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
