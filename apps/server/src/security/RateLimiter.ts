interface Bucket {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(
    private readonly windowMs: number,
    private readonly max: number,
  ) {
    // Prune stale entries every window to prevent unbounded memory growth
    this.cleanupInterval = setInterval(() => this.prune(), this.windowMs * 2);
    this.cleanupInterval.unref?.();
  }

  /** Returns true if the key is within the limit, false if it should be blocked. */
  hit(key: string): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 1, resetAt: now + this.windowMs };
      this.buckets.set(key, bucket);
      return true;
    }

    bucket.count += 1;
    return bucket.count <= this.max;
  }

  /** Seconds until the key's window resets (for Retry-After header). */
  retryAfter(key: string): number {
    const bucket = this.buckets.get(key);
    if (!bucket) return 0;
    return Math.ceil((bucket.resetAt - Date.now()) / 1000);
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) this.buckets.delete(key);
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}
