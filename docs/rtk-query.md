# RTK Query — slice pattern

> The canonical pattern for every API slice in this repo. Deviation causes
> cache invalidation bugs, TypeScript errors, and stale UI.

## The pattern every slice MUST follow

```typescript
// src/app/api/myFeatureApi.ts

import { baseApi, withSessionData } from './baseApi';

// 1. Export the API slice (injected into baseApi — NOT a separate createApi)
export const myFeatureApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({

    // 2. Queries: use builder.query<ReturnType, ArgType>
    listThings: builder.query<Thing[], { workspaceId: string }>({
      query: ({ workspaceId }) => ({
        url: `/workspaces/${workspaceId}/things`,
        method: 'GET',
      }),
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: 'Thing' as const, id })), 'Thing']
          : ['Thing'],
    }),

    getThing: builder.query<Thing, { workspaceId: string; id: string }>({
      query: ({ workspaceId, id }) => `/workspaces/${workspaceId}/things/${id}`,
      providesTags: (_, __, { id }) => [{ type: 'Thing', id }],
    }),

    // 3. Mutations: use builder.mutation<ReturnType, ArgType>
    createThing: builder.mutation<Thing, { workspaceId: string; name: string }>({
      query: ({ workspaceId, ...body }) => ({
        url: `/workspaces/${workspaceId}/things`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Thing'],
    }),

    updateThing: builder.mutation<Thing, { workspaceId: string; id: string; name: string }>({
      query: ({ workspaceId, id, ...body }) => ({
        url: `/workspaces/${workspaceId}/things/${id}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (_, __, { id }) => [{ type: 'Thing', id }, 'Thing'],
    }),

    deleteThing: builder.mutation<void, { workspaceId: string; id: string }>({
      query: ({ workspaceId, id }) => ({
        url: `/workspaces/${workspaceId}/things/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Thing'],
    }),
  }),
  // 4. Never override existing endpoints
  overrideExisting: false,
});

// 5. Export typed hooks — always export from the slice file
export const {
  useListThingsQuery,
  useGetThingQuery,
  useCreateThingMutation,
  useUpdateThingMutation,
  useDeleteThingMutation,
} = myFeatureApi;
```

## Tag types — add to `baseApi.ts`

Before using a new tag type, add it to `baseApi`'s `tagTypes` array:
```typescript
export const baseApi = createApi({
  tagTypes: [
    // ... existing tags ...
    'Thing',   // ← add your new tag here
  ],
  endpoints: () => ({}),
});
```
Missing tag types cause TypeScript errors and broken cache invalidation.

## Cache invalidation rules

- `providesTags`: the query provides these cache entries. When any of them is invalidated, the query refetches.
- `invalidatesTags`: the mutation invalidates these. Any query providing those tags refetches automatically.
- **Granular invalidation**: `{ type: 'Thing', id }` only refetches the specific item.
- **List invalidation**: `'Thing'` (string, not object) invalidates all list queries for that type.
- **Both**: `invalidatesTags: (_, __, { id }) => [{ type: 'Thing', id }, 'Thing']` refetches the item AND the list.

## `withSessionData` — when to use

`withSessionData` injects `workspace_id`, `client_id`, `project_id` from
`localStorage.authsec_session_v2` into the request body. Use it for legacy
endpoints that require these fields in the body (not URL):
```typescript
query: (body) => ({
  url: '/some/legacy/endpoint',
  method: 'POST',
  body: withSessionData(body),
}),
```
New endpoints should take workspace_id as a URL param — use `withSessionData` only
where the backend requires it in the body.

## Using in components

```typescript
// In a page component:
const { data: things, isLoading, isError } = useListThingsQuery({ workspaceId });
const [createThing, { isLoading: isCreating }] = useCreateThingMutation();

// Mutation with error handling:
const handleCreate = async (name: string) => {
  try {
    await createThing({ workspaceId, name }).unwrap();
    // success
  } catch (err) {
    // err is the API error
  }
};
```

## `AdaptiveTable` gotcha — `onRowClick`

`ResponsiveDataTable` (`src/components/primitives/responsive-data-table.tsx`) calls
`onRowClick(row.original)` internally. The callback receives **the data item directly**,
not a TanStack Row object:

```typescript
// ✅ CORRECT
<AdaptiveTable
  onRowClick={(thing) => setSelected(thing)}
  // thing is Thing, not Row<Thing>
/>

// ❌ WRONG — .original does not exist on the data item
<AdaptiveTable
  onRowClick={(row) => setSelected(row.original)}
/>
```

## Skip conditions

Use `skip` to avoid queries that aren't ready:
```typescript
const { data } = useGetThingQuery({ workspaceId, id }, { skip: !id });
```

## Polling

```typescript
const { data } = usePollQuery(args, { pollingInterval: 5000 }); // 5s
```

## Do not

- Do not call `createApi` for new slices — always `baseApi.injectEndpoints`.
- Do not put business logic in API slices (transformations, filters). Do it in the
  component or a selector.
- Do not `dispatch` RTK Query actions manually from components — use hooks.
