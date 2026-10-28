import type { Metadata, Viewport } from 'next';
import { Poppins, Lora } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

// Poppins: fonte da identidade visual (texto Regular/Medium, títulos SemiBold).
const poppins = Poppins({
  variable: '--font-poppins',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

// Usada só dentro de `.ficha-theme` (Estoque e Precificação) — a serifada
// que aparece nas capturas de referência do usuário, sem trocar a
// identidade visual roxa do resto do painel.
const lora = Lora({
  variable: '--font-lora',
  subsets: ['latin'],
});

export const viewport: Viewport = { themeColor: '#6A3F7D', viewportFit: 'cover' };

export const metadata: Metadata = {
  // Arquivos em /assets/ ficam fora do proxy do site do cardápio.
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: '/assets/brand/apple-touch-icon.png',
  },
  manifest: '/assets/brand/site.webmanifest',
  // iPhone: abre em tela cheia quando adicionado à Tela de Início.
  appleWebApp: { capable: true, title: 'Confeitto', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
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
      className={`${poppins.variable} ${lora.variable}`}
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
