import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import type { Notice } from "./connectionNotices";
import { SourceNotices } from "./SourceNotices";

function notice(overrides: Partial<Notice>): Notice {
  return { key: "n1", tone: "warning", label: "Authentication failed", text: "Fabrikam Inc: results from earlier scans remain.", ...overrides };
}

function renderNotices(notices: Notice[]) {
  return render(
    <MemoryRouter>
      <SourceNotices notices={notices} />
    </MemoryRouter>,
  );
}

describe("SourceNotices", () => {
  beforeEach(() => sessionStorage.clear());

  it("renders nothing when there are no notices", () => {
    const { container } = renderNotices([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a notice and removes it on dismiss, within this session", () => {
    renderNotices([notice({})]);
    expect(screen.getByText("Authentication failed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss this notice" }));
    expect(screen.queryByText("Authentication failed")).toBeNull();
  });

  it("keeps a dismissal across remounts of the same session", () => {
    const { unmount } = renderNotices([notice({})]);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss this notice" }));
    unmount();
    renderNotices([notice({})]);
    expect(screen.queryByText("Authentication failed")).toBeNull();
  });

  it("does not let dismissing one notice hide a different one", () => {
    renderNotices([notice({ key: "n1", label: "Authentication failed" }), notice({ key: "n2", label: "Latest scan failed", text: "Contoso: results from earlier scans remain." })]);
    fireEvent.click(screen.getAllByRole("button", { name: "Dismiss this notice" })[0]);
    expect(screen.queryByText("Authentication failed")).toBeNull();
    expect(screen.getByText("Latest scan failed")).toBeTruthy();
  });
});
