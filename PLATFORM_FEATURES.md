# AuthSec Platform — Core Features

> Source of truth for the website's Platform page. Every feature below is live and
> backend-integrated in the product today — verified against `Authsec-ui` @ 2026-07-03.
> Deliberately excluded: the Governance/IGA module (Access Requests, Certifications, SoD,
> Lifecycle, Ownership, Policies, Risk, Audit) and Vault/secrets-import — both are UI-only
> previews today, with backend work still in progress. They'll graduate into this document
> once shipped.

---

## 1. One Identity Model for Humans, Machines, and Agents

AuthSec is built around a single, workspace-scoped identity model instead of bolting
machine identity onto a human-first IAM system as an afterthought:

- **Users** — the people in your organization.
- **Service Accounts** — machine identities that authenticate with a client secret or a
  private-key JWT for service-to-service (M2M) calls.
- **Workload Identities** — pods, containers, and infrastructure that authenticate via
  SPIFFE/SPIRE-issued identity, no shared secret to leak or rotate.
- **Agents** — AI agents and copilots that log in as a user and then act on that user's
  behalf across connected applications.
- **Applications** (Resource Servers) — the APIs, MCP servers, and services being
  protected.
- **OAuth Clients** — the registered callers (first-party apps, agents, third-party
  integrations) that request access.
- **Workspace** — the tenant boundary. Every identity, credential, role, and log line is
  scoped to a workspace.

Every other feature below is a view onto this same model — a role granted to a user
behaves the same way a role granted to a service account does, and the same audit trail
captures both.

---

## 2. Application & MCP Server Onboarding

The core workflow for protecting an API, service, or MCP server, from first connection to
production-ready.

- **Guided setup wizard** — pick your stack (Go, Python, or TypeScript), wire in the
  AuthSec SDK, configure environment variables and secrets, then verify protection with a
  live bearer-token challenge against your endpoint.
- **Automatic tool & scope discovery** — point AuthSec at an MCP server's manifest and it
  imports the tool inventory automatically, flagging tools that need scope review, are
  public, or should be denied.
- **Scope catalog per application** — define OAuth scopes with a risk level (low, medium,
  high, critical) and see how many tools each scope currently governs.
- **Launch-readiness dashboard** — every application has an Overview tab that shows a
  real setup checklist and a single "next best action," not vanity metrics.
- **Built-in OAuth/PKCE test harness** — run a live authorization-code + PKCE flow against
  your own application straight from the console: discovery, dynamic client registration,
  bearer challenge, and full browser round-trip, without writing a test script.
- **Drift detection** — get notified when a connected server's manifest changes: a new
  tool appears, a tool is removed, a new scope is suggested, or a manifest fails to parse.
- **Scope presets for common integrations** — spin up canonical scopes for code
  repositories, messaging, file storage, workflow automation, databases, and
  knowledge/RAG systems in one step, or start from a blank slate.

---

## 3. Role-Based Access Control (RBAC)

Standard, Okta/Auth0-shaped RBAC that works identically for users, service accounts, and
agents.

- **Roles built from scopes** — compose a role by binding together the OAuth scopes it
  should carry, at the workspace level or scoped to a single application.
- **Role assignments** — bind roles to any principal type (user, service account, or
  agent), with a searchable "who has access" view per application.
- **Scope catalog** — a workspace-wide, cross-application view of every scope in use.
- **Effective Access resolution** — pick a user (or agent) and an application and see the
  actual, resolved set of granted scopes and their risk levels — not the theoretical
  union of every role, but what's really enforced.
- **Permissions & resources** — a resource/permission model underneath roles, with
  separate admin and end-user views so the right audience sees the right level of detail.

---

## 4. AI Agent Identity & Cross-App Access (XAA)

Purpose-built infrastructure for the part of IAM that legacy vendors don't have an answer
for: an AI agent that needs to act across multiple applications on a user's behalf.

- **Agent registration** — mint a dedicated OAuth client for an agent in one step, with
  its own client ID, secret, and issuer — distinct from a Service Account because an
  agent always logs in as a user first.
- **Cross-app token exchange (ID-JAG)** — an agent authenticates once, then exchanges that
  identity for scoped, short-lived access tokens at each downstream MCP server or API it
  needs to call, via standards-based token exchange and JWT-bearer redemption. No
  password or secret sharing between the apps an agent touches.
- **Trusted issuer federation** — register external identity providers by issuer and JWKS
  URI so agents and workloads authenticated elsewhere can redeem tokens into your
  workspace, with a built-in tool to test a sample assertion before going live.
- **Brokering policies** — explicit allow/deny rules for which external issuers can
  broker access into which applications, evaluated on every redemption.
- **Cross-app debugger** — simulate a cross-app caller against a real application and see
  exactly which gate it passes or fails (domain match, connection approval, brokering
  policy), so integration issues are diagnosable in minutes, not support tickets.

---

## 5. Trust Delegation

Bounded, time-boxed permission delegation for agents and workloads — the piece that lets
you say "yes, but only this, and only for a while."

- **Scoped delegation grants** — bind a specific role to a specific OAuth client (an AI
  agent/MCP server, an autonomous workload, or a service account), restricted to an
  explicit allow-list of actions pulled from your live permission catalog — not the whole
  role.
- **Enforced expiry** — every delegation carries a maximum duration (minutes, hours, or
  days); nothing delegated is delegated forever by default.
- **One-click revocation** — disable a delegation instantly without touching the
  underlying role or the delegate's other access.
- **Guided delegation wizard** — a four-step flow (context → allowed actions → duration
  & lifecycle → review) keeps delegation grants deliberate rather than a free-text
  permission dump.

---

## 6. Workload & Service Identity

Machine and workload authentication that matches how modern infrastructure actually
authenticates, with no one-size-fits-all credential.

- **Client-secret / JWT credentials** — classic OAuth2 client-credentials flow for
  service-to-service calls.
- **Private-key JWT authentication** — a service proves its identity by signing a JWT
  with its own private key; AuthSec verifies against the service's published JWKS URI, so
  there's never a shared secret to leak.
- **SPIFFE/SPIRE workload identity** — Kubernetes pods and infrastructure authenticate
  with a SPIFFE SVID presented at runtime, attested per MCP server, with a guided wizard
  that generates the SPIFFE ID and install snippet for a namespace and service account.
- **One inventory, three credential types** — every machine identity, regardless of how
  it authenticates, is visible and manageable from a single view, filterable by
  credential type.

---

## 7. Authentication & Identity Federation

Federate with the identity providers your customers and workforce already use, from a
single console.

- **OIDC federation** — built-in templates for Google, Microsoft Entra ID (with
  tenant-aware URL derivation), and GitHub, plus a generic custom-OIDC path for anything
  else.
- **SAML federation** — dedicated setup instructions for Okta, Azure/Entra, Auth0, and any
  generic SAML 2.0 identity provider.
- **Passwordless & step-up authentication** — WebAuthn-based passwordless login, plus
  out-of-band push approval (CIBA) and TOTP as a second factor for sensitive admin
  actions, with a managed inventory of every registered approval device.
- **Per-client provider scoping** — restrict which identity providers are available to
  which OAuth clients, rather than exposing every provider globally.

---

## 8. Directory Sync & Provisioning

Keep your user directory and AuthSec in sync automatically, in both directions.

- **SCIM 2.0 inbound provisioning** — generate a SCIM endpoint and token for your identity
  provider (Okta and others) in one step, with full connection lifecycle management
  (status, revoke, per-IdP setup instructions).
- **Active Directory & Microsoft Entra ID sync** — configure directory sync against AD or
  Entra ID with a guided inline form, and trigger an on-demand sync alongside the
  scheduled one.

---

## 9. Consent Management

A standards-based OAuth consent ledger, not a black box.

- **Full consent visibility** — see exactly which user granted which OAuth client access
  to which scopes, on which application.
- **One-click revocation** — pull a consent grant the moment it's no longer appropriate,
  whether the grantor left the company or the client's behavior changed.
- **Per-application view** — consent history lives alongside the rest of an application's
  access data, not in a disconnected admin screen.

---

## 10. Secrets & Third-Party Service Connections

A managed registry for the external services your applications, workloads, and agents
need to call — and the credentials that unlock them.

- **Service registry** — register a third-party service by name, type, and URL, with the
  authentication method it expects (OAuth2, API key, bearer token, basic auth).
- **Credential storage** — store the actual API keys, bearer tokens, and client
  secrets/webhook secrets tied to each service.
- **Agent-access control** — a per-service toggle determines whether AI agents and
  workloads are allowed to draw on that credential at all, so "give the agent this API
  key" is a deliberate, auditable decision rather than an implicit one.

---

## 11. Custom Domains

Branded, first-party authentication experiences.

- **Bring your own domain** — add a custom domain and verify ownership via a DNS TXT
  record — no code changes required.
- **Multiple domains, one primary** — support more than one branded domain per workspace,
  with a single domain designated as the default for authentication flows.

---

## 12. Audit, Logs & Observability

Every authentication, administrative change, and machine-to-machine token decision,
searchable and exportable.

- **Auth Logs** — every authentication attempt, filterable by success/failure and time
  range, with the ability to group by user attribute.
- **Audit Logs** — every administrative change, filterable by action, severity (low
  through critical), and status, with both relative and absolute timestamps.
- **M2M Logs** — service-to-service token issuance and policy-decision events, filterable
  by client, with one-click JSON export of the visible page.
- **Configurable retention & behavior** — tune what gets logged and how, from a dedicated
  logging configuration screen.

---

## How this maps to a buyer's mental model

| If they're evaluating for... | Point to |
|---|---|
| Workforce SSO / federation | §7 Authentication & Identity Federation, §8 Directory Sync |
| Traditional API/B2B IAM | §2 Application Onboarding, §3 RBAC, §9 Consent Management |
| Machine identity / zero-trust infra | §6 Workload & Service Identity, §10 Secrets & Service Connections |
| AI agent security (the differentiator) | §4 AI Agent Identity & Cross-App Access, §5 Trust Delegation |
| Compliance / SOC2 readiness conversations | §12 Audit, Logs & Observability |

The AI-agent story (§4 + §5) is the platform's sharpest differentiator against
Okta/Auth0/AWS IAM/GCP Identity — none of them have a native answer for "an agent that
needs to authenticate once and act across five different tools with scoped, revocable,
time-boxed access." Lead with it.
