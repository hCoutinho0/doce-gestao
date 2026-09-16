import { updateGlobalAtomic } from '@/lib/cosmos';

// A sliding-window limiter backed by the same Cosmos container as
// everything else — buckets live at `ratelimit:{key}` documents, guarded
// by the existing ETag-based atomic update, so it coordinates correctly
// across every instance the app runs on (an in-memory Map couldn't).
// Each bucket sets its own `ttl`, so Cosmos deletes it once the window is
// long past — no manual sweep needed, no unbounded growth from one-off
// keys (an IP that never comes back).
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

// Best-effort caller IP behind Azure's proxy — the header is a
// comma-separated hop chain, and the first entry is the original client.
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}
