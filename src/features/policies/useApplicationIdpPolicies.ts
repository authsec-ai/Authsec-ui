/**
 * Approved identity providers, per MCP server.
 *
 * The backend keeps an optional allow-list per application
 * (`GET /authsec/applications/:id/identity-providers`): with no entries the
 * MCP server accepts every identity provider (default-allow); with entries it
 * accepts only the enabled ones. There is no workspace-wide list endpoint, so
 * this subscribes to the per-application query for every MCP server and
 * returns the results together. The cache entries are the same ones the
 * add/remove mutations invalidate, so changes refetch on their own.
 */

import { useEffect, useMemo } from "react";
import { shallowEqual } from "react-redux";

import { authMethodApi, type ApplicationIDPPolicy } from "@/app/api/authMethodApi";
import { useAppDispatch, useAppSelector } from "@/app/hooks";

export interface AppIdpPolicies {
  applicationId: string;
  policies: ApplicationIDPPolicy[];
  /** Identity provider ids this MCP server accepts; null when it accepts every provider. */
  allowed: string[] | null;
}

const endpoint = authMethodApi.endpoints.listApplicationIDPPolicies;

export function useApplicationIdpPolicies(applicationIds: string[]) {
  const dispatch = useAppDispatch();
  const key = applicationIds.join(",");

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    const subs = ids.map((id) => dispatch(endpoint.initiate(id)));
    return () => subs.forEach((s) => s.unsubscribe());
  }, [dispatch, key]);

  const selectors = useMemo(
    () => (key ? key.split(",") : []).map((id) => endpoint.select(id)),
    [key],
  );
  const results = useAppSelector((state) => selectors.map((sel) => sel(state)), shallowEqual);

  return useMemo(() => {
    const byApp = new Map<string, AppIdpPolicies>();
    const ids = key ? key.split(",") : [];
    ids.forEach((id, i) => {
      const r = results[i];
      if (!r?.data) return;
      const policies = r.data;
      const enabled = policies.filter((p) => p.enabled).map((p) => p.identity_provider_id);
      byApp.set(id, { applicationId: id, policies, allowed: enabled.length ? enabled : null });
    });
    const isLoading = results.some((r) => !r || r.isUninitialized || r.isLoading);
    const isError = results.some((r) => r?.isError);
    return { byApp, isLoading, isError };
  }, [key, results]);
}
