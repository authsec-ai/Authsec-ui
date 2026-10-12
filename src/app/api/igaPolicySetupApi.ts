/**
 * Policy › Setup and legacy API — the routes the Setup surfaces (S9) and the
 * legacy agent-policy view call. SPEC-iga-phase3-policy.md §3.6 (enforcement
 * stack and self-test), §7.9 (binding and IaC sources), §7.10 (legacy
 * compatibility), §7.11 (Slack), §9.3 S9 (Setup) and §9.5 (legacy view).
 *
 * NOT under `/api/iga/v1/policy`. Each group has its own mount, read from
 * `routes/routes.go` (the `authsec` group is `/authsec`, line 299):
 *
 *   enforcement + IaC  /authsec/discovery/aws/connectors/:id/...   routes.go:1701-1706
 *   Slack              /authsec/integrations/slack/...             routes.go:1519
 *   legacy             /api/iga/v1/legacy/agent-policies/...       routes.go:292
 *
 * Every route here but the legacy ones sits behind the IGA_POLICY gate and
 * answers `503 policy_unavailable` while it is off. The legacy routes are NOT
 * gated by IGA_POLICY (see below). Errors are `{ error: { code, message,
 * detail } }` (`PolicyErrorBody`); the workspace is the token's and is never
 * sent. `ws` in an argument is a client-only cache key.
 *
 * Endpoint -> Go handler (controllers/platform/ unless noted)
 *
 *   GET    /connectors/:id/enforcement                 cloud_enforcement_binding_controller.go:194  Get
 *   POST   /connectors/:id/enforcement/sessions        cloud_enforcement_binding_controller.go:209  StartSession
 *   GET    /connectors/:id/enforcement/sessions/:sid   cloud_enforcement_binding_controller.go:239  GetSession
 *   POST   /connectors/:id/enforcement                 cloud_enforcement_binding_controller.go:263  BindManual
 *   POST   /connectors/:id/enforcement/verify          cloud_enforcement_binding_controller.go:293  Verify
 *   DELETE /connectors/:id/enforcement                 cloud_enforcement_binding_controller.go:313  Revoke
 *   GET    /connectors/:id/iac-sources                 cloud_aws_iac_source_controller.go:96        List
 *   POST   /connectors/:id/iac-sources                 cloud_aws_iac_source_controller.go:110       Create
 *   DELETE /connectors/:id/iac-sources/:sid            cloud_aws_iac_source_controller.go:138       Delete
 *   GET    /integrations/slack/install                 slack_integration_controller.go:131          Install
 *   GET    /integrations/slack/oauth/callback          slack_integration_controller.go:155          OAuthCallback (browser only)
 *   PUT    /integrations/slack/settings                slack_integration_controller.go:231          PutSettings
 *   DELETE /integrations/slack                         slack_integration_controller.go:254          Disconnect
 *   POST   /integrations/slack/link/confirm            slack_integration_controller.go:272          ConfirmLink
 *   GET    /api/iga/v1/policy/settings (Slack block)   iga_gov_policy_controller.go:118 (GetSettings; services/iga_gov_settings_service.go:420)
 *   GET    /api/iga/v1/legacy/agent-policies           legacy_agent_policy_compat_controller.go:185 ListLegacyAgentPolicies
 *   POST   /api/iga/v1/legacy/agent-policies/:id/pause legacy_agent_policy_compat_controller.go:277 PauseLegacyAgentPolicy
 *   DELETE /api/iga/v1/legacy/agent-policies/:id       legacy_agent_policy_compat_controller.go:306 RemoveLegacyAgentPolicy
 *
 * Response structs: services/cloud_enforcement_binding_service.go (329, 510,
 * 1152, 1161), internal/awsenforce/selftest.go:72, services/
 * iga_gov_iac_source_service.go (73-97) with models/iga_gov_ops.go:108,
 * services/slack_integration_service.go (307, 481, 559, 672),
 * models/slack_integration.go, services/iga_gov_settings_service.go:347-366,
 * services/agent_policy_legacy_compat.go (25-70).
 *
 * WHICH ENDPOINT LISTS AWS ACCOUNTS WITH THEIR ENFORCEMENT STATE: none does.
 * `GET /authsec/discovery/connections` (connectionsApi.ts, not redefined
 * here) lists AWS accounts: a connection with `provider: "aws"` has `id` =
 * the cloud connector's id (internal/igaread/connections.go, connCloud:
 * `ID: c.ID`), which is the `:id` of every route here; `native_id` is the
 * 12-digit account id, `name` its display name, `connection.state` its state.
 * Enforcement state is a separate read per account: call
 * `useGetEnforcementBindingQuery(connectionId)` for each AWS row. There is no
 * bulk read and `GET /aws/connectors` carries no enforcement field.
 *
 * WHAT THE SPEC DESCRIBES FOR SETUP THAT THE BACKEND DOES NOT SERVE
 *   1. Slack members' link state. S9 notifications says "member links"; the
 *      only Slack read is the status block of `GET /policy/settings`
 *      (`notifications.slack.status`: connected, team_name,
 *      approvals_channel_id, installed_at, `linked_users` COUNT). There is no
 *      route listing which members are linked, so Setup can show the count
 *      and the confirm-a-link flow, never a member list.
 *   2. No standalone Slack status route. Use `useGetSlackStatusQuery` below,
 *      which reads the settings block. It needs `governance:read` and also
 *      answers the "Slack not configured on this server" reason.
 *   3. "Update stack" (S9 checklist). No route updates an enforcement stack
 *      in place: a bound binding refuses a new session with
 *      409 `binding_exists`; the way to move to a new template is Revoke,
 *      then a new session. `current_template_version` vs `template_version`
 *      tells whether an update is due.
 *   4. "Verifying" as an observable state. `POST .../verify` and the manual
 *      bind run the self-test synchronously and answer with the final state;
 *      a concurrent request gets 409 `self_test_in_progress`. A `verifying`
 *      state exists in the row (a worker holds it) but no endpoint exposes
 *      progress other than re-reading the binding.
 *   5. IaC "role matching" has a fixed shape the spec leaves open:
 *      `{ rules: [{ role_name, resource }] }` (one trailing `*` allowed).
 *   6. IaC sources cannot be edited, only created or deleted; a source with
 *      pull requests opened from it cannot be deleted (409 `iac_source_in_use`).
 *   7. Legacy routes use `governance:enforce` to pause and remove, as spec
 *      §7.10 says (controller "Permissions" note; `governance:admin` alone is
 *      refused). The console still learns the right from the server's 403.
 *   8. Spec §9.6 lists legacy pause/remove among the Logs events. The legacy
 *      controller writes `audit_events` only (auditAdminMutation) and no
 *      `iga_gov_event`; whether `GET /policy/events` surfaces them was not
 *      traced here.
 *   9. A route to list GitHub repositories for an IaC mapping does not exist:
 *      `repository` is typed `owner/name` by the user. The choosable
 *      `discovery_source_id` values are the `provider: "github"` entries of
 *      `GET /authsec/discovery/connections` (their `id` is
 *      `discovery_sources.id`, internal/igaread/connections.go connGitHubSQL).
 *
 * SLACK INSTALL, FOR THE SCREEN AUTHOR. `GET /install` does NOT redirect: it
 * returns JSON `{ data: { authorize_url, expires_at } }` and sets an HttpOnly
 * cookie (`authsec_slack_install`, 10 minutes) that the callback checks, so it
 * must be called by this API client (credentials are included by baseApi)
 * with the member's bearer token, then the page sends the browser to
 * `authorize_url` (`window.location.assign`, after `isSlackAuthorizeUrl`).
 * Needs a verified workspace-member session (a service token is 403
 * `forbidden`) with `governance:enforce`. The callback
 * (`GET /oauth/callback`) is Slack's browser redirect to the API host and is
 * never called from here; it ends by redirecting the browser to
 * `<console>/iga/policy/setup/notifications?slack=connected` or
 * `?slack_error=<code>` (`parseSlackReturn`), or answers JSON when the server
 * has no console base URL configured. An unlinked Slack user is sent to
 * `.../setup/notifications?slack_link=<signed token>`; the page posts that
 * token to `POST /link/confirm` and should remove it from the address bar.
 *
 * CONTRACT ASSUMPTIONS NOT TRACED: that the API origin's CORS answers
 * `Access-Control-Allow-Credentials` for the console origin (the install
 * cookie depends on it); that the deployed image contains these routes.
 */

import { baseApi } from "./baseApi";
import { POLICY_BASE, enc, policyQuery } from "./igaPolicyCommon";
import type { PageArgs, PolicyEnvelope, WsArg } from "./igaPolicyCommon";

const AWS_DISCOVERY = "/authsec/discovery/aws";
const SLACK_BASE = "/authsec/integrations/slack";
const LEGACY_BASE = "/api/iga/v1/legacy/agent-policies";

/* ======================================================================= */
/* Enforcement binding (§3.6, §7.9)                                         */
/* ======================================================================= */

/** The §3.6 capabilities in probe order (internal/awsenforce/selftest.go:29-35). */
export const ENFORCEMENT_CAPABILITIES = [
  "assume",
  "create_policy",
  "version_management",
  "attach_boundary",
  "refuses_foreign_boundary",
  "detach_boundary",
  "delete_policy",
] as const;

export type EnforcementCapabilityName = (typeof ENFORCEMENT_CAPABILITIES)[number];

/** The checklist wording of §9.3 S9. */
export const ENFORCEMENT_CAPABILITY_LABELS: Record<EnforcementCapabilityName, string> = {
  assume: "Assume role",
  create_policy: "Create policy",
  version_management: "Manage versions",
  attach_boundary: "Attach boundary",
  refuses_foreign_boundary: "Refuses other boundaries",
  detach_boundary: "Detach boundary",
  delete_policy: "Delete policy",
};

/** selftest.go:44-52. `denied`: AWS refused the call. `error`: it failed for another reason. */
export type EnforcementCapabilityStatus = "ok" | "denied" | "error" | "untested";

/**
 * awsenforce.CapabilityResult (selftest.go:72). A capability never run is
 * `untested` with `checked_at` the zero time (`0001-01-01T00:00:00Z`): treat
 * it as "not checked", never as a timestamp. `refuses_foreign_boundary`
 * accepted by AWS is `error` with code `ForeignBoundaryAccepted`, never
 * `denied`.
 */
export interface EnforcementCapabilityResult {
  status: EnforcementCapabilityStatus;
  error_code?: string;
  message?: string;
  checked_at: string;
}

/** Row states (models/cloud_enforcement.go:16-23); `off` is the view's word for "no live binding". */
export type EnforcementBindingState =
  | "off"
  | "pending"
  | "verifying"
  | "verified"
  | "partial"
  | "error"
  | "revoked";

/**
 * The §9.3 wording (cloud_enforcement_binding_service.go setupState, 382):
 * `off` (none or revoked), `waiting_for_stack` (pending), `error` (a failed
 * bind with nothing bound), else the row state. The shared `bindingState`
 * label table is keyed by ROW state: map `setup_state` through it only after
 * handling `waiting_for_stack` and `off`.
 */
export type EnforcementSetupState =
  | "off"
  | "waiting_for_stack"
  | "verifying"
  | "verified"
  | "partial"
  | "error";

/** services.EnforcementBindingView (cloud_enforcement_binding_service.go:329): GET, bind, verify answer. */
export interface EnforcementBindingView {
  connector_id: string;
  /** The 12-digit AWS account id (the connector's `scope_id`). */
  account_id: string;
  state: EnforcementBindingState;
  setup_state: EnforcementSetupState;
  /** null when the connector has no live binding. */
  binding_id: string | null;
  role_arn?: string;
  selftest_role_arn?: string;
  /** The template version the binding was made with; absent before a bind. */
  template_version?: string;
  /** The version AuthSec ships now. Differs from `template_version` when an update is due. */
  current_template_version: string;
  /** Every §3.6 capability, `untested` ones included. */
  capabilities: Record<string, EnforcementCapabilityResult>;
  /**
   * Only for `partial`, or `error` with a bound role: `"name: status (code)"`
   * per failing capability, in probe order. Empty otherwise (a failed bind
   * has `last_error`, not failing checks).
   */
  failing: string[];
  /** Newest `checked_at` among the capabilities other than `assume`; null before any self-test. */
  last_self_test_at: string | null;
  verified_at: string | null;
  last_error?: string;
  last_error_code?: string;
  /** The user who consented; null when there is no binding. */
  consented_by: string | null;
  stack_name?: string;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * Status of a session: the binding's `setup_state`, `revoked`, or `expired`
 * (a pending session older than one hour; GetSession, service line 669).
 */
export type EnforcementSessionStatus = EnforcementSetupState | "revoked" | "expired";

/**
 * services.EnforcementSession (cloud_enforcement_binding_service.go:510).
 * `id` is the binding id. `quick_create_url` is the console URL that opens
 * AWS CloudFormation's Quick Create; present only when `automatic`.
 * Otherwise `automatic_reason` says why and the user deploys the template by
 * hand and posts the role ARNs (`useBindEnforcementManualMutation`).
 */
export interface EnforcementSession {
  id: string;
  binding_id: string;
  connector_id: string;
  account_id: string;
  status: EnforcementSessionStatus;
  code?: string;
  message?: string;
  /**
   * The enforcement ExternalId. Returned only to the user who started the
   * session (GetSession), and only for the manual path's stack parameters.
   * It is a confused-deputy guard, not a credential, but treat it as a
   * secret in the UI: shown once behind a disclosure with a copy control,
   * never logged, never put in a URL.
   */
  external_id?: string;
  /** The stack's name suffix (NameSuffix parameter). */
  suffix: string;
  stack_name: string;
  role_name: string;
  selftest_role_name: string;
  template_version: string;
  /** The published template (S3) URL; present only when `automatic`. */
  template_url?: string;
  deployment_region?: string;
  /** true when `quick_create_url` is set. */
  automatic: boolean;
  automatic_reason?: string;
  quick_create_url?: string;
  /** Parameters for a hand-deployed stack: AuthSecPrincipalArn, ExternalId, NameSuffix. */
  stack_parameters?: Record<string, string>;
  /** Quick Create link lifetime: one hour from the last update. */
  expires_at: string;
  binding?: EnforcementBindingView;
}

/** services.EnforcementArtifact (service line 1152): an AuthSec-owned artifact still in AWS. */
export interface EnforcementArtifact {
  id: string;
  control_id: string;
  kind: string;
  /** Native ARN: detail, behind progressive disclosure. */
  native_arn: string;
  state: string;
}

/**
 * services.EnforcementRevokeResult (line 1161). Revoking changes NOTHING in
 * AWS: the stack stays until the customer deletes it, and every boundary
 * listed in `artifacts_in_aws` stays attached.
 */
export interface EnforcementRevokeResult {
  binding: EnforcementBindingView;
  artifacts_in_aws: EnforcementArtifact[];
}

/** Codes of the binding routes (service lines 90-104) beside the shared ones. */
export type EnforcementErrorCode =
  | "not_found"
  | "enforcement_not_configured"
  | "connector_revoked"
  | "binding_exists"
  | "enforcement_session_required"
  | "artifact_owned_elsewhere"
  | "binding_not_bound"
  | "self_test_in_progress"
  | "validation_failed"
  | "enforcement_assume_failed"
  | "binding_not_verified"
  | "binding_partial"
  | "enforcement_unavailable"
  | "user_required"
  | "policy_unavailable";

export interface StartEnforcementSessionArgs {
  connectorId: string;
  /** Optional AWS region for the stack; the server picks one it supports when omitted or unknown. */
  deployment_region?: string;
}

export interface EnforcementSessionArgs {
  connectorId: string;
  sessionId: string;
}

/** Body of the manual path (controller line 263). Unknown fields are ignored by the server, but send only these. */
export interface BindEnforcementManualArgs {
  connectorId: string;
  role_arn: string;
  selftest_role_arn: string;
  /** Defaults to the current template version; an unknown one is 422 `validation_failed`. */
  template_version?: string;
}

export interface RevokeEnforcementArgs {
  connectorId: string;
  reason?: string;
}

/* ======================================================================= */
/* IaC sources (§7.9, T3.17)                                                */
/* ======================================================================= */

export type GovIaCFormat = "terraform" | "cloudformation";

/** internal/iacpr/render.go:83-91. `role_name` is exact or has one trailing `*`. */
export interface GovIaCRoleRule {
  role_name: string;
  resource: string;
}

export interface GovIaCRoleMatch {
  rules?: GovIaCRoleRule[];
}

/**
 * Permission state of the GitHub App installation behind the source's
 * discovery source (service line 84). `pending_grant`: the installation's
 * owner still has to accept the App's updated permissions on GitHub
 * (`remedy`, `url`); until then pull-request delivery refuses with 409
 * `iac_permission_missing`. `integration_missing`: the discovery source has
 * no GitHub App integration.
 */
export type GovIaCPermissionState = "granted" | "pending_grant" | "integration_missing";

export interface GovIaCPermissions {
  /** e.g. `{ contents: "write", pull_requests: "write" }`. */
  required: Record<string, string>;
  /** `"contents:write"`-style entries still missing; empty when granted. */
  missing: string[];
  /** The permissions have been requested of the installation. */
  requested: boolean;
  state: GovIaCPermissionState;
  remedy?: string;
  /** GitHub's installation settings page, when the installation is known. */
  url?: string;
}

/**
 * services.GovIaCSourceView (service line 94): models.IGAGovIaCSource
 * (flattened) plus `permissions`.
 */
export interface GovIaCSourceView {
  id: string;
  /** On the wire; the console has no use for it. */
  workspace_id: string;
  connector_id: string;
  format: GovIaCFormat;
  /** The GitHub discovery source (a `provider: "github"` connection's id). */
  discovery_source_id: string;
  /** `owner/name`. */
  repository: string;
  base_branch: string;
  /** Repository-relative; `""` is the repository root. */
  directory: string;
  /** `{}` when no rule was given. */
  role_match: GovIaCRoleMatch;
  created_by: string;
  created_at: string;
  permissions: GovIaCPermissions;
}

/**
 * services.GovIaCSourceInput (service line 73). The server rejects unknown
 * fields, so `createIacSource` sends exactly these.
 */
export interface CreateIacSourceArgs {
  connectorId: string;
  format: GovIaCFormat;
  discovery_source_id: string;
  /** `owner/name`: letters, digits, `_`, `.`, `-`. */
  repository: string;
  /** Defaults to `main`. */
  base_branch?: string;
  /** Repository-relative path, no `..`; empty is the root. */
  directory: string;
  role_match?: GovIaCRoleMatch;
}

export interface DeleteIacSourceArgs {
  connectorId: string;
  sourceId: string;
}

export interface DeleteIacSourceResult {
  id: string;
  deleted: boolean;
}

/** Codes of the IaC routes (service lines 47-53) beside the shared ones. */
export type IacSourceErrorCode =
  | "iac_source_missing"
  | "iac_permission_missing"
  | "iac_source_in_use"
  | "iac_unavailable"
  | "discovery_source_invalid"
  | "invalid_parameter"
  | "version_conflict"
  | "not_found"
  | "policy_unavailable";

/* ======================================================================= */
/* Slack (§7.11, T3.14)                                                     */
/* ======================================================================= */

/** services.SlackInstallStart (service line 307). The cookie nonce is not in the JSON. */
export interface SlackInstallStart {
  /** Always `https://slack.com/oauth/v2/authorize?...`; check with `isSlackAuthorizeUrl`. */
  authorize_url: string;
  /** The state's expiry: 10 minutes. */
  expires_at: string;
}

/**
 * models.WorkspaceSlackIntegration (models/slack_integration.go:14), as
 * `PUT /settings` answers it. `bot_token_ref` is a Vault path, `workspace_id`
 * and `installed_by` internal ids: never render any of them.
 */
export interface SlackIntegration {
  workspace_id: string;
  slack_team_id: string;
  slack_team_name: string;
  bot_token_ref: string;
  /** `""` when no channel is set. */
  approvals_channel_id: string;
  installed_by: string;
  installed_at: string;
  revoked_at?: string;
}

/** `PUT /settings` body: a Slack channel id (`C...` or `G...`); `""` clears the channel. */
export interface UpdateSlackSettingsArgs {
  approvals_channel_id: string;
}

/** `DELETE /` answer. Disconnecting also deletes the workspace's member links. */
export interface SlackDisconnectResult {
  disconnected: boolean;
  slack_team_id: string;
}

/** models.SlackUserLink (models/slack_integration.go:29). `linked_via`: `verified_email` or `console_confirmation`. */
export interface SlackUserLink {
  workspace_id: string;
  slack_user_id: string;
  user_id: string;
  linked_via: string;
  linked_at: string;
}

export interface ConfirmSlackLinkArgs {
  /** The signed token from `?slack_link=` in the console URL Slack sent. */
  token: string;
}

/** services.SlackLinkResult (service line 672). */
export interface SlackLinkResult {
  link: SlackUserLink;
}

/**
 * services.SlackStatusView (service line 559): the Slack block of
 * `GET /policy/settings`. `linked_users` is a COUNT; no route lists members.
 */
export interface SlackStatusView {
  connected: boolean;
  team_name?: string;
  approvals_channel_id?: string;
  installed_at?: string;
  linked_users: number;
}

/**
 * services.GovChannelAvailability (iga_gov_settings_service.go:361).
 * `available: false` carries `reason` (Slack not configured on this server);
 * `available: true` carries `status`.
 */
export interface SlackChannelAvailability {
  available: boolean;
  reason?: string;
  status?: SlackStatusView;
}

/** Codes of the Slack routes (service lines 98-108) beside the shared ones. */
export type SlackErrorCode =
  | "slack_not_configured"
  | "slack_not_connected"
  | "slack_state_invalid"
  | "slack_team_bound_elsewhere"
  | "slack_install_failed"
  | "slack_link_invalid"
  | "slack_user_already_linked"
  | "slack_user_not_linked"
  | "slack_signature_invalid"
  | "forbidden"
  | "invalid_parameter"
  | "not_found"
  | "policy_unavailable";

/** Only Slack's own authorize endpoint (internal/slackapp/api.go:21) may be navigated to. */
export function isSlackAuthorizeUrl(url: string | undefined | null): url is string {
  return typeof url === "string" && url.startsWith("https://slack.com/oauth/v2/authorize?");
}

/** What the OAuth callback and a Slack "Link" message append to the Setup URL (controller line 180; service line 663). */
export interface SlackReturn {
  /** `slack=connected` */
  connected: boolean;
  /** `slack_error=<code>`, e.g. `slack_state_invalid`. */
  error: SlackErrorCode | (string & {}) | null;
  /** `slack_link=<signed token>`: post it to `useConfirmSlackLinkMutation`, then drop it from the address bar. */
  linkToken: string | null;
}

export function parseSlackReturn(search: string): SlackReturn {
  const q = new URLSearchParams(search);
  return {
    connected: q.get("slack") === "connected",
    error: q.get("slack_error"),
    linkToken: q.get("slack_link"),
  };
}

/* ======================================================================= */
/* Legacy agent policies (§7.10, §9.5)                                      */
/* ======================================================================= */

/** services.LegacyAgentPolicyTarget (agent_policy_legacy_compat.go:25). */
export interface LegacyAgentPolicyTarget {
  kind: "agent" | "selector";
  discovered_agent_id?: string;
  /** The agent's display name, when `kind` is `agent` and the agent still exists. */
  agent_label?: string;
  /** Present for `selector`: the legacy reconciler's selector, as stored. */
  selector?: Record<string, unknown>;
}

/**
 * services.LegacyReconcileOutcome (line 34): the newest recorded action of the
 * legacy reconciler for this policy. `arm`: `entitlement` | `cluster`.
 * `outcome`: `applied` | `failed` | `refused` | `planned` (models/agent_policy.go:49-52).
 */
export interface LegacyReconcileOutcome {
  action: string;
  arm: string;
  outcome: string;
  /** A dry run planned the action and did not apply it. */
  dry_run: boolean;
  detail: string;
  at: string;
}

/** services.LegacyAgentPolicyView (line 44): one row; also `pause`'s answer. */
export interface LegacyAgentPolicyView {
  id: string;
  name: string;
  description: string;
  target: LegacyAgentPolicyTarget;
  enabled: boolean;
  desired_state: string;
  /** `revoke` | `quarantine` | `evict` (models/agent_policy.go:23-25). `evict` removes the workload. */
  on_expiry: string;
  /** The policy's clock resolved; null when it has none. */
  effective_expiry: string | null;
  /**
   * When the legacy reconciler will act destructively (`on_expiry = evict`)
   * on an ENABLED policy; null otherwise. A date in the past means it acts
   * on its next pass.
   */
  pending_destructive_deadline: string | null;
  /** null when the reconciler has recorded nothing for it. */
  last_reconcile: LegacyReconcileOutcome | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** `meta` of the list. `legacy_workers`: whether THIS process still runs the reconciler and warning workers. */
export interface LegacyAgentPolicyMeta {
  next_cursor: string | null;
  limit: number;
  legacy_workers: "on" | "off";
  [key: string]: unknown;
}

export interface ListLegacyAgentPoliciesArgs extends WsArg, PageArgs {}

export interface PauseLegacyAgentPolicyArgs {
  id: string;
  /** Optional; recorded in the audit event. */
  reason?: string;
}

export interface RemoveLegacyAgentPolicyArgs {
  id: string;
  /** Required: an empty reason is 400 `reason_required`. */
  reason: string;
}

/** `DELETE` answer. Effects the policy already had are NOT undone. */
export interface RemoveLegacyAgentPolicyResult {
  id: string;
  removed: boolean;
  note: string;
}

/**
 * Legacy codes (controller): `legacy_agent_policies_unavailable` (404: the
 * stack is off and the workspace has none), `reason_required`, `invalid_body`,
 * `invalid_parameter`, `cursor_invalid`, `not_found`, `internal`.
 */
export type LegacyErrorCode =
  | "legacy_agent_policies_unavailable"
  | "reason_required"
  | "invalid_body"
  | "invalid_parameter"
  | "cursor_invalid"
  | "not_found"
  | "internal";

/* ======================================================================= */
/* Endpoints                                                                */
/* ======================================================================= */

const setupTag = (id: string) => ({ type: "IgaGovSetup" as const, id });
const enfTag = (connectorId: string) => setupTag(`enforcement:${connectorId}`);
const iacTag = (connectorId: string) => setupTag(`iac:${connectorId}`);
/** Readiness reads the binding and IaC sources of every account (services/iga_gov_readiness.go:219, 276). */
const READINESS = { type: "IgaGovReadiness" as const, id: "ALL" };

/** The self-test calls AWS several times; the default 30 s base timeout is too short. */
const SELF_TEST_TIMEOUT_MS = 90_000;

export const igaPolicySetupApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    /* ---- enforcement binding ---- */

    /** Binding state, capabilities, template version, last self-test (`discovery:read`). `connectorId` is the AWS connection's id. */
    getEnforcementBinding: b.query<EnforcementBindingView, string>({
      query: (connectorId) => ({
        url: `${AWS_DISCOVERY}/connectors/${enc(connectorId)}/enforcement`,
        method: "GET",
      }),
      transformResponse: (r: PolicyEnvelope<EnforcementBindingView>) => r.data,
      providesTags: (_r, _e, connectorId) => [enfTag(connectorId), setupTag("ALL")],
    }),

    /** Quick Create session for the enforcement stack (`governance:enforce`; a signed-in user). 201. */
    startEnforcementSession: b.mutation<EnforcementSession, StartEnforcementSessionArgs>({
      query: ({ connectorId, deployment_region }) => ({
        url: `${AWS_DISCOVERY}/connectors/${enc(connectorId)}/enforcement/sessions`,
        method: "POST",
        body: deployment_region ? { deployment_region } : undefined,
      }),
      transformResponse: (r: PolicyEnvelope<EnforcementSession>) => r.data,
      invalidatesTags: (_r, _e, { connectorId }) => [enfTag(connectorId), READINESS],
    }),

    /** Poll a session. The binding moves to `verified`/`partial`/`error` when the stack's callback arrives. */
    getEnforcementSession: b.query<EnforcementSession, EnforcementSessionArgs>({
      query: ({ connectorId, sessionId }) => ({
        url: `${AWS_DISCOVERY}/connectors/${enc(connectorId)}/enforcement/sessions/${enc(sessionId)}`,
        method: "GET",
      }),
      // The poll is read for its status only. The ExternalId, the stack parameters and the launch link (which carries the ExternalId)
      // come from the start call and live in the dialog's own state; none of them is kept in the shared cache.
      transformResponse: (r: PolicyEnvelope<EnforcementSession>) => {
        const { external_id: _e, stack_parameters: _p, quick_create_url: _q, ...rest } = r.data;
        void _e;
        void _p;
        void _q;
        return rest as EnforcementSession;
      },
      keepUnusedDataFor: 0,
      providesTags: (_r, _e, { connectorId }) => [enfTag(connectorId)],
    }),

    /**
     * Manual path: the stack was deployed by hand with the session's
     * ExternalId and suffix; post both role ARNs. Assumes the role, binds and
     * runs the self-test before answering. Needs a session first
     * (409 `enforcement_session_required`).
     */
    bindEnforcementManual: b.mutation<EnforcementBindingView, BindEnforcementManualArgs>({
      query: ({ connectorId, role_arn, selftest_role_arn, template_version }) => ({
        url: `${AWS_DISCOVERY}/connectors/${enc(connectorId)}/enforcement`,
        method: "POST",
        body: { role_arn, selftest_role_arn, ...(template_version ? { template_version } : {}) },
        timeout: SELF_TEST_TIMEOUT_MS,
      }),
      transformResponse: (r: PolicyEnvelope<EnforcementBindingView>) => r.data,
      invalidatesTags: (_r, _e, { connectorId }) => [enfTag(connectorId), READINESS],
    }),

    /** Run the self-test now; answers with the new state. 409 `binding_not_bound` when no role is bound. */
    verifyEnforcement: b.mutation<EnforcementBindingView, string>({
      query: (connectorId) => ({
        url: `${AWS_DISCOVERY}/connectors/${enc(connectorId)}/enforcement/verify`,
        method: "POST",
        timeout: SELF_TEST_TIMEOUT_MS,
      }),
      transformResponse: (r: PolicyEnvelope<EnforcementBindingView>) => r.data,
      invalidatesTags: (_r, _e, connectorId) => [enfTag(connectorId), READINESS],
    }),

    /** Revoke: blocks new direct deployments; nothing in AWS changes. Lists the boundaries still in AWS. */
    revokeEnforcement: b.mutation<EnforcementRevokeResult, RevokeEnforcementArgs>({
      query: ({ connectorId, reason }) => ({
        url: `${AWS_DISCOVERY}/connectors/${enc(connectorId)}/enforcement`,
        method: "DELETE",
        body: reason?.trim() ? { reason: reason.trim() } : undefined,
      }),
      transformResponse: (r: PolicyEnvelope<EnforcementRevokeResult>) => r.data,
      invalidatesTags: (_r, _e, { connectorId }) => [enfTag(connectorId), READINESS],
    }),

    /* ---- IaC sources ---- */

    /** Sources of the account, each with its GitHub permission state (`governance:enforce`). */
    listIacSources: b.query<GovIaCSourceView[], string>({
      query: (connectorId) => ({
        url: `${AWS_DISCOVERY}/connectors/${enc(connectorId)}/iac-sources`,
        method: "GET",
      }),
      transformResponse: (r: PolicyEnvelope<GovIaCSourceView[]>) => r.data,
      providesTags: (_r, _e, connectorId) => [iacTag(connectorId), setupTag("ALL")],
    }),

    /** Map a repository directory to the account. Requests contents/pull_requests write on the GitHub App. 201. */
    createIacSource: b.mutation<GovIaCSourceView, CreateIacSourceArgs>({
      query: ({ connectorId, format, discovery_source_id, repository, base_branch, directory, role_match }) => ({
        url: `${AWS_DISCOVERY}/connectors/${enc(connectorId)}/iac-sources`,
        method: "POST",
        body: {
          format,
          discovery_source_id,
          repository,
          directory,
          ...(base_branch ? { base_branch } : {}),
          ...(role_match ? { role_match } : {}),
        },
      }),
      transformResponse: (r: PolicyEnvelope<GovIaCSourceView>) => r.data,
      invalidatesTags: (_r, _e, { connectorId }) => [iacTag(connectorId), READINESS],
    }),

    /** Remove a mapping. 409 `iac_source_in_use` once pull requests were opened from it. */
    deleteIacSource: b.mutation<DeleteIacSourceResult, DeleteIacSourceArgs>({
      query: ({ connectorId, sourceId }) => ({
        url: `${AWS_DISCOVERY}/connectors/${enc(connectorId)}/iac-sources/${enc(sourceId)}`,
        method: "DELETE",
      }),
      transformResponse: (r: PolicyEnvelope<DeleteIacSourceResult>) => r.data,
      invalidatesTags: (_r, _e, { connectorId }) => [iacTag(connectorId), READINESS],
    }),

    /* ---- Slack ---- */

    /**
     * The Slack connection as the settings read reports it
     * (`GET /policy/settings` -> `notifications.slack`, `governance:read`).
     * There is no standalone Slack status route. The workspace's settings
     * slice may read the same URL; this selects only the Slack block.
     */
    getSlackStatus: b.query<SlackChannelAvailability, WsArg>({
      query: () => ({ url: `${POLICY_BASE}/settings`, method: "GET" }),
      transformResponse: (r: PolicyEnvelope<{ notifications?: { slack?: SlackChannelAvailability } }>) =>
        r.data.notifications?.slack ?? { available: false },
      providesTags: [setupTag("slack"), setupTag("ALL"), { type: "IgaGovSettings", id: "ALL" }],
    }),

    /**
     * Start an install: returns the Slack authorize URL and sets the install
     * cookie. A mutation (never cached) because each call mints a new state
     * and cookie. Navigate to `authorize_url` only when `isSlackAuthorizeUrl`.
     */
    startSlackInstall: b.mutation<SlackInstallStart, void>({
      query: () => ({ url: `${SLACK_BASE}/install`, method: "GET" }),
      transformResponse: (r: PolicyEnvelope<SlackInstallStart>) => r.data,
    }),

    /** Set the approvals channel (`""` clears it). 409 `slack_not_connected` when Slack is not installed. */
    updateSlackSettings: b.mutation<SlackIntegration, UpdateSlackSettingsArgs>({
      query: ({ approvals_channel_id }) => ({
        url: `${SLACK_BASE}/settings`,
        method: "PUT",
        body: { approvals_channel_id: approvals_channel_id.trim() },
      }),
      transformResponse: (r: PolicyEnvelope<SlackIntegration>) => r.data,
      invalidatesTags: [setupTag("slack"), { type: "IgaGovSettings", id: "ALL" }],
    }),

    /** Disconnect Slack: revokes the token and deletes the workspace's member links. */
    disconnectSlack: b.mutation<SlackDisconnectResult, void>({
      query: () => ({ url: `${SLACK_BASE}`, method: "DELETE" }),
      transformResponse: (r: PolicyEnvelope<SlackDisconnectResult>) => r.data,
      invalidatesTags: [setupTag("slack"), { type: "IgaGovSettings", id: "ALL" }],
    }),

    /** Confirm a Slack account <-> member link with the signed token from the Slack message. */
    confirmSlackLink: b.mutation<SlackLinkResult, ConfirmSlackLinkArgs>({
      query: ({ token }) => ({ url: `${SLACK_BASE}/link/confirm`, method: "POST", body: { token } }),
      transformResponse: (r: PolicyEnvelope<SlackLinkResult>) => r.data,
      invalidatesTags: [setupTag("slack"), { type: "IgaGovSettings", id: "ALL" }],
    }),

    /* ---- legacy agent policies ---- */

    /** Read-only list, newest first (`governance:read`). 404 `legacy_agent_policies_unavailable` when there is nothing to show. */
    listLegacyAgentPolicies: b.query<PolicyEnvelope<LegacyAgentPolicyView[], LegacyAgentPolicyMeta>, ListLegacyAgentPoliciesArgs>({
      query: (args) => ({ url: `${LEGACY_BASE}${policyQuery(args)}`, method: "GET" }),
      providesTags: [{ type: "IgaGovLegacy", id: "ALL" }],
    }),

    /** Disable the policy (`governance:enforce`). Idempotent. Nothing it already did is undone. */
    pauseLegacyAgentPolicy: b.mutation<LegacyAgentPolicyView, PauseLegacyAgentPolicyArgs>({
      query: ({ id, reason }) => ({
        url: `${LEGACY_BASE}/${enc(id)}/pause`,
        method: "POST",
        body: reason?.trim() ? { reason: reason.trim() } : undefined,
      }),
      transformResponse: (r: PolicyEnvelope<LegacyAgentPolicyView>) => r.data,
      invalidatesTags: [{ type: "IgaGovLegacy", id: "ALL" }],
    }),

    /** Remove the policy (`governance:enforce`). A reason is required. Recorded actions are kept. */
    removeLegacyAgentPolicy: b.mutation<RemoveLegacyAgentPolicyResult, RemoveLegacyAgentPolicyArgs>({
      query: ({ id, reason }) => ({
        url: `${LEGACY_BASE}/${enc(id)}`,
        method: "DELETE",
        body: { reason: reason.trim() },
      }),
      transformResponse: (r: PolicyEnvelope<RemoveLegacyAgentPolicyResult>) => r.data,
      invalidatesTags: [{ type: "IgaGovLegacy", id: "ALL" }],
    }),
  }),
});

export const {
  useGetEnforcementBindingQuery,
  useStartEnforcementSessionMutation,
  useGetEnforcementSessionQuery,
  useBindEnforcementManualMutation,
  useVerifyEnforcementMutation,
  useRevokeEnforcementMutation,
  useListIacSourcesQuery,
  useCreateIacSourceMutation,
  useDeleteIacSourceMutation,
  useGetSlackStatusQuery,
  useStartSlackInstallMutation,
  useUpdateSlackSettingsMutation,
  useDisconnectSlackMutation,
  useConfirmSlackLinkMutation,
  useListLegacyAgentPoliciesQuery,
  usePauseLegacyAgentPolicyMutation,
  useRemoveLegacyAgentPolicyMutation,
} = igaPolicySetupApi;
