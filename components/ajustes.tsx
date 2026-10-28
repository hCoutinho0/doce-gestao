'use client';

import { Share, Smartphone } from 'lucide-react';
import { Field, PageHeading, Panel, inputClass } from '@/components/painel-ui';
import type { Ajustes as AjustesData } from '@/lib/tipos';

// Ajustes da confeitaria (só administradores): chave Pix, limite diário de
// pedidos e o passo a passo para instalar no iPhone.
export function Ajustes({
  ajustes,
  setAjustes,
}: {
  ajustes: AjustesData;
  setAjustes: (v: AjustesData | ((o: AjustesData) => AjustesData)) => void;
}) {
  const set = (patch: Partial<AjustesData>) => setAjustes((old) => ({ ...old, ...patch }));
  return (
    <>
      <PageHeading title="Ajustes" subtitle="Pix, limite de pedidos e o app no celular." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className="space-y-3 p-5">
          <h2 className="font-heading font-bold">Pix</h2>
          <p className="text-xs text-muted-foreground">
            Com a chave cadastrada, o botão Receber de cada pedido mostra o QR Code e o copia e cola
            com o valor certo.
          </p>
          <Field label="Chave Pix (CPF, CNPJ, e-mail, celular ou aleatória)">
            <input
              value={ajustes.pixKey ?? ''}
              onChange={(e) => set({ pixKey: e.target.value })}
              className={inputClass}
              autoComplete="off"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome do recebedor">
              <input
                value={ajustes.pixName ?? ''}
                maxLength={25}
                onChange={(e) => set({ pixName: e.target.value })}
                className={inputClass}
                placeholder="Lavily Confeitaria"
              />
            </Field>
            <Field label="Cidade">
              <input
                value={ajustes.pixCity ?? ''}
                maxLength={15}
                onChange={(e) => set({ pixCity: e.target.value })}
                className={inputClass}
                placeholder="São Paulo"
              />
            </Field>
          </div>
        </Panel>

        <Panel className="space-y-3 p-5">
          <h2 className="font-heading font-bold">Limite de pedidos por dia</h2>
          <p className="text-xs text-muted-foreground">
            Quando o dia de entrega atinge o limite, o cardápio do site recusa novos pedidos para essa
            data. No painel você ainda consegue lançar (aparece só como &quot;cheio&quot; na Agenda). Deixe em branco
            para não limitar.
          </p>
          <Field label="Máximo de pedidos por dia">
            <input
              type="number"
              min="1"
              step="1"
              value={ajustes.dailyLimit ?? ''}
              onChange={(e) => {
                const n = Math.floor(Number(e.target.value));
                set({ dailyLimit: Number.isFinite(n) && n > 0 ? n : undefined });
              }}
              className={inputClass}
              placeholder="Sem limite"
            />
          </Field>
        </Panel>

        <Panel className="space-y-3 p-5 lg:col-span-2">
          <h2 className="font-heading flex items-center gap-2 font-bold">
            <Smartphone className="size-4" aria-hidden="true" /> Usar no iPhone
          </h2>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm">
            <li>Abra o endereço do painel no <strong>Safari</strong> (não funciona pelo Chrome do iPhone).</li>
            <li>
              Toque em <Share className="inline size-4 align-text-bottom" aria-label="Compartilhar" />{' '}
              <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.
            </li>
            <li>Abra pelo ícone novo: o Confeitto roda em tela cheia, como um aplicativo.</li>
            <li>
              Para receber o aviso de pedido novo, mantenha o app aberto (o aviso toca som e destaca o
              pedido assim que ele chega, em até 30 segundos).
            </li>
          </ol>
          <p className="text-xs text-muted-foreground">
            O iPhone só deixa o aplicativo instalado receber avisos com a tela bloqueada se houver um
            serviço de notificação push; hoje o aviso funciona com o app aberto.
          </p>
        </Panel>
      </div>
    </>
  );
}
