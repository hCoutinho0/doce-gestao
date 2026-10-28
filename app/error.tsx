'use client';

import { Button } from '@/components/ui/button';

// Tela amigável quando algo quebra ao desenhar uma página, em vez da tela de
// erro crua do Next. "Tentar de novo" refaz a página; os dados já salvos no
// banco não são afetados.
export default function ErroDaPagina({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="conteudo" className="grid min-h-screen place-items-center bg-background px-5">
      <div className="max-w-md text-center">
        <h1 className="font-heading text-2xl font-bold">Algo deu errado por aqui</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Seus dados continuam salvos. Tente de novo; se o problema voltar, feche e abra o
          Confeitto.
        </p>
        <Button className="mt-5" onClick={() => reset()}>
          Tentar de novo
        </Button>
      </div>
    </main>
  );
}
