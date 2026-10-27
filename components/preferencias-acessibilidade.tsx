'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Monitor, Moon, Sun, Type } from 'lucide-react';

// Preferências de leitura (tema e tamanho do texto), guardadas no próprio
// navegador/app. O script em app/layout.tsx aplica as mesmas preferências
// antes da página aparecer, para não piscar o tema claro ao abrir.

type Tema = 'claro' | 'escuro' | 'sistema';
type Fonte = 'pequena' | 'normal' | 'grande' | 'maior';

const CHAVE_TEMA = 'confeitto-tema';
const CHAVE_FONTE = 'confeitto-fonte';

const TEMAS: { valor: Tema; rotulo: string; Icone: typeof Sun }[] = [
  { valor: 'claro', rotulo: 'Claro', Icone: Sun },
  { valor: 'escuro', rotulo: 'Escuro', Icone: Moon },
  { valor: 'sistema', rotulo: 'Automático', Icone: Monitor },
];

const FONTES: { valor: Fonte; rotulo: string; amostra: string }[] = [
  { valor: 'pequena', rotulo: 'Texto pequeno', amostra: 'A−' },
  { valor: 'normal', rotulo: 'Texto normal', amostra: 'A' },
  { valor: 'grande', rotulo: 'Texto grande', amostra: 'A+' },
  { valor: 'maior', rotulo: 'Texto muito grande', amostra: 'A++' },
];

function ler<T extends string>(chave: string, permitidos: readonly T[], padrao: T): T {
  try {
    const valor = localStorage.getItem(chave);
    return permitidos.includes(valor as T) ? (valor as T) : padrao;
  } catch {
    return padrao;
  }
}

function gravar(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // Armazenamento bloqueado: a preferência vale só até fechar.
  }
}

function aplicarTema(tema: Tema) {
  const escuro =
    tema === 'escuro' ||
    (tema === 'sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', escuro);
}

function aplicarFonte(fonte: Fonte) {
  if (fonte === 'normal') document.documentElement.removeAttribute('data-fonte');
  else document.documentElement.setAttribute('data-fonte', fonte);
}

/** Os dois grupos de opções (tema e tamanho do texto), sem o botão. */
export function ControlesLeitura({ compacto = false }: { compacto?: boolean }) {
  const [tema, setTema] = useState<Tema>('sistema');
  const [fonte, setFonte] = useState<Fonte>('normal');
  const nomeGrupo = useId();

  useEffect(() => {
    setTema(ler(CHAVE_TEMA, ['claro', 'escuro', 'sistema'] as const, 'sistema'));
    setFonte(ler(CHAVE_FONTE, ['pequena', 'normal', 'grande', 'maior'] as const, 'normal'));
  }, []);

  // No modo automático, acompanha a troca de tema do sistema na hora.
  useEffect(() => {
    if (tema !== 'sistema') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const mudar = () => aplicarTema('sistema');
    mq.addEventListener('change', mudar);
    return () => mq.removeEventListener('change', mudar);
  }, [tema]);

  const escolherTema = (valor: Tema) => {
    setTema(valor);
    gravar(CHAVE_TEMA, valor);
    aplicarTema(valor);
  };
  const escolherFonte = (valor: Fonte) => {
    setFonte(valor);
    gravar(CHAVE_FONTE, valor);
    aplicarFonte(valor);
  };

  // No modo compacto (menu da conta, que é estreito) o ícone fica em cima do
  // nome, para "Automático" caber sem vazar do botão.
  const opcao = (ativo: boolean) =>
    `flex min-w-0 cursor-pointer items-center justify-center rounded-[0.45rem] text-center font-semibold leading-tight transition-all duration-150 ${
      compacto ? 'flex-col gap-1 px-1 py-1.5 text-[11px]' : 'gap-1.5 px-2 py-2 text-xs'
    } has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring ${
      // Controle segmentado da Apple: a opção escolhida vira um "botão"
      // claro em relevo sobre o trilho cinza.
      ativo
        ? 'bg-card text-foreground shadow-[0_1px_3px_rgb(0_0_0/0.15)]'
        : 'text-muted-foreground hover:text-foreground'
    }`;
  const legenda = `mb-2 font-bold uppercase tracking-wide text-muted-foreground ${compacto ? 'text-[10px]' : 'text-xs'}`;

  return (
    <>
      <fieldset>
        <legend className={legenda}>Tema</legend>
        <div className="grid grid-cols-3 gap-0.5 rounded-[0.6rem] bg-secondary p-0.5">
          {TEMAS.map(({ valor, rotulo, Icone }) => (
            <label key={valor} className={opcao(tema === valor)}>
              <input
                type="radio"
                name={`${nomeGrupo}-tema`}
                value={valor}
                checked={tema === valor}
                onChange={() => escolherTema(valor)}
                className="sr-only"
              />
              <Icone className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="max-w-full truncate">{rotulo}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={compacto ? 'mt-3' : 'mt-4'}>
        <legend className={legenda}>Tamanho do texto</legend>
        <div className="grid grid-cols-4 gap-0.5 rounded-[0.6rem] bg-secondary p-0.5">
          {FONTES.map(({ valor, rotulo, amostra }) => (
            <label key={valor} className={opcao(fonte === valor)} title={rotulo}>
              <input
                type="radio"
                name={`${nomeGrupo}-fonte`}
                value={valor}
                checked={fonte === valor}
                onChange={() => escolherFonte(valor)}
                className="sr-only"
                aria-label={rotulo}
              />
              <span aria-hidden="true">{amostra}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

export function PreferenciasAcessibilidade({
  className = '',
  claro = false,
}: {
  className?: string;
  /** Botão sobre fundo escuro/foto (ex.: topo do cardápio). */
  claro?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const painelId = useId();

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAberto(false);
        botao.current?.focus();
      }
    };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto]);

  return (
    <div ref={raiz} className={`relative ${className}`}>
      <button
        ref={botao}
        type="button"
        aria-expanded={aberto}
        aria-controls={painelId}
        aria-label="Acessibilidade: tema e tamanho do texto"
        title="Acessibilidade"
        onClick={() => setAberto((v) => !v)}
        className={`grid size-9 place-items-center rounded-full border transition-colors ${
          claro
            ? 'border-white/40 bg-white/15 text-white backdrop-blur hover:bg-white/25'
            : 'border-border bg-card text-foreground hover:bg-muted'
        }`}
      >
        <Type className="size-4" aria-hidden="true" />
      </button>

      {aberto && (
        <div
          id={painelId}
          role="dialog"
          aria-label="Preferências de acessibilidade"
          className="vidro-menu absolute right-0 z-50 mt-2 w-72 rounded-xl border p-4 text-popover-foreground shadow-[0_12px_40px_-8px_rgb(0_0_0/0.3)]"
        >
          <ControlesLeitura />
        </div>
      )}
    </div>
  );
}
