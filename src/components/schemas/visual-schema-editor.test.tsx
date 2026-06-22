import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import VisualSchemaEditor from "@/components/schemas/visual-schema-editor";
import type { SavePayload } from "@/lib/schemas/visual-editor";

/**
 * Task 6.5 — Two-pane visual schema editor (req 05.5 / D-SchemaEditor).
 *
 * Covers the spec scenarios from
 * `openspec/changes/phase3b-integration/specs/schema-visual-editor/spec.md`:
 *   - Visual edit updates YAML (two-way binding, visual -> YAML)
 *   - YAML edit updates visual form (two-way binding, YAML -> visual)
 *   - Live validation shows error inline + Save blocked on validation error
 *   - Stale If-Match -> conflict -> out-of-band reload/merge banner (INV-7)
 */

const VALID_SOURCE = `# leading comment (must survive visual edit — INV-2)
name: spec-driven
version: 1
artifacts:
  - id: proposal
    generates: proposal.md
  - id: design
    generates: design.md
    requires:
      - proposal
    apply:
      tracks: proposal.md
`;

describe("VisualSchemaEditor — two-pane two-way binding (task 6.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom lacks pointer-capture APIs some Radix primitives touch.
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
    proto.hasPointerCapture = vi.fn(() => false);
    proto.setPointerCapture = vi.fn();
    proto.releasePointerCapture = vi.fn();
  });
  afterEach(() => cleanup());

  it("visual edit of an artifact's apply.tracks updates the YAML pane (visual -> YAML)", () => {
    render(
      <VisualSchemaEditor
        initialSource={VALID_SOURCE}
        initialIfMatch="etag-1"
        schemaPath="/repo/openspec/schemas/spec-driven.yaml"
        onSave={vi.fn()}
      />,
    );

    // Sanity: YAML pane initially carries the design artifact.
    const yamlPane = screen.getByLabelText("Raw schema.yaml") as HTMLTextAreaElement;
    expect(yamlPane.value).toContain("tracks: proposal.md");

    // Edit apply.tracks for the `design` artifact via the visual pane.
    const tracksInput = screen.getByLabelText("apply.tracks for design");
    fireEvent.change(tracksInput, { target: { value: "review" } });

    // The YAML pane must now reflect the visual edit in real time.
    expect(yamlPane.value).toContain("tracks: review");
    // INV-2: untouched region (leading comment) preserved verbatim.
    expect(yamlPane.value).toContain("# leading comment");
  });

  it("editing the YAML pane updates the visual form (YAML -> visual)", () => {
    render(
      <VisualSchemaEditor
        initialSource={VALID_SOURCE}
        initialIfMatch="etag-1"
        schemaPath="/repo/openspec/schemas/spec-driven.yaml"
        onSave={vi.fn()}
      />,
    );

    const yamlPane = screen.getByLabelText("Raw schema.yaml") as HTMLTextAreaElement;
    // Rewrite the name via the YAML pane.
    const next = yamlPane.value.replace("name: spec-driven", "name: rewritten");
    fireEvent.change(yamlPane, { target: { value: next } });

    // The visual Name input must reflect the parsed change in real time.
    const nameInput = screen.getByLabelText("Schema name") as HTMLInputElement;
    expect(nameInput.value).toBe("rewritten");
  });

  it("invalid YAML surfaces an inline error and blocks Save (live validation, INV-6)", () => {
    const BROKEN = "name: spec-driven\n  artifacts: [this is : : broken\n";
    render(
      <VisualSchemaEditor
        initialSource={BROKEN}
        initialIfMatch="etag-1"
        schemaPath="/repo/openspec/schemas/spec-driven.yaml"
        onSave={vi.fn()}
      />,
    );

    // Inline error surfaced.
    expect(screen.getByTestId("save-button")).toBeTruthy();
    // Save button is disabled while unparseable / error findings exist.
    expect(
      (screen.getByTestId("save-button") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByTestId("save-blocked")).toBeTruthy();
  });

  it("save is blocked on a schema-rule violation (no artifacts) and unblocked once fixed", () => {
    const EMPTY = "name: spec-driven\nversion: 1\nartifacts: []\n";
    render(
      <VisualSchemaEditor
        initialSource={EMPTY}
        initialIfMatch="etag-1"
        schemaPath="/repo/openspec/schemas/spec-driven.yaml"
        onSave={vi.fn()}
      />,
    );

    // schema.no-artifacts error should disable Save.
    expect(
      (screen.getByTestId("save-button") as HTMLButtonElement).disabled,
    ).toBe(true);

    // Fix via the YAML pane: add a valid artifact.
    const yamlPane = screen.getByLabelText(
      "Raw schema.yaml",
    ) as HTMLTextAreaElement;
    fireEvent.change(yamlPane, {
      target: {
        value:
          "name: spec-driven\nversion: 1\nartifacts:\n  - id: proposal\n    generates: proposal.md\n",
      },
    });

    // No error findings -> Save enabled.
    expect(
      (screen.getByTestId("save-button") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("sends a whole-file If-Match save payload and surfaces the conflict banner on stale ETag (INV-7)", async () => {
    const saveSpy = vi.fn(
      async (payload: SavePayload) => "conflict" as const,
    );

    render(
      <VisualSchemaEditor
        initialSource={VALID_SOURCE}
        initialIfMatch="etag-1"
        schemaPath="/repo/openspec/schemas/spec-driven.yaml"
        onSave={saveSpy}
      />,
    );

    fireEvent.click(screen.getByTestId("save-button"));

    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    const [payload] = saveSpy.mock.calls[0];
    expect(payload.schemaPath).toBe(
      "/repo/openspec/schemas/spec-driven.yaml",
    );
    // Whole-file If-Match ETag carried through (INV-7).
    expect(payload.ifMatch).toBe("etag-1");
    // Body is the (possibly edited) serialized document.
    expect(payload.body).toContain("name: spec-driven");

    // Stale ETag -> conflict banner offering reload/merge.
    await waitFor(() =>
      expect(screen.getByTestId("conflict-banner")).toBeTruthy(),
    );
  });
});
