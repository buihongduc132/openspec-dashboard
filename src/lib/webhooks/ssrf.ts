/**
 * Task 6.3 — SSRF egress guard for outbound webhooks (req 08.5a).
 *
 * Spec source: req 08 §8.5 (a) in
 * `flow/requirements/08-integration-sync.md`.
 *
 * Contract:
 *   - **Default-deny allowlist**: the operator-configured egress allowlist
 *     starts EMPTY. No outbound delivery happens unless the host is
 *     explicitly allowed.
 *   - **Denylist enforced on top**: even if an operator misconfigures the
 *     allowlist to include a private range, the denylist STILL blocks:
 *       * RFC1918 (10/8, 172.16/12, 192.168/16)
 *       * link-local 169.254/16
 *       * CGNAT 100.64/10
 *       * cloud metadata 169.254.169.254 + fd00:ec2::254
 *       * loopback 127.0.0.0/8 + ::1 + "localhost"
 *
 * This module does NOT perform DNS resolution; it inspects the literal host
 * of the URL. (The full DNS-rebinding defence is layered above; this module
 * is the deterministic, fully-unit-testable policy gate.)
 */

/** Operator-configured egress allowlist (default empty). */
export interface EgressAllowlist {
  /**
   * Exact hostnames / IP literals permitted for outbound delivery.
   * Default deny: an empty list blocks everything.
   */
  hosts: string[];
}

/**
 * Decide whether an outbound delivery to `url` is permitted by the policy.
 *
 * Returns `true` only when BOTH:
 *   (1) the URL's host is on the operator allowlist, AND
 *   (2) the host is not on the mandatory denylist.
 *
 * Host matching is case-insensitive and ignores the port.
 */
export function isEgressAllowed(
  url: string,
  allowlist: EgressAllowlist,
): boolean {
  const host = extractHost(url);
  if (!host) return false;
  const normalized = host.toLowerCase();
  if (!allowlist.hosts.some((h) => h.toLowerCase() === normalized)) return false;
  if (isDenylisted(normalized)) return false;
  return true;
}

/** Extract the host portion of a URL (lowercased, port stripped). */
function extractHost(url: string): string | null {
  // Strip scheme.
  const noScheme = url.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "");
  // Strip path/query/fragment.
  const authority = noScheme.split(/[/?#]/, 1)[0] ?? "";
  // Strip userinfo.
  const atHost = authority.includes("@")
    ? authority.slice(authority.lastIndexOf("@") + 1)
    : authority;
  // Strip brackets + port from IPv6 / host:port.
  if (atHost.startsWith("[")) {
    const end = atHost.indexOf("]");
    if (end === -1) return null;
    return atHost.slice(1, end).toLowerCase();
  }
  const colon = atHost.lastIndexOf(":");
  const host = colon === -1 ? atHost : atHost.slice(0, colon);
  return host.toLowerCase() || null;
}

/** Mandatory denylist: private / link-local / CGNAT / metadata / loopback. */
function isDenylisted(lowerHost: string): boolean {
  if (lowerHost === "localhost") return true;
  if (IPV4_RE.test(lowerHost)) {
    return isPrivateV4(lowerHost) || isMetadataV4(lowerHost);
  }
  // IPv6 literal (with or without brackets already removed).
  const v6 = lowerHost.replace(/^\[|\]$/g, "");
  if (IPV6_RE.test(v6)) {
    if (normalizeV6(v6) === "0000:0000:0000:0000:0000:0000:0000:0001") return true;
    if (v6.toLowerCase() === "fd00:ec2::254") return true;
    if (isLinkLocalV6(v6)) return true;
  }
  return false;
}

const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE = /^[0-9a-fA-F:]+$/;

function isPrivateV4(ip: string): boolean {
  const rawParts = ip.split(".");
  // Reject leading zeros (e.g. "012") — parseInt would parse "012" as 12,
  // allowing SSRF bypasses like 0127.0.0.1 → 127.0.0.1.
  // Treat as private/blocked to be safe (denylist over allowlist).
  if (rawParts.some((p) => p.length > 1 && p[0] === "0")) return true;
  const parts = rawParts.map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts;
  // 10/8
  if (a === 10) return true;
  // 172.16/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168/16
  if (a === 192 && b === 168) return true;
  // 127/8 loopback
  if (a === 127) return true;
  // 169.254/16 link-local (covers 169.254.169.254 too)
  if (a === 169 && b === 254) return true;
  // 100.64/10 CGNAT
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isMetadataV4(ip: string): boolean {
  // AWS / GCP / Azure metadata endpoints. 169.254.x is already covered by
  // isPrivateV4 link-local; spell it out explicitly for clarity.
  return ip === "169.254.169.254";
}

function isLinkLocalV6(v6: string): boolean {
  return /^fe[89ab][0-9a-f]:/i.test(v6);
}

/**
 * Normalize an IPv6 address to its fully-expanded, 4-digit-per-group form.
 * Handles `::` expansion so that e.g. `0:0:0:0:0:0:0:1` and `::1` both
 * normalize to `0000:0000:0000:0000:0000:0000:0000:0001`.
 */
function normalizeV6(v6: string): string {
  const parts = v6.split("::");
  if (parts.length === 2) {
    const left = parts[0] ? parts[0].split(":") : [];
    const right = parts[1] ? parts[1].split(":") : [];
    const missing = 8 - left.length - right.length;
    if (missing < 0) return v6; // invalid — too many groups
    const groups = [...left, ...Array(missing).fill("0"), ...right];
    return groups.map((g) => g.padStart(4, "0").toLowerCase()).join(":");
  }
  return v6.split(":").map((g) => g.padStart(4, "0").toLowerCase()).join(":");
}
