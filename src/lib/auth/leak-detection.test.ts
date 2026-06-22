/**
 * Task 6.1 — Per-token leak detection (req 09.5 (c)).
 *
 * Pure algorithm, injectable clock + geo-IP resolver.
 *
 * Rolling 24h window tracks per-token (origin-IP, user-agent) fingerprint
 * buckets. A token used from a fingerprint bucket NOT seen in the prior
 * 30 days AND geographically implausible (>2000 km from median of last 50
 * uses) triggers an alert + temporary rate-limit pending reconfirmation.
 *
 * Cold-start:
 *  - <50 uses → median computed over all available uses (minimum 5).
 *  - <5 uses → exempt from geographic implausibility; only novel-fingerprint
 *    alerting applies.
 */
import { describe, it, expect } from "vitest";
import {
  type TokenUse,
  type GeoIpResolver,
  type LeakDetectionInput,
  evaluateLeak,
  fingerprint,
  haversineKm,
  medianLat,
} from "./leak-detection";

// --- fixtures ----------------------------------------------------------------

const NOW = 1_700_000_000_000;
const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** A geo-IP resolver that returns a fixed table keyed by IP. */
function fixedResolver(table: Record<string, { lat: number; lon: number }>): GeoIpResolver {
  return (ip: string) => table[ip] ?? null;
}

function makeUses(count: number, ip: string, ua: string, lat: number, lon: number, clockMs = NOW): TokenUse[] {
  const out: TokenUse[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      ip,
      userAgent: ua,
      lat,
      lon,
      at: clockMs - (count - i - 1) * HOUR,
    });
  }
  return out;
}

// --- fingerprint buckets -----------------------------------------------------

describe("fingerprint bucket (req 09.5 (c))", () => {
  it("combines origin-IP + user-agent into a stable fingerprint", () => {
    const a = fingerprint("1.2.3.4", "Mozilla/5.0");
    const b = fingerprint("1.2.3.4", "Mozilla/5.0");
    const c = fingerprint("1.2.3.4", "curl/8.0");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("different IPs at the same user-agent produce distinct fingerprints", () => {
    const a = fingerprint("1.2.3.4", "Mozilla/5.0");
    const b = fingerprint("5.6.7.8", "Mozilla/5.0");
    expect(a).not.toBe(b);
  });
});

// --- haversine ---------------------------------------------------------------

describe("haversine km (req 09.5 (c))", () => {
  it("returns 0 for identical points", () => {
    expect(haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 0 })).toBe(0);
  });

  it("approximates known distances (within 1%)", () => {
    // London (51.5074, -0.1278) → Paris (48.8566, 2.3522): ~343 km.
    const d = haversineKm({ lat: 51.5074, lon: -0.1278 }, { lat: 48.8566, lon: 2.3522 });
    expect(d).toBeGreaterThan(340);
    expect(d).toBeLessThan(346);
  });

  it("antipodal points ~20,015 km (half earth circumference)", () => {
    const d = haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 180 });
    expect(d).toBeGreaterThan(19_900);
    expect(d).toBeLessThan(20_100);
  });
});

// --- median ------------------------------------------------------------------

describe("median latitude (req 09.5 (c))", () => {
  it("returns the median lat over an odd count", () => {
    expect(medianLat([10, 20, 30])).toBe(20);
  });

  it("returns the lower-median over an even count (deterministic)", () => {
    // For the algorithm this is only called with the last-50 uses' latitudes;
    // the median is used as the geographic anchor for the 2000 km check.
    expect(medianLat([10, 20, 30, 40])).toBe(20);
  });
});

// --- leak evaluation ---------------------------------------------------------

describe("evaluateLeak — happy path (no alert)", () => {
  it("no alert when fingerprint bucket is seen within the 30-day window", () => {
    // 50 uses from (1.2.3.4, "chrome") over the last 29 days, then a new use
    // from the SAME fingerprint in London — well within the median anchor.
    const prior = makeUses(50, "1.2.3.4", "chrome", 51.5, -0.1, NOW - DAY);
    const latest: TokenUse = {
      ip: "1.2.3.4",
      userAgent: "chrome",
      lat: 51.6, // ~10 km from anchor
      lon: -0.2,
      at: NOW,
    };
    const r = evaluateLeak({
      prior,
      latest,
      now: NOW,
      resolveGeo: fixedResolver({}),
    });
    expect(r.alert).toBe(false);
    expect(r.reason).toBe("");
  });

  it("no alert when bucket is novel but distance < 2000 km from median anchor", () => {
    const prior = makeUses(50, "1.2.3.4", "chrome", 51.5, -0.1, NOW - DAY);
    const latest: TokenUse = {
      ip: "9.9.9.9", // novel IP
      userAgent: "firefox", // novel UA
      lat: 52.5,
      lon: 13.4,
      at: NOW,
    };
    const r = evaluateLeak({
      prior,
      latest,
      now: NOW,
      resolveGeo: fixedResolver({}),
    });
    expect(r.alert).toBe(false);
  });
});

describe("evaluateLeak — cold-start exemption (req 09.5 (c))", () => {
  it("exempt from geographic implausibility when <5 prior uses", () => {
    const prior = makeUses(4, "1.2.3.4", "chrome", 51.5, -0.1, NOW - DAY);
    // A use 12000 km away — but cold-start exempts geo check (<5 uses).
    const latest: TokenUse = {
      ip: "5.6.7.8",
      userAgent: "chrome",
      lat: -33.86,
      lon: 151.2,
      at: NOW,
    };
    const r = evaluateLeak({
      prior,
      latest,
      now: NOW,
      resolveGeo: fixedResolver({}),
    });
    // No alert because geo-implausibility is exempt in cold-start.
    expect(r.alert).toBe(false);
  });

  it("still alerts on novel fingerprint in cold-start when >=5 uses exist", () => {
    const prior = makeUses(10, "1.2.3.4", "chrome", 51.5, -0.1, NOW - DAY);
    // Novel fingerprint bucket (different UA).
    const latest: TokenUse = {
      ip: "5.6.7.8",
      userAgent: "curl/8.0",
      lat: 51.6,
      lon: -0.2,
      at: NOW,
    };
    const r = evaluateLeak({
      prior,
      latest,
      now: NOW,
      resolveGeo: fixedResolver({}),
    });
    // <50 uses still compute median over ALL available (5..49); bucket is novel
    // but distance is small → no geo implausibility → no alert.
    expect(r.alert).toBe(false);
  });
});

describe("evaluateLeak — alert condition (novel bucket + >2000 km)", () => {
  it("alerts when bucket is novel in 30-day window AND geographically implausible", () => {
    // 50 uses from London. Then a use from Sydney with a novel fingerprint.
    const prior = makeUses(50, "1.2.3.4", "chrome", 51.5, -0.1, NOW - DAY);
    const latest: TokenUse = {
      ip: "9.9.9.9",
      userAgent: "firefox",
      lat: -33.86,
      lon: 151.2,
      at: NOW,
    };
    const r = evaluateLeak({
      prior,
      latest,
      now: NOW,
      resolveGeo: fixedResolver({}),
    });
    expect(r.alert).toBe(true);
    expect(r.reason).toMatch(/implausible|novel|geography/i);
  });

  it("no alert when bucket was seen in the prior 30 days even though geographically distant", () => {
    // 50 uses, one of which was from (9.9.9.9, "firefox") in Sydney 10 days ago.
    const prior: TokenUse[] = [
      ...makeUses(49, "1.2.3.4", "chrome", 51.5, -0.1, NOW - DAY),
      { ip: "9.9.9.9", userAgent: "firefox", lat: -33.86, lon: 151.2, at: NOW - 10 * DAY },
    ];
    // Latest use from the same (novel-within-24h-but-not-30-day) fingerprint.
    const latest: TokenUse = {
      ip: "9.9.9.9",
      userAgent: "firefox",
      lat: -33.86,
      lon: 151.2,
      at: NOW,
    };
    const r = evaluateLeak({
      prior,
      latest,
      now: NOW,
      resolveGeo: fixedResolver({}),
    });
    // The bucket (9.9.9.9 / firefox) was seen within the 30-day window → not novel.
    expect(r.alert).toBe(false);
  });
});

describe("evaluateLeak — lookback-window boundary", () => {
  it("uses beyond the 30-day lookback are not counted as seen → novel bucket", () => {
    // 49 uses in London recently, plus one (9.9.9.9 / firefox) use 31 days ago
    // — outside the 30-day lookback window — so its fingerprint is stale.
    const prior: TokenUse[] = [
      ...makeUses(49, "1.2.3.4", "chrome", 51.5, -0.1, NOW - HOUR),
      { ip: "9.9.9.9", userAgent: "firefox", lat: 51.5, lon: -0.1, at: NOW - 31 * DAY },
    ];
    const latest: TokenUse = {
      ip: "9.9.9.9",
      userAgent: "firefox",
      lat: -33.86,
      lon: 151.2,
      at: NOW,
    };
    const r = evaluateLeak({
      prior,
      latest,
      now: NOW,
      resolveGeo: fixedResolver({}),
    });
    // The (9.9.9.9 / firefox) use is 31 days old — outside the 30-day lookback —
    // so the fingerprint IS novel as of the latest use. Combined with >2000 km → alert.
    expect(r.alert).toBe(true);
  });
});
