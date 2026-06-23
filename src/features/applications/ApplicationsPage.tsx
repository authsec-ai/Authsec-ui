/**
 * `ApplicationsPage` — triage list for protected MCP servers / APIs.
 * Rebuilt to match the Console Refresh prototype (section-header, triage
 * banner, metric strip, bespoke table), wired to real data + mutations.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  MoreHorizontal,
  PlayCircle,
  Plus,
  Server,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
  Wrench,
  X,
} from "lucide-react";
import toast from "react-hot-toast";

import {
  useDeleteApplicationMutation,
  useListApplicationsQuery,
} from "@/app/api/applicationsApi";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { computeReadiness, isLaunched } from "./lib/computeReadiness";
import {
  computeNextBestAction,
  nextActionHref,
} from "./lib/computeNextBestAction";
import type { Application } from "./types";
import type { ReadinessState } from "./types";

type ConsoleTone = "success" | "warning" | "danger" | "info" | "muted";

interface AppRow {
  application: Application;
  readiness: ReturnType<typeof computeReadiness>;
}

interface BucketCounts {
  total: number;
  active: number;
  inSetup: number;
  blocked: number;
}

function bucketRow(row: AppRow): keyof BucketCounts {
  if (isLaunched(row.application)) return "active";
  if (
    row.application.state === "scan_failed" ||
    row.readiness.protection.state === "err" ||
    row.readiness.launch.state === "err"
  ) {
    return "blocked";
  }
  return "inSetup";
}

function toneFromState(state: ReadinessState): ConsoleTone {
  if (state === "ok") return "success";
  if (state === "warn") return "warning";
  if (state === "err") return "danger";
  return "muted";
}

function readinessCopy(row: AppRow): string {
  const r = row.readiness;
  if (isLaunched(row.application)) return "Launched";
  if (r.launch.state === "ok") return "Ready to launch";
  if (r.protection.state === "err") return "Blocked";
  if (r.protection.state !== "ok") return "In setup";
  if (r.tools.state !== "ok") return "Tools need review";
  if (r.access.state !== "ok") return "Access needs setup";
  return r.launch.status;
}

function riskOf(row: AppRow): { tone: ConsoleTone; label: string } {
  const r = row.readiness;
  if (r.launch.state === "err" || r.tools.state === "err" || row.application.state === "scan_failed")
    return { tone: "danger", label: "High" };
  if (r.tools.state === "warn" || r.launch.state === "warn" || r.protection.state === "warn")
    return { tone: "warning", label: "Needs review" };
  return { tone: "muted", label: "Low" };
}

function lastSignal(application: Application): string {
  if (application.last_scan_completed_at)
    return `Manifest · ${new Date(application.last_scan_completed_at).toLocaleDateString()}`;
  if (application.last_validated_at)
    return `Checked · ${new Date(application.last_validated_at).toLocaleDateString()}`;
  return "No runtime signal";
}

const BANNER_DISMISS_STORAGE_KEY = "authsec.applications.pendingBanner.dismissedFor";

const ROW_ACTIONS: Array<{ label: string; tab: string; icon: typeof ShieldCheck }> = [
  { label: "Open overview", tab: "overview", icon: ExternalLink },
  { label: "Setup", tab: "setup", icon: ShieldCheck },
  { label: "Review tools", tab: "tools", icon: Wrench },
  { label: "Manage access", tab: "access-assignments", icon: KeyRound },
  { label: "Clients", tab: "clients", icon: Users },
  { label: "Run test login", tab: "test", icon: PlayCircle },
];

export default function ApplicationsPage() {
  const navigate = useNavigate();
  const { data: applications, isLoading } = useListApplicationsQuery();
  const [deleteApplication, { isLoading: deleting }] = useDeleteApplicationMutation();

  const rows: AppRow[] = useMemo(
    () => (applications ?? []).map((application) => ({ application, readiness: computeReadiness(application) })),
    [applications],
  );

  const counts: BucketCounts = useMemo(() => {
    const c = { total: rows.length, active: 0, inSetup: 0, blocked: 0 };
    for (const row of rows) c[bucketRow(row)] += 1;
    return c;
  }, [rows]);

  const pendingRows = useMemo(() => rows.filter((row) => bucketRow(row) !== "active"), [rows]);
  const pendingSignature = useMemo(
    () => pendingRows.map((r) => r.application.id).sort().join("|"),
    [pendingRows],
  );

  const [dismissedSignature, setDismissedSignature] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(BANNER_DISMISS_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (dismissedSignature && dismissedSignature !== pendingSignature) {
      setDismissedSignature(null);
      try {
        sessionStorage.removeItem(BANNER_DISMISS_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [pendingSignature, dismissedSignature]);

  const handleDismissBanner = () => {
    setDismissedSignature(pendingSignature);
    try {
      sessionStorage.setItem(BANNER_DISMISS_STORAGE_KEY, pendingSignature);
    } catch {
      /* ignore */
    }
  };

  const showBanner = pendingRows.length > 0 && dismissedSignature !== pendingSignature;

  const [pendingDelete, setPendingDelete] = useState<Application | null>(null);

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    try {
      await deleteApplication(target.id).unwrap();
      toast.success(`Deleted "${target.name}".`);
      setPendingDelete(null);
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't delete application.");
    }
  };

  const metricCells: Array<[keyof BucketCounts, string, string]> = [
    ["total", "is-total", "applications"],
    ["active", "is-live", "live"],
    ["inSetup", "is-setup", "need setup"],
    ["blocked", "is-blocked", "blocked"],
  ];

  return (
    <div data-cr>
      <div className="console-page">
        <div className="section-header">
          <div>
            <h1 className="sh-title">Applications</h1>
            <p className="sh-desc">
              Triage protected MCP servers, APIs, and services by launch readiness and runtime risk.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => navigate("/applications/new")}>
            <Plus className="icon-sm" /> Create application
          </button>
        </div>

        {isLoading ? null : showBanner ? (
          <TriageBanner
            pendingRows={pendingRows}
            blockedCount={counts.blocked}
            onDismiss={handleDismissBanner}
          />
        ) : counts.total > 0 ? (
          <div className="banner banner--success">
            <span className="bn-icon">
              <CheckCircle2 className="icon" />
            </span>
            <div className="bn-body">
              <p className="bn-title">All applications healthy</p>
              <p className="bn-sub">Runtime policy is active for every launched application.</p>
            </div>
          </div>
        ) : null}

        <div className="metric-strip">
          {metricCells.map(([key, cls, label]) => {
            const val = isLoading ? 0 : counts[key];
            return (
              <div className={cls === "is-total" ? "metric" : `metric${val === 0 ? " is-zero" : ""}`} key={cls}>
                <span className={`m-dot ${cls}`} />
                <span className="m-val">{isLoading ? "—" : val}</span>
                <span className="m-label">{label}</span>
              </div>
            );
          })}
        </div>

        <div className="table-card">
          {isLoading ? (
            <div>
              {Array.from({ length: 5 }).map((_, i) => (
                <div className="skeleton-row" key={i}>
                  <span className="sk" style={{ width: 36, height: 36, borderRadius: 8, flex: "none" }} />
                  <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
                    <span className="sk sk-line" style={{ width: "38%" }} />
                    <span className="sk sk-line" style={{ width: "28%", height: 9 }} />
                  </span>
                  <span className="sk sk-line" style={{ width: 96, height: 22, borderRadius: 999 }} />
                  <span className="sk sk-line" style={{ width: 72, height: 22, borderRadius: 999, margin: "0 40px" }} />
                  <span className="sk sk-line" style={{ width: 90 }} />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="empty">
              <span className="empty-ic">
                <Server className="icon-lg" />
              </span>
              <h3 className="empty-title">No applications yet</h3>
              <p className="empty-desc">
                Register a protected MCP server or API and AuthSec will guide protection, tool review,
                access, and launch.
              </p>
              <button className="btn btn-primary" onClick={() => navigate("/applications/new")}>
                <Plus className="icon-sm" /> Create the first application
              </button>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Application</th>
                  <th>Readiness</th>
                  <th className="th-risk">Risk</th>
                  <th className="num">Users</th>
                  <th className="th-signal">Last signal</th>
                  <th className="th-actions" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const a = row.application;
                  const tone = toneFromState(row.readiness.launch.state);
                  const risk = riskOf(row);
                  const users = a.end_users_count ?? 0;
                  const glyphTone = bucketRow(row) === "blocked" ? "danger" : tone;
                  return (
                    <tr
                      key={a.id}
                      tabIndex={0}
                      onClick={() => navigate(`/applications/${a.id}/overview`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") navigate(`/applications/${a.id}/overview`);
                      }}
                    >
                      <td>
                        <div className="app-cell">
                          <span className={`app-glyph tone-${glyphTone}`}>
                            {glyphTone === "danger" ? <ShieldAlert className="icon" /> : <Server className="icon" />}
                          </span>
                          <span className="ac-meta">
                            <span className="ac-name">{a.name}</span>
                            <span className="ac-uri" title={a.resource_uri}>
                              {a.resource_uri}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge badge--${tone}`}>
                          <span className="bdot" />
                          {readinessCopy(row)}
                        </span>
                      </td>
                      <td className="col-risk">
                        <span className={`badge badge--${risk.tone}`}>
                          <span className="bdot" />
                          {risk.label}
                        </span>
                      </td>
                      <td className={`num-cell${users === 0 ? " zero" : ""}`}>{users}</td>
                      <td className="col-signal">
                        <span className="signal-cell">{lastSignal(a)}</span>
                      </td>
                      <td>
                        <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="icon-btn" aria-label="Row actions">
                                <MoreHorizontal className="icon" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" data-cr className="min-w-52 p-1">
                              {ROW_ACTIONS.map(({ label, tab, icon: Icon }) => (
                                <DropdownMenuItem
                                  key={tab}
                                  className="menu-item"
                                  onSelect={() => navigate(`/applications/${a.id}/${tab}`)}
                                >
                                  <span className="mi-ic">
                                    <Icon className="icon-sm" />
                                  </span>
                                  {label}
                                </DropdownMenuItem>
                              ))}
                              <div className="menu-sep" />
                              <DropdownMenuItem
                                className="menu-item danger"
                                onSelect={() => setPendingDelete(a)}
                              >
                                <span className="mi-ic">
                                  <Trash2 className="icon-sm" />
                                </span>
                                Delete application
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && !deleting && setPendingDelete(null)}>
        <DialogContent data-cr showCloseButton={false} className="border-0 bg-transparent p-0 shadow-none sm:max-w-md">
          <div className="dialog" style={{ width: "100%" }}>
            <span className="dg-icon">
              <Trash2 className="icon" />
            </span>
            <h2 className="dg-title">Delete application?</h2>
            <p className="dg-desc">
              This removes the protected application, its canonical scopes, introspection secret, and
              imported tools. Active clients will lose access immediately. This can't be undone.
            </p>
            {pendingDelete?.resource_uri && <div className="dg-target">{pendingDelete.resource_uri}</div>}
            <div className="dg-actions">
              <button className="btn btn-secondary" onClick={() => setPendingDelete(null)} disabled={deleting}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={() => void handleConfirmDelete()} disabled={deleting}>
                <Trash2 className="icon-sm" /> {deleting ? "Deleting…" : "Delete application"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TriageBanner({
  pendingRows,
  blockedCount,
  onDismiss,
}: {
  pendingRows: AppRow[];
  blockedCount: number;
  onDismiss: () => void;
}) {
  const navigate = useNavigate();
  const ordered = useMemo(
    () =>
      [...pendingRows].sort(
        (a, b) => (bucketRow(a) === "blocked" ? 0 : 1) - (bucketRow(b) === "blocked" ? 0 : 1),
      ),
    [pendingRows],
  );
  const visible = ordered.slice(0, 3);
  const overflow = ordered.length - visible.length;
  const total = pendingRows.length;

  return (
    <div className="banner banner--triage">
      <span className="bn-icon">
        <AlertTriangle className="icon" />
      </span>
      <div className="bn-body">
        <p className="bn-title">
          {total} application{total > 1 ? "s" : ""} need attention
          {blockedCount > 0 ? ` · ${blockedCount} blocked` : ""}
        </p>
        <p className="bn-sub">Finish setup or clear runtime risk before launch.</p>
        <div className="triage-list">
          {visible.map((row) => {
            const a = row.application;
            const blocked = bucketRow(row) === "blocked";
            const nba = computeNextBestAction(a, row.readiness);
            return (
              <div
                className="triage-item"
                key={a.id}
                onClick={() => navigate(nextActionHref(a.id, nba))}
              >
                <span className={`badge badge--${blocked ? "danger" : "warning"}`}>
                  <span className="bdot" />
                  {readinessCopy(row)}
                </span>
                <span className="ti-name">{a.name}</span>
                <span className="ti-uri">{a.resource_uri}</span>
                <span className="ti-cta">
                  {blocked ? "Resolve" : "Continue setup"} <ArrowRight className="icon-sm" />
                </span>
              </div>
            );
          })}
          {overflow > 0 && <div className="triage-more">…and {overflow} more need attention</div>}
        </div>
      </div>
      <button className="icon-btn bn-dismiss" aria-label="Dismiss" onClick={onDismiss}>
        <X className="icon-sm" />
      </button>
    </div>
  );
}
