/**
 * Task 5.7 (RED) — Read-only quarantine on chain break
 * (change `phase0-foundations`, spec `audit-chain`, req
 * "Read-only quarantine on chain break").
 *
 * On a detected chain break, the server enters read-only quarantine:
 *   - mutating endpoints return 503 with a quarantine reason,
 *   - read endpoints continue to serve (200).
 *
 * Scenarios covered (RED):
 *   - Quarantine blocks mutations: once entered, PUT/POST/PATCH/DELETE return
 *     503 with the quarantine reason.
 *   - Reads remain available during quarantine: GET still reaches the handler.
 *   - After operator clears the quarantine, mutations flow again.
 */
import { describe, expect, it } from "vitest";
import {
  createQuarantineState,
  withQuarantineGate,
  type QuarantineReason,
} from "./quarantine";

const MUTATING_METHODS = ["PUT", "POST", "PATCH", "DELETE"] as const;

function okHandler(): (req: Request) => Promise<Response> {
  return async () => new Response("ok", { status: 200 });
}

function reasonFor(projectId = "p-1"): QuarantineReason {
  return {
    projectId,
    findings: [
      { index: 2, kind: "hash_mismatch", entry: {} as never },
    ],
  };
}

describe("quarantine — mutations blocked while reads pass", () => {
  it("returns 503 with a quarantine reason for mutating methods once entered", async () => {
    const state = createQuarantineState();
    const handler = withQuarantineGate(okHandler(), state);
    state.enter(reasonFor());

    for (const method of MUTATING_METHODS) {
      const res = await handler(new Request("https://x/api/x", { method }));
      expect(res.status).toBe(503);
      const body = (await res.json()) as { error: string; quarantine: boolean; reason: unknown };
      expect(body.error).toBe("quarantine");
      expect(body.quarantine).toBe(true);
      expect(body.reason).toBeDefined();
    }
  });

  it("read endpoints still serve 200 during quarantine", async () => {
    const state = createQuarantineState();
    const handler = withQuarantineGate(okHandler(), state);
    state.enter(reasonFor());

    const res = await handler(new Request("https://x/api/x", { method: "GET" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("lets mutations through again once an operator clears quarantine", async () => {
    const state = createQuarantineState();
    const handler = withQuarantineGate(okHandler(), state);
    state.enter(reasonFor());
    state.clear();

    const res = await handler(new Request("https://x/api/x", { method: "PUT" }));
    expect(res.status).toBe(200);
  });

  it("mutations pass through when quarantine has never been entered", async () => {
    const state = createQuarantineState();
    const handler = withQuarantineGate(okHandler(), state);

    const res = await handler(new Request("https://x/api/x", { method: "POST" }));
    expect(res.status).toBe(200);
  });
});
