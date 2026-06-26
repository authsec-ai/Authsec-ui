# UI coding practices

> TypeScript + React conventions for Authsec-ui. Read before writing new components
> or modifying existing ones.

## Page structure

Every new console page:
1. Renders through `ConsolePage` (see `docs/console-standard.md`).
2. Gets its data from RTK Query hooks (see `docs/rtk-query.md`).
3. Lives in `src/features/<domain>/`.
4. Is registered as a route in the router.

## Component conventions

- **No class components.** Functional components only.
- **No prop drilling past 2 levels.** Use RTK Query hooks in the component that needs the data.
- **Co-locate**: a component only used by one feature lives in `src/features/<domain>/components/`.
  Shared primitives live in `src/components/`.
- **Dialogs**: use `src/components/ui/dialog.tsx` primitives (`DialogHeader`, `DialogTitle`,
  `DialogDescription`, `DialogFooter`). No custom dialog layouts.
- **Drawers**: use `RightDrawer` + the `detail.tsx` kit. No icon chips on drawer headers.

## TypeScript

- `interface` for shapes that might be extended; `type` for unions and aliases.
- Don't use `any`. If a type is unknown, use `unknown` and narrow it.
- RTK Query hooks are always typed — use the generated hook, don't cast the result.
- Prefer `T | undefined` over optional chaining chains (`a?.b?.c?.d`) — trace the type
  to its origin and fix the interface.

## State management

- **Server state** (data from the backend) → RTK Query. Never copy server data into
  `useState`.
- **UI state** (open/closed dialogs, selected rows, form values) → `useState` or
  `useReducer` in the component.
- **Global UI state** (sidebar, theme) → `ui` Redux slice. Add to the slice only when
  state is genuinely shared across unrelated components.

## Forms

Use `react-hook-form`. Don't manage form state manually with `useState` per field.
```tsx
const form = useForm<FormValues>({ defaultValues: { name: '' } });
const { register, handleSubmit, formState: { errors } } = form;
```

## Tailwind

- Tailwind v4 (`@tailwind` directives replaced by CSS `@import`).
- Use design tokens (CSS variables) for colors and spacing — don't hard-code hex values.
- Don't `@apply` in feature CSS. Use Tailwind classes directly in JSX.
- `@source not "../**/*.md"` is already in `src/index.css` to prevent Tailwind scanning
  `.md` files for classes.

## Error handling in components

```tsx
const [doAction, { isLoading, error }] = useDoActionMutation();

const handleAction = async () => {
  try {
    await doAction(args).unwrap();
    toast.success('Done');
  } catch (err) {
    toast.error('Something went wrong');
  }
};
```

Never swallow errors silently. Always surface them to the user (toast, inline error message).

## No tests unless asked

Don't add Vitest / Jest tests unless explicitly requested. Verify correctness with:
```
npx tsc --noEmit
npx eslint src/
```

## Naming

- Components: `PascalCase` (`ServiceAccountsPage`, `DeleteAccountDialog`).
- Hooks: `camelCase` starting with `use` (`useSelectedAccount`).
- API slice files: `camelCase` ending in `Api` (`agentIdentityApi.ts`).
- Feature dirs: `kebab-case` (`service-accounts/`).
- No `tenant` in new code — use `workspace`.

## Clean-code rules

- Don't add code that isn't needed for the current task.
- Delete code that a change makes obsolete.
- Reuse before you add: check if a helper or component already exists.
- If a page looks different from the rest of the console (different padding, different
  table style, different header), it's a bug — fix it via `ConsolePage` or the tokens,
  not via per-page overrides.
