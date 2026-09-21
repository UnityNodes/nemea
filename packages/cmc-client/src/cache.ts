const MAX_ENTRIES = 500;

export type CacheStats = { hits: number; misses: number; coalesced: number };

type Entry<T> = { value: T; expiresAt: number };

export class TtlCache {
  private readonly entries = new Map<string, Entry<unknown>>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly stats: CacheStats = { hits: 0, misses: 0, coalesced: 0 };

  constructor(private readonly now: () => number = Date.now) {}

  async getOrLoad<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key) as Entry<T> | undefined;
    if (hit && hit.expiresAt > this.now()) {
      this.stats.hits += 1;
      return hit.value;
    }
    const pending = this.inflight.get(key) as Promise<T> | undefined;
    if (pending) {
      this.stats.coalesced += 1;
      return pending;
    }
    this.stats.misses += 1;
    const started = load().then(
      (value) => {
        this.entries.set(key, { value, expiresAt: this.now() + ttlMs });
        this.inflight.delete(key);
        if (this.entries.size > MAX_ENTRIES) this.sweep();
        return value;
      },
      (error) => {
        this.inflight.delete(key);
        throw error;
      },
    );
    this.inflight.set(key, started);
    return started;
  }

  peek<T>(key: string): T | undefined {
    const hit = this.entries.get(key) as Entry<T> | undefined;
    return hit && hit.expiresAt > this.now() ? hit.value : undefined;
  }

  private sweep(): void {
    const t = this.now();
    for (const [key, entry] of this.entries) if (entry.expiresAt <= t) this.entries.delete(key);
  }

  size(): number {
    return this.entries.size;
  }

  invalidate(prefix: string): void {
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }

  snapshot(): CacheStats {
    return { ...this.stats };
  }
}
