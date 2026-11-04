// Counts events per key over a sliding window, e.g. player lookups per visitor per minute.
const MAX_KEYS = 10_000;

export function createRateLimiter({ limit, windowMs }) {
  const hits = new Map(); // key -> times of the events still in the window, oldest first
  return {
    // Records an event for key unless it is over the limit. Returns 0 when allowed,
    // otherwise the number of seconds until the oldest event leaves the window.
    take(key, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return Math.ceil((recent[0] + windowMs - now) / 1000);
      }
      recent.push(now);
      hits.set(key, recent);
      // Forget idle visitors so the map can't grow without bound.
      if (hits.size > MAX_KEYS) for (const [other, times] of hits) if (now - times.at(-1) >= windowMs) hits.delete(other);
      return 0;
    },
  };
}
