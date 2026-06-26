# UI Architecture

> Read this before adding a new page, new API slice, or touching state management.
> Stack: Vite + React 18 + TypeScript + Tailwind v4 + shadcn + Redux Toolkit + RTK Query.

## Store shape (`src/app/store.ts`)

```
store
├── baseApi          — RTK Query: all injected API slices (authApi, workloadsApi, rolesApi, …)
├── userAuthApi      — direct email/password login (separate reducerPath)
├── oidcApi          — OIDC/OAuth flows
├── deviceApi        — TOTP / CIBA device management
├── ui               — sidebar collapsed, current page, loading, theme
├── auth             — session token, workspace_id, user identity
├── adminWebAuthn    — admin passkey ceremony state
└── oidcWebAuthn     — OIDC passkey ceremony state
```

**`baseApi`** is the primary query store. Nearly all data-fetching slices inject into
it via `baseApi.injectEndpoints({})`. The few standalone APIs (`userAuthApi`, `oidcApi`,
`deviceApi`) are separate because they handle authentication before a session exists.

## RTK Query slices (`src/app/api/`)

~45 slice files, all injecting into `baseApi`. One slice per backend domain area:

| Slice file | Domain |
|---|---|
| `rolesApi.ts` | Roles CRUD |
| `permissionsApi.ts` | Permissions CRUD |
| `bindingsApi.ts` | Role bindings |
| `scopeMatrixApi.ts` | Scope matrix / assignments |
| `scopePresetsApi.ts` | Scope presets catalog |
| `accessApi.ts` | Access control, access requests |
| `agentIdentityApi.ts` | Service accounts, agent connections, access assignments |
| `applicationsApi.ts` | Applications / resource servers |
| `appWorkloadsApi.ts` | SPIRE workload entries |
| `workloadsApi.ts` | Workload lifecycle |
| `workloadProvidersApi.ts` | Workload identity providers |
| `trustedIssuersApi.ts` | Trusted issuers |
| `brokeringPoliciesApi.ts` | A2A brokering policies |
| `trustDelegationApi.ts` | Delegation policies |
| `resourceServersApi.ts` | Resource server management |
| `resourcesApi.ts` | Resource / tool definitions |
| `clientApi.ts` | OAuth clients |
| `mcpClientsApi.ts` | MCP OAuth clients |
| `membershipApi.ts` | Workspace memberships |
| `invitesApi.ts` | Member invites |
| `oidcApi.ts` | OIDC provider CRUD |
| `samlApi.ts` | SAML provider CRUD |
| `authMethodApi.ts` | Auth method management |
| `authApi.ts` | Auth state, session |
| `userAuthApi.ts` | Direct login (standalone) |
| `webauthnApi.ts` | WebAuthn/passkeys |
| `deviceApi.ts` | TOTP/CIBA device flow (standalone) |
| `logsApi.ts` | Auth / audit / M2M logs |
| `dashboardApi.ts` | Dashboard stats |
| `iamAggregatesApi.ts` | IAM read-model aggregates |
| `scimConnectionsApi.ts` | SCIM 2.0 connections |
| `syncConfigsApi.ts` | SCIM sync configurations |
| `consentGrantsApi.ts` | OAuth consent grants |
| `billingApi.ts` | Billing / plans |
| `domainApi.ts` | Custom domains |
| `vaultApi.ts` | Vault integration |
| `externalServiceApi.ts` | External service connections |
| `adminVoiceAgentApi.ts` | Voice agent (admin) |
| `voiceAgentApi.ts` | Voice agent (end-user) |
| `setupWizardApi.ts` | Onboarding setup wizard |
| `iamAggregatesApi.ts` | Aggregated IAM data |
| `LEGACY_groupsApi.ts` | Groups (legacy, being phased out) |

## Feature directories (`src/features/`)

Each feature owns: its pages, components, dialogs, and imports hooks from the relevant
API slice. The pattern is **feature-first** — no shared component imports across features
except from `src/components/`.

| Feature dir | Pages |
|---|---|
| `access/` | Access Control (Roles, Scopes, Assignments) |
| `applications/` | Applications list + detail |
| `agents/` | Agent connections inventory |
| `service-accounts/` | Service account inventory + CRUD |
| `end-users/` | End user directory |
| `users/` | Admin user management |
| `permissions/` | Permission management |
| `roles/` | Role management |
| `role-bindings/` | Role binding list |
| `scope-matrix/` | Scope matrix table |
| `authentication/` | IdP / auth method configuration |
| `logging/` | Auth / audit / M2M log viewer |
| `dashboard/` | Dashboard home |
| `resource-servers/` | Resource server detail |
| `clients/` | OAuth client list |
| `trust-delegation/` | Delegation policies |
| `settings/` | Workspace settings |
| `billing/` | Billing |
| `vault/` | Vault keys |

## Routing

Routes are defined in `src/app/` (React Router v6). Each route maps to a feature page
component. All authenticated sidebar pages go through `ConsolePage`.

## Data flow

```
Page component
  → useXxxQuery(args, options)         ← generated RTK hook (from injectEndpoints)
    → baseApi cache (RTK Query)
      → fetchBaseQuery → backend API
        ← response
      → cached in store[baseApi.reducerPath]
  → result.data, result.isLoading, result.isError
```

Mutations:
```
Page component
  → const [doMutation, { isLoading }] = useXxxMutation()
  → doMutation(body).unwrap()           ← throws on error (use try/catch)
    → backend API (POST/PUT/DELETE)
      ← 200 triggers invalidatesTags → refetch dependent queries
```

## Verification (no dev server)

Authenticated routes can't be previewed locally (need the backend). Verify with:
```
npx tsc --noEmit    # type errors
npx eslint src/     # lint
```
