/**
 * Task 4.1 — projection content-hash utilities.
 *
 * Powers incremental projection (D2): a file whose computed hash matches the
 * stored hash of its rows is skipped — not re-parsed, not re-upserted.
 *
 * `contentHash(content)` canonicalizes the source (CRLF → LF, lone CR → LF)
 * and returns the SHA-256 hex of the canonicalized UTF-8 bytes.
 */
import { createHash } from "node:crypto";

/**
 * Normalize line endings to LF before hashing.
 *
 * Git checkouts on Windows carry CRLF; the canonical on-disk form we hash
 * against is LF-only, so the same file hashes identically across platforms
 * and across `git checkout` (which mangles mtime but not bytes).
 */
export function canonicalize(content: string): string {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * SHA-256 hex (64 lowercase chars) of the canonicalized source bytes.
 * Accepts a string (encoded as UTF-8) or raw bytes.
 */
export function contentHash(content: string | Uint8Array): string {
  const canonical =
    typeof content === "string"
      ? Buffer.from(canonicalize(content), "utf8")
      : Buffer.from(content);
  return createHash("sha256").update(canonical).digest("hex");
}
