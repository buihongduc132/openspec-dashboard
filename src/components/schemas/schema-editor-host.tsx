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
import { useCallback } from "react";
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
  const onSave = useCallback(
    async (payload: SavePayload): Promise<SaveStatus> => {
      try {
        const res = await fetch(`/api/schemas/${schemaId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "If-Match": payload.ifMatch,
          },
          body: JSON.stringify({ body: payload.body }),
        });
        if (res.ok) return "saved";
        if (res.status === 409) return "conflict";
        return "error";
      } catch {
        return "error";
      }
    },
    [schemaId],
  );

  return (
    <VisualSchemaEditor
      initialSource={initialSource}
      initialIfMatch={initialIfMatch}
      schemaPath={schemaPath}
      onSave={onSave}
    />
  );
}
