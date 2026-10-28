/**
 * PolicyJsonEditor — form/JSON toggle editor for runtime policy documents.
 *
 * Two modes:
 * - "Form" — delegates to the caller's form UI (renders `children`).
 * - "JSON" — a monospace textarea for direct JSON editing.
 *
 * Validates the JSON via `JSON.parse` on mode switch and on save.
 * Calls `onChange` with the parsed object whenever valid JSON is saved
 * or the mode switches back to form.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { Code2, FormInput, AlertCircle, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Panel } from "@/features/iga/shared/components/Panel";

// ── Types ────────────────────────────────────────────────────────────────────

type EditorMode = "form" | "json";

interface PolicyJsonEditorProps {
  /** The current document object. */
  document: object;
  /** Called when the document changes (from either mode). */
  onChange: (doc: object) => void;
  /** Optional children rendered in "form" mode. */
  children?: React.ReactNode;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatJson(obj: object): string {
  return JSON.stringify(obj, null, 2);
}

function tryParseJson(raw: string): { ok: true; value: object } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "Document must be a JSON object." };
    }
    return { ok: true, value: parsed as object };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Invalid JSON" };
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function PolicyJsonEditor({ document, onChange, children }: PolicyJsonEditorProps) {
  const [mode, setMode] = useState<EditorMode>("form");
  const [jsonText, setJsonText] = useState(() => formatJson(document));
  const [parseError, setParseError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync external document changes into the JSON textarea when in form mode.
  useEffect(() => {
    if (mode === "form") {
      setJsonText(formatJson(document));
      setParseError(null);
    }
  }, [document, mode]);

  // ── Mode switching ──────────────────────────────────────────────────────

  const switchToJson = useCallback(() => {
    setJsonText(formatJson(document));
    setParseError(null);
    setMode("json");
  }, [document]);

  const switchToForm = useCallback(() => {
    const result = tryParseJson(jsonText);
    if (!result.ok) {
      setParseError(result.error);
      toast.error("Fix JSON errors before switching to form mode.");
      return;
    }
    setParseError(null);
    onChange(result.value);
    setMode("form");
  }, [jsonText, onChange]);

  // ── JSON apply ──────────────────────────────────────────────────────────

  const handleApplyJson = useCallback(() => {
    const result = tryParseJson(jsonText);
    if (!result.ok) {
      setParseError(result.error);
      toast.error("Invalid JSON: " + result.error);
      return;
    }
    setParseError(null);
    onChange(result.value);
    toast.success("JSON applied.");
  }, [jsonText, onChange]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <Panel
      title="Policy Document"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant={mode === "form" ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={mode === "form" ? undefined : switchToForm}
          >
            <FormInput className="size-3.5" />
            Form
          </Button>
          <Button
            variant={mode === "json" ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={mode === "json" ? undefined : switchToJson}
          >
            <Code2 className="size-3.5" />
            JSON
          </Button>
        </div>
      }
    >
      {mode === "form" ? (
        <div>{children}</div>
      ) : (
        <div className="space-y-3">
          <textarea
            ref={textareaRef}
            className={
              "min-h-[320px] w-full resize-y rounded-md border p-3 font-mono text-xs leading-relaxed " +
              "bg-(--color-surface-subtle) text-(--color-text) " +
              (parseError
                ? "border-(--color-danger-border) focus:ring-(--color-danger-border)"
                : "border-(--color-border-subtle) focus:ring-(--color-primary)")
            }
            spellCheck={false}
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              if (parseError) setParseError(null);
            }}
          />

          {parseError && (
            <p className="flex items-center gap-1.5 text-xs text-(--color-danger-text)">
              <AlertCircle className="size-3.5 shrink-0" />
              {parseError}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button size="sm" className="gap-1.5" onClick={handleApplyJson}>
              <Check className="size-3.5" />
              Apply JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setJsonText(formatJson(document));
                setParseError(null);
              }}
            >
              Reset
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
