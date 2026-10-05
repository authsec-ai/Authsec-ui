/**
 * What the page says about the state of the sources behind the list — read
 * from the connections, never inferred from the rows (rendered by `SourceNotices.tsx`).
 */

import type { Connection } from "@/app/api/connectionsApi";
import type { ConsoleTone } from "@/components/console/status";

import { readableSurface } from "../coverage/surfaceNames";
import { surfaceStateText } from "../shared/labels";
import { K8S_COVERAGE_LABEL, type ClusterSweep } from "./k8s";

export interface Notice {
  key: string;
  tone: ConsoleTone;
  label: string;
  text: string;
  href?: string;
}

export function connectionNotices(connections: Connection[], opts: { publishedView: boolean; skipCoverage?: boolean }): Notice[] {
  const out: Notice[] = [];
  for (const c of connections) {
    const href = `/iga/connections/${encodeURIComponent(c.id)}`;
    const name = c.name || c.native_id;
    if (c.connection.state === "revoked") {
      out.push({ key: `${c.id}:revoked`, tone: "neutral", label: "Revoked", text: `${name}: its last results are kept and are no longer reconfirmed.`, href });
      continue;
    }
    if (c.connection.state === "authentication_failed") {
      out.push({ key: `${c.id}:auth`, tone: "warning", label: "Authentication failed", text: `${name}: results from earlier scans remain.`, href });
    } else if (c.connection.state === "not_verified") {
      out.push({ key: `${c.id}:verify`, tone: "info", label: "Not yet verified", text: `${name} has not been verified, so it may not have been read.`, href });
    }
    if (c.scan.state === "failed") {
      out.push({ key: `${c.id}:scan`, tone: "warning", label: "Latest scan failed", text: `${name}: results from earlier scans remain.`, href });
    } else if (c.scan.state === "running" || c.scan.state === "queued") {
      out.push({ key: `${c.id}:scan`, tone: "info", label: c.scan.state === "running" ? "Scan running" : "Scan queued", text: `${name}: what is shown is from the previous scan.`, href });
    }
    if (opts.publishedView && c.graph.state === "failed") {
      out.push({ key: `${c.id}:graph`, tone: "warning", label: "Publication failed", text: `${name}: the last publication is shown.`, href });
    } else if (opts.publishedView && c.graph.state === "publishing") {
      out.push({ key: `${c.id}:graph`, tone: "info", label: "Publishing", text: `${name}: the graph is being built from the latest scan.`, href });
    }
    // On the published AWS lists the graph's own coverage summary says this, with its sheet.
    if (!opts.publishedView && !opts.skipCoverage && (c.coverage.state === "partial" || c.coverage.state === "denied") && c.coverage.gaps.length) {
      const gaps = c.coverage.gaps.slice(0, 3).map((g) => `${readableSurface(g.surface).service} ${surfaceStateText(g.state)}`);
      out.push({
        key: `${c.id}:coverage`,
        tone: "warning",
        label: c.coverage.state === "denied" ? "Collection denied" : "Collection partial",
        text: `${name}: ${gaps.join(", ")}${c.coverage.gaps.length > 3 ? ` and ${c.coverage.gaps.length - 3} more` : ""}. What was not read is unknown, not absent.`,
        href: `${href}/coverage`,
      });
    }
  }
  return out;
}

export function sweepNotices(sweeps: ClusterSweep[]): Notice[] {
  return sweeps
    .filter((s) => s.state === "namespaced_only" || s.state === "incomplete")
    .map((s) => ({
      key: `sweep:${s.cluster}`,
      tone: s.state === "incomplete" ? ("danger" as const) : ("warning" as const),
      label: K8S_COVERAGE_LABEL[s.state] ?? s.state,
      text: `${s.cluster}: ${s.limitation ?? "Part of the cluster was not read, so what it grants there is unknown, not absent."}`,
    }));
}

