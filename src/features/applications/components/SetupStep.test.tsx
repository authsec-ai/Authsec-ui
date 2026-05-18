import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { SetupStep } from "./SetupStep";

describe("SetupStep", () => {
  it("renders the number badge when state is active", () => {
    const html = renderToStaticMarkup(
      <SetupStep number={2} title="Wire SDK" state="active">
        body
      </SetupStep>,
    );
    expect(html).toContain(">2<");
    expect(html).toContain("body");
    expect(html).toContain("Wire SDK");
  });

  it("renders the number badge when state is todo", () => {
    const html = renderToStaticMarkup(
      <SetupStep number={3} title="Configure env" state="todo">
        env body
      </SetupStep>,
    );
    expect(html).toContain(">3<");
    expect(html).toContain("env body");
  });

  it("hides the number badge and renders the summary when state is done", () => {
    const html = renderToStaticMarkup(
      <SetupStep
        number={4}
        title="Verify"
        state="done"
        summary="All checks passed."
      >
        hidden body
      </SetupStep>,
    );
    expect(html).toContain("All checks passed.");
    expect(html).not.toContain("hidden body");
  });

  it("shows an Edit button only when done + onEdit is provided", () => {
    const withEdit = renderToStaticMarkup(
      <SetupStep
        number={1}
        title="Pick stack"
        state="done"
        summary="Go · macOS"
        onEdit={() => {}}
      >
        children
      </SetupStep>,
    );
    expect(withEdit).toMatch(/>Edit</);

    const activeWithEdit = renderToStaticMarkup(
      <SetupStep
        number={1}
        title="Pick stack"
        state="active"
        onEdit={() => {}}
      >
        children
      </SetupStep>,
    );
    expect(activeWithEdit).not.toMatch(/>Edit</);
  });
});
