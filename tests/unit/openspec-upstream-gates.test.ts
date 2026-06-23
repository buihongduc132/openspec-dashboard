import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Upstream gates finding scaffold', () => {
  it('should have a finding file with all required gate sections', () => {
    const findingPath = join(process.cwd(), 'flow/findings/2026-06-20_openspec-upstream-gates.md');
    const content = readFileSync(findingPath, 'utf-8');
    
    expect(content).toContain('# Finding — Upstream Format Empirical Gates');
    expect(content).toContain('## Gate 1: Sidecar Location Coexistence');
    expect(content).toContain('## Gate 2: Workspace Format');
    expect(content).toContain('## Gate 3: Context Store Format');
    expect(content).toContain('## Gate 4: Schema Fork Provenance');
    expect(content).toContain('## Gate 5: Parser Source Retrieval');
  });

  it('records real upstream formats in Gate 2/3/4 (not TBD)', () => {
    const findingPath = join(process.cwd(), 'flow/findings/2026-06-20_openspec-upstream-gates.md');
    const content = readFileSync(findingPath, 'utf-8');

    // Gate 2 — workspace format confirmed
    expect(content).toContain('registry.yaml');
    expect(content).toContain('workspaces');

    // Gate 3 — context-store format confirmed
    expect(content).toContain('context-stores');
    expect(content).toContain('.openspec-store');

    // Gate 4 — schema-fork provenance: copied directory, not a json manifest
    expect(content).toContain('openspec/schemas/');
    expect(content).toMatch(/no .*schema-forks\.json/i);
  });

  it('records parser-source retrievability + initial NFR-5 gap-registry seed (Gate 5)', () => {
    const findingPath = join(process.cwd(), 'flow/findings/2026-06-20_openspec-upstream-gates.md');
    const content = readFileSync(findingPath, 'utf-8');

    // Source retrieval outcome recorded
    expect(content).toContain('@fission-ai/openspec');
    expect(content).toMatch(/bundled.*readable|readable.*bundled/i);

    // npm `openspec` is a placeholder, not the real tool
    expect(content).toMatch(/placeholder/i);

    // Initial gap-registry seed has at least the two confirmed gaps
    expect(content).toContain('tasks.md');
    expect(content).toMatch(/removed/i);
  });
});
