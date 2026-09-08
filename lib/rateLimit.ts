// A minimal in-memory sliding-window limiter — no external dependency, no
// infra to provision. Good enough to blunt casual brute force / spam
// scripts today; it resets on every cold start/redeploy and doesn't
// coordinate across instances if the app ever scales out to more than one,
// so it's not a substitute for a shared store (Redis/Upstash) once traffic
// justifies one — see the security audit for that note.
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Keeps the map from growing forever under sustained abuse from many
// distinct keys (IPs/emails) — cheap opportunistic sweep, not a timer.
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}

// Returns true when the call is allowed, false when the key has hit its
// limit for the current window.
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  sweep(now);
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

// Best-effort caller IP behind Azure's proxy — the header is a
// comma-separated hop chain, and the first entry is the original client.
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}
