import { expect, test, type Page } from "@playwright/test";

import { IDS, capabilitiesV1, capabilitiesV2, collectorNotFound, pipelineV2, runtimeInstancesLive, runtimePolicyStatus } from "../src/features/iga/__fixtures__/v2/readers";

const WORKLOAD = IDS.workload;

function token(): string {
  const payload = {
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
    iat: Math.floor(Date.now() / 1000),
    iss: "e2e",
    client_id: "e2e",
    email_id: "e2e@example.com",
    groups: [],
    project_id: "project-e2e",
    resources: [],
    roles: [],
    scopes: [],
    workspace_id: "ws-e2e",
    token_type: "access",
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `e30.${body}.e30`;
}

async function seedSession(page: Page) {
  const sessionToken = token();
  await page.addInitScript((tokenValue) => {
    const session = {
      token: tokenValue,
      user: { id: "user-e2e", email: "e2e@example.com" },
      projects: [],
      currentProject: null,
      workspace_id: "ws-e2e",
      project_id: "project-e2e",
      client_id: "e2e",
      user_id: "user-e2e",
      expiresAt: Date.now() + 60 * 60 * 1000,
    };
    localStorage.setItem("authsec_session_v2", JSON.stringify(session));
  }, sessionToken);
}

function workloadDetail() {
  return {
    data: {
      ref: `workload:${WORKLOAD}`,
      name: "invoice-host",
      runtime_kind: "systemd",
      account: null,
      region: null,
      classification: "unclassified",
      lifecycle: "active",
      state: "current",
      last_confirmed_at: "2026-09-26T12:00:00Z",
      arn: null,
    },
    meta: {
      rev: 7,
      published_at: "2026-09-26T12:00:00Z",
      graph_state: "published",
      capabilities: {},
      graph_revision: 7,
    },
  };
}

async function mockApi(page: Page, caps: unknown) {
  const seen: string[] = [];
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    seen.push(url);
    const path = new URL(url).pathname;
    if (path.endsWith("/capabilities")) {
      await route.fulfill({ json: caps });
      return;
    }
    if (path.endsWith(`/workloads/${WORKLOAD}/runtime-instances`)) {
      await route.fulfill({ json: runtimeInstancesLive });
      return;
    }
    if (path.endsWith(`/workloads/${WORKLOAD}/runtime-policy-status`)) {
      await route.fulfill({ json: runtimePolicyStatus });
      return;
    }
    if (path.endsWith(`/workloads/${WORKLOAD}`)) {
      await route.fulfill({ json: workloadDetail() });
      return;
    }
    if (path.endsWith("/pipeline")) {
      await route.fulfill({ json: { data: pipelineV2 } });
      return;
    }
    if (path.includes("/collectors/")) {
      await route.fulfill({ status: 404, json: collectorNotFound });
      return;
    }
    if (path.endsWith("/workloads")) {
      await route.fulfill({
        json: {
          data: [],
          meta: {
            rev: 7,
            published_at: "2026-09-26T12:00:00Z",
            graph_state: "published",
            next_cursor: null,
            limit: 50,
            total_known: true,
            total: 0,
            coverage: [],
            facets: {},
          },
        },
      });
      return;
    }
    await route.fulfill({ json: { data: [], meta: { graph_state: "published", rev: 7, coverage: [] } } });
  });
  return seen;
}

test("v2 runtime tab labels observed runtime state and stays off green", async ({ page }) => {
  await seedSession(page);
  const seen = await mockApi(page, capabilitiesV2);
  await page.goto(`/iga/estate/${WORKLOAD}/runtime`);
  await expect(page.getByText("boot-a/host/824/93401")).toBeVisible();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  await expect(page.getByText("Not configured")).toBeVisible();
  await expect(page.locator("[data-protection='protected']")).toHaveCount(0);
  const detail = seen.find((url) => url.includes(`/workloads/${WORKLOAD}`) && !url.includes("runtime"));
  expect(detail).toContain("graph=v2");
});

test("without graph_v2 the runtime tab is unavailable and the detail URL stays default", async ({ page }) => {
  await seedSession(page);
  const seen = await mockApi(page, capabilitiesV1);
  await page.goto(`/iga/estate/${WORKLOAD}/runtime`);
  await expect(page.getByText(/not available|unavailable/i)).toBeVisible();
  const detail = seen.find((url) => url.includes(`/workloads/${WORKLOAD}`) && !url.includes("runtime"));
  expect(detail ?? "").not.toContain("graph=");
});

test("the estate list keeps the default workloads URL until a provider is chosen", async ({ page }) => {
  await seedSession(page);
  const seen = await mockApi(page, capabilitiesV2);
  await page.goto("/iga/estate");
  await expect(page.getByRole("heading", { name: "Agents & workloads" })).toBeVisible();
  const list = seen.find((url) => url.includes("/api/iga/v1/workloads?") || url.endsWith("/api/iga/v1/workloads"));
  expect(list).toBeTruthy();
  expect(list).not.toContain("graph=");
  expect(list).not.toContain("provider=");
});

test("a missing collector is not shown as protected", async ({ page }) => {
  await seedSession(page);
  await mockApi(page, capabilitiesV2);
  await page.goto("/iga/estate");
  await expect(page.getByText("Collector ingest is not enabled, or this collector is not in the workspace.")).toBeVisible();
  await expect(page.locator("[data-protection='protected']")).toHaveCount(0);
});
