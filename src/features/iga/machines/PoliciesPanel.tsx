/**
 * Agent policies (authsec.ai/v1 AgentPolicy YAML), one per agent, kept for
 * the whole workspace: every connected machine applies them within a minute,
 * ahead of a local policy for the same agent. "*" is the default, used by
 * agents without their own.
 *
 * A save names the version it was edited from; if someone saved in between
 * the server answers 409 and nothing is overwritten. A machine runs
 * `policy check` on what it pulls and keeps its previous policy when a new one
 * does not pass, saying so in the logs.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";

import {
  useListAgentKitPoliciesQuery,
  useListAgentKitPolicyVersionsQuery,
  usePutAgentKitPolicyMutation,
  type AgentKitPolicy,
} from "@/app/api/agentkitApi";
import { useListDiscoveredAgentsQuery } from "@/app/api/discoveryApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConnPill } from "@/features/iga/connections/ConnPill";
import { agoText } from "@/features/iga/shared/labels";

import { MUTED } from "./MachineParts";
import { machineAgentId, policyProblem, starterPolicy } from "./machinesModel";

const modeOf = (doc: string) => /^mode:\s*(\S+)/m.exec(doc)?.[1] ?? "";

export function PoliciesPanel({
  agent,
  onAgent,
}: {
  agent?: string;
  onAgent: (id: string) => void;
}) {
  const pols = useListAgentKitPoliciesQuery();
  const agents = useListDiscoveredAgentsQuery({
    source: "vm_sensor",
    limit: 200,
  });

  // Every agent with a policy, every agent a machine reported, and the default.
  const ids = useMemo(() => {
    const s = new Set<string>(["*"]);
    for (const p of pols.data ?? []) s.add(p.agent_id);
    for (const a of agents.data?.agents ?? []) {
      const id = machineAgentId(a);
      if (id) s.add(id);
    }
    return [...s].sort((a, b) =>
      a === "*" ? -1 : b === "*" ? 1 : a.localeCompare(b),
    );
  }, [pols.data, agents.data]);
  const current = agent && ids.includes(agent) ? agent : agent || ids[0];
  const latest = pols.data?.find((p) => p.agent_id === current);

  if (pols.isLoading)
    return <p className={`py-6 text-sm ${MUTED}`}>Loading policies…</p>;
  if (pols.isError)
    return (
      <p className="py-6 text-sm text-(--color-danger-text)">
        Policies could not be loaded.
      </p>
    );

  return (
    <div className="grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
      <nav aria-label="Agents" className="space-y-1">
        {ids.map((id) => {
          const p = pols.data?.find((x) => x.agent_id === id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => onAgent(id)}
              className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
                id === current
                  ? "bg-(--color-surface-subtle) font-medium"
                  : "hover:bg-(--color-surface-subtle)/60"
              }`}
            >
              <span className="truncate font-mono text-xs">
                {id === "*" ? "* (default)" : id}
              </span>
              {p ? (
                <ConnPill
                  tone={modeOf(p.document) === "enforce" ? "success" : "muted"}
                >
                  {modeOf(p.document) || "?"} v{p.version}
                </ConnPill>
              ) : (
                <span className={`text-xs ${MUTED}`}>none</span>
              )}
            </button>
          );
        })}
      </nav>
      {current ? (
        <PolicyEditor
          key={`${current}:${latest?.version ?? 0}`}
          agent={current}
          latest={latest}
        />
      ) : null}
    </div>
  );
}

function PolicyEditor({
  agent,
  latest,
}: {
  agent: string;
  latest?: AgentKitPolicy;
}) {
  const [doc, setDoc] = useState(latest?.document ?? starterPolicy(agent));
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [save, saving] = usePutAgentKitPolicyMutation();
  const versions = useListAgentKitPolicyVersionsQuery(agent, { skip: !latest });
  const base = latest?.version ?? 0;
  const dirty = doc !== (latest?.document ?? "");
  const problem = policyProblem(agent, doc);

  useEffect(() => setError(null), [doc]);

  const submit = async () => {
    setError(null);
    try {
      const r = await save({
        agent,
        document: doc,
        comment: comment.trim(),
        base_version: base,
      }).unwrap();
      setComment("");
      toast.success(
        r.created
          ? `Saved ${agent} version ${r.policy.version}. Machines apply it within a minute.`
          : "No change: it is the current version.",
      );
    } catch (e) {
      const err = e as { status?: number; data?: { error?: string } };
      if (err.status === 409)
        setError(
          "Someone saved this policy after you opened it. Copy your changes, reload the page and edit the new version.",
        );
      else if (err.status === 403)
        setError("Your role cannot change policies: it needs discovery:admin.");
      else setError(err.data?.error ?? "The policy could not be saved.");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-semibold">
          {agent === "*" ? "Default policy (*)" : agent}
        </h3>
        <span className={`text-xs ${MUTED}`}>
          {latest
            ? `version ${latest.version}, saved ${agoText(latest.created_at)}${latest.comment ? ` — ${latest.comment}` : ""}`
            : "not saved yet: a starting policy in monitor mode"}
        </span>
      </div>
      <Textarea
        aria-label={`Policy for ${agent}`}
        value={doc}
        spellCheck={false}
        onChange={(e) => setDoc(e.target.value)}
        className="min-h-[24rem] font-mono text-xs leading-5"
        onKeyDown={(e) => {
          // Tab indents instead of leaving the editor (YAML is indentation).
          if (e.key === "Tab" && !e.shiftKey) {
            e.preventDefault();
            const t = e.currentTarget;
            const { selectionStart: s, selectionEnd: end } = t;
            const next = `${doc.slice(0, s)}  ${doc.slice(end)}`;
            setDoc(next);
            requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2));
          }
        }}
      />
      <p className={`text-xs ${MUTED}`}>
        mode: monitor logs what would be blocked; enforce blocks it. Rules:
        network allow/deny by host, *.domain or cidr (and port); filesystem
        read_write/read_only/deny paths ({"{home}"}, {"{project}"}); commands
        allow/ask/deny patterns; mcp_servers allow/deny.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="What changed (optional)"
          className="max-w-sm"
          maxLength={500}
        />
        <Button
          onClick={() => void submit()}
          disabled={!dirty || !!problem || saving.isLoading}
        >
          {saving.isLoading
            ? "Saving…"
            : latest
              ? `Save as version ${base + 1}`
              : "Save"}
        </Button>
        {dirty && latest ? (
          <Button variant="outline" onClick={() => setDoc(latest.document)}>
            Discard changes
          </Button>
        ) : null}
        {problem && dirty ? (
          <span className="text-xs text-(--color-warning-text)">{problem}</span>
        ) : null}
      </div>
      {error ? (
        <p className="text-xs text-(--color-danger-text)">{error}</p>
      ) : null}
      {versions.data && versions.data.length > 1 ? (
        <details className="text-xs">
          <summary className="cursor-pointer">
            History ({versions.data.length} versions)
          </summary>
          <ul className="mt-2 space-y-1">
            {versions.data.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-2">
                <span className="font-mono">v{v.version}</span>
                <span className={MUTED}>{agoText(v.created_at)}</span>
                <span>{v.comment}</span>
                {v.version !== latest?.version ? (
                  <button
                    type="button"
                    className="text-(--color-primary-text) hover:underline"
                    onClick={() => setDoc(v.document)}
                  >
                    Load into the editor
                  </button>
                ) : (
                  <span className={MUTED}>current</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
