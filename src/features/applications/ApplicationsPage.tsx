/**
 * `ApplicationsPage` — the triage list for protected MCP servers / APIs.
 *
 * Layout:
 *   1. Top "pending actions" banner that aggregates every app with an
 *      open next-best-action and lets the operator dismiss it for the
 *      current session. The per-row table no longer carries a Next
 *      action column — actions live in a per-row dropdown so an
 *      operator can reach any tab without dirtying the row layout.
 *   2. Inline stats strip (total / live / need setup / blocked).
 *   3. The applications table itself — kebab menu on every row.
 *
 * Banner dismissal is keyed by the set of pending application IDs so a
 * newly-pending app will re-show the banner even after a dismiss.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Plus,
  X,
} from "lucide-react";
import toast from "react-hot-toast";

import {
  useDeleteApplicationMutation,
  useListApplicationsQuery,
} from "@/app/api/applicationsApi";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { computeReadiness, isLaunched } from "./lib/computeReadiness";
import {
  computeNextBestAction,
  nextActionHref,
} from "./lib/computeNextBestAction";
import {
  ApplicationsTable,
  type ApplicationTableRow,
} from "./components/ApplicationsTable";
import {
  consolePage,
  InlineStat,
  SectionHeader,
  Surface,
} from "./components/ApplicationConsole";
import type { Application } from "./types";

type AppRow = ApplicationTableRow;

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

const BANNER_DISMISS_STORAGE_KEY = "authsec.applications.pendingBanner.dismissedFor";

export default function ApplicationsPage() {
  const navigate = useNavigate();
  const {
    data: applications,
    isLoading,
  } = useListApplicationsQuery();
  const [deleteApplication, { isLoading: deleting }] =
    useDeleteApplicationMutation();

  const rows: AppRow[] = useMemo(() => {
    return (applications ?? []).map((application) => {
      const readiness = computeReadiness(application);
      const nba = computeNextBestAction(application, readiness);
      return {
        application,
        readiness,
        next: {
          label: nba.primary,
          href: nextActionHref(application.id, nba),
          primary: nba.key !== "open",
        },
      };
    });
  }, [applications]);

  const counts: BucketCounts = useMemo(() => {
    const c = { total: rows.length, active: 0, inSetup: 0, blocked: 0 };
    for (const row of rows) {
      c[bucketRow(row)] += 1;
    }
    return c;
  }, [rows]);

  const pendingRows = useMemo(
    () => rows.filter((row) => bucketRow(row) !== "active"),
    [rows],
  );

  // Pending-app set is the dismiss key. A newly-pending app produces a
  // different signature and re-surfaces the banner.
  const pendingSignature = useMemo(
    () =>
      pendingRows
        .map((row) => row.application.id)
        .sort()
        .join("|"),
    [pendingRows],
  );

  const [dismissedSignature, setDismissedSignature] = useState<string | null>(
    () => {
      try {
        return sessionStorage.getItem(BANNER_DISMISS_STORAGE_KEY);
      } catch {
        return null;
      }
    },
  );

  // Whenever the pending signature changes, surface the banner again.
  useEffect(() => {
    if (dismissedSignature && dismissedSignature !== pendingSignature) {
      setDismissedSignature(null);
      try {
        sessionStorage.removeItem(BANNER_DISMISS_STORAGE_KEY);
      } catch {
        /* sessionStorage may be unavailable (e.g. SSR) */
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

  const showBanner =
    pendingRows.length > 0 && dismissedSignature !== pendingSignature;

  // Delete is confirmed via a modal dialog (no browser-native alert).
  // `pendingDelete` stores the application targeted for deletion until
  // the user confirms or cancels.
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

  return (
    <div className="min-h-screen bg-background">
      <div className={consolePage}>
        <SectionHeader
          title="Applications"
          description="Triage protected MCP servers, APIs, and services by launch readiness and runtime risk."
          actions={
            <Button
              onClick={() => navigate("/applications/new")}
              className="h-9"
            >
              <Plus className="mr-2 size-4" />
              Create application
            </Button>
          }
        />

        {isLoading ? null : showBanner ? (
          <PendingActionsBanner
            pendingRows={pendingRows}
            blockedCount={counts.blocked}
            inSetupCount={counts.inSetup}
            onDismiss={handleDismissBanner}
          />
        ) : counts.total > 0 ? (
          <AllHealthyBanner />
        ) : null}

        <Surface className="flex flex-wrap items-center gap-x-6 gap-y-2 border-border bg-card px-4 py-3">
          <InlineStat
            label="applications"
            value={loadingValue(isLoading, counts.total)}
            tone="info"
          />
          <InlineStat
            label="live"
            value={loadingValue(isLoading, counts.active)}
            tone="success"
          />
          <InlineStat
            label="need setup"
            value={loadingValue(isLoading, counts.inSetup)}
            tone="warning"
          />
          <InlineStat
            label="blocked"
            value={loadingValue(isLoading, counts.blocked)}
            tone="danger"
          />
        </Surface>

        <div>
          {isLoading ? (
            <Surface className="px-4 py-12 text-center text-sm text-slate-500">
              Loading applications…
            </Surface>
          ) : rows.length === 0 ? (
            <Surface className="px-4 py-12 text-center">
              <p className="text-sm text-slate-500">No applications yet.</p>
              <Button
                className="mt-4"
                onClick={() => navigate("/applications/new")}
              >
                Create the first application
              </Button>
            </Surface>
          ) : (
            <ApplicationsTable
              rows={rows}
              onOpenApplication={(application) =>
                navigate(`/applications/${application.id}/overview`)
              }
              onNavigateToTab={(applicationId, tab) =>
                navigate(`/applications/${applicationId}/${tab}`)
              }
              onDeleteApplication={(application) => setPendingDelete(application)}
            />
          )}
        </div>
      </div>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete application?</DialogTitle>
            <DialogDescription>
              {pendingDelete ? (
                <>
                  This permanently removes{" "}
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {pendingDelete.name}
                  </span>{" "}
                  and every approval, role, scope, and client tied to it. This
                  action cannot be undone.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleConfirmDelete()}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete application"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function loadingValue(loading: boolean, value: number) {
  return loading ? "…" : value;
}

/** Banner — lists every application with an open next-best-action.
 *  - Always groups by severity (blocked first).
 *  - Up to 5 rows shown; the rest collapse into "…and N more".
 *  - Dismiss button hides it for this session (keyed by the pending set,
 *    so a new pending app re-surfaces the banner). */
function PendingActionsBanner({
  pendingRows,
  blockedCount,
  inSetupCount,
  onDismiss,
}: {
  pendingRows: AppRow[];
  blockedCount: number;
  inSetupCount: number;
  onDismiss: () => void;
}) {
  // Severity order: blocked rows first, then in-setup. Otherwise preserve
  // the table order so the banner stays predictable.
  const ordered = useMemo(() => {
    return [...pendingRows].sort((a, b) => {
      const aBlocked = bucketRow(a) === "blocked" ? 0 : 1;
      const bBlocked = bucketRow(b) === "blocked" ? 0 : 1;
      return aBlocked - bBlocked;
    });
  }, [pendingRows]);

  const visible = ordered.slice(0, 5);
  const overflow = ordered.length - visible.length;

  const isUrgent = blockedCount > 0;
  const headline = isUrgent
    ? `${blockedCount} application${blockedCount === 1 ? "" : "s"} blocked${inSetupCount > 0 ? `, ${inSetupCount} in setup` : ""}`
    : `${inSetupCount} application${inSetupCount === 1 ? "" : "s"} need setup`;

  return (
    <section
      className={cn(
        "rounded-lg border",
        isUrgent
          ? "border-red-200 bg-red-50/40"
          : "border-amber-200 bg-amber-50/50",
      )}
    >
      <header className="flex items-start justify-between gap-3 px-5 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
              isUrgent
                ? "bg-red-100 text-red-700"
                : "bg-amber-100 text-amber-700",
            )}
          >
            <AlertTriangle className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-5 text-slate-950">
              {headline}
            </h2>
            <p className="mt-0.5 text-xs leading-5 text-slate-600">
              AuthSec keeps unreviewed tools denied until launch gates pass.
              Resolve each application below.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss for this session"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-white/60 hover:text-slate-900"
        >
          <X className="size-4" />
        </button>
      </header>
      <ul className="divide-y divide-white/60 border-t border-white/60 bg-white/50">
        {visible.map((row) => (
          <li
            key={row.application.id}
            className="flex items-center justify-between gap-3 px-5 py-2.5"
          >
            <div className="min-w-0">
              <Link
                to={`/applications/${row.application.id}/overview`}
                className="truncate text-sm font-semibold text-slate-950 hover:underline"
              >
                {row.application.name}
              </Link>
              <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500">
                {row.application.resource_uri}
              </p>
            </div>
            <Link
              to={row.next.href}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition",
                bucketRow(row) === "blocked"
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-blue-600 text-white hover:bg-blue-700",
              )}
            >
              {row.next.label}
              <ArrowRight className="size-3.5" />
            </Link>
          </li>
        ))}
        {overflow > 0 && (
          <li className="px-5 py-2 text-xs text-slate-500">
            …and {overflow} more in the table below
          </li>
        )}
      </ul>
    </section>
  );
}

function AllHealthyBanner() {
  return (
    <section className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-5 py-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <CheckCircle2 className="size-4" />
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold leading-5 text-slate-950">
          All applications healthy
        </h2>
        <p className="mt-0.5 text-xs leading-5 text-slate-600">
          Runtime policy is active for every launched application.
        </p>
      </div>
    </section>
  );
}
