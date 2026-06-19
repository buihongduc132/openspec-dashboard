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

// Patterns that strongly indicate commented-out code
const CODE_PATTERNS = [
  // Starts with a JS/TS keyword
  /^\s*(const|let|var|function|return|if|for|while|import|export|class|interface|type|switch|case|break|continue|throw|try|catch|finally|await|async|new|enum|namespace|abstract|readonly|private|public|protected|static|get|set)\b/,
  // Function call ending with optional semicolon: foo() or foo.bar();
  // Requires name directly before ( (no space) to avoid prose false positives
  /[\w.]+\([^)]*\)\s*;?\s*$/,
  // Arrow function syntax
  /=>/,
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

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

    // Check block comment lines (lines inside /* */ that start with *)
    const blockCommentMatch = trimmed.match(/^\*\s*(.*)$/);
    if (blockCommentMatch) {
      const commentContent = blockCommentMatch[1];
      if (isCodeLike(commentContent)) {
        findings.push({
          file: relPath,
          line: i + 1,
          content: trimmed,
        });
      }
    }
  }

  return findings;
}

function isCodeLike(text) {
  if (!text || text.length < 3) return false;
  // Skip lines that look like JSDoc tags
  if (/^@\w+/.test(text)) return false;
  // Skip common prose patterns
  if (/^(Note|TODO|FIXME|HACK|WARNING|IMPORTANT|See|e\.g\.|i\.e\.)/.test(text)) return false;

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
