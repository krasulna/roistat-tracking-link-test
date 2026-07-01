import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyPersistedState } from "../app/storage";
import { useAppStore } from "../app/store";
import { createCampaign, createProject, createSource } from "../test/factories";
import { CampaignsPage } from "./CampaignsPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setInputValue(element: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  valueSetter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("CampaignsPage", () => {
  let root: Root | undefined;
  let container: HTMLDivElement;
  const project = createProject();

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    useAppStore.setState({
      ...emptyPersistedState,
      activeProjectId: project.id,
      projects: [project],
      campaignsByProjectId: {
        [project.id]: [createCampaign()],
      },
      historyByProjectId: {
        [project.id]: [],
      },
    });
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container.remove();
    root = undefined;
  });

  it("writes duplicate campaign failures to history", async () => {
    root = createRoot(container);

    await act(async () => {
      root?.render(<CampaignsPage />);
    });

    const campaignInput = container.querySelectorAll<HTMLInputElement>("input")[0];
    const addButton = container.querySelector<HTMLButtonElement>("button");
    if (!campaignInput || !addButton) {
      throw new Error("Campaign form was not rendered");
    }

    await act(async () => {
      setInputValue(campaignInput, "brand_search");
      addButton.click();
      await Promise.resolve();
    });

    const history = useAppStore.getState().historyByProjectId[project.id];
    expect(history[0]).toMatchObject({
      type: "campaign",
      status: "failed",
      campaign: "brand_search",
    });
    expect(history[0].details).toContain("уже существует");
  });

  it("resets source selection when the active project changes before adding a campaign", async () => {
    const firstProject = createProject({
      id: "project_first",
      allowedSources: [createSource({ id: "source_first", utmSource: "first_source" })],
    });
    const secondProject = createProject({
      id: "project_second",
      roistatProjectId: "2002",
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
    root = createRoot(container);

    await act(async () => {
      root?.render(<CampaignsPage />);
    });

    const initialSelect = container.querySelector<HTMLSelectElement>("select");
    const initialInputs = container.querySelectorAll<HTMLInputElement>("input");
    const addButton = container.querySelector<HTMLButtonElement>("button");
    if (!initialSelect || initialInputs.length < 2 || !addButton) {
      throw new Error("Campaign form was not rendered");
    }
    expect(initialSelect.value).toBe("source_first");

    await act(async () => {
      setInputValue(initialInputs[0], "stale_campaign");
      setInputValue(initialInputs[1], "100");
      useAppStore.getState().setActiveProject(secondProject.id);
      await Promise.resolve();
    });

    const select = container.querySelector<HTMLSelectElement>("select");
    const inputs = container.querySelectorAll<HTMLInputElement>("input");
    if (!select || inputs.length < 2) {
      throw new Error("Campaign form was not rendered after project switch");
    }
    expect(select.value).toBe("source_second");
    expect(inputs[0].value).toBe("");
    expect(inputs[1].value).toBe("");

    await act(async () => {
      setInputValue(inputs[0], "fresh_campaign");
      setInputValue(inputs[1], "100");
      addButton.click();
      await Promise.resolve();
    });

    const state = useAppStore.getState();
    expect(state.campaignsByProjectId[firstProject.id]).toEqual([]);
    expect(state.campaignsByProjectId[secondProject.id][0]).toMatchObject({
      sourceId: "source_second",
      utmCampaign: "fresh_campaign",
    });
  });
});
