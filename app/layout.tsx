import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  variable: '--font-jakarta',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Confeitto | Gestão completa para confeitaria',
  description: 'Estoque, pedidos, precificação, financeiro, cardápio e fidelidade em um só lugar.',
  openGraph: {
    title: 'Confeitto | Gestão completa para confeitaria',
    description: 'Estoque, pedidos, precificação, financeiro, cardápio e fidelidade em um só lugar.',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Confeitto',
    description: 'Gestão completa para confeitaria.',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" className={jakarta.variable}><body className="antialiased"><Providers>{children}</Providers></body></html>;
}
