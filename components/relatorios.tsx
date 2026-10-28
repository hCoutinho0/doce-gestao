'use client';

import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import { Download, Printer } from 'lucide-react';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Button } from '@/components/ui/button';
import { Empty, PageHeading, Panel, PanelTitle, inputClass, money } from '@/components/painel-ui';
import { computeRecipeCost } from '@/lib/custos';
import { recipeForItem } from '@/lib/consumo';
import { baixarCsv, imprimirHtml } from '@/lib/imprimir';
import { lastMonths, monthlySummary, productRanking, toCsv } from '@/lib/relatorios';
import type { FinanceItem, MenuItem, Order, Perda, Product, ProductRecipe, StockItem } from '@/lib/tipos';

const config = { vendas: { label: 'Vendas', color: 'var(--primary)' } } satisfies ChartConfig;

const mesLabel = (m: string, longo = false) =>
  new Date(`${m}-01T12:00`)
    .toLocaleDateString('pt-BR', longo ? { month: 'long', year: 'numeric' } : { month: 'short' })
    .replace('.', '');

// Vendas por mês, produtos mais vendidos com lucro (pela ficha técnica),
// perdas do estoque e exportação para Excel (CSV) e PDF (impressão).
export function Relatorios({
  orders,
  finance,
  recipes,
  stock,
  menuItems,
  products,
  perdas,
  confeitaria,
}: {
  orders: Order[];
  finance: FinanceItem[];
  recipes: ProductRecipe[];
  stock: StockItem[];
  menuItems: MenuItem[];
  products: Product[];
  perdas: Perda[];
  confeitaria: string;
}) {
  const meses = useMemo(() => lastMonths(new Date(), 6), []);
  const [mes, setMes] = useState(meses[meses.length - 1]);
  const resumo = useMemo(() => monthlySummary(orders, finance, meses), [orders, finance, meses]);
  const atual = resumo.find((r) => r.month === mes)!;

  const custoUnit = (name: string): number | null => {
    const r = recipeForItem(name, menuItems, products, recipes);
    if (!r || r.soldByWeight || !(r.yieldCount > 0)) return null;
    return computeRecipeCost(r as ProductRecipe, stock).baseCost / r.yieldCount;
  };
  const ranking = productRanking(orders, mes, custoUnit);
  const perdasDoMes = perdas.filter((p) => p.date.startsWith(mes));
  const totalPerdas = perdasDoMes.reduce((t, p) => t + p.cost, 0);

  const exportarPedidos = () =>
    baixarCsv(
      `pedidos-${mes}.csv`,
      toCsv(
        ['Pedido', 'Cliente', 'Entrega', 'Itens', 'Valor', 'Recebido', 'Status', 'Pagamento'],
        orders
          .filter((o) => o.deliveryDate?.startsWith(mes))
          .map((o) => [
            o.id,
            o.customer,
            o.deliveryDate ?? '',
            o.item,
            o.value,
            o.paymentStatus === 'Pago' ? o.value : (o.paidAmount ?? 0),
            o.status,
            o.paymentMethod ?? '',
          ]),
      ),
    );
  const exportarFinanceiro = () =>
    baixarCsv(
      `financeiro-${mes}.csv`,
      toCsv(
        ['Data', 'Tipo', 'Categoria', 'Descrição', 'Valor'],
        finance.map((f) => [f.date, f.type, f.category ?? '', f.description, f.value]),
      ),
    );
  const imprimir = () =>
    imprimirHtml(
      `Relatório ${mes}`,
      `<h1>${confeitaria}</h1><p>Relatório de ${mesLabel(mes, true)}</p>
       <h2>Resumo</h2>
       <table><tbody>
         <tr><td>Pedidos</td><td class="r">${atual.pedidos}</td></tr>
         <tr><td>Vendas</td><td class="r">${money(atual.vendas)}</td></tr>
         <tr><td>Ticket médio</td><td class="r">${money(atual.ticket)}</td></tr>
         <tr><td>Entradas</td><td class="r">${money(atual.entradas)}</td></tr>
         <tr><td>Saídas</td><td class="r">${money(atual.saidas)}</td></tr>
         <tr><td>Saldo</td><td class="r">${money(atual.saldo)}</td></tr>
         <tr><td>Perdas no estoque</td><td class="r">${money(totalPerdas)}</td></tr>
       </tbody></table>
       <h2>Produtos</h2>
       <table><thead><tr><th>Produto</th><th class="r">Qtd</th><th class="r">Receita</th><th class="r">Lucro</th></tr></thead><tbody>${ranking
         .map(
           (r) =>
             `<tr><td>${r.name.replace(/</g, '&lt;')}</td><td class="r">${r.qtd}</td><td class="r">${money(r.receita)}</td><td class="r">${r.lucro == null ? '—' : money(r.lucro)}</td></tr>`,
         )
         .join('')}</tbody></table>`,
    );

  const kpi = (rotulo: string, valor: string) => (
    <Panel className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className="font-nums mt-1 text-xl font-bold">{valor}</p>
    </Panel>
  );

  return (
    <>
      <PageHeading
        title="Relatórios"
        subtitle="Vendas, produtos e lucro por mês — para exportar ou imprimir."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-10 rounded-xl" onClick={exportarPedidos}>
              <Download /> Pedidos (Excel)
            </Button>
            <Button variant="outline" className="h-10 rounded-xl" onClick={exportarFinanceiro}>
              <Download /> Financeiro (Excel)
            </Button>
            <Button variant="outline" className="h-10 rounded-xl" onClick={imprimir}>
              <Printer /> PDF / Imprimir
            </Button>
          </div>
        }
      />
      <div className="mb-5 max-w-xs">
        <select value={mes} onChange={(e) => setMes(e.target.value)} className={inputClass} aria-label="Mês do relatório">
          {meses.map((m) => (
            <option key={m} value={m}>
              {mesLabel(m, true)}
            </option>
          ))}
        </select>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpi('Vendas', money(atual.vendas))}
        {kpi('Pedidos', String(atual.pedidos))}
        {kpi('Ticket médio', money(atual.ticket))}
        {kpi('Saldo do mês', money(atual.saldo))}
      </div>
      <Panel className="mb-5 p-5">
        <p className="font-heading font-bold">Vendas dos últimos 6 meses</p>
        <p className="text-xs text-muted-foreground">Pelo mês da entrega.</p>
        <ChartContainer config={config} className="mt-4 h-56 w-full">
          <BarChart data={resumo.map((r) => ({ month: mesLabel(r.month), vendas: r.vendas }))}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip content={<ChartTooltipContent formatter={(v) => money(Number(v))} />} />
            <Bar dataKey="vendas" fill="var(--color-vendas)" radius={4} />
          </BarChart>
        </ChartContainer>
      </Panel>
      <Panel className="mb-5 overflow-hidden">
        <PanelTitle title="Produtos do mês" subtitle="Lucro = receita − custo da ficha técnica." />
        {ranking.length === 0 ? (
          <Empty label="Sem pedidos com itens neste mês." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Produto</th>
                  <th className="px-3 py-3 text-right">Qtd</th>
                  <th className="px-3 py-3 text-right">Receita</th>
                  <th className="px-5 py-3 text-right">Lucro</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ranking.map((r) => (
                  <tr key={r.name}>
                    <td className="px-5 py-3 font-medium">{r.name}</td>
                    <td className="font-nums px-3 py-3 text-right">{r.qtd}</td>
                    <td className="font-nums px-3 py-3 text-right">{money(r.receita)}</td>
                    <td className="font-nums px-5 py-3 text-right">
                      {r.lucro == null ? (
                        <span className="text-xs text-muted-foreground" title="Sem ficha técnica">
                          sem ficha
                        </span>
                      ) : (
                        money(r.lucro)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Panel className="overflow-hidden">
        <PanelTitle
          title="Perdas no estoque"
          subtitle={`${perdasDoMes.length} registros · ${money(totalPerdas)} no mês`}
        />
        {perdasDoMes.length === 0 ? (
          <Empty label="Nenhuma perda registrada neste mês." />
        ) : (
          <ul className="divide-y text-sm">
            {perdasDoMes.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span>
                  {p.name} — {p.qty} {p.unit}
                  <span className="text-muted-foreground"> · {p.reason || 'sem motivo'}</span>
                </span>
                <span className="font-nums">{money(p.cost)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
