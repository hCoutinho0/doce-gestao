import type { Metadata } from 'next';
import { DM_Sans, Playfair_Display } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const dmSans = DM_Sans({ variable: '--font-dm-sans', subsets: ['latin'] });
const playfair = Playfair_Display({ variable: '--font-playfair', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Doce Gestão | Gestão completa para confeitaria',
  description: 'Estoque, pedidos, precificação, financeiro, cardápio e fidelidade em um só lugar.',
  openGraph: {
    title: 'Doce Gestão | Gestão completa para confeitaria',
    description: 'Estoque, pedidos, precificação, financeiro, cardápio e fidelidade em um só lugar.',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Doce Gestão',
    description: 'Gestão completa para confeitaria.',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body className={`${dmSans.variable} ${playfair.variable} antialiased`}><Providers>{children}</Providers></body></html>;
}
