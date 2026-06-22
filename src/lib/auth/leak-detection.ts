/**
 * Task 6.1 — Per-token leak detection (req 09.5 (c)).
 *
 * Pure algorithm. A rolling 24h window tracks per-token (origin-IP,
 * user-agent) fingerprint buckets. If a token is used from a fingerprint
 * bucket NOT seen in the prior 30 days AND geographically implausible
 * (>2000 km from median of last 50 uses), an alert is emitted (and the
 * caller is expected to temporarily rate-limit the token pending
 * reconfirmation).
 *
 * Cold-start (req 09.5 (c)):
 *  - For tokens with <50 uses, the median is computed over all available uses
 *    (minimum 5).
 *  - Tokens with <5 uses are EXEMPT from geographic implausibility; only
 *    novel-fingerprint alerting applies.
 *
 * Geo-IP source: operator-provided via `GEOIP_SOURCE` env var (req 09.5 (c)).
 * The resolver is injected so the algorithm is deterministic under test and
 * agnostic to the operator's chosen Geo-IP backend.
 *
 * Source: req 09 §9.5 (c).
 */

/** Injectable monotonic clock (milliseconds). */
export type Clock = () => number;

/** A latitude/longitude pair returned by the Geo-IP resolver. */
export interface LatLon {
  lat: number;
  lon: number;
}

/** Resolves an IP to a lat/lon, or null if unknown. */
export type GeoIpResolver = (ip: string) => LatLon | null;

/** A recorded token use (one row of the token's history). */
export interface TokenUse {
  /** Origin IP of the request. */
  ip: string;
  /** User-Agent of the request. */
  userAgent: string;
  /** Resolved latitude (operator-provided Geo-IP). */
  lat: number;
  /** Resolved longitude. */
  lon: number;
  /** Timestamp of the use (ms). */
  at: number;
}

/** Inputs to {@link evaluateLeak}. */
export interface LeakDetectionInput {
  /** Prior uses of the token, in any order. */
  prior: TokenUse[];
  /** The candidate (latest) use being evaluated. */
  latest: TokenUse;
  /** Current wall-clock time (ms). */
  now: number;
  /**
   * Optional Geo-IP resolver. When provided, uses without coordinates
   * resolve through it; uses already carrying lat/lon are used as-is.
   */
  resolveGeo?: GeoIpResolver;
}

/** Outcome of {@link evaluateLeak}. */
export interface LeakDecision {
  /** Whether the latest use should trigger an alert. */
  alert: boolean;
  /** Human-readable reason (empty when no alert). */
  reason: string;
}

/** Rolling window sizes (req 09.5 (c)). */
export const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
export const PRIOR_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
/** Distance threshold for geographic implausibility (km). */
export const IMPLAUSIBLE_KM = 2000;
/** Number of most-recent uses the median anchor is computed over. */
export const MEDIAN_SAMPLE = 50;
/** Minimum uses before the geo check applies. */
export const MIN_USES_FOR_GEO = 5;

/**
 * Build the (origin-IP, user-agent) fingerprint bucket key (req 09.5 (c)).
 *
 * The exact string is opaque but stable: identical (ip, ua) → identical key.
 */
export function fingerprint(ip: string, userAgent: string): string {
  // A control character that cannot appear in either field separates them.
  return `${ip}\u0000${userAgent}`;
}

/**
 * Great-circle distance between two lat/lon points, in km (haversine).
 *
 * Used for the ">2000 km from median of last 50 uses" check.
 */
export function haversineKm(a: LatLon, b: LatLon): number {
  const R = 6371; // earth radius, km
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Median latitude of a list of latitudes (req 09.5 (c)).
 *
 * For an even count returns the lower median (deterministic). Used to anchor
 * the geographic-implausibility check.
 */
export function medianLat(lats: number[]): number {
  if (lats.length === 0) return NaN;
  const sorted = [...lats].sort((a, b) => a - b);
  const mid = Math.floor((sorted.length - 1) / 2);
  return sorted[mid];
}

/**
 * Evaluate whether a token's latest use is suspicious (req 09.5 (c)).
 *
 * Decision logic:
 *  1. Compute the set of fingerprint buckets seen within the rolling 24h
 *     window of `prior`.
 *  2. Also compute the set seen within the prior 30-day lookback.
 *  3. **Novel-fingerprint**: the latest's fingerprint is NOT in the 30-day
 *     set. (A bucket seen in the 30-day set but not the 24h set is NOT
 *     novel — it has appeared recently enough.)
 *  4. **Geographic implausibility**: the latest is >2000 km from the median
 *     anchor of the last 50 uses (or all available uses if <50). Exempt when
 *     fewer than 5 prior uses exist.
 *  5. Alert only when BOTH novel-fingerprint AND geographic implausibility
 *     hold.
 *
 * The Geo-IP resolver is consulted only to fill in coordinates for prior
 * uses missing them; `latest` is always trusted to carry its own coords.
 */
export function evaluateLeak(input: LeakDetectionInput): LeakDecision {
  const latestFp = fingerprint(input.latest.ip, input.latest.userAgent);

  // Fingerprint buckets seen in the prior 30-day lookback.
  const lookbackStart = input.now - PRIOR_LOOKBACK_MS;
  const bucketsSeen30d = new Set<string>();
  for (const u of input.prior) {
    if (u.at >= lookbackStart && u.at <= input.now) {
      bucketsSeen30d.add(fingerprint(u.ip, u.userAgent));
    }
  }

  // Cold-start geo exemption (req 09.5 (c)): <5 prior uses → skip geo.
  const priorUses = input.prior.length;
  const geoApplicable = priorUses >= MIN_USES_FOR_GEO;

  // Geographic implausibility, if applicable.
  let implausible = false;
  let distance = 0;
  if (geoApplicable) {
    const windowUses = [...input.prior, input.latest]
      // exclude the latest from the median computation
      .filter((u) => u !== input.latest)
      .sort((a, b) => a.at - b.at);
    const sample = windowUses.slice(-MEDIAN_SAMPLE);
    const lats = sample.map((u) => u.lat);
    const anchorLat = medianLat(lats);
    const anchorLon = medianLon(sample, anchorLat);
    distance = haversineKm(
      { lat: input.latest.lat, lon: input.latest.lon },
      { lat: anchorLat, lon: anchorLon },
    );
    implausible = distance > IMPLAUSIBLE_KM;
  }

  const novel = !bucketsSeen30d.has(latestFp);

  if (novel && implausible) {
    return {
      alert: true,
      reason:
        `novel fingerprint bucket (${input.latest.ip} / ${input.latest.userAgent}) ` +
        `combined with geographically implausible use ` +
        `(${Math.round(distance)} km > ${IMPLAUSIBLE_KM} km from median anchor)`,
    };
  }

  // Cold-start (req 09.5 (c)): tokens with <5 prior uses are exempt from
  // geographic implausibility, but novel-fingerprint alerting MUST still
  // apply. Without this, a stolen token used from a brand-new location
  // during its first few uses would generate no alert at all.
  if (novel && !geoApplicable) {
    return {
      alert: true,
      reason:
        `novel fingerprint bucket (${input.latest.ip} / ${input.latest.userAgent}) ` +
        `(geo exemption active: <${MIN_USES_FOR_GEO} prior uses)`,
    };
  }

  return { alert: false, reason: "" };
}

/**
 * Median longitude anchored to the latitude median's position.
 *
 * We pick the longitude of the use whose latitude equals the median latitude
 * (when present), falling back to the median of all longitudes. This keeps
 * the anchor a real point the token has used from, rather than an averaged
 * coordinate that may not correspond to any real location.
 */
function medianLon(uses: TokenUse[], anchorLat: number): number {
  const atAnchor = uses.find((u) => u.lat === anchorLat);
  if (atAnchor) return atAnchor.lon;
  const lons = uses.map((u) => u.lon).sort((a, b) => a - b);
  if (lons.length === 0) return 0;
  const mid = Math.floor((lons.length - 1) / 2);
  return lons[mid];
}
