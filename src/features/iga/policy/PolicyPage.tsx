/**
 * Policy — a reserved destination (SPEC-console-revamp.md, "Policy — reserved
 * destination"). It states what the page is for and nothing else: no network
 * call, no sample screens, no control that looks operational.
 */

import { Link } from "react-router-dom";

import { ConsolePage } from "@/components/console/ConsolePage";
import { toneClasses } from "@/components/console/status";
import { cn } from "@/lib/utils";

const LINK_CLASS =
  "inline-flex h-9 items-center rounded-md border border-(--color-border-strong) bg-(--color-surface-raised) px-3.5 text-sm font-semibold text-(--color-text) transition hover:bg-(--color-surface-subtle)";

export default function PolicyPage() {
  return (
    <ConsolePage title="Policy" description="Decisions about what discovered objects may do.">
      <div role="note" className={cn("rounded-lg border px-4 py-3", toneClasses.neutral.banner)}>
        <p className="text-sm font-semibold text-(--color-text)">
          Preview — sample data. Nothing here is evaluated or enforced.
        </p>
      </div>

      <section className="max-w-3xl space-y-4 rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised) px-5 py-4">
        <h2 className="text-[13px] font-semibold leading-5 text-(--color-text)">What Policy will hold</h2>
        <p className="text-sm leading-6 text-(--color-text)">
          Policy will hold your decisions about which discovered objects may do what — for example, which workloads may
          reach a given resource — and check each decision against what discovery found, so a rule is judged against the
          objects in your inventory rather than against a description of them.
        </p>
        <nav aria-label="Related screens" className="flex flex-wrap gap-2">
          <Link to="/iga/discovery" className={LINK_CLASS}>
            Open Discovery
          </Link>
          <Link to="/iga/connections" className={LINK_CLASS}>
            Open Connections
          </Link>
        </nav>
      </section>
    </ConsolePage>
  );
}
