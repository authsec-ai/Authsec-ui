# Console page standard

> The mandatory layout contract for every workspace console sidebar page.
> Read before adding a new page or modifying an existing one.

## The shell: `ConsolePage` (`src/components/console/ConsolePage.tsx`)

Every sidebar page renders through `ConsolePage`:

```tsx
<ConsolePage
  title="Service Accounts"
  description="Machine identities for M2M access."
  actions={<Button onClick={onCreate}>Add Service Account</Button>}
>
  <ConsoleFilterBar ... />
  <TableCard>
    <AdaptiveTable ... />
  </TableCard>
</ConsolePage>
```

Do **not** hand-roll `<div data-cr><div className="console-page">` in feature pages.
`ConsolePage` owns the container, max-width, header, and vertical rhythm.

## Layout contract (generated HTML)

```html
<div data-cr>                           <!-- scopes console CSS vars -->
  <div class="console-page">           <!-- max-width + padding -->
    <header class="section-header">    <!-- title row -->
      <div class="min-w-0">
        <h1 class="sh-title">...</h1>  <!-- page title -->
        <p class="sh-desc">...</p>     <!-- optional subtitle, max-width 560px -->
      </div>
      <div class="flex ...">           <!-- right-aligned actions -->
      </div>
    </header>
    <div class="space-y-4">            <!-- body: filter bar, table card, etc. -->
      ...children
    </div>
  </div>
</div>
```

## CSS tokens (in `src/theme/tokens.css`)

| Token | Value | Use |
|---|---|---|
| `--component-table-border` | `#ebedf0` | Table border color |
| `--component-table-row-hover` | `#e7ecf3` | Row hover background |
| `--component-table-cell-padding-block` | `0.8125rem` | Table cell vertical padding |

## CSS classes (in `src/theme/console-screens.css`)

| Class | What it does |
|---|---|
| `.console-page` | Page max-width, padding. Also aliased as `.content-inner`. |
| `.section-header` | Flex row for title + actions; aligns baseline. |
| `.sh-title` | Page title — 22px, font-semibold. |
| `.sh-desc` | Page description — 13px, muted, max-width 560px. |

**Tune CSS centrally, not per-page.** If spacing or sizing needs a fix, edit the
token or class — don't add inline Tailwind to individual pages.

## Detail kit (`src/components/console/detail.tsx`)

Building blocks for slide-out drawers and detail panels. Use these instead of
hand-rolling layout:

| Component | Purpose |
|---|---|
| `DrawerHeader` | Drawer title, optional subtitle + badge. **No icon chip.** |
| `DrawerBody` | Scrollable body area with consistent padding |
| `DrawerSection` | Labeled section within a drawer body |
| `DetailGrid` | 2-column key-value grid |
| `DetailRow` | Single key-value row within a `DetailGrid` |
| `CopyField` | Monospace value + copy-to-clipboard button |
| `DrawerEmpty` | Dashed empty state within a drawer |
| `DrawerFooter` | Sticky footer for actions (Save / Delete) |

Example drawer:
```tsx
<DrawerHeader title="Service Account" subtitle="Read-only details" />
<DrawerBody>
  <DrawerSection title="Identity">
    <DetailGrid>
      <DetailRow label="Client ID"><CopyField value={sa.clientId} /></DetailRow>
      <DetailRow label="Workspace">{sa.workspaceName}</DetailRow>
    </DetailGrid>
  </DrawerSection>
</DrawerBody>
<DrawerFooter>
  <Button variant="destructive" onClick={onDelete}>Delete</Button>
</DrawerFooter>
```

## `RightDrawer` and `hideClose`

`src/components/primitives/RightDrawer.tsx` wraps `SheetContent` with `hideClose` to
prevent a double-X close button (SheetContent renders a built-in close button; if you
add your own close button, pass `hideClose` to suppress the built-in one).

## Primary `<Button>` white-text contract

Primary solid buttons MUST be white text on blue background. Use:
```tsx
<Button className="text-[length:var(--text-sm)] text-white">Create</Button>
```
The `length:` hint prevents tailwind-merge from stripping `text-white` when it sees a
competing `text-*` class from the button variant. Without the hint, some merge orders
produce dark text on a blue button.

## `Select` is full-width by default

`SelectTrigger` is `w-full` — do not add `w-fit` to Select components in forms.
A narrow Select next to a wider input creates visual misalignment.

## Verify

No dev server (authenticated routes need the backend). Verify with:
```
npx tsc --noEmit
npx eslint src/
```
