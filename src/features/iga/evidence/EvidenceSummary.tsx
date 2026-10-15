/**
 * An object's Overview › Evidence: when AuthSec last read the object and from
 * where, with the full records one click away in the page's evidence panel
 * (`?evidence=<object ref>`, the same panel a graph line opens). The graph's
 * selection card points here through Open details instead of carrying its own
 * evidence button for objects.
 */

import type { ReactNode } from "react";
import { FileSearch } from "lucide-react";

import type { GraphRef } from "@/app/api/igaGraphApi";

import { Facts, Panel } from "../shared/components/Panel";
import { useEvidence } from "./useEvidence";

export function EvidenceSummary({ objectRef, children }: { objectRef: GraphRef; children: ReactNode }) {
  const { open } = useEvidence();
  return (
    <Panel
      title="Evidence"
      actions={
        <button
          type="button"
          onClick={() => open(objectRef)}
          className="inline-flex items-center gap-1 font-medium text-(--color-primary-text) hover:underline"
        >
          <FileSearch className="size-3.5" aria-hidden="true" />
          View source records
        </button>
      }
    >
      <Facts>{children}</Facts>
    </Panel>
  );
}
