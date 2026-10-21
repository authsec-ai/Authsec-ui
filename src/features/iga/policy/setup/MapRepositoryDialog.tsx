/**
 * Map a GitHub repository directory to one AWS account (SPEC-iga-phase3-policy.md
 * §7.9, §8.11, §9.3 S9 "iac"). The repository is typed as `owner/name`: no route
 * lists a GitHub connection's repositories. The GitHub connection is chosen from
 * the connections list (a `provider: "github"` connection's id is the discovery
 * source the server checks).
 *
 * Mapping asks the GitHub App for contents and pull-request write on the
 * installation. If its owner still has to accept, the answer says so and the
 * dialog keeps that in view after the mapping is saved.
 */

import { useEffect, useId, useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "react-hot-toast";

import type { Connection } from "@/app/api/connectionsApi";
import { useCreateIacSourceMutation, type GovIaCFormat, type GovIaCSourceView } from "@/app/api/igaPolicySetupApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { usePolicyAction } from "../shared";
import { ActionDialog } from "./ActionDialog";
import { GithubPermissionNote } from "./GithubPermissionNote";
import {
  IAC_FORMATS,
  branchProblem,
  cleanRules,
  directoryProblem,
  repositoryProblem,
  ruleProblem,
  type RuleDraft,
} from "./iacModel";

const selectClass =
  "h-10 w-full rounded-md border border-(--color-border-strong) bg-(--color-surface-raised) px-2.5 text-sm text-(--color-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-focus-ring)";

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-(--color-text)">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-(--color-danger-text)">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-(--color-text-muted)">{hint}</p>
      ) : null}
    </div>
  );
}

export function MapRepositoryDialog({
  account,
  github,
  open,
  onOpenChange,
}: {
  account: Connection;
  /** The workspace's GitHub connections (`provider: "github"`). */
  github: Connection[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const uid = useId();
  const [create] = useCreateIacSourceMutation();
  const action = usePolicyAction("governance:enforce");
  const [sourceId, setSourceId] = useState("");
  const [repository, setRepository] = useState("");
  const [format, setFormat] = useState<GovIaCFormat>("terraform");
  const [directory, setDirectory] = useState("");
  const [branch, setBranch] = useState("");
  const [rules, setRules] = useState<RuleDraft[]>([]);
  const [touched, setTouched] = useState(false);
  const [created, setCreated] = useState<GovIaCSourceView | null>(null);

  useEffect(() => {
    if (!open) {
      setSourceId("");
      setRepository("");
      setFormat("terraform");
      setDirectory("");
      setBranch("");
      setRules([]);
      setTouched(false);
      setCreated(null);
      action.clear();
    }
    // `action.clear` is a fresh closure each render; closing is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // One GitHub connection is the only choice there is.
  const chosen = sourceId || (github.length === 1 ? github[0].id : "");
  const connection = github.find((g) => g.id === chosen);
  const formatInfo = IAC_FORMATS.find((f) => f.value === format) ?? IAC_FORMATS[0];

  const problems = {
    source: chosen ? null : "Choose a GitHub connection.",
    repository: repositoryProblem(repository),
    directory: directoryProblem(directory),
    branch: branchProblem(branch),
  };
  const ruleProblems = rules.map(ruleProblem);
  const invalid = Object.values(problems).some(Boolean) || ruleProblems.some(Boolean);

  async function submit() {
    setTouched(true);
    if (invalid) return;
    const role_match = cleanRules(rules);
    const view = await action.run(() =>
      create({
        connectorId: account.id,
        format,
        discovery_source_id: chosen,
        repository: repository.trim(),
        directory: directory.trim(),
        ...(branch.trim() ? { base_branch: branch.trim() } : {}),
        ...(role_match.length > 0 ? { role_match: { rules: role_match } } : {}),
      }),
    );
    if (view) {
      toast.success("Repository mapped");
      if (view.permissions.state === "granted") onOpenChange(false);
      else setCreated(view);
    }
  }

  const name = account.name || account.native_id;
  const description = `AWS account ${account.native_id}${name !== account.native_id ? ` · ${name}` : ""}`;

  if (created) {
    return (
      <ActionDialog open={open} onOpenChange={onOpenChange} title="Repository mapped" description={description} wide>
        <p>
          <span className="font-mono">{created.repository}</span> is mapped to this account.
        </p>
        <GithubPermissionNote permissions={created.permissions} />
      </ActionDialog>
    );
  }

  const show = (p: string | null) => (touched ? p : null);

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Map a repository"
      description={description}
      confirmLabel="Map repository"
      busyLabel="Mapping…"
      pending={action.pending}
      failure={action.failure}
      onConfirm={() => void submit()}
      confirmDisabled={github.length === 0}
      wide
    >
      <p className="text-(--color-text-muted)">
        When a change to a role in this account is delivered by pull request, AuthSec edits the infrastructure code in this directory. It opens
        the pull request only after a person approves the change.
      </p>

      {github.length === 0 ? (
        <p className="text-(--color-warning-text)">
          No GitHub connection exists in this workspace.{" "}
          <Link to="/iga/connections" className="font-medium underline">
            Open Accounts
          </Link>{" "}
          to add one, then map a repository.
        </p>
      ) : (
        <div className="space-y-3">
          <Field id={`${uid}-source`} label="GitHub connection" error={show(problems.source)}>
            <select
              id={`${uid}-source`}
              className={selectClass}
              value={chosen}
              onChange={(e) => setSourceId(e.target.value)}
              aria-invalid={touched && !!problems.source}
            >
              <option value="">Choose a connection</option>
              {github.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name || g.native_id}
                  {g.name && g.name !== g.native_id ? ` (${g.native_id})` : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field
            id={`${uid}-repo`}
            label="Repository"
            hint={connection ? `Written owner/name, for example ${connection.native_id}/infrastructure.` : "Written owner/name."}
            error={show(problems.repository)}
          >
            <Input
              id={`${uid}-repo`}
              value={repository}
              onChange={(e) => setRepository(e.target.value)}
              placeholder="owner/name"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={touched && !!problems.repository}
              aria-describedby={touched && problems.repository ? `${uid}-repo-error` : undefined}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`${uid}-format`} label="Format">
              <select id={`${uid}-format`} className={selectClass} value={format} onChange={(e) => setFormat(e.target.value as GovIaCFormat)}>
                {IAC_FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              id={`${uid}-branch`}
              label="Base branch (optional)"
              hint="Pull requests are opened against it. Defaults to main."
              error={show(problems.branch)}
            >
              <Input
                id={`${uid}-branch`}
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="main"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={touched && !!problems.branch}
                aria-describedby={touched && problems.branch ? `${uid}-branch-error` : undefined}
              />
            </Field>
          </div>

          <Field
            id={`${uid}-dir`}
            label="Directory"
            hint="Where this account's roles are defined, relative to the repository. Empty is the repository root."
            error={show(problems.directory)}
          >
            <Input
              id={`${uid}-dir`}
              value={directory}
              onChange={(e) => setDirectory(e.target.value)}
              placeholder="iam/prod"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={touched && !!problems.directory}
              aria-describedby={touched && problems.directory ? `${uid}-dir-error` : undefined}
            />
          </Field>

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-(--color-text)">Role matching (optional)</legend>
            <p className="text-xs text-(--color-text-muted)">
              Without a rule, AuthSec finds a role by its literal name. A rule names the {formatInfo.label} {formatInfo.resource} that defines a role,
              for example {formatInfo.example}. A role name may end in one *.
            </p>
            {rules.map((r, i) => {
              const problem = touched ? ruleProblems[i] : null;
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-start gap-2">
                    <Input
                      aria-label={`Role name, rule ${i + 1}`}
                      value={r.role_name}
                      onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, role_name: e.target.value } : x)))}
                      placeholder="RefundTaskRole"
                      autoComplete="off"
                      spellCheck={false}
                      aria-invalid={!!problem}
                    />
                    <Input
                      aria-label={`${formatInfo.resource}, rule ${i + 1}`}
                      value={r.resource}
                      onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, resource: e.target.value } : x)))}
                      placeholder={formatInfo.example}
                      autoComplete="off"
                      spellCheck={false}
                      aria-invalid={!!problem}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove rule ${i + 1}`}
                      onClick={() => setRules(rules.filter((_, j) => j !== i))}
                    >
                      <X aria-hidden="true" className="text-(--color-text-muted)" />
                    </Button>
                  </div>
                  {problem ? <p className="text-xs text-(--color-danger-text)">{problem}</p> : null}
                </div>
              );
            })}
            <Button type="button" variant="outline" size="sm" onClick={() => setRules([...rules, { role_name: "", resource: "" }])}>
              <Plus aria-hidden="true" />
              Add a rule
            </Button>
          </fieldset>

          <p className="text-xs text-(--color-text-muted)">
            Mapping asks the GitHub App for contents and pull-request write access on this connection. If its owner has not accepted that yet,
            AuthSec shows what is still needed and cannot open pull requests until it is granted.
          </p>
        </div>
      )}
    </ActionDialog>
  );
}
