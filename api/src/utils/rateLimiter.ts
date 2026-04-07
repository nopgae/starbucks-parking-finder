// ── API Usage Monitor & Rate Limiter ─────────────────────────────────────────
// Tracks daily call counts per API and blocks requests once the soft limit
// (set below the actual free tier) is reached — preventing surprise charges.
// Counters reset automatically at midnight KST.
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiUsage {
  name: string;
  today: number;
  softLimit: number;
  hardLimit: number;
  blocked: boolean;
  resetAt: string; // ISO string of next midnight
}

interface Counter {
  date: string; // YYYY-MM-DD in KST
  count: number;
}

// Free-tier limits (official) and our soft cap (80% of free tier)
// Naver Local Search (Naver Developers): 25,000 / day
// Naver Maps SDK is client-side — usage tracked separately in browser
export const API_LIMITS: Record<string, { soft: number; hard: number }> = {
  naver_search: { soft: 20_000, hard: 25_000 },
};

class RateLimiter {
  private counters = new Map<string, Counter>();

  private todayKST(): string {
    // KST = UTC+9
    const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  }

  private nextMidnightKST(): string {
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const tomorrow = new Date(now);
    tomorrow.setUTCHours(24, 0, 0, 0); // next midnight UTC == next midnight KST - 9h
    return new Date(tomorrow.getTime() - 9 * 60 * 60 * 1000).toISOString();
  }

  private getOrCreate(api: string): Counter {
    const today = this.todayKST();
    const existing = this.counters.get(api);
    if (!existing || existing.date !== today) {
      const fresh: Counter = { date: today, count: 0 };
      this.counters.set(api, fresh);
      return fresh;
    }
    return existing;
  }

  /** Returns false and logs a warning if the soft limit has been reached. */
  check(api: string): boolean {
    const limits = API_LIMITS[api];
    if (!limits) return true; // unknown api — allow

    const counter = this.getOrCreate(api);
    if (counter.count >= limits.soft) {
      console.warn(
        `[rateLimiter] ${api} soft limit reached (${counter.count}/${limits.soft}) — blocking to avoid charges`
      );
      return false;
    }
    return true;
  }

  /** Call after a successful API request to increment the counter. */
  record(api: string): void {
    const counter = this.getOrCreate(api);
    counter.count++;

    const limits = API_LIMITS[api];
    if (limits) {
      const pct = Math.round((counter.count / limits.soft) * 100);
      if (pct === 50 || pct === 80 || pct === 90 || pct === 95) {
        console.warn(`[rateLimiter] ${api} usage at ${pct}% of soft limit (${counter.count}/${limits.soft})`);
      }
    }
  }

  /** Returns usage stats for all tracked APIs. */
  getAll(): ApiUsage[] {
    return Object.entries(API_LIMITS).map(([name, limits]) => {
      const counter = this.getOrCreate(name);
      return {
        name,
        today: counter.count,
        softLimit: limits.soft,
        hardLimit: limits.hard,
        blocked: counter.count >= limits.soft,
        resetAt: this.nextMidnightKST(),
      };
    });
  }
}

export const rateLimiter = new RateLimiter();
