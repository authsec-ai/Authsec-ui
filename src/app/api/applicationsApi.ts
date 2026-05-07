/**
 * Phase 1 alias slice — `Application` is the new name for `ResourceServer`.
 *
 * Feature code should import from this file (not from `resourceServersApi`)
 * so that Phase 4 can rename the underlying slice without touching feature
 * code. New endpoints unique to Launch Control (readiness, runtime summary,
 * test scenario, activity, launch) get added here as the backend ships
 * them.
 *
 * Until the backend exposes the new endpoints, callers should derive
 * readiness from `Application` fields client-side via
 * `computeReadiness()` (added in Phase 2).
 */

import type {
  ResourceServer,
  CreateResourceServerRequest,
  ResourceServerCreateResponse,
} from "./resourceServersApi";

import {
  useListResourceServersQuery,
  useGetResourceServerQuery,
  useCreateResourceServerMutation,
  useUpdateResourceServerMutation,
  useDeleteResourceServerMutation,
  useRotateResourceServerSecretMutation,
} from "./resourceServersApi";

// ── Type aliases ────────────────────────────────────────────────────────────

export type Application = ResourceServer;
export type CreateApplicationRequest = CreateResourceServerRequest;
export type ApplicationCreateResponse = ResourceServerCreateResponse;

// ── Hook re-exports (preserve existing call sites; new code uses these) ─────

export const useListApplicationsQuery = useListResourceServersQuery;
export const useGetApplicationQuery = useGetResourceServerQuery;
export const useCreateApplicationMutation = useCreateResourceServerMutation;
export const useUpdateApplicationMutation = useUpdateResourceServerMutation;
export const useDeleteApplicationMutation = useDeleteResourceServerMutation;
export const useRotateApplicationSecretMutation = useRotateResourceServerSecretMutation;
