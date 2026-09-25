# Authsec-ui — Working Notes for AI Agents

Read the [workspace instructions](../AGENTS.md) first. This file supplies the
React/TypeScript console conventions for any assistant or engineer.

## Current graph work

The design entrypoint is
[`SPEC-iga-phase2-graph.md`](../authsec/.claude/specs/SPEC-iga-phase2-graph.md).
The goal is an end-to-end AWS scanning and graph experience; a fixture-backed
screen is not evidence that its backend contract exists. Keep screen contracts,
capability handling, authorization, workspace-scoped caching and publication
consistency aligned with the backend.

Preserve existing GitHub, Kubernetes and other product screens and behaviors.
Do not remove unrelated navigation or substitute legacy endpoints just to make
the AWS graph appear complete. Use the current `authsec-staging` working tree;
preserve other people's changes. Reviews and prompt requests stay read-only
unless the user asks for edits.

---

## Buttons — primary action color contract

**Solid primary buttons MUST render white text on the brand blue.** That's the
look across the product (`Save grants`, `Grant to Viewer`, `Add provider`,
etc.). If you render a primary CTA with dark text on blue, that's a regression.

The Button primitive is at [src/components/ui/button.tsx](src/components/ui/button.tsx).
The `default` variant carries `bg-[var(--component-button-primary-bg)] text-white`
and the `destructive` variant carries `bg-[var(--component-button-destructive-bg)]
text-white`. Don't override those unless you know exactly what you're doing.

### Arbitrary font sizes

Use `text-[length:var(...)]` for arbitrary font sizes. Without the `length:`
hint, `tailwind-merge` can treat the size as a text-color class and drop
`text-white`. Preserve the existing size variants' hints:

```tsx
className="text-[length:var(--font-size-sm)]"
```

### Belt-and-suspenders rule

When putting a primary `<Button>` inside a container with a custom background
(sticky bars, popovers, dialogs), explicitly add `text-white` to the className.
The variant already carries it, but if a future regression strips it, the local
declaration keeps the contrast contract intact.

---

## Sheet / Dialog accessibility

Radix Dialog (which `Sheet` is built on) warns if `DialogContent`/`SheetContent`
renders without a `DialogTitle`/`SheetTitle` and `DialogDescription`/`SheetDescription`.
The warning is real — screen readers need them. Every `SheetContent` in the
repo MUST include both, even if the visible UI has its own header.

If the visible UI already has a heading, hide the a11y title via `sr-only`:

```tsx
<SheetContent ...>
  <SheetTitle className="sr-only">User details</SheetTitle>
  <SheetDescription className="sr-only">
    Inspect this end-user's identity, sessions, and access.
  </SheetDescription>
  {/* visible content */}
</SheetContent>
```

The `RightDrawer` primitive at [src/components/primitives/RightDrawer.tsx](src/components/primitives/RightDrawer.tsx)
already does this via `ariaTitle` / `ariaDescription` props with safe defaults.
Prefer `RightDrawer` for new side-panel UI.

---

## Console Refresh — `[data-cr]` scope

Detail screens live under a `<div data-cr>` wrapper that applies the design
prototype's class names without leaking them into the rest of the app. See
[src/theme/console-screens.css](src/theme/console-screens.css). Anything
rendered through `<Outlet>` in `ApplicationLayout` is **outside** that scope —
so console-refresh utility classes (`.tabbar`, `.btn-primary`, `.drawer-head`,
etc.) won't apply unless you wrap your subtree in `data-cr` yourself.

The tab strip sits inside `data-cr` from `ApplicationLayout`. Do not add
an explicit `marginTop` to `.tabbar-wrap` when the header padding already
provides the gap.

---

## Verifying changes locally

This app's authenticated routes can't be previewed without the backend stack
running. **Do not start the dev server to verify a UI change** — it'll just
sit at the login wall. Verify with `npx tsc -p tsconfig.app.json --noEmit` and
`npx eslint <file>`.

> **Use `-p tsconfig.app.json`.** The root `tsconfig.json` is a solution file
> with `"files": []`; bare `npx tsc --noEmit` does not type-check the app. A
> successful Vite build is not a substitute for TypeScript checking.

Capture the actual baseline before a code change and compare diagnostics by
file, code and message afterwards. Error counts alone can hide a new failure
replacing an old one. Do not assume a fixed number of pre-existing failures or
raise CI thresholds to hide new diagnostics. Run applicable lint and the
production build for application changes; verify authenticated behavior against
an authorized backend when the task requires it.

Documentation-only changes require reference and diff checks, not a dev server,
application build, SDK change, commit or deployment. Never paste session tokens
into documentation or logs. Deployment hosts and build configuration are in the
release reference below.

## Production deployment

The production release procedure is documented in
[`../authsec/.claude/specs/SPEC-deployment-k3s.md`](../authsec/.claude/specs/SPEC-deployment-k3s.md).

- Production Deployment/container: `authsec-prod/prod-ui` / `prod-ui`.
- Build the local working tree as an immutable `linux/amd64` image.
- Set both `VITE_API_URL` and `VITE_OAUTH_BASE_URL` to
  `https://prod.api.authsec.ai` at build time.
- Deploy only after the matching backend is healthy.
- [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) declares push
  deployment from `authsec-staging` and manual dispatch. A push may deploy;
  workflow configuration alone does not prove its prerequisites are configured.
  Apply the root approval and cutover restrictions.

---

## Bulk actions on the Tools page

The Tools page at [src/features/applications/ApplicationToolsPage.tsx](src/features/applications/ApplicationToolsPage.tsx)
supports multi-select with a sticky bulk-action bar. Backend's
`UpdateToolScopeMap` accepts a `mappings: [...]` array and applies atomically,
so any new bulk operation should issue one API call per action, not N calls.
Skip no-op mappings client-side (assigning a scope a tool already has, removing
one it doesn't) — the backend will silently drop them but they pollute logs.

---

## Console page standard — one shell for every page

Every sidebar/console page renders through **one central shell**, so width,
header, and spacing are identical product-wide. Do **not** hand-roll page
headers (`<div data-cr><div className="console-page"><div className="section-header">`).

- **Page shell:** [src/components/console/ConsolePage.tsx](src/components/console/ConsolePage.tsx)
  — `<ConsolePage title description actions>`. Emits `data-cr → .console-page →
  .section-header → .space-y-4` body.
- **Table stack inside it:** `<ConsoleFilterBar>` (search + optional segmented
  filter pills) → `<TableCard><CardContent variant="flush">` → `<AdaptiveTable>`
  (columns are `AdaptiveColumn[]`; identity column uses `<EntityCell>`; row actions
  via `<ConsoleRowActions>`). **`onRowClick` gets the row DATA item directly** — no
  `.original`.
- **Drawers + modals:** [src/components/console/detail.tsx](src/components/console/detail.tsx)
  — `DrawerHeader / DrawerBody / DrawerSection / DetailGrid / DetailRow / CopyField /
  DrawerEmpty / DrawerFooter`. No icon chips in headers. A `Sheet` that renders its
  own close button MUST pass `hideClose` to `SheetContent`, else you get a double-X.
- **Reference pages:** `src/features/access/AccessControlPage.tsx` (tables) and
  `src/features/service-accounts/ServiceAccountsPage.tsx` (tables + drawer + CRUD).
- Look is tuned centrally — `src/theme/console-screens.css` (`.sh-title`/`.sh-desc`),
  `src/theme/tokens.css` (`--component-table-*` border/hover/padding),
  `src/components/ui/dialog.tsx`, `src/components/ui/select.tsx`. Tune there, not
  per-page. Keep existing color tokens; don't add new colors.

---

## Terminology — always follow market standards

Every label, heading, button, and tooltip in the UI is the product's public
voice. Security buyers compare AuthSec against Okta, Auth0, AWS IAM, and GCP
Identity the moment they open it. Mismatched terminology signals immaturity
and creates support burden.

**Hard rule: before writing any UI copy (page title, sidebar label, button
text, empty-state, dialog heading, error message), check what the dominant
security vendors call the same concept. Use that name. Do not invent product
jargon where a standard term exists.**

### Legacy-runtime term map for UI copy

| Concept | ✅ Use this | ❌ Never use this |
|---|---|---|
| Non-human identity with client_id + secret for M2M | **Service Account** | "Workload" for credential-based M2M |
| Running pod / SPIFFE workload identity | **Workload** | Conflating the runtime with its credential or service account |
| Sidebar section covering both | **Workloads** only if the page clearly separates the two types with correct sub-labels | Unnamed mix |
| OAuth registered application | **Client** or **Application** (consistent with Okta/Auth0) | custom names |
| Token permission string | **Scope** | "Permission" at the OAuth UI layer |
| RBAC permission node | **Permission** | "Scope" at the RBAC layer |
| Organization boundary | **Workspace** | "Tenant" |
| Cross-app agent delegation | **Agent** (product term) — explain as "acts on behalf of a user" | internal protocol names as UI copy |

For IGA discovery, distinguish the running workload from the identity it uses.
Keep provider-native object names: a Kubernetes ServiceAccount and a GCP service
account are legitimate identity types. Do not apply the legacy M2M term map as a
ban on those names or imply that every discovered workload is an AI agent. Use
the graph spec's classification and evidence wording, and verify provider-specific
claims when introducing them.

---

## Completion checks

Use the applicable parts of [the ship checklist](../.claude/commands/ship.md),
with the explicit app TypeScript command above. The checklist is not an
instruction to commit or deploy a review or documentation change.

- For UI code: compare TypeScript diagnostics, lint affected files, build, and
  verify changed interactions in the authorized authenticated environment.
- State SDK/public-doc implications when the change affects those consumers.
- Preserve unrelated changes; do not stage, commit or deploy unless the task
  calls for it. `git push` requires explicit per-command approval.
- For mutations, verify the RTK invalidation/refetch path. Graph publication
  changes must follow the spec's explicit refresh rule rather than silently
  combining data from different revisions. Preserve workspace isolation.

---

## Anti-patterns to refuse

- Primary `<Button>` with anything other than white text — read the contract above
- New `text-[var(...)]` arbitrary classes without the `length:` hint
- `SheetContent` / `DialogContent` without a `SheetTitle` + `SheetDescription`
  (use `sr-only` if you don't want them visible)
- Wrapping `<Outlet>` content with console-refresh CSS classes assuming they're
  in `data-cr` scope — they aren't
- Starting the dev server to verify UI changes (the routes need the backend)
- Adding tests the user didn't ask for

---

## Deep docs index

Load the relevant doc before working in that area.

| I'm about to… | Read this first |
|---|---|
| Add a new page / understand how pages are structured | [`docs/architecture.md`](docs/architecture.md) |
| Add a new API slice / RTK Query endpoint | [`docs/rtk-query.md`](docs/rtk-query.md) |
| Add or modify a console page layout, drawer, or table | [`docs/console-standard.md`](docs/console-standard.md) |
| Follow TypeScript / React / Tailwind conventions | [`docs/coding-practices.md`](docs/coding-practices.md) |
