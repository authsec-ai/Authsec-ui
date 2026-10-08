import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { NotFoundState } from "./NotFoundState";
import { isNotFoundError } from "@/lib/error-utils";
import { baseApi } from "@/app/api/baseApi";
import ApplicationLayout from "@/features/applications/ApplicationLayout";

// A by-id read that returns 404 shows "not found", not a crash, an endless
// loader, or an error that suggests retrying.

// (@testing-library/dom is not installed, so this renders with react-dom.)
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render(ui: ReactNode): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(ui));
  return container;
}

async function waitForText(el: HTMLElement, text: string): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (el.textContent?.includes(text)) return;
    await act(() => new Promise((r) => setTimeout(r, 10)));
  }
  throw new Error(`"${text}" never appeared; got: ${el.textContent}`);
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

describe("isNotFoundError", () => {
  it("recognises an RTK Query 404", () => {
    expect(isNotFoundError({ status: 404, data: { error: "not found" } })).toBe(true);
  });

  it("rejects other errors and non-errors", () => {
    expect(isNotFoundError({ status: 500, data: {} })).toBe(false);
    expect(isNotFoundError({ status: "FETCH_ERROR", error: "x" })).toBe(false);
    expect(isNotFoundError(undefined)).toBe(false);
    expect(isNotFoundError("404")).toBe(false);
  });
});

describe("NotFoundState", () => {
  it("names what is missing and links back", async () => {
    const el = await render(
      <MemoryRouter>
        <NotFoundState subject="connector" backTo="/connectors" backLabel="Back to connectors" />
      </MemoryRouter>,
    );
    expect(el.textContent).toContain("This connector was not found");
    const link = el.querySelector("a");
    expect(link?.textContent).toBe("Back to connectors");
    expect(link).toHaveAttribute("href", "/connectors");
  });

  it("offers a button when there is no route to go back to", async () => {
    const onBack = vi.fn();
    const el = await render(<NotFoundState subject="role" onBack={onBack} backLabel="Close" />);
    const button = el.querySelector("button");
    expect(button?.textContent).toBe("Close");
    act(() => button!.click());
    expect(onBack).toHaveBeenCalled();
  });
});

describe("ApplicationLayout", () => {
  it("shows the not-found state when the application read returns 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "application not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const store = configureStore({
      reducer: { [baseApi.reducerPath]: baseApi.reducer },
      middleware: (getDefault) => getDefault({ serializableCheck: false }).concat(baseApi.middleware),
    });
    const el = await render(
      <Provider store={store}>
        <MemoryRouter initialEntries={["/applications/missing/overview"]}>
          <Routes>
            <Route path="/applications/:id" element={<ApplicationLayout />}>
              <Route path="overview" element={<div>overview</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </Provider>,
    );
    await waitForText(el, "This application was not found");
    expect(el.textContent).not.toContain("overview");
    expect(el.querySelector("a")).toHaveAttribute("href", "/applications");
  });
});
