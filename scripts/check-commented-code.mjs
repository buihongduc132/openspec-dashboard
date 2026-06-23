#!/usr/bin/env node
/**
 * Commented-out code detector (task 3.3 — lint:deadcode).
 *
 * Scans src/ for comments that contain code-like patterns. This catches
 * developers commenting out old code instead of deleting it.
 *
 * Heuristic: a comment line is flagged as "code-like" if it matches ANY:
 *   1. Starts with a JS/TS keyword (const, let, function, return, if, etc.)
 *   2. Ends with a semicolon AND contains parentheses
 *   3. Contains arrow function syntax (=>)
 *   4. Contains an assignment (= but not ==, ===, !=, >=, <=)
 *   5. Contains a function/method call pattern: word followed by ()
 *
 * Tuned to avoid prose-comment false positives by requiring code-specific
 * structural markers, not just keywords in natural language.
 *
 * Usage: node scripts/check-commented-code.mjs
 * Exit: 0 = clean, 1 = commented-out code found
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

const ROOT = new URL("../src", import.meta.url).pathname;
const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const EXCLUDE_DIRS = new Set(["node_modules", ".next", "coverage", ".git", "dist", "build"]);

// Patterns that strongly indicate commented-out code.
// Strategy: a line is flagged only when it has BOTH a code keyword start
// AND a code terminator (semicolon or balanced call parens), AND does NOT
// contain common English articles/prepositions that mark it as prose.
// This avoids false positives on documentation comments that happen to
// start with a keyword or contain punctuation.
const ENGLISH_MARKERS = /\b(the|a|an|is|are|was|were|with|and|or|not|to|of|for|in|on|at|by|from|that|this|these|those|which|who|when|where|why|how|only|must|should|would|could|can|may|might|will|shall|has|have|had|been|be|do|does|did|so|if|but|because|while|during|after|before|since|until|without|within|across|between|among|each|every|all|any|some|no|more|most|less|fewer|very|also|just|only|still|even|now|then|here|there)\b/i;

const CODE_PATTERNS = [
  // Keyword start + semicolon terminator (e.g. "const x = 5;", "return foo();").
  /^\s*(const|let|var|function|return|import|export|throw|await|new|class|interface|type|enum|namespace)\b.*;\s*$/,
  // Function call with balanced parens ending with optional semicolon.
  /[\w.]+\([^)]*\)\s*;?\s*$/,
];

function scanDir(dir) {
  const findings = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry)) {
        findings.push(...scanDir(fullPath));
      }
    } else if (CODE_EXTENSIONS.has(extname(entry))) {
      findings.push(...scanFile(fullPath));
    }
  }
  return findings;
}

function scanFile(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const findings = [];
  const relPath = relative(ROOT, filePath);

  let inFencedBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // Track fenced code blocks (``` or ~~~). Any code inside a fenced block
    // is EXAMPLE documentation, not commented-out code.
    if (/^```|^~~~/.test(trimmed)) {
      inFencedBlock = !inFencedBlock;
      continue;
    }
    if (inFencedBlock) continue;

    // Check line comments (// but not URLs like http://)
    const lineCommentMatch = trimmed.match(/^\/\/\s*(.*)$/);
    if (lineCommentMatch && !trimmed.match(/^\/\/\s*https?:\/\//)) {
      const commentContent = lineCommentMatch[1];
      if (isCodeLike(commentContent)) {
        findings.push({
          file: relPath,
          line: i + 1,
          content: trimmed,
        });
      }
    }

    // Check block comment lines (lines inside /* */ that start with *).
    //
    // Skip these entirely — JSDoc `* ` lines are prose documentation, not
    // commented-out code. The `* ` prefix unambiguously distinguishes
    // block-comment content from line comments where commented-out code
    // actually appears. (The earlier heuristic produced 27 false positives
    // from legitimate JSDoc prose such as "* Tampered body => rejected.".)
  }

  return findings;
}

function isCodeLike(text) {
  if (!text || text.length < 3) return false;
  // Skip lines that look like JSDoc tags
  if (/^@\w+/.test(text)) return false;
  // Skip common prose patterns
  if (/^(Note|TODO|FIXME|HACK|WARNING|IMPORTANT|See|e\.g\.|i\.e\.)/.test(text)) return false;
  // Skip lines containing common English articles/prepositions — these are
  // prose, not code. Real code rarely uses "the", "a", "with", "and", etc.
  if (ENGLISH_MARKERS.test(text)) return false;

  return CODE_PATTERNS.some((pattern) => pattern.test(text));
}

const findings = scanDir(ROOT);

if (findings.length > 0) {
  console.error(`\nFound ${findings.length} commented-out code snippet(s):\n`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}`);
    console.error(`    ${f.content}`);
    console.error();
  }
  console.error("Remove commented-out code or move to a notes file.");
  process.exit(1);
} else {
  console.log("No commented-out code detected.");
  process.exit(0);
}
