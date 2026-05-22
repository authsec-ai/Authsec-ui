/**
 * Scope Presets API — starter vocabularies surfaced on the
 * Create Application page. Backend exposes a static catalog at
 * `GET /authsec/scope-presets`; the UI uses these to seed the
 * scope vocabulary for a new resource server.
 *
 * None of these presets grant access by themselves — they only
 * create scope *names*. Granting happens later on the Access tab.
 */

import { baseApi } from "./baseApi";

export type ScopePresetRisk = "low" | "medium" | "high" | "critical";

export type PresetScopeDef = {
  suffix: string;
  description: string;
  risk: ScopePresetRisk;
};

export type ScopePresetCategory = "common" | "domain" | "custom";

export type ScopePreset = {
  /**
   * Catalog id, e.g. `read_only`, `read_write`, `code_repos`, `messaging`,
   * `file_storage`, `workflow_actions`, `database`, `knowledge_rag`,
   * `voice_agent`, `blank`, etc.
   */
  id: string;
  name: string;
  category: ScopePresetCategory;
  description: string;
  recommended: boolean;
  scopes: PresetScopeDef[];
};

export type ListScopePresetsResponse = {
  presets: ScopePreset[];
};

export const scopePresetsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listScopePresets: build.query<ScopePreset[], void>({
      query: () => ({ url: "authsec/scope-presets" }),
      transformResponse: (response: ListScopePresetsResponse) => response.presets,
    }),
  }),
});

export const { useListScopePresetsQuery } = scopePresetsApi;
