import { CmcRateLimitError } from "./errors.ts";

export class SlidingWindowLimiter {
  private readonly stamps: number[] = [];

  constructor(
    private perMinute: number,
    private readonly maxWaitMs: number,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {
    if (!Number.isInteger(perMinute) || perMinute < 1) throw new Error(`perMinute must be a positive integer, got ${perMinute}`);
  }

  async acquire(): Promise<void> {
    const deadline = this.now() + this.maxWaitMs;
    for (;;) {
      const t = this.now();
      while (this.stamps.length > 0 && (this.stamps[0] as number) <= t - 60_000) this.stamps.shift();
      if (this.stamps.length < this.perMinute) {
        this.stamps.push(t);
        return;
      }
      const freesAt = (this.stamps[0] as number) + 60_000;
      if (freesAt > deadline) {
        throw new CmcRateLimitError(
          `local limiter: ${this.perMinute}/min exhausted, next slot in ${freesAt - t}ms (wait budget ${this.maxWaitMs}ms)`,
          "local",
          freesAt - t,
          null,
        );
      }
      await this.sleep(Math.max(1, freesAt - t));
    }
  }

  setPerMinute(perMinute: number): void {
    if (!Number.isInteger(perMinute) || perMinute < 1) throw new Error(`perMinute must be a positive integer, got ${perMinute}`);
    this.perMinute = perMinute;
  }

  inWindow(): number {
    const t = this.now();
    return this.stamps.filter((s) => s > t - 60_000).length;
  }
}
