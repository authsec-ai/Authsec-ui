/**
 * The evidence behind a declared (repository-scanned) finding.
 *
 * Every claim this panel makes has to be traceable to the artefact it came
 * from, so the repository and file path are links: an admin deciding whether to
 * claim or quarantine an agent should be one click from the actual file, not
 * reading our summary of it.
 *
 * Two things are deliberately never shown, because they are never stored:
 * secret VALUES (only names — that is the whole finding) and file contents
 * (only a content hash and the provider's blob SHA).
 */

import { ExternalLink } from "lucide-react";

import { DrawerSection, DetailGrid, DetailRow, CopyField } from "@/components/console/detail";
import type { DiscoveredAgent } from "@/app/api/discoveryApi";

/** Narrow an unknown metadata value to a non-empty string. */
function str(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key];
  return typeof v === "string" && v !== "" ? v : null;
}

/** Narrow to a non-empty array of strings, tolerating a single string. */
function list(meta: Record<string, unknown>, key: string): string[] {
  const v = meta[key];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return typeof v === "string" && v !== "" ? [v] : [];
}

function Tags({ values }: { values: string[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {values.map((v) => (
        <code
          key={v}
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] break-all"
        >
          {v}
        </code>
      ))}
    </span>
  );
}

export function GitHubEvidenceSection({ agent }: { agent: DiscoveredAgent }) {
  const meta = (agent.metadata ?? {}) as Record<string, unknown>;

  const repository = str(meta, "repository");
  const filePath =
    str(meta, "path") ??
    str(meta, "workflow_path") ??
    str(meta, "manifest_path") ??
    str(meta, "config_path") ??
    str(meta, "dockerfile_path") ??
    str(meta, "compose_path");

  // Nothing to show for a finding that did not come from a repository scan.
  if (!repository && !filePath) return null;

  const runtimes = list(meta, "declared_runtimes");
  const frameworks = list(meta, "declared_frameworks");
  const tools = list(meta, "declared_tools");
  const mcpServers = list(meta, "mcp_servers");
  const mcpEnvKeys = list(meta, "mcp_env_keys");
  const secrets = list(meta, "secret_references");
  const owners = list(meta, "codeowners");

  const ruleID = str(meta, "rule_id");
  const ruleVersion = str(meta, "rule_version");
  const strength = str(meta, "signal_strength");
  const needsCorroboration = meta["requires_corroboration"] === true;
  const elevatedTrigger = str(meta, "elevated_trigger");

  // HEAD rather than a branch name: the scan records the path, not the ref it
  // was read at, so pinning a branch here could 404 on a repo whose default
  // branch is not main.
  const fileURL =
    repository && filePath
      ? `https://github.com/${repository}/blob/HEAD/${filePath}`
      : null;

  return (
    <>
      {needsCorroboration && (
        <DrawerSection label="Confidence">
          <p className="rounded-md bg-(--color-warning-soft) px-3 py-2 text-xs text-(--color-warning-text)">
            This is a <strong>candidate, not a confirmed agent</strong>. It was
            matched only by a dependency being present, which proves the
            capability exists — not that anything uses it. Treat it as worth
            reviewing, not as a finding, unless a second signal corroborates it.
          </p>
        </DrawerSection>
      )}

      {elevatedTrigger && (
        <DrawerSection label="Blast radius">
          <p className="rounded-md bg-(--color-warning-soft) px-3 py-2 text-xs text-(--color-warning-text)">
            Triggered on <code className="font-mono">{elevatedTrigger}</code>,
            which runs against code from outside the repository while holding the
            repository&rsquo;s own permissions and secrets. Worth confirming this
            is intended.
          </p>
        </DrawerSection>
      )}

      <DrawerSection label="Where this was declared">
        <DetailGrid>
          {repository && (
            <DetailRow
              label="Repository"
              value={
                <a
                  href={`https://github.com/${repository}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 underline underline-offset-2"
                >
                  {repository}
                  <ExternalLink className="size-3" />
                </a>
              }
              full
            />
          )}
          {filePath && (
            <DetailRow
              label="File"
              value={
                fileURL ? (
                  <a
                    href={fileURL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 break-all font-mono text-xs underline underline-offset-2"
                  >
                    {filePath}
                    <ExternalLink className="size-3 shrink-0" />
                  </a>
                ) : (
                  <span className="break-all font-mono text-xs">{filePath}</span>
                )
              }
              full
            />
          )}
          {owners.length > 0 && (
            <DetailRow label="Code owner" value={<Tags values={owners} />} full />
          )}
        </DetailGrid>
      </DrawerSection>

      {(runtimes.length > 0 ||
        frameworks.length > 0 ||
        tools.length > 0 ||
        mcpServers.length > 0) && (
        <DrawerSection label="What was declared">
          <DetailGrid>
            {runtimes.length > 0 && (
              <DetailRow label="Agent runtime" value={<Tags values={runtimes} />} full />
            )}
            {frameworks.length > 0 && (
              <DetailRow label="Frameworks" value={<Tags values={frameworks} />} full />
            )}
            {tools.length > 0 && (
              <DetailRow label="Declared tools" value={<Tags values={tools} />} full />
            )}
            {mcpServers.length > 0 && (
              <DetailRow label="MCP servers" value={<Tags values={mcpServers} />} full />
            )}
            {mcpEnvKeys.length > 0 && (
              <DetailRow
                label="MCP env keys"
                value={<Tags values={mcpEnvKeys} />}
                full
              />
            )}
          </DetailGrid>
        </DrawerSection>
      )}

      {secrets.length > 0 && (
        <DrawerSection label="Secrets referenced">
          <Tags values={secrets} />
          <p className="mt-2 text-xs text-muted-foreground">
            Names only. Values are never read or stored — the name is the finding.
          </p>
        </DrawerSection>
      )}

      <DrawerSection label="How this was found">
        <DetailGrid>
          {ruleID && (
            <DetailRow
              label="Rule"
              value={
                <span className="font-mono text-xs">
                  {ruleID}
                  {ruleVersion ? ` · v${ruleVersion}` : ""}
                </span>
              }
              full
            />
          )}
          {strength && (
            <DetailRow
              label="Signal"
              value={
                strength === "direct"
                  ? "Direct — an agent runtime is named explicitly"
                  : strength === "indirect"
                    ? "Indirect — an agent framework is referenced"
                    : "Weak — a dependency is present, nothing more"
              }
              full
            />
          )}
          {str(meta, "blob_sha") && (
            <DetailRow
              label="Blob SHA"
              value={<CopyField value={str(meta, "blob_sha")!} />}
              full
            />
          )}
        </DetailGrid>
        <p className="mt-2 text-xs text-muted-foreground">
          File contents are not retained. A corrected rule cannot be re-run over
          this record — it needs a fresh scan.
        </p>
      </DrawerSection>
    </>
  );
}
