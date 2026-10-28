import type { ReactNode } from 'react';

export function PageHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <h1 className="font-heading text-[1.75rem] font-bold leading-tight sm:text-[2.125rem]">
          {title}
        </h1>
        <p className="mt-1 text-[0.9375rem] text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

export function Panel({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04),0_4px_16px_-8px_rgb(0_0_0/0.08)] ${className}`}>
      {children}
    </section>
  );
}

export function Field({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  'h-10 w-full min-w-0 rounded-xl border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15';

export function PanelTitle({
  title,
  subtitle,
  action,
  icon,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b px-5 py-4">
      <div>
        <h2 className="font-heading font-bold">
          {icon ? <span className="mr-1.5">{icon}</span> : null}
          {title}
        </h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Empty({ label }: { label: string }) {
  return (
    <div className="p-10 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

export const money = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
