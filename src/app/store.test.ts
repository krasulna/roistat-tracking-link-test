import { beforeEach, describe, expect, it } from "vitest";
import { createCampaign, createDraft, createHistoryItem, createProject, createSource } from "../test/factories";
import { getSettingsFormState, validateSettingsForm } from "../pages/settingsForm";
import { emptyPersistedState } from "./storage";
import { useAppStore } from "./store";

function resetStore() {
  localStorage.clear();
  useAppStore.setState({
    ...emptyPersistedState,
    projects: [],
    campaignsByProjectId: {},
    historyByProjectId: {},
  });
}

describe("app store", () => {
  beforeEach(() => {
    resetStore();
  });

  it("stores removed tracking parameter diffs and warnings in link history", () => {
    const project = createProject();
    useAppStore.setState({
      ...emptyPersistedState,
      activeProjectId: project.id,
      projects: [project],
      campaignsByProjectId: { [project.id]: [] },
      historyByProjectId: { [project.id]: [] },
    });

    const result = useAppStore.getState().createTrackingLink(
      project.id,
      createDraft({
        targetUrl: "https://shop.example.com/catalog?utm_term=old",
        utmTerm: "",
      }),
    );
    const history = useAppStore.getState().historyByProjectId[project.id];

    expect(result.diffs).toContainEqual({ param: "utm_term", from: "old", to: "" });
    expect(history[0].diffs).toContainEqual({ param: "utm_term", from: "old", to: "" });
    expect(history[0].warnings.map((warning) => warning.code)).toContain("already_marked_url");
    expect(history[0].warnings.map((warning) => warning.code)).toContain("tracking_params_removed");
  });

  it("uses the same marker in the first link and the saved auto-source", () => {
    const project = createProject();
    useAppStore.setState({
      ...emptyPersistedState,
      activeProjectId: project.id,
      projects: [project],
      campaignsByProjectId: { [project.id]: [] },
      historyByProjectId: { [project.id]: [] },
    });

    const result = useAppStore.getState().createTrackingLink(
      project.id,
      createDraft({
        utmSource: "newsletter",
        utmCampaign: "summer_sale",
      }),
    );
    const savedProject = useAppStore.getState().projects.find((item) => item.id === project.id);
    const savedSource = savedProject?.allowedSources.find((source) => source.utmSource === "newsletter");

    expect(savedSource?.roistatMarker).toBe("newsletter2");
    expect(result.finalUrl).toContain("roistat=newsletter2_cpc_summer:u:sale");
    expect(useAppStore.getState().historyByProjectId[project.id][0].finalUrl).toBe(result.finalUrl);
  });

  it("re-enables a disabled source when a confirmed link uses it", () => {
    const project = createProject({
      allowedSources: [
        createSource({
          id: "source_old",
          utmSource: "old_source",
          roistatMarker: "oldsource1",
          enabled: false,
        }),
      ],
    });
    useAppStore.setState({
      ...emptyPersistedState,
      activeProjectId: project.id,
      projects: [project],
      campaignsByProjectId: { [project.id]: [] },
      historyByProjectId: { [project.id]: [] },
    });

    const result = useAppStore.getState().createTrackingLink(
      project.id,
      createDraft({
        utmSource: "old_source",
      }),
    );
    const state = useAppStore.getState();

    expect(result.warnings.map((warning) => warning.code)).toContain("source_disabled");
    expect(state.projects[0].allowedSources).toHaveLength(1);
    expect(state.projects[0].allowedSources[0]).toMatchObject({
      id: "source_old",
      enabled: true,
    });
    expect(state.campaignsByProjectId[project.id][0].sourceId).toBe("source_old");
  });

  it("rejects invalid project updates before they can be persisted", () => {
    const project = createProject();
    useAppStore.setState({
      ...emptyPersistedState,
      activeProjectId: project.id,
      projects: [project],
      campaignsByProjectId: { [project.id]: [] },
      historyByProjectId: { [project.id]: [] },
    });

    expect(() => {
      useAppStore.getState().updateProject(project.id, { budgetLimit: Number.NaN });
    }).toThrow("Project settings are invalid");
    expect(useAppStore.getState().projects[0].budgetLimit).toBe(project.budgetLimit);
  });

  it("removes campaigns whose source is removed from project settings", () => {
    const project = createProject({
      allowedSources: [
        createSource({
          id: "source_yandex",
          utmSource: "yandex_direct",
          roistatMarker: "direct1",
          channelId: 1,
        }),
      ],
    });
    useAppStore.setState({
      ...emptyPersistedState,
      activeProjectId: project.id,
      projects: [project],
      campaignsByProjectId: {
        [project.id]: [createCampaign({ sourceId: "source_yandex" })],
      },
      historyByProjectId: { [project.id]: [] },
    });

    useAppStore.getState().updateProject(project.id, {
      allowedSources: [
        createSource({
          id: "source_google",
          utmSource: "google_ads",
          roistatMarker: "google2",
          channelId: 2,
        }),
      ],
    });

    const state = useAppStore.getState();
    expect(state.projects[0].allowedSources.map((source) => source.id)).toEqual(["source_google"]);
    expect(state.campaignsByProjectId[project.id]).toEqual([]);
    expect(state.historyByProjectId[project.id][0].details).toContain("Удалены кампании");
  });

  it("keeps campaigns when saving settings with semicolons in source fields", () => {
    const project = createProject({
      allowedSources: [
        createSource({
          id: "source_delimited",
          name: "Foo; Bar",
          utmSource: "foo;bar",
          roistatMarker: "foo_bar2",
          channelId: 2,
        }),
      ],
    });
    useAppStore.setState({
      ...emptyPersistedState,
      activeProjectId: project.id,
      projects: [project],
      campaignsByProjectId: {
        [project.id]: [createCampaign({ sourceId: "source_delimited" })],
      },
      historyByProjectId: { [project.id]: [] },
    });
    const validation = validateSettingsForm(getSettingsFormState(project), project.allowedSources);
    expect(validation.ok).toBe(true);

    if (validation.ok) {
      useAppStore.getState().updateProject(project.id, validation.patch);
    }

    const state = useAppStore.getState();
    expect(state.projects[0].allowedSources[0]).toMatchObject({
      id: "source_delimited",
      name: "Foo; Bar",
      utmSource: "foo;bar",
    });
    expect(state.campaignsByProjectId[project.id][0].sourceId).toBe("source_delimited");
  });

  it("keeps campaigns after settings roundtrip for an auto-added semicolon source", () => {
    const project = createProject();
    useAppStore.setState({
      ...emptyPersistedState,
      activeProjectId: project.id,
      projects: [project],
      campaignsByProjectId: { [project.id]: [] },
      historyByProjectId: { [project.id]: [] },
    });

    useAppStore.getState().createTrackingLink(
      project.id,
      createDraft({
        utmSource: "foo;bar",
        utmCampaign: "semicolon_campaign",
      }),
    );
    const projectWithAutoSource = useAppStore.getState().projects.find((item) => item.id === project.id);
    if (!projectWithAutoSource) {
      throw new Error("Project was not saved");
    }
    const validation = validateSettingsForm(getSettingsFormState(projectWithAutoSource), projectWithAutoSource.allowedSources);
    expect(validation.ok).toBe(true);

    if (validation.ok) {
      useAppStore.getState().updateProject(project.id, validation.patch);
    }

    const state = useAppStore.getState();
    const autoSource = state.projects[0].allowedSources.find((source) => source.utmSource === "foo;bar");
    expect(autoSource).toBeDefined();
    expect(state.campaignsByProjectId[project.id]).toContainEqual(
      expect.objectContaining({
        sourceId: autoSource?.id,
        utmCampaign: "semicolon_campaign",
      }),
    );
  });

  it("rejects campaigns whose source id does not belong to the project", () => {
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
      activeProjectId: secondProject.id,
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

    expect(() => {
      useAppStore.getState().addCampaign(secondProject.id, {
        sourceId: "source_first",
        name: "Wrong source",
        utmCampaign: "wrong_source",
        budget: 100,
        createdManually: true,
      });
    }).toThrow("Campaign source does not belong to the project.");
    expect(useAppStore.getState().campaignsByProjectId[secondProject.id]).toEqual([]);
  });

  it("remaps imported campaigns and history when a multi-project import changes local ids", () => {
    const existingProject = createProject({
      id: "project_collision",
      roistatProjectId: "1001",
    });
    const importedFirst = createProject({
      id: "project_collision",
      roistatProjectId: "2001",
      allowedSources: [createSource({ id: "source_imported_first", utmSource: "first_source" })],
    });
    const importedSecond = createProject({
      id: "project_second",
      roistatProjectId: "2002",
      allowedSources: [createSource({ id: "source_imported_second", utmSource: "second_source" })],
    });
    useAppStore.setState({
      ...emptyPersistedState,
      activeProjectId: existingProject.id,
      projects: [existingProject],
      campaignsByProjectId: { [existingProject.id]: [] },
      historyByProjectId: { [existingProject.id]: [] },
    });

    const importedProjects = useAppStore.getState().importProjectJson(
      JSON.stringify({
        schemaVersion: 1,
        activeProjectId: importedFirst.id,
        projects: [importedFirst, importedSecond],
        campaignsByProjectId: {
          [importedFirst.id]: [
            createCampaign({
              id: "campaign_first",
              sourceId: "source_imported_first",
              utmCampaign: "campaign_first",
            }),
          ],
          [importedSecond.id]: [
            createCampaign({
              id: "campaign_second",
              sourceId: "source_imported_second",
              utmCampaign: "campaign_second",
            }),
          ],
        },
        historyByProjectId: {
          [importedFirst.id]: [createHistoryItem({ id: "history_first" })],
          [importedSecond.id]: [createHistoryItem({ id: "history_second" })],
        },
      }),
    );
    const state = useAppStore.getState();
    const remappedFirst = state.projects.find((project) => project.roistatProjectId === importedFirst.roistatProjectId);
    const preservedSecond = state.projects.find((project) => project.roistatProjectId === importedSecond.roistatProjectId);

    expect(importedProjects).toHaveLength(2);
    expect(remappedFirst?.id).toBeDefined();
    expect(remappedFirst?.id).not.toBe(importedFirst.id);
    expect(preservedSecond?.id).toBe(importedSecond.id);
    expect(state.activeProjectId).toBe(remappedFirst?.id);
    expect(state.campaignsByProjectId[remappedFirst?.id ?? ""][0].id).toBe("campaign_first");
    expect(state.historyByProjectId[remappedFirst?.id ?? ""][0].id).toBe("history_first");
    expect(state.campaignsByProjectId[importedSecond.id][0].id).toBe("campaign_second");
    expect(state.historyByProjectId[importedSecond.id][0].id).toBe("history_second");
  });

  it("does not duplicate imported records when two imported projects share the same old local id", () => {
    const existingProject = createProject({
      id: "project_existing",
      roistatProjectId: "1001",
    });
    const importedFirst = createProject({
      id: "project_duplicate",
      roistatProjectId: "3001",
    });
    const importedSecond = createProject({
      id: "project_duplicate",
      roistatProjectId: "3002",
    });
    useAppStore.setState({
      ...emptyPersistedState,
      activeProjectId: existingProject.id,
      projects: [existingProject],
      campaignsByProjectId: { [existingProject.id]: [] },
      historyByProjectId: { [existingProject.id]: [] },
    });

    useAppStore.getState().importProjectJson(
      JSON.stringify({
        schemaVersion: 1,
        activeProjectId: importedFirst.id,
        projects: [importedFirst, importedSecond],
        campaignsByProjectId: {
          [importedFirst.id]: [createCampaign({ id: "campaign_for_duplicate_id" })],
        },
        historyByProjectId: {
          [importedFirst.id]: [createHistoryItem({ id: "history_for_duplicate_id" })],
        },
      }),
    );
    const state = useAppStore.getState();
    const first = state.projects.find((project) => project.roistatProjectId === importedFirst.roistatProjectId);
    const second = state.projects.find((project) => project.roistatProjectId === importedSecond.roistatProjectId);

    expect(first?.id).toBe(importedFirst.id);
    expect(second?.id).toBeDefined();
    expect(second?.id).not.toBe(importedSecond.id);
    expect(state.activeProjectId).toBe(first?.id);
    expect(state.campaignsByProjectId[first?.id ?? ""]).toHaveLength(1);
    expect(state.historyByProjectId[first?.id ?? ""]).toHaveLength(1);
    expect(state.campaignsByProjectId[second?.id ?? ""]).toEqual([]);
    expect(state.historyByProjectId[second?.id ?? ""]).toEqual([]);
  });

  it("preserves edited sources when an exported project is imported with a new roistatProjectId", () => {
    const existingProject = createProject({
      id: "project_original",
      roistatProjectId: "1001",
    });
    const exportedProject = {
      ...existingProject,
      roistatProjectId: "2001",
      allowedSources: [
        createSource({
          id: "source_yandex_direct",
          name: "Yandex Direct",
          utmSource: "yandex_direct",
          roistatMarker: "custom_marker1",
          channelId: 1,
        }),
      ],
    };
    useAppStore.setState({
      ...emptyPersistedState,
      activeProjectId: existingProject.id,
      projects: [existingProject],
      campaignsByProjectId: { [existingProject.id]: [] },
      historyByProjectId: { [existingProject.id]: [] },
    });

    useAppStore.getState().importProjectJson(
      JSON.stringify({
        schemaVersion: 1,
        activeProjectId: exportedProject.id,
        projects: [exportedProject],
        campaignsByProjectId: {
          [exportedProject.id]: [],
        },
        historyByProjectId: {
          [exportedProject.id]: [],
        },
      }),
    );
    const importedProject = useAppStore.getState().projects.find((project) => project.roistatProjectId === "2001");

    expect(importedProject?.allowedSources).toHaveLength(1);
    expect(importedProject?.allowedSources[0]).toMatchObject({
      id: "source_yandex_direct",
      utmSource: "yandex_direct",
      roistatMarker: "custom_marker1",
    });
  });

  it("rejects imported projects with duplicate source ids or utm_source values", () => {
    const projectWithDuplicateSources = createProject({
      id: "project_duplicate_sources",
      roistatProjectId: "4001",
      allowedSources: [
        createSource({
          id: "source_dup",
          utmSource: "yandex_direct",
          roistatMarker: "direct1",
          channelId: 1,
        }),
        createSource({
          id: "source_dup",
          utmSource: "yandex_direct",
          roistatMarker: "direct2",
          channelId: 2,
        }),
      ],
    });

    expect(() => {
      useAppStore.getState().importProjectJson(
        JSON.stringify({
          schemaVersion: 1,
          activeProjectId: projectWithDuplicateSources.id,
          projects: [projectWithDuplicateSources],
          campaignsByProjectId: {
            [projectWithDuplicateSources.id]: [],
          },
          historyByProjectId: {
            [projectWithDuplicateSources.id]: [],
          },
        }),
      );
    }).toThrow();
  });

  it("rejects imported projects with duplicate roistat markers or channel ids", () => {
    const projectWithDuplicateChannels = createProject({
      id: "project_duplicate_channels",
      roistatProjectId: "4002",
      allowedSources: [
        createSource({
          id: "source_direct",
          utmSource: "yandex_direct",
          roistatMarker: "direct1",
          channelId: 1,
        }),
        createSource({
          id: "source_google",
          utmSource: "google_ads",
          roistatMarker: "google1",
          channelId: 1,
        }),
      ],
    });

    expect(() => {
      useAppStore.getState().importProjectJson(
        JSON.stringify({
          schemaVersion: 1,
          activeProjectId: projectWithDuplicateChannels.id,
          projects: [projectWithDuplicateChannels],
          campaignsByProjectId: {
            [projectWithDuplicateChannels.id]: [],
          },
          historyByProjectId: {
            [projectWithDuplicateChannels.id]: [],
          },
        }),
      );
    }).toThrow();
  });
});
