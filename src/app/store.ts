import { configureStore, createListenerMiddleware } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";

// Import API slices
import { baseApi } from "./api/baseApi";
// Import APIs that inject endpoints into baseApi (imports needed for side effects)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { authApi } from "./api/authApi"; // User authentication endpoints
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { webauthnApi } from "./api/webauthnApi"; // WebAuthn/MFA endpoints
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { externalServiceApi } from "./api/externalServiceApi"; // External services endpoints
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { workloadsApi } from "./api/workloadsApi"; // SPIRE workloads endpoints
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { dashboardApi } from "./api/dashboardApi"; // Dashboard endpoints
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { iamAggregatesApi } from "./api/iamAggregatesApi"; // AI/MCP IAM cockpit read models


// New segregated authentication APIs
import { userAuthApi } from "./api/userAuthApi"; // Direct email/password login
import { oidcApi } from "./api/oidcApi"; // OIDC/OAuth flows
import { deviceApi } from "./api/deviceApi"; // Device management (TOTP/CIBA)

// Import regular slices
import uiSlice from "./slices/uiSlice";

// Import auth slices from new location
import authSlice, { logout } from "../auth/slices/authSlice";
import { resetGraphRevisions } from "../features/iga/shared/revision";
import adminWebAuthnSlice from "../auth/slices/adminWebAuthnSlice";
import oidcWebAuthnSlice from "../auth/slices/oidcWebAuthnSlice";

/**
 * Redux store configuration with RTK Query integration
 *
 * Configures the main application store with:
 * - RTK Query API slices for data fetching
 * - UI state management
 * - Authentication state
 * - Development tools in dev mode
 */
// Ending or switching a session resets the RTK Query cache and the identity graph's pinned
// revisions. The backend takes the workspace from the token, so a cached
// response carries no workspace of its own: without this, the next session on
// the same origin could be served the previous workspace's data
// (SPEC-iga-phase2-graph.md §2.14.14, cache isolation). A session ends by
// signing out, or by `checkSession` finding it expired, which clears the
// session without dispatching `logout`.
function sessionIdentity(state: unknown): string {
  const auth = (state as { auth: { isAuthenticated: boolean; jwtPayload?: { workspace_id?: string; user_id?: string; sub?: string }; user?: { id?: string } } }).auth;
  if (!auth.isAuthenticated) return "signed-out";
  return `${auth.jwtPayload?.workspace_id ?? ""}|${auth.jwtPayload?.user_id ?? auth.user?.id ?? auth.jwtPayload?.sub ?? ""}`;
}
const sessionListener = createListenerMiddleware();
sessionListener.startListening({
  predicate: (action, current, previous) =>
    logout.match(action) ||
    sessionIdentity(current) !== sessionIdentity(previous),
  effect: (_action, api) => {
    api.dispatch(baseApi.util.resetApiState());
    resetGraphRevisions();
  },
});

export const store = configureStore({
  reducer: {
    // RTK Query API slices - baseApi with injected endpoints
    [baseApi.reducerPath]: baseApi.reducer, // Contains authApi, webauthnApi, and externalServiceApi endpoints

    // Segregated authentication APIs (still separate)
    [userAuthApi.reducerPath]: userAuthApi.reducer, // Direct login
    [oidcApi.reducerPath]: oidcApi.reducer, // OIDC/OAuth
    [deviceApi.reducerPath]: deviceApi.reducer, // Device management

    // Regular slices
    ui: uiSlice,
    auth: authSlice,
    adminWebAuthn: adminWebAuthnSlice,
    oidcWebAuthn: oidcWebAuthnSlice,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [
          // Ignore these action types from RTK Query
          "persist/PERSIST",
          "persist/REHYDRATE",
        ],
      },
    })
      .prepend(sessionListener.middleware)
      .concat(
        // Add RTK Query middleware
        baseApi.middleware, // Contains authApi, webauthnApi, and externalServiceApi endpoints
        // Segregated authentication middleware
        userAuthApi.middleware,
        oidcApi.middleware,
        deviceApi.middleware,
      ),
  devTools: process.env.NODE_ENV !== "production",
});

// Enable listener behavior for the store
setupListeners(store.dispatch);

// Infer types from the store itself
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
