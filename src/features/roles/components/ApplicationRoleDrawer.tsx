/**
 * `ApplicationRoleDrawer` — app-role summary drawer (Console Refresh prototype):
 * owning application, stat grid (scopes / users / risk / default), scope chips,
 * a protected-note for default/generated roles, and handoff actions into the
 * application's Access / Scopes / Assignments surfaces. Renders in a Sheet
 * portal whose content carries `data-cr`.
 */

import { useNavigate } from "react-router-dom";
import { KeyRound, Link2, Lock, Scan, Server, Sparkles, Star, X } from "lucide-react";

import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import type { ApplicationRole } from "@/app/api/accessApi";

type Risk = "low" | "medium" | "high" | "critical";
const RISK_ORDER: Record<Risk, number> = { low: 0, medium: 1, high: 2, critical: 3 };

function aggregateRisk(role: ApplicationRole): Risk {
  let max: Risk = "low";
  for (const s of role.scopes ?? []) {
    const r = (s.risk_level as Risk) ?? "low";
    if (RISK_ORDER[r] > RISK_ORDER[max]) max = r;
  }
  return max;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function ApplicationRoleDrawer({
  role,
  onClose,
}: {
  role: ApplicationRole | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const protectedRole = !!role && (role.is_default || role.source === "generated");
  const risk = role ? aggregateRisk(role) : "low";

  return (
    <Sheet open={!!role} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" hideClose data-cr className="flex h-full flex-col overflow-hidden p-0 sm:max-w-110">
        <SheetTitle className="sr-only">
          {role ? `${role.display_name || role.name} — role details` : "Role details"}
        </SheetTitle>
        <SheetDescription className="sr-only">
          Application-scoped role summary, scopes, and handoffs.
        </SheetDescription>
        {role && (
          <div className="flex h-full flex-col" style={{ background: "var(--color-surface-raised)" }}>
            <div className="drawer-head">
              <div className="drawer-head-top">
                <div className="dh-statuses">
                  <span className="kind-chip app">
                    <Server className="kc-ic" /> Application role
                  </span>
                  {role.is_default && (
                    <span className="role-tag default">
                      <Star className="rt-ic" /> Default
                    </span>
                  )}
                  {role.source === "generated" && (
                    <span className="role-tag generated">
                      <Sparkles className="rt-ic" /> Generated
                    </span>
                  )}
                </div>
                <button className="icon-btn" aria-label="Close" onClick={onClose}>
                  <X className="icon" />
                </button>
              </div>
              <div style={{ marginTop: 8 }}>
                <div className="drawer-email" style={{ fontSize: 18 }}>
                  {role.label}
                </div>
                <div className="drawer-username" style={{ fontFamily: "var(--font-family-sans)" }}>
                  Application role · {role.application.name}
                </div>
              </div>
            </div>

            <div className="drawer-body">
              <div className="role-summary">
                <div className="owning-app">
                  <span className="oa-glyph">
                    <Server className="icon-sm" />
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="oa-name">{role.application.name}</div>
                    <div className="oa-uri">{role.application.resource_uri}</div>
                  </div>
                </div>

                <div className="summary-stat-grid">
                  <div className="stat-card">
                    <div className="sc-k">Scopes granted</div>
                    <div className="sc-v">{role.scopes_count}</div>
                  </div>
                  <div className="stat-card">
                    <div className="sc-k">Assigned users</div>
                    <div className="sc-v">{role.users_count}</div>
                  </div>
                  <div className="stat-card">
                    <div className="sc-k">Aggregate risk</div>
                    <div className="sc-v">
                      <span className={`badge badge--risk-${risk}`}>
                        <span className="bdot" />
                        {cap(risk)}
                      </span>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="sc-k">Default access</div>
                    <div className="sc-v" style={{ fontSize: 15, fontWeight: 600 }}>
                      {role.is_default ? "Enabled" : "Off"}
                    </div>
                  </div>
                </div>

                <div>
                  <p className="drawer-section-label" style={{ marginBottom: 10 }}>
                    Scope grants
                  </p>
                  <div className="scope-chips">
                    {(role.scopes ?? []).map((s) => (
                      <span className="scope-chip" key={s.id}>
                        <span className={`rdot ${(s.risk_level as Risk) ?? "low"}`} />
                        {s.scope_string}
                      </span>
                    ))}
                    {(role.scopes ?? []).length === 0 && (
                      <span className="detail-v" style={{ color: "var(--color-text-subtle)", fontWeight: 400 }}>
                        No scope grants yet.
                      </span>
                    )}
                  </div>
                </div>

                {protectedRole && (
                  <div className="protected-note">
                    <span className="pn-ic">
                      <Lock className="icon-sm" />
                    </span>
                    <span className="pn-text">
                      This role is {role.is_default ? "the default access package" : "system-generated"} and is
                      protected from destructive actions. Edit scope grants from the application's Access page.
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="drawer-foot">
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => navigate(`/applications/${role.application.id}/access`)}
              >
                <Scan className="icon-sm" /> Open Access
              </button>
              <button
                className="btn btn-secondary"
                aria-label="Review scopes"
                onClick={() => navigate(`/applications/${role.application.id}/scopes`)}
              >
                <KeyRound className="icon-sm" />
              </button>
              <button
                className="btn btn-secondary"
                aria-label="View assignments"
                onClick={() => navigate(`/applications/${role.application.id}/role-bindings`)}
              >
                <Link2 className="icon-sm" />
              </button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
