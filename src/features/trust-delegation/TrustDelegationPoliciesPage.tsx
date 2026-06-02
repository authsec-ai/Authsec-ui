/**
 * TrustDelegationPoliciesPage — Configure → Trust Delegation. Rebuilt to the
 * Console Refresh prototype (`[data-cr]`): section-header, filter toolbar,
 * bespoke table, kebab actions, prototype delete dialog. Real hooks preserved.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  GlobeLock,
  MoreHorizontal,
  Pencil,
  Power,
  Search,
  Trash2,
  X,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { getErrorMessage } from "@/lib/error-utils";
import { toast } from "@/lib/toast";
import {
  useDeleteDelegationPolicyMutation,
  useListDelegationPoliciesQuery,
  useUpdateDelegationPolicyMutation,
} from "@/app/api/trustDelegationApi";
import type { DelegationPolicyUI } from "./types";
import { getTrustDelegationErrorMessage } from "./utils";

const PAGE_SIZE = 10;

export function TrustDelegationPoliciesPage() {
  const navigate = useNavigate();
  const { data: policies = [], isFetching, error } = useListDelegationPoliciesQuery();
  const [updatePolicy] = useUpdateDelegationPolicyMutation();
  const [deletePolicy] = useDeleteDelegationPolicyMutation();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [targetTypeFilter, setTargetTypeFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<DelegationPolicyUI | null>(null);

  const filteredPolicies = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return policies.filter((p) => {
      if (statusFilter !== "all" && p.enabled !== (statusFilter === "enabled")) return false;
      if (roleFilter !== "all" && p.roleName !== roleFilter) return false;
      if (targetTypeFilter !== "all" && p.agentType !== targetTypeFilter) return false;
      if (clientFilter !== "all" && p.clientId !== clientFilter) return false;
      if (!q) return true;
      return [p.roleName, p.agentType, p.clientLabel, p.allowedPermissions.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [clientFilter, policies, roleFilter, searchQuery, statusFilter, targetTypeFilter]);

  const roles = Array.from(new Set(policies.map((p) => p.roleName)));
  const targetTypes = Array.from(new Set(policies.map((p) => p.agentType)));
  const clients = Array.from(
    new Map(policies.map((p) => [p.clientId, { id: p.clientId, label: p.clientLabel }])).values(),
  );

  const filtersActive =
    searchQuery.trim() !== "" ||
    statusFilter !== "all" ||
    roleFilter !== "all" ||
    targetTypeFilter !== "all" ||
    clientFilter !== "all";

  const total = filteredPolicies.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filteredPolicies.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const errorMessage = error
    ? getTrustDelegationErrorMessage(error, "Unable to load trust delegation records right now.")
    : null;
  const showInitialSkeleton = isFetching && filteredPolicies.length === 0 && !errorMessage;

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setRoleFilter("all");
    setTargetTypeFilter("all");
    setClientFilter("all");
    setPage(1);
  };

  const handleToggle = async (policy: DelegationPolicyUI) => {
    try {
      await updatePolicy({
        id: policy.id,
        body: {
          role_name: policy.roleName,
          agent_type: policy.agentType,
          allowed_permissions: policy.allowedPermissions,
          max_ttl_seconds: policy.maxTtlSeconds,
          enabled: !policy.enabled,
          client_id: policy.clientId,
        },
      }).unwrap();
      toast.success(policy.enabled ? "Trust delegation disabled" : "Trust delegation enabled");
    } catch (e) {
      toast.error(getErrorMessage(e, "Failed to update trust delegation"));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deletePolicy(deleteTarget.id).unwrap();
      toast.success("Trust delegation deleted");
      setDeleteTarget(null);
    } catch (e) {
      toast.error(getErrorMessage(e, "Failed to delete trust delegation"));
    }
  };

  return (
    <div data-cr>
      <div className="console-page">
        <div className="section-header">
          <div>
            <h1 className="sh-title">Trust Delegation</h1>
            <p className="sh-desc">
              Saved trust delegation configurations for agents, workloads, and user-linked service
              identities.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => navigate("/trust-delegation/new")}>
            Create trust delegation
          </button>
        </div>

        <div className="roles-toolbar">
          <div className={`search${searchQuery ? " has-value" : ""}`}>
            <span className="search-ic"><Search className="icon" /></span>
            <input
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              placeholder="Search trust delegations"
              aria-label="Search trust delegations"
            />
            <button className="clear-ic" aria-label="Clear search" onClick={() => setSearchQuery("")}>
              <X className="icon-sm" />
            </button>
          </div>
          <div className="filterset">
            <span className="filterset-label">Status</span>
            <div className="segmented">
              {[["all", "All"], ["enabled", "Enabled"], ["disabled", "Disabled"]].map(([v, label]) => (
                <button key={v} data-on={statusFilter === v} onClick={() => { setStatusFilter(v); setPage(1); }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="select">
            <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }} aria-label="Role" style={{ minWidth: 120 }}>
              <option value="all">All roles</option>
              {roles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <span className="chev"><ChevronDown className="icon-sm" /></span>
          </div>
          <div className="select">
            <select value={targetTypeFilter} onChange={(e) => { setTargetTypeFilter(e.target.value); setPage(1); }} aria-label="Target type" style={{ minWidth: 130 }}>
              <option value="all">All target types</option>
              {targetTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <span className="chev"><ChevronDown className="icon-sm" /></span>
          </div>
          <div className="select">
            <select value={clientFilter} onChange={(e) => { setClientFilter(e.target.value); setPage(1); }} aria-label="Client" style={{ minWidth: 140 }}>
              <option value="all">All clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <span className="chev"><ChevronDown className="icon-sm" /></span>
          </div>
          {filtersActive && <button className="chip-clear" onClick={clearFilters}>Clear</button>}
        </div>

        <div className="table-card">
          {errorMessage ? (
            <div className="empty">
              <span className="empty-ic" style={{ background: "var(--color-danger-soft)", color: "var(--color-danger-text)", borderColor: "transparent" }}>
                <GlobeLock className="icon-lg" />
              </span>
              <h3 className="empty-title" style={{ color: "var(--color-danger-text)" }}>Unable to load trust delegation</h3>
              <p className="empty-desc" style={{ color: "var(--color-danger-text)" }}>{errorMessage}</p>
            </div>
          ) : showInitialSkeleton ? (
            <div>
              {Array.from({ length: 6 }).map((_, i) => (
                <div className="skeleton-row" key={i}>
                  <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
                    <span className="sk sk-line" style={{ width: "34%" }} />
                    <span className="sk sk-line" style={{ width: "46%", height: 9 }} />
                  </span>
                  <span className="sk sk-line" style={{ width: 60, margin: "0 24px" }} />
                  <span className="sk sk-line" style={{ width: 90 }} />
                  <span className="sk sk-line" style={{ width: 72, height: 22, borderRadius: 999 }} />
                  <span className="sk sk-line" style={{ width: 28 }} />
                </div>
              ))}
            </div>
          ) : total === 0 ? (
            <div className="empty">
              <span className="empty-ic"><GlobeLock className="icon-lg" /></span>
              <h3 className="empty-title">{filtersActive ? "No trust delegations match" : "No trust delegations yet"}</h3>
              <p className="empty-desc">
                {filtersActive
                  ? "Try a different search term or reset the filters."
                  : "Create a trust delegation to let agents and workloads obtain scoped tokens."}
              </p>
              <button className="btn btn-primary" onClick={filtersActive ? clearFilters : () => navigate("/trust-delegation/new")}>
                {filtersActive ? "Clear filters" : "Create trust delegation"}
              </button>
            </div>
          ) : (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th>Trust Delegation</th>
                    <th className="num th-apps">Actions</th>
                    <th className="th-context">Max duration</th>
                    <th>Status</th>
                    <th className="th-actions" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((p) => (
                    <tr key={p.id} tabIndex={0} onClick={() => navigate(`/trust-delegation/${p.id}`)}>
                      <td>
                        <div className="role-cell">
                          <div className="role-name-row">
                            <span className="role-name">{p.roleName} · {p.agentType}</span>
                          </div>
                          <span className="role-detail" style={{ fontFamily: "var(--font-family-mono)" }}>{p.clientLabel}</span>
                        </div>
                      </td>
                      <td className={`num-cell col-apps${p.allowedPermissions.length === 0 ? " zero" : ""}`}>
                        {p.allowedPermissions.length}
                      </td>
                      <td className="col-context">
                        <span className="time-cell">{p.maxTtlLabel}</span>
                      </td>
                      <td>
                        <span className={`badge ${p.enabled ? "badge--success" : "badge--muted"}`}>
                          <span className="bdot" />
                          {p.enabled ? "Enabled" : "Disabled"}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="icon-btn" aria-label="Trust delegation actions">
                                <MoreHorizontal className="icon" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" data-cr className="min-w-52 p-1">
                              <DropdownMenuItem className="menu-item" onSelect={() => navigate(`/trust-delegation/${p.id}`)}>
                                <span className="mi-ic"><Eye className="icon-sm" /></span>
                                View trust delegation
                              </DropdownMenuItem>
                              <DropdownMenuItem className="menu-item" onSelect={() => navigate(`/trust-delegation/${p.id}/edit`)}>
                                <span className="mi-ic"><Pencil className="icon-sm" /></span>
                                Edit trust delegation
                              </DropdownMenuItem>
                              <DropdownMenuItem className="menu-item" onSelect={() => handleToggle(p)}>
                                <span className="mi-ic"><Power className="icon-sm" /></span>
                                {p.enabled ? "Disable" : "Enable"}
                              </DropdownMenuItem>
                              <div className="menu-sep" />
                              <DropdownMenuItem className="menu-item danger" onSelect={() => setDeleteTarget(p)}>
                                <span className="mi-ic"><Trash2 className="icon-sm" /></span>
                                Delete trust delegation
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="table-foot">
                <span className="foot-count">
                  Showing <b>{(safePage - 1) * PAGE_SIZE + 1}</b>–<b>{(safePage - 1) * PAGE_SIZE + pageRows.length}</b> of{" "}
                  <b>{total}</b>
                </span>
                <div className="pager">
                  <span className="pager-label">Page</span>
                  <div className="pager-btns">
                    <button className="pager-btn" aria-label="Previous page" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                      <ChevronLeft className="icon-sm" />
                    </button>
                    <span className="pager-label mono">{safePage} / {totalPages}</span>
                    <button className="pager-btn" aria-label="Next page" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                      <ChevronRight className="icon-sm" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent data-cr showCloseButton={false} className="border-0 bg-transparent p-0 shadow-none sm:max-w-md">
          <div className="dialog" style={{ width: "100%" }}>
            <span className="dg-icon"><Trash2 className="icon" /></span>
            <DialogTitle className="dg-title">Delete trust delegation?</DialogTitle>
            <DialogDescription className="dg-desc">
              This stops future token issuance for this configuration. Historical audit records are
              preserved. This can't be undone.
            </DialogDescription>
            {deleteTarget && <div className="dg-target">{deleteTarget.roleName} · {deleteTarget.agentType}</div>}
            <div className="dg-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => void handleDelete()}>
                <Trash2 className="icon-sm" /> Delete
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
