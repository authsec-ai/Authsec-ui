import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { Breadcrumb } from "./Breadcrumb";
import { useBreadcrumbTail } from "./breadcrumbTail";

function Page({ label }: { label: string }) {
  useBreadcrumbTail("/iga/connections/bad-id", label, { label: "Connections", href: "/iga/connections" });
  return null;
}

describe("Breadcrumb", () => {
  it("shows the page's own name for an object id that is not a UUID", () => {
    render(
      <MemoryRouter initialEntries={["/iga/connections/bad-id"]}>
        <Page label="Not found" />
        <Breadcrumb />
      </MemoryRouter>,
    );
    expect(screen.getByText("Not found")).toBeInTheDocument();
    expect(screen.queryByText("Bad Id")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connections" })).toBeInTheDocument();
  });
});
