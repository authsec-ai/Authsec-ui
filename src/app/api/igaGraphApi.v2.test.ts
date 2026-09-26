import { defaultSerializeQueryArgs } from "@reduxjs/toolkit/query";
import { describe, expect, it } from "vitest";

import { graphUrls } from "./igaGraphApi";

const ws = "ws-1";
const id = "11111111-1111-4111-8111-111111111111";

function cacheKey(queryArgs: object): string {
  return defaultSerializeQueryArgs({
    endpointDefinition: {} as never,
    endpointName: "graph",
    queryArgs,
  });
}

describe("default graph URLs", () => {
  const golden: [string, string][] = [
    ["capabilities", graphUrls.capabilities()],
    ["pipeline", graphUrls.pipeline({ ws })],
    ["coverage", graphUrls.coverage({ ws })],
    ["workloads", graphUrls.workloads({ ws })],
    ["workload", graphUrls.workload({ ws, id })],
    ["workload identities", graphUrls.workloadIdentities({ ws, id })],
    ["workload resources", graphUrls.workloadResources({ ws, id })],
    ["classification", graphUrls.workloadClassification({ ws, id })],
    ["identities", graphUrls.identities({ ws })],
    ["identity", graphUrls.identity({ ws, id })],
    ["used by", graphUrls.identityUsedBy({ ws, id })],
    ["permissions", graphUrls.identityPermissions({ ws, id })],
    ["external", graphUrls.externalPrincipal({ ws, id })],
    ["referenced by", graphUrls.externalReferencedBy({ ws, id })],
    ["resources", graphUrls.resources({ ws })],
    ["resource", graphUrls.resource({ ws, id })],
    ["access", graphUrls.resourceAccess({ ws, id })],
    ["changes", graphUrls.changes({ ws, object: "workloads", id, kind: "configuration" })],
    ["graph", graphUrls.neighbourhood({ ws, root: `workload:${id}`, direction: "forward" })],
    ["expand", graphUrls.expand({ ws, node: `identity:${id}`, edge: "grant", direction: "forward" })],
    ["path", graphUrls.path({ ws, from: `workload:${id}`, to: `identity:${id}` })],
    ["evidence", graphUrls.evidence({ ws, claim: `grant:${id}` })],
    ["lookup", graphUrls.lookup({ ws, cloud_ref: "arn:aws:iam::1:role/a" })],
    ["runtime instances", graphUrls.runtimeInstances({ ws, id })],
    ["observed access", graphUrls.observedAccess({ ws, id })],
    ["runtime policy", graphUrls.runtimePolicyStatus({ ws, id })],
    ["observed use", graphUrls.identityObservedUse({ ws, id })],
  ];

  it("matches the pre-v2 URL list and never sends graph or provider", () => {
    const urls = golden.map(([, url]) => url);
    expect(urls).toEqual([
      "/api/iga/v1/capabilities",
      "/api/iga/v1/pipeline",
      "/api/iga/v1/coverage",
      "/api/iga/v1/workloads?facets=account%2Cruntime_kind%2Cclassification%2Cregion",
      `/api/iga/v1/workloads/${id}`,
      `/api/iga/v1/workloads/${id}/identities`,
      `/api/iga/v1/workloads/${id}/resources`,
      `/api/iga/v1/workloads/${id}/classification`,
      "/api/iga/v1/identities?facets=account%2Ckind",
      `/api/iga/v1/identities/${id}`,
      `/api/iga/v1/identities/${id}/used-by`,
      `/api/iga/v1/identities/${id}/permissions`,
      `/api/iga/v1/external-principals/${id}`,
      `/api/iga/v1/external-principals/${id}/referenced-by`,
      "/api/iga/v1/resources?facets=kind%2Cservice%2Caccount",
      `/api/iga/v1/resources/${id}`,
      `/api/iga/v1/resources/${id}/access`,
      `/api/iga/v1/workloads/${id}/changes?kind=configuration`,
      `/api/iga/v1/graph?root=workload%3A${id}&direction=forward`,
      `/api/iga/v1/graph/expand?node=identity%3A${id}&edge=grant&direction=forward`,
      `/api/iga/v1/graph/path?from=workload%3A${id}&to=identity%3A${id}`,
      `/api/iga/v1/evidence?claim=grant%3A${id}`,
      "/api/iga/v1/lookup?cloud_ref=arn%3Aaws%3Aiam%3A%3A1%3Arole%2Fa",
      `/api/iga/v1/workloads/${id}/runtime-instances`,
      `/api/iga/v1/workloads/${id}/observed-access`,
      `/api/iga/v1/workloads/${id}/runtime-policy-status`,
      `/api/iga/v1/identities/${id}/observed-use`,
    ]);
    for (const url of urls) {
      expect(url).not.toContain("graph=");
      expect(url).not.toContain("provider=");
      expect(url).not.toContain("ws=");
    }
  });
});

describe("v2 graph URLs", () => {
  it("opts in with graph=v2 and repeats provider", () => {
    expect(graphUrls.pipeline({ ws, graph: "v2" })).toBe("/api/iga/v1/pipeline?graph=v2");
    expect(graphUrls.workloads({ ws, graph: "v2", provider: ["linux"] })).toBe(
      "/api/iga/v1/workloads?graph=v2&provider=linux&facets=account%2Cruntime_kind%2Cclassification%2Cregion",
    );
    expect(graphUrls.workloads({ ws, graph: "v2", provider: ["ad", "kubernetes"] })).toContain("provider=ad");
    expect(graphUrls.workloads({ ws, graph: "v2", provider: ["ad", "kubernetes"] })).toContain("provider=kubernetes");
    expect(graphUrls.neighbourhood({ ws, root: `identity:${id}`, direction: "forward", graph: "v2" })).toContain("graph=v2");
    expect(graphUrls.collector(id)).toBe(`/api/iga/v2/collectors/${id}`);
  });
});

describe("graph cache keys", () => {
  it("differs when the opt-in differs", () => {
    const plain = cacheKey({ ws, id });
    const opted = cacheKey({ ws, id, graph: "v2" });
    const linux = cacheKey({ ws, id, graph: "v2", provider: ["linux"] });
    expect(plain).not.toBe(opted);
    expect(opted).not.toBe(linux);
  });
});
