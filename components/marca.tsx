import Image from 'next/image';

// Logo horizontal da identidade visual: versão colorida no tema claro e
// branca no escuro (o roxo do wordmark some sobre fundo escuro).
export function LogoConfeitto({ className = 'h-9 w-auto' }: { className?: string }) {
  return (
    <>
      <Image
        src="/assets/brand/logo-horizontal.svg"
        alt="Confeitto"
        width={176}
        height={51}
        unoptimized
        className={`${className} dark:hidden`}
      />
      <Image
        src="/assets/brand/logo-horizontal-branco.svg"
        alt="Confeitto"
        width={176}
        height={51}
        unoptimized
        className={`${className} hidden dark:block`}
      />
    </>
  );
}
