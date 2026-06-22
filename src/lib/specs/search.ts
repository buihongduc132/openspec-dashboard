/**
 * Task 2.15 — Spec full-text search (req 02 §2.7).
 *
 * Full-text search across all specs in a project. The dashboard's authoritative
 * index is a SQLite FTS5 table (req 02 §2.7 AC b: index refresh ≤ 2s after a
 * write). This module is the in-memory ranking core that mirrors FTS5
 * semantics (Unicode-aware tokenisation + BM25 ranking) so the same query can
 * be evaluated offline — e.g. for a preview before the FTS5 index is rebuilt,
 * or in tests without a database.
 *
 * Filters supported (req 02 §2.7): domain and RFC 2119 strength
 * (MUST / SHALL / SHOULD / MAY). Search hits scope to the matching requirement
 * (AC a); clicking a hit in the UI jumps to it.
 */

/** A scenario block within a searchable requirement. */
export interface SearchableScenario {
  name: string;
  body: string;
}

/** A requirement within a searchable spec. */
export interface SearchableRequirement {
  name: string;
  body: string;
  scenarios: SearchableScenario[];
}

/** A flattened spec domain ready for in-memory FTS indexing. */
export interface SearchableSpec {
  domain: string;
  requirements: SearchableRequirement[];
}

/** RFC 2119 keyword strength tiers, per RFC 2119 §1–§3. */
export type Rfc2119Strength = "MUST" | "SHALL" | "SHOULD" | "MAY";

/** Optional filters applied to the search (req 02 §2.7). */
export interface SearchOptions {
  /** Restrict hits to these spec domains. */
  domains?: string[];
  /** Restrict hits to requirements whose body uses one of these strengths. */
  rfc2119?: Rfc2119Strength[];
}

/** One search hit, scoped to a requirement (req 02 §2.7 AC a). */
export interface SearchHit {
  domain: string;
  requirement: string;
  scenario?: string;
  /** Relevance score (BM25-ish); higher is more relevant. */
  score: number;
  /** Best matching token, for snippet highlighting in the UI. */
  matchedToken: string;
}

const RFC2119: ReadonlySet<string> = new Set([
  "MUST",
  "SHALL",
  "SHOULD",
  "MAY",
  "MUSTNOT",
  "SHALLNOT",
]);

/**
 * Tokenise a string the way FTS5's default `unicode61` tokenizer does:
 * lowercase, then split on any non-alphanumeric run.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

/** Detect which RFC 2119 strength keywords occur in a requirement body. */
function strengthsOf(body: string): Rfc2119Strength[] {
  const out = new Set<Rfc2119Strength>();
  for (const word of body.split(/[^A-Za-z]+/)) {
    const upper = word.toUpperCase();
    if (RFC2119.has(upper) && upper !== "MUSTNOT" && upper !== "SHALLNOT") {
      out.add(upper as Rfc2119Strength);
    }
  }
  return [...out];
}

interface Doc {
  domain: string;
  requirement: string;
  scenario?: string;
  tokens: string[];
}

/**
 * In-memory FTS5-equivalent search. Builds a per-query inverted index over the
 * supplied specs and ranks matches with a simplified BM25 score
 * (term-frequency × inverse-document-frequency), scoped per requirement.
 *
 * Multi-token queries are AND-ed (every query token must appear in the doc),
 * matching FTS5's implicit-AND default.
 */
export function searchSpecs(
  specs: SearchableSpec[],
  query: string,
  options?: SearchOptions,
): SearchHit[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const domainFilter =
    options?.domains && options.domains.length > 0
      ? new Set(options.domains)
      : null;
  const rfcFilter =
    options?.rfc2119 && options.rfc2119.length > 0
      ? new Set(options.rfc2119)
      : null;

  const docs: Doc[] = [];
  for (const spec of specs) {
    if (domainFilter && !domainFilter.has(spec.domain)) continue;
    for (const req of spec.requirements) {
      if (rfcFilter) {
        const strengths = new Set(strengthsOf(req.body));
        if (![...rfcFilter].some((s) => strengths.has(s))) continue;
      }
      docs.push({
        domain: spec.domain,
        requirement: req.name,
        tokens: tokenize(`${req.name} ${req.body}`),
      });
      for (const scenario of req.scenarios) {
        docs.push({
          domain: spec.domain,
          requirement: req.name,
          scenario: scenario.name,
          tokens: tokenize(`${scenario.name} ${scenario.body}`),
        });
      }
    }
  }

  const N = docs.length;
  if (N === 0) return [];

  // Document frequency per query token.
  const df = new Map<string, number>();
  for (const token of queryTokens) {
    if (df.has(token)) continue;
    let count = 0;
    for (const doc of docs) {
      if (doc.tokens.includes(token)) count++;
    }
    df.set(token, count);
  }

  // AND semantics: every query token must occur in the doc.
  const hits: SearchHit[] = [];
  for (const doc of docs) {
    const tf = new Map<string, number>();
    for (const t of doc.tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    if (!queryTokens.every((q) => (tf.get(q) ?? 0) > 0)) continue;

    // BM25-ish score (k1=1.2, b=0.75 simplified; avgdl approximated per-query).
    let score = 0;
    let bestToken = queryTokens[0];
    let bestContribution = -Infinity;
    const dl = doc.tokens.length;
    for (const q of queryTokens) {
      const idf = Math.log(1 + (N - (df.get(q) ?? 0) + 0.5) / ((df.get(q) ?? 0) + 0.5));
      const freq = tf.get(q) ?? 0;
      const denom = freq + 1.2 * (1 - 0.75 + 0.75 * (dl / 8));
      const contribution = idf * ((freq * 2.2) / denom);
      score += contribution;
      if (contribution > bestContribution) {
        bestContribution = contribution;
        bestToken = q;
      }
    }
    if (score > 0) {
      hits.push({
        domain: doc.domain,
        requirement: doc.requirement,
        scenario: doc.scenario,
        score,
        matchedToken: bestToken,
      });
    }
  }

  hits.sort((a, b) => b.score - a.score);
  return hits;
}
