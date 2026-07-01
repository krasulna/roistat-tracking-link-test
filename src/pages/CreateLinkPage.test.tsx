import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPersistedState } from "../app/storage";
import { useAppStore } from "../app/store";
import { createProject, createSource } from "../test/factories";
import { CreateLinkPage } from "./CreateLinkPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function input(container: HTMLElement, name: string): HTMLInputElement {
  const element = container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!element) {
    throw new Error(`Input ${name} not found`);
  }

  return element;
}

function checkbox(container: HTMLElement, name: string): HTMLInputElement {
  const element = input(container, name);
  if (element.type !== "checkbox") {
    throw new Error(`Input ${name} is not a checkbox`);
  }

  return element;
}

async function changeInputValue(container: HTMLElement, name: string, value: string) {
  await act(async () => {
    const element = input(container, name);
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
  });
}

describe("CreateLinkPage", () => {
  let root: Root | undefined;
  let container: HTMLDivElement;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    const firstProject = createProject({
      id: "project_first",
      trustedDomain: "first.example.com",
      allowedSources: [createSource({ id: "source_first", utmSource: "first_source" })],
    });
    const secondProject = createProject({
      id: "project_second",
      roistatProjectId: "2002",
      trustedDomain: "second.example.com",
      allowedSources: [createSource({ id: "source_second", utmSource: "second_source" })],
    });

    useAppStore.setState({
      ...emptyPersistedState,
      activeProjectId: firstProject.id,
      projects: [firstProject, secondProject],
      campaignsByProjectId: {
        [firstProject.id]: [],
        [secondProject.id]: [],
      },
      historyByProjectId: {
        [firstProject.id]: [],
        [secondProject.id]: [],
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container.remove();
    root = undefined;
  });

  it("resets default URL and source when the active project changes", async () => {
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={["/create-link"]}>
          <CreateLinkPage />
        </MemoryRouter>,
      );
    });

    expect(input(container, "targetUrl").value).toBe("https://first.example.com/catalog");
    expect(input(container, "utmSource").value).toBe("first_source");

    await act(async () => {
      useAppStore.getState().setActiveProject("project_second");
      await Promise.resolve();
    });

    expect(input(container, "targetUrl").value).toBe("https://second.example.com/catalog");
    expect(input(container, "utmSource").value).toBe("second_source");
  });

  it("clears warning confirmation when link inputs change", async () => {
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={["/create-link"]}>
          <CreateLinkPage />
        </MemoryRouter>,
      );
    });

    await act(async () => {
      checkbox(container, "confirmWarnings").click();
      await Promise.resolve();
    });
    expect(checkbox(container, "confirmWarnings").checked).toBe(true);

    await changeInputValue(container, "targetUrl", "https://risky.example.com/catalog");

    expect(checkbox(container, "confirmWarnings").checked).toBe(false);
  });

  it("does not save a pending link submit after the active project changes", async () => {
    vi.useFakeTimers();
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={["/create-link"]}>
          <CreateLinkPage />
        </MemoryRouter>,
      );
    });

    await changeInputValue(container, "budget", "100");

    const form = container.querySelector<HTMLFormElement>("form");
    if (!form) {
      throw new Error("Create link form was not rendered");
    }

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    await act(async () => {
      useAppStore.getState().setActiveProject("project_second");
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(2400);
      await Promise.resolve();
    });

    const state = useAppStore.getState();
    expect(state.campaignsByProjectId.project_first).toEqual([]);
    expect(state.campaignsByProjectId.project_second).toEqual([]);
    expect(state.historyByProjectId.project_first).toEqual([]);
    expect(state.historyByProjectId.project_second).toEqual([]);
  });

  it("does not save a pending link submit after the page unmounts", async () => {
    vi.useFakeTimers();
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={["/create-link"]}>
          <CreateLinkPage />
        </MemoryRouter>,
      );
    });

    await changeInputValue(container, "budget", "100");

    const form = container.querySelector<HTMLFormElement>("form");
    if (!form) {
      throw new Error("Create link form was not rendered");
    }

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    await act(async () => {
      root?.unmount();
      await Promise.resolve();
    });
    root = undefined;

    await act(async () => {
      vi.advanceTimersByTime(2400);
      await Promise.resolve();
    });

    const state = useAppStore.getState();
    expect(state.campaignsByProjectId.project_first).toEqual([]);
    expect(state.historyByProjectId.project_first).toEqual([]);
  });
});
