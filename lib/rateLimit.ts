import { updateGlobalAtomic } from '@/lib/db';

// Limitador de tentativas guardado no banco local — buckets em documentos
// `ratelimit:{key}`, atualizados pela fila atômica do documento. Cada bucket
// expira sozinho depois da janela (e purgeExpired limpa o disco).
type Bucket = { count: number; resetAt: number };

// Returns true when the call is allowed, false when the key has hit its
// limit for the current window.
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const now = Date.now();
  let allowed = true;
  await updateGlobalAtomic<Bucket>(
    `ratelimit:${key}`,
    (current) => {
      if (!current || now > current.resetAt) {
        return { count: 1, resetAt: now + windowMs };
      }
      if (current.count >= limit) {
        allowed = false;
        return current;
      }
      return { count: current.count + 1, resetAt: current.resetAt };
    },
    { ttlSeconds: Math.ceil(windowMs / 1000) + 60 },
  );
  return allowed;
}

// IP de quem chamou (no app local é sempre o próprio computador).
export function clientIp(request: Request): string {
  // No Vercel, x-real-ip é preenchido pela própria plataforma (o cliente
  // não consegue falsificar). No app de desktop não há proxy: todos os
  // pedidos vêm do próprio computador.
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'local';
}
