/**
 * Domain types for the Launch Control "Application" model.
 *
 * `Application` is the user-facing rename of the legacy `ResourceServer`.
 * For Phase 1 it's a structural alias — the underlying RTK Query slice
 * still talks to /resource-servers. Phase 4 renames the slice and moves
 * `ResourceServer` out of the public type surface.
 */

import type { ResourceServer } from "@/app/api/resourceServersApi";

/**
 * The protected entity AuthSec watches over.
 * MCP server / OIDC API / custom service.
 */
export type Application = ResourceServer;

/** Per-area readiness state. */
export type ReadinessState = "ok" | "warn" | "err" | "none";

/** The six gates that make up an Application's launch readiness. */
export interface Readiness {
  protection: ReadinessArea;
  tools: ReadinessArea;
  access: ReadinessArea;
  clients: ReadinessArea;
  test: ReadinessArea;
  launch: ReadinessArea;
}

export interface ReadinessArea {
  state: ReadinessState;
  /** Short status text shown in the ribbon, e.g. "101 need review". */
  status: string;
  /** Optional one-line explanation, used on Overview readiness gates. */
  detail?: string;
}

/**
 * What a tool actually does at runtime — the consequence column on Tools.
 * Distinct from "decision" (mapped/unmapped/keep blocked) which is config.
 */
export type RuntimeBehavior =
  | { kind: "denied" }
  | { kind: "allowed"; roles: string[] }
  | { kind: "public" }
  | { kind: "blocked-intentionally" };

/** A single gate row on the Launch page. */
export interface LaunchGate {
  area:
    | "endpoint-protection"
    | "tool-exposure"
    | "access-rollout"
    | "client-readiness"
    | "scenario-test";
  state: ReadinessState;
  /** One-sentence reason for the current state. */
  reason: string;
  /**
   * The action label that fixes the gate (or re-runs it on success).
   * On the Launch page, the highest-priority blocker becomes the
   * primary CTA at the top of the page.
   */
  fixCta: string;
  /** Internal route the fix CTA navigates to. */
  fixHref: string;
}

/** A single event in the Activity timeline / inbox. */
export interface ActivityEvent {
  id: string;
  timestamp: string; // ISO
  actor: { kind: "system" | "user"; name: string };
  message: string;
  state: "info" | "ok" | "warn" | "err";
}

/** Computed action the product should recommend next. */
export interface NextBestAction {
  /** Internal key used to switch on for analytics / tab routing. */
  key:
    | "install-protection"
    | "run-protection-check"
    | "review-tools"
    | "roll-out-access"
    | "approve-client"
    | "test-access"
    | "open-launch"
    | "launch-application"
    | "review-new-tools"
    | "open";
  /** Headline for the NBA card, e.g. "Review 101 tools". */
  headline: string;
  /** One-paragraph explanation. */
  body: string;
  /** Primary button copy, e.g. "Review tools". */
  primary: string;
  /** Optional secondary action. */
  secondary?: string;
  /** "If you do nothing…" line shown beneath the buttons. */
  noopConsequence?: string;
}
