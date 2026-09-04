'use client';

import Image from 'next/image';
import { useEffect, useState, type ComponentProps } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CakeSlice,
  Check,
  MapPin,
  Palette,
  Settings2,
  Upload,
  UsersRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { BAKERY_KEY, type BakeryProfile } from '@/lib/bakery';
import { useUserSession } from '@/lib/auth';
import { StepHeading, SetupInput } from '@/components/onboarding-fields';

const icons = ['🧁', '🍰', '🎂', '🍪', '🍫', '🥐'];
const steps = [
  { number: 1, label: 'Confeitaria', icon: Building2 },
  { number: 2, label: 'Identidade', icon: Palette },
  { number: 3, label: 'Operação', icon: Settings2 },
];

const initialProfile: BakeryProfile = {
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
  whatsapp: '',
  instagram: '',
  tiktok: '',
};

export default function SetupPage() {
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState(initialProfile);
  const [logoError, setLogoError] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const { session, isLoading: sessionLoading } = useUserSession();

  useEffect(() => {
    if (!sessionLoading && !session) window.location.replace('/login');
  }, [sessionLoading, session]);

  const setField = (field: keyof BakeryProfile, value: string) => {
    setProfile((current) => ({ ...current, [field]: value }));
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
      .then(({ url }) => setField('logo', url))
      .catch(() =>
        setLogoError('Não foi possível enviar a imagem. Tente novamente.'),
      )
      .finally(() => setUploadingLogo(false));
  };

  const canContinue =
    step === 1
      ? Boolean(
          profile.name.trim() &&
          profile.founded &&
          profile.phone.trim() &&
          profile.city.trim(),
        )
      : step === 2
        ? Boolean(profile.icon || profile.logo)
        : Boolean(profile.specialty && profile.salesModel);

  const finish: NonNullable<ComponentProps<'form'>['onSubmit']> = (event) => {
    event.preventDefault();
    if (!canContinue) return;
    setSaving(true);
    setSaveError('');
    void fetch(`/api/data/${BAKERY_KEY}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: profile }),
    })
      .then((response) => {
        if (!response.ok) throw new Error('save_failed');
        window.location.replace('/painel');
      })
      .catch(() => {
        setSaving(false);
        setSaveError(
          'Não foi possível salvar agora. Verifique a conexão e tente de novo.',
        );
      });
  };

  if (sessionLoading || !session) {
    return (
      <main className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Preparando configuração…
      </main>
    );
  }

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
              Configuração inicial
            </p>
          </div>
          <span className="ml-auto rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
            Etapa {step} de 3
          </span>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:py-12">
        <aside>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
            Vamos começar
          </p>
          <h1 className="mt-3 font-heading text-3xl font-bold leading-tight">
            Conte um pouco sobre sua confeitaria.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Essas informações personalizam o painel e o cardápio. Você poderá
            alterá-las depois.
          </p>
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
        </aside>

        <form
          onSubmit={finish}
          className="rounded-3xl border bg-card p-5 shadow-sm sm:p-8"
        >
          {step === 1 && (
            <section>
              <StepHeading
                title="Dados da confeitaria"
                description="As informações principais do negócio que você irá administrar."
              />
              <div className="mt-7 grid gap-5 sm:grid-cols-2">
                <SetupInput
                  id="bakery-name"
                  label="Nome da confeitaria"
                  value={profile.name}
                  onChange={(value) => setField('name', value)}
                  placeholder="Ex.: Ateliê da Gabi"
                  required
                />
                <SetupInput
                  id="legal-name"
                  label="Razão social (opcional)"
                  value={profile.legalName}
                  onChange={(value) => setField('legalName', value)}
                  placeholder="Nome cadastrado da empresa"
                />
                <SetupInput
                  id="founded"
                  label="Data de fundação"
                  type="date"
                  value={profile.founded}
                  onChange={(value) => setField('founded', value)}
                  required
                />
                <div className="space-y-2">
                  <Label htmlFor="team-size">Tamanho da equipe</Label>
                  <NativeSelect
                    id="team-size"
                    value={profile.teamSize}
                    onChange={(event) =>
                      setField('teamSize', event.target.value)
                    }
                    className="w-full [&_select]:h-11 [&_select]:rounded-xl"
                  >
                    {[
                      '1 pessoa',
                      '2 a 5 pessoas',
                      '6 a 10 pessoas',
                      'Mais de 10 pessoas',
                    ].map((option) => (
                      <NativeSelectOption key={option} value={option}>
                        {option}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <SetupInput
                  id="phone"
                  label="WhatsApp comercial"
                  value={profile.phone}
                  onChange={(value) => setField('phone', value)}
                  placeholder="(11) 99999-9999"
                  required
                />
                <SetupInput
                  id="city"
                  label="Cidade e estado"
                  icon={<MapPin />}
                  value={profile.city}
                  onChange={(value) => setField('city', value)}
                  placeholder="São Paulo, SP"
                  required
                />
              </div>
              <p className="mt-7 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Link público (opcional)
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Aparecem no seu link de divulgação — deixe em branco pra não
                mostrar.
              </p>
              <div className="mt-3 grid gap-5 sm:grid-cols-3">
                <SetupInput
                  id="social-whatsapp"
                  label="WhatsApp (só números, com DDI)"
                  value={profile.whatsapp ?? ''}
                  onChange={(value) => setField('whatsapp', value)}
                  placeholder="5511999999999"
                />
                <SetupInput
                  id="social-instagram"
                  label="Instagram (sem @)"
                  value={profile.instagram ?? ''}
                  onChange={(value) => setField('instagram', value)}
                  placeholder="suaconfeitaria"
                />
                <SetupInput
                  id="social-tiktok"
                  label="TikTok (sem @)"
                  value={profile.tiktok ?? ''}
                  onChange={(value) => setField('tiktok', value)}
                  placeholder="suaconfeitaria"
                />
              </div>
            </section>
          )}

          {step === 2 && (
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
                        onClick={() => setField('icon', icon)}
                        className={`grid aspect-square place-items-center rounded-xl border text-2xl transition ${profile.icon === icon ? 'border-primary bg-primary/10 ring-2 ring-primary/15' : 'hover:border-primary/40'}`}
                        aria-label={`Usar ícone ${icon}`}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                  <div className="mt-6 space-y-2">
                    <Label htmlFor="logo">
                      Logotipo ou ícone personalizado
                    </Label>
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
                    {profile.logo ? (
                      <Image
                        src={profile.logo}
                        alt="Prévia do logotipo"
                        width={80}
                        height={80}
                        unoptimized
                        className="size-full object-cover"
                      />
                    ) : (
                      profile.icon
                    )}
                  </span>
                  <p className="mt-4 font-heading text-xl font-bold">
                    {profile.name || 'Sua confeitaria'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Administrado com Doce Gestão
                  </p>
                </div>
              </div>
            </section>
          )}

          {step === 3 && (
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
                    value={profile.specialty}
                    onChange={(event) =>
                      setField('specialty', event.target.value)
                    }
                    className="w-full [&_select]:h-11 [&_select]:rounded-xl"
                  >
                    {[
                      'Bolos e doces variados',
                      'Bolos personalizados',
                      'Doces finos e eventos',
                      'Confeitaria artesanal',
                      'Padaria e confeitaria',
                    ].map((option) => (
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
                    value={profile.salesModel}
                    onChange={(event) =>
                      setField('salesModel', event.target.value)
                    }
                    className="w-full [&_select]:h-11 [&_select]:rounded-xl"
                  >
                    {[
                      'Encomendas e pronta entrega',
                      'Somente encomendas',
                      'Somente pronta entrega',
                      'Loja física e delivery',
                    ].map((option) => (
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
                        <strong>{profile.name}</strong>, com uma equipe de{' '}
                        {profile.teamSize.toLowerCase()} e foco em{' '}
                        {profile.specialty.toLowerCase()}.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          <div className="mt-9 flex items-center justify-between border-t pt-5">
            <Button
              type="button"
              variant="ghost"
              disabled={step === 1}
              onClick={() => setStep((current) => current - 1)}
            >
              <ArrowLeft /> Voltar
            </Button>
            {step < 3 ? (
              <Button
                type="button"
                disabled={!canContinue}
                onClick={() => setStep((current) => current + 1)}
              >
                Continuar <ArrowRight />
              </Button>
            ) : (
              <Button type="submit" disabled={!canContinue || saving}>
                <Check /> {saving ? 'Salvando…' : 'Concluir configuração'}
              </Button>
            )}
          </div>
          {saveError && (
            <p className="mt-3 text-right text-xs text-destructive">
              {saveError}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}

