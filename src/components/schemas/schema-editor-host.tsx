"use client";

/**
 * Task 6.5 — Client host for the two-pane visual schema editor.
 *
 * Loads nothing itself; the server page passes the initial schema source +
 * whole-file ETag. This component owns the network save: it PATCHes
 * `/api/schemas/[id]` with the `If-Match` ETag and translates the HTTP
 * status into the `SaveStatus` the editor consumes (200 -> saved,
 * 409 -> conflict / out-of-band, 422 -> error).
 */
import { useCallback, useState } from "react";
import VisualSchemaEditor, { type SaveStatus } from "@/components/schemas/visual-schema-editor";
import type { SavePayload } from "@/lib/schemas/visual-editor";

export interface SchemaEditorHostProps {
  schemaId: string;
  initialSource: string;
  initialIfMatch: string;
  schemaPath: string;
}

export default function SchemaEditorHost({
  schemaId,
  initialSource,
  initialIfMatch,
  schemaPath,
}: SchemaEditorHostProps) {
  const [currentIfMatch, setCurrentIfMatch] = useState(initialIfMatch);

  const onSave = useCallback(
    async (payload: SavePayload): Promise<SaveStatus> => {
      try {
        const res = await fetch(`/api/schemas/${schemaId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            // Use the host-tracked ETag so subsequent saves after a
            // successful PATCH carry the fresh version rather than the
            // stale value baked into the editor's initial state.
            "If-Match": currentIfMatch,
          },
          body: JSON.stringify({ body: payload.body }),
        });
        if (res.ok) {
          // The server returns the new whole-file ETag in the PATCH response
          // body ({ ok: true, etag }). Read it from the body (not an HTTP
          // header — the route sets none) so subsequent saves carry the fresh
          // version instead of the stale initial ETag.
          const data = (await res.json().catch(() => null)) as
            | { etag?: string }
            | null;
          if (data?.etag) {
            setCurrentIfMatch(data.etag);
          }
          return "saved";
        }
        if (res.status === 409) return "conflict";
        return "error";
      } catch {
        return "error";
      }
    },
    [schemaId, currentIfMatch],
  );

  return (
    <VisualSchemaEditor
      initialSource={initialSource}
      initialIfMatch={currentIfMatch}
      schemaPath={schemaPath}
      onSave={onSave}
    />
  );
}
