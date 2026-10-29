import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const caps = { state: "on", accessK8s: false, providerSupported: () => false, providerReason: () => null as string | null };
vi.mock("./usePolicyCapabilities", () => ({ usePolicyCapabilities: () => caps }));
vi.mock("@/utils/workspace", () => ({ getWorkspaceId: () => "ws-1" }));

import { KubernetesPolicyNote } from "./KubernetesPolicyNote";
import { k8sPolicyHref } from "./k8sPolicyHref";

describe("KubernetesPolicyNote (UI-054)", () => {
  beforeEach(() => {
    caps.state = "on";
    caps.accessK8s = false;
  });

  it("offers a Kubernetes access policy when the server has them", () => {
    caps.accessK8s = true;
    render(
      <MemoryRouter>
        <KubernetesPolicyNote serviceAccount={{ id: "sa-1", name: "agent-demo:billing" }} />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/not yet supported/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create policy" })).toHaveAttribute(
      "href",
      "/iga/policy/new?provider=k8s&identity_account_id=sa-1&sa=agent-demo%3Abilling",
    );
  });

  it("says policy is not supported only when the server has no Kubernetes access policies", () => {
    render(
      <MemoryRouter>
        <KubernetesPolicyNote />
      </MemoryRouter>,
    );
    expect(screen.getByText(/not yet supported for Kubernetes/)).toBeInTheDocument();
  });

  it("names no ServiceAccount when there is none", () => {
    expect(k8sPolicyHref()).toBe("/iga/policy/new?provider=k8s");
  });
});
