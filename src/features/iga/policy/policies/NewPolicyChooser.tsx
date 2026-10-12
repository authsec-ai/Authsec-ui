/**
 * "New policy" (SPEC-iga-phase3-policy.md §9.3 S7): a policy starts from
 * something AuthSec already found, so the chooser lists the kinds of change
 * the way the spec's table does, and each one either goes where it starts or
 * says why it cannot yet. A disabled choice states its reason; nothing is
 * hidden to keep the list short.
 */

import { ArrowRight, Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getWorkspaceId } from "@/utils/workspace";

import { usePolicyCapabilities, usePolicyPermission } from "../shared";

interface Choice {
  key: string;
  title: string;
  /** What it does. */
  body: string;
  to?: string;
  /** Present exactly when the choice cannot be used, in words. */
  unavailable?: string;
}

export function NewPolicyButton() {
  const [open, setOpen] = useState(false);
  const author = usePolicyPermission("governance:author");
  if (author.refused) return null;
  return (
    <>
      <Button className="text-white" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" />
        New policy
      </Button>
      <NewPolicyDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function NewPolicyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const caps = usePolicyCapabilities(getWorkspaceId() ?? "");

  const choices: Choice[] = [
    {
      key: "right_size",
      title: "Right-size AWS roles from observed use",
      body: "Restrict the AWS services a role has not used, keeping the ones it has. Starts from a finding or a role you pick.",
      to: "/iga/policy/new",
      unavailable: caps.feature("proposals") ? undefined : (caps.featureReason("proposals") ?? "Proposals are not available on this server."),
    },
    {
      key: "broad_grant",
      title: "Remove a broad wildcard grant",
      body: "Open the findings for grants that allow everything, and start from one.",
      to: "/iga/policy/findings?kind=broad_grant",
    },
    {
      key: "owners",
      title: "Assign owners from AWS tags",
      body: "Set an owner rule that reads an AWS tag, then see which roles still have no owner.",
      to: "/iga/policy/setup/owner-rules",
    },
    {
      key: "review_date",
      title: "Require a review date",
      body: "Turn on a finding rule that flags workloads whose owner has no review date.",
      to: "/iga/policy/setup/rules",
    },
    {
      key: "k8s",
      title: "Kubernetes RBAC right-size",
      body: "Right-size what a service account may do in a cluster.",
      unavailable: caps.providerReason("k8s") ?? "Not yet supported: needs authenticated collection (K-1).",
    },
    {
      key: "action_level",
      title: "Action-level right-sizing",
      body: "Narrow the actions inside a service a role keeps. AuthSec restricts whole services today.",
      unavailable: "Needs CloudTrail history (R1b).",
    },
    {
      key: "time_bound",
      title: "Time-bound access",
      body: "Access that ends on its own.",
      unavailable: "Planned (R2).",
    },
    {
      key: "gateway",
      title: "Gateway tool controls",
      body: "Control which tools an agent may call.",
      unavailable: "Planned (R3).",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New policy</DialogTitle>
          <DialogDescription>Choose the kind of change. A policy always starts from what AuthSec has observed.</DialogDescription>
        </DialogHeader>
        <ul className="-mx-1 max-h-[60vh] divide-y divide-(--color-border-subtle) overflow-y-auto">
          {choices.map((c) => {
            const off = c.unavailable !== undefined || !c.to;
            return (
              <li key={c.key} className="px-1">
                <button
                  type="button"
                  disabled={off}
                  onClick={() => {
                    if (!c.to) return;
                    onOpenChange(false);
                    navigate(c.to);
                  }}
                  className="flex w-full items-start gap-3 rounded-md px-2 py-3 text-left transition-colors enabled:hover:bg-(--color-surface-subtle) disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-(--color-primary)"
                >
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[13px] font-medium ${off ? "text-(--color-text-muted)" : "text-(--color-text)"}`}>{c.title}</span>
                    <span className="block text-xs text-(--color-text-muted)">{c.body}</span>
                    {off ? <span className="mt-0.5 block text-xs font-medium text-(--color-warning-text)">{c.unavailable ?? "Not available yet."}</span> : null}
                  </span>
                  {!off ? <ArrowRight className="mt-0.5 size-4 shrink-0 text-(--color-text-muted)" aria-hidden="true" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
