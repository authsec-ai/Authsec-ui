/**
 * "Boundary · verified / applying / drifted" for a role a policy controls
 * (SPEC-iga-phase3-policy.md §9.4). The words come from that role's newest
 * deployment, so a chip never says "verified" unless a deployment did. Before
 * any deployment exists it says what the control itself says: planned, or
 * being removed. Text as well as colour; the meaning is on hover.
 *
 * Renders nothing when no policy controls the role.
 */

import { useMemo } from "react";

import { useListGovDeploymentsQuery } from "@/app/api/igaPolicyDeploymentsApi";
import type { GovControlRef } from "@/app/api/igaPolicyReadsApi";

import { StateChip, deploymentState, type StateView } from "../shared";

/** A deployment that no longer describes what is in AWS says nothing about it. */
const NOT_CURRENT = new Set(["superseded", "undone", "recovered"]);

/**
 * Only a deployment that puts a boundary on the role can make the chip say so.
 * A finished undo, control removal or split revert is `verified` too, and means
 * the opposite.
 */
const PUTS_BOUNDARY_ON = new Set(["apply", "split"]);

/** The list has no role filter, so this reads a wide page of the policy's deployments and keeps this role's. */
const PAGE = 200;

export function ControlChip({ ws, control, className }: { ws: string; control: GovControlRef | null; className?: string }) {
  const q = useListGovDeploymentsQuery({ ws, policy_id: control?.policy_id, limit: PAGE }, { skip: !ws || !control });

  const state: StateView | null = useMemo(() => {
    if (!control) return null;
    if (control.state === "removing") return { label: "Boundary · being removed", tone: "warning", hint: "AuthSec is returning this role to the boundary it had before." };
    const mine = (q.data?.data ?? []).filter((d) => d.control_id === control.id && PUTS_BOUNDARY_ON.has(d.kind));
    const newest = [...mine].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const current = newest.find((d) => !NOT_CURRENT.has(d.state)) ?? null;
    if (current) {
      const s = deploymentState(current.state, current.delivery);
      return { ...s, label: `Boundary · ${s.label.toLowerCase()}` };
    }
    if (control.state === "planned") return { label: "Boundary · planned", tone: "neutral", hint: "A policy controls this role, but nothing has been applied to AWS yet." };
    return { label: "Boundary · controlled", tone: "neutral", hint: "A policy controls this role. No deployment is current." };
  }, [control, q.data]);

  if (!state) return null;
  return <StateChip state={state} className={className} />;
}
