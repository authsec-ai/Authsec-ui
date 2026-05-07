/**
 * `computeReadiness` — derive an Application's six-area readiness from
 * fields already on the `ResourceServer` model.
 *
 * Notes on backend truth:
 *   • `application.active` is set to `true` immediately on create — it
 *     does NOT mean "policy is live." Real activation is signalled by
 *     `state === "ready"` AND `setup_completed_at`.
 *   • Tool exposure / access / clients / test states are intentionally
 *     conservative ("none" / "warn") until callers compose this with the
 *     real per-RS data: `useGetActivationPreviewQuery`,
 *     `useListResourceServerClientsQuery`, etc. The Overview/Launch
 *     pages refine this with backend signals.
 */

import type { ResourceServer } from "@/app/api/resourceServersApi";
import type { Readiness, ReadinessArea } from "../types";

function area(
  state: ReadinessArea["state"],
  status: string,
  detail?: string,
): ReadinessArea {
  return { state, status, detail };
}

/** True iff the backend considers this RS launched (`state === "ready"`). */
export function isLaunched(server: Pick<ResourceServer, "state" | "setup_completed_at">): boolean {
  return server.state === "ready" && Boolean(server.setup_completed_at);
}

export function computeReadiness(server: ResourceServer): Readiness {
  const launched = isLaunched(server);

  // ── Protection ────────────────────────────────────────────────────────
  // `last_validation_status` is set by `validateResourceServer`. Until
  // an admin runs that, we know nothing — return "none" rather than guess.
  const protection: ReadinessArea = (() => {
    if (server.last_validation_status === "passed") {
      return area(
        "ok",
        "Passing",
        "Last validation succeeded.",
      );
    }
    if (server.last_validation_status === "failed" || server.state === "scan_failed") {
      return area(
        "err",
        "Failed",
        server.last_validation_error ?? "Last validation failed. Re-run after redeploy.",
      );
    }
    if (server.state === "ready") {
      // Already launched but never validated post-deploy.
      return area("warn", "Not run", "Run a protection check to verify the SDK is responding.");
    }
    return area("none", "Not yet run", "Install the SDK, then run a protection check.");
  })();

  // ── Tools ─────────────────────────────────────────────────────────────
  // We only know whether a manifest has *ever* been received here. Real
  // mapped/unmapped/public counts come from the activation-preview
  // endpoint and are layered in by the page that needs them.
  const tools: ReadinessArea = Number(server.last_successful_generation || 0) > 0
    ? area("warn", "Discovered", "Tool inventory present. See Tools tab for mapping status.")
    : area("none", "No manifest yet", "AuthSec hasn't received a tool manifest yet.");

  // ── Access ────────────────────────────────────────────────────────────
  // `access_policy_enabled` toggles whether a default role grants
  // first-time users any scopes. Real reachable/blocked counts come
  // from activation-preview.
  const access: ReadinessArea = server.access_policy_enabled
    ? area(
        "ok",
        server.access_policy_role_name
          ? `Default: ${server.access_policy_role_name}`
          : "Default role enabled",
        "First-time users get scopes from the default role.",
      )
    : area(
        "warn",
        "No default",
        "Choose a default role so first-time users get any access at all.",
      );

  // ── Clients ───────────────────────────────────────────────────────────
  const clientCount = Number(server.client_count || 0);
  const clients: ReadinessArea = clientCount > 0
    ? area("ok", `${clientCount} ready`, "Pre-registered clients are ready.")
    : area("none", "None registered", "Register clients or rely on dynamic registration.");

  // ── Test ──────────────────────────────────────────────────────────────
  // `test-login` is the only available test today. We can't know whether
  // it's been run from the RS row alone, so report "Not yet run" until
  // the page that actually invokes the mutation overrides it.
  const test: ReadinessArea = area(
    "none",
    "Not yet run",
    "Run a test-login from the Test tab to verify OAuth wiring.",
  );

  // ── Launch ────────────────────────────────────────────────────────────
  const launch: ReadinessArea = launched
    ? area("ok", "Launched", "Policy is enforced for this application.")
    : area(
        "warn",
        "Not launched",
        "Open Launch to see remaining gates from the setup checklist.",
      );

  return { protection, tools, access, clients, test, launch };
}
