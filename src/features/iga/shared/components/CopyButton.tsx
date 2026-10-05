import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/clipboard";

/**
 * Copies `value` and says only what happened: "Copied" appears once the
 * browser has accepted the write; a refusal toasts its own failure and the
 * label stays "Copy …" (lib/clipboard.ts).
 */
export function CopyButton({ value, label, what }: { value: string; label: string; what: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        const ok = await copyToClipboard(value, what, { toastSuccess: false });
        window.clearTimeout(timer.current);
        setCopied(ok);
        if (ok) timer.current = window.setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </Button>
  );
}
