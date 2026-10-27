import type { Metadata } from 'next';
import { Inter, Lora } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

// Inter: no Windows, faz o papel da SF Pro (fonte do sistema da Apple), que
// o navegador já usa direto no Mac e no iPhone (ver --font-sans em
// globals.css).
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

// Usada só dentro de `.ficha-theme` (Estoque e Precificação) — a serifada
// que aparece nas capturas de referência do usuário, sem trocar a
// identidade visual roxa do resto do painel.
const lora = Lora({
  variable: '--font-lora',
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

// Aplica tema e tamanho do texto salvos antes da primeira pintura (sem o
// "piscar" do tema claro). Mesmas chaves de components/preferencias-acessibilidade.
const PREFERENCIAS_SCRIPT = `(function(){try{var d=document.documentElement,t=localStorage.getItem('confeitto-tema')||'sistema',f=localStorage.getItem('confeitto-fonte');if(t==='escuro'||(t==='sistema'&&matchMedia('(prefers-color-scheme: dark)').matches))d.classList.add('dark');if(f==='pequena'||f==='grande'||f==='maior')d.setAttribute('data-fonte',f);}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${lora.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFERENCIAS_SCRIPT }} />
      </head>
      <body className="antialiased">
        <a href="#conteudo" className="pular-conteudo">
          Pular para o conteúdo
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
