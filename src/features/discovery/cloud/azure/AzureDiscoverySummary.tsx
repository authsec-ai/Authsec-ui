/**
 * Everything Azure discovery has written to AuthSec's graph, counted: a strip
 * above the Azure lists of Discovery, and a drawer with every kind (resource
 * types, identity kinds, grant paths, …) by state. Read from
 * `/authsec/discovery/azure/graph/summary`, which covers every Azure tenant of
 * the workspace. Counts only; nothing is rated.
 */

import { useMemo, useState } from "react";

import { useGetAzureGraphSummaryQuery } from "@/app/api/cloudDiscoveryApi";
import { DrawerBody, DrawerHeader, DrawerSection } from "@/components/console/detail";
import { RightDrawer } from "@/components/primitives/RightDrawer";

import { isPresentState, stateLabel, summarizeGraph, type SummarySection } from "./azureGraphSummary";

const MUTED = "text-(--color-text-muted)";
const fmt = (n: number) => n.toLocaleString();
const nounOf = (s: SummarySection, n: number) => (n === 1 ? s.noun[0] : s.noun[1]);

function SectionTable({ s }: { s: SummarySection }) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className={`text-left text-xs ${MUTED}`}>
          <th className="pb-1.5 font-medium">Type</th>
          <th className="pb-1.5 text-right font-medium">In Azure</th>
          <th className="pb-1.5 pl-3 font-medium">By status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-(--color-border-subtle)">
        {s.kinds.map((k) => (
          <tr key={k.kind} className="align-top">
            <td className="py-1.5 pr-2">{k.label}</td>
            <td className="py-1.5 text-right tabular-nums">{fmt(k.present)}</td>
            <td className={`py-1.5 pl-3 text-xs ${MUTED}`}>
              {k.byState.map((st) => (
                <span key={st.state} className={`mr-2 inline-block whitespace-nowrap ${isPresentState(st.state) ? "" : "line-through decoration-1"}`}>
                  {stateLabel(st.state)} {fmt(st.count)}
                </span>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AzureDiscoverySummary() {
  const q = useGetAzureGraphSummaryQuery();
  const [open, setOpen] = useState(false);
  const sections = useMemo(() => summarizeGraph(q.data?.rows ?? []), [q.data]);

  // The strip holds its place while it loads, so the lists do not jump when it arrives.
  if (q.isLoading) return <div className="h-[42px] animate-pulse rounded-lg bg-(--color-surface-subtle)" aria-hidden="true" />;
  // A failed or empty read, or a graph that is not ready, says nothing here: the lists below carry their own states.
  if (!q.data || !sections.length) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised) px-4 py-2.5 text-[13px]">
        <span className="font-semibold">Discovered in Azure</span>
        {sections.map((s) => (
          <span key={s.table} className="whitespace-nowrap">
            <span className="font-medium tabular-nums">{fmt(s.present)}</span> <span className={MUTED}>{nounOf(s, s.present)}</span>
          </span>
        ))}
        <button type="button" onClick={() => setOpen(true)} className="ml-auto text-xs font-medium text-(--color-primary-text) hover:underline">
          See every type
        </button>
      </div>
      <RightDrawer open={open} onClose={() => setOpen(false)} width={640} ariaTitle="Discovered in Azure" ariaDescription="Every type Azure discovery recorded, counted by status.">
        <DrawerHeader title="Discovered in Azure" subtitle="Everything AuthSec found across your connected Azure tenants. Struck-through counts are no longer in Azure." />
        <DrawerBody>
          {sections.map((s) => (
            <DrawerSection key={s.table} label={`${s.label} · ${fmt(s.present)}`}>
              <SectionTable s={s} />
            </DrawerSection>
          ))}
        </DrawerBody>
      </RightDrawer>
    </>
  );
}
