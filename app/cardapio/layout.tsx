import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cardápio da Semana | Ateliê da Gabi',
  description: 'Escolha doces artesanais, monte seu carrinho e envie sua encomenda.',
  openGraph: {
    title: 'Cardápio da Semana | Ateliê da Gabi',
    description: 'Doces artesanais disponíveis nesta semana.',
    images: [],
  },
  twitter: {
    card: 'summary',
    title: 'Cardápio da Semana | Ateliê da Gabi',
    description: 'Doces artesanais disponíveis nesta semana.',
    images: [],
  },
};

export default function CardapioLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
