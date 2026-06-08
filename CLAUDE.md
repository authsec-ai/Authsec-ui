# Authsec-ui — Working Notes for AI Agents

This file is the canonical orientation for Claude Code (and any other AI agent
working in this repo). Read this before touching shadcn primitives, console
screens, or anything that ships pixels.

---

## Buttons — primary action color contract

**Solid primary buttons MUST render white text on the brand blue.** That's the
look across the product (`Save grants`, `Grant to Viewer`, `Add provider`,
etc.). If you render a primary CTA with dark text on blue, that's a regression.

The Button primitive is at [src/components/ui/button.tsx](src/components/ui/button.tsx).
The `default` variant carries `bg-[var(--component-button-primary-bg)] text-white`
and the `destructive` variant carries `bg-[var(--component-button-destructive-bg)]
text-white`. Don't override those unless you know exactly what you're doing.

### The trap: `size="sm"` used to strip the white

Until 2026-06-08, the `sm` and `lg` size variants used `text-[var(--font-size-sm)]`
without a `length:` hint. `tailwind-merge` reads that as a `text-*` class and
collides it with `text-white` from the color variant — and silently drops the
white. The bug surfaced as `<Button size="sm">` rendering dark text on blue
while `<Button>` (default size) rendered correctly.

The size variants now use `text-[length:var(...)]` to disambiguate. **Do not
revert that.** If you add new size variants or arbitrary text-size classes
elsewhere, always use the `length:` hint:

```tsx
// CORRECT
className="text-[length:var(--font-size-sm)]"

// WRONG — tailwind-merge will collide this with text-white
className="text-[var(--font-size-sm)]"
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

The tab strip already sits inside `data-cr` from `ApplicationLayout`. Don't add
an explicit `marginTop` to `.tabbar-wrap` — the header's `padding-bottom`
already creates the right gap. (Doubling it produces a visibly loose tab strip;
removed on 2026-06-08.)

---

## Verifying changes locally

This app's authenticated routes can't be previewed without the backend stack
running. **Do not start the dev server to verify a UI change** — it'll just
sit at the login wall. Verify with `npx tsc --noEmit` and `npx eslint <file>`.
For visual review, the user has the live stage app at
`https://*.stage.authsec.dev` and will eyeball changes after deploy.

---

## Bulk actions on the Tools page

The Tools page at [src/features/applications/ApplicationToolsPage.tsx](src/features/applications/ApplicationToolsPage.tsx)
supports multi-select with a sticky bulk-action bar. Backend's
`UpdateToolScopeMap` accepts a `mappings: [...]` array and applies atomically,
so any new bulk operation should issue one API call per action, not N calls.
Skip no-op mappings client-side (assigning a scope a tool already has, removing
one it doesn't) — the backend will silently drop them but they pollute logs.

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
