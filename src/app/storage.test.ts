import { beforeEach, describe, expect, it } from "vitest";
import { createCampaign, createHistoryItem, createProject, createSource } from "../test/factories";
import { loadPersistedState, savePersistedState, STORAGE_KEY } from "./storage";

describe("storage persistence recovery", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("does not reset the whole state when one persisted source numeric value is invalid", () => {
    const project = createProject({
      allowedSources: [createSource({ channelId: 3 })],
    });
    const brokenProject = {
      ...project,
      allowedSources: [
        {
          ...project.allowedSources[0],
          channelId: null,
        },
      ],
    };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        activeProjectId: project.id,
        projects: [brokenProject],
        campaignsByProjectId: {
          [project.id]: [createCampaign()],
        },
        historyByProjectId: {
          [project.id]: [createHistoryItem()],
        },
      }),
    );

    const loaded = loadPersistedState();

    expect(loaded.projects).toHaveLength(1);
    expect(loaded.activeProjectId).toBe(project.id);
    expect(loaded.projects[0].allowedSources[0]).toMatchObject({
      id: project.allowedSources[0].id,
      channelId: 1,
    });
    expect(loaded.campaignsByProjectId[project.id]).toHaveLength(1);
    expect(loaded.historyByProjectId[project.id]).toHaveLength(1);
  });

  it("preserves edited default source markers and does not restore deleted defaults on reload", () => {
    const project = createProject({
      allowedSources: [
        createSource({
          id: "source_yandex_direct",
          utmSource: "yandex_direct",
          roistatMarker: "custom_marker1",
          channelId: 1,
        }),
      ],
    });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        activeProjectId: project.id,
        projects: [project],
        campaignsByProjectId: {
          [project.id]: [],
        },
        historyByProjectId: {
          [project.id]: [],
        },
      }),
    );

    const loaded = loadPersistedState();

    expect(loaded.projects[0].allowedSources).toHaveLength(1);
    expect(loaded.projects[0].allowedSources[0]).toMatchObject({
      id: "source_yandex_direct",
      utmSource: "yandex_direct",
      roistatMarker: "custom_marker1",
    });
  });

  it("recovers legacy custom sources whose old marker had no channel suffix", () => {
    const project = createProject({
      allowedSources: [
        {
          id: "source_newsletter",
          name: "Newsletter",
          utmSource: "newsletter",
          roistatMarker: "newsletter",
          channelId: 11,
          enabled: true,
        },
      ],
    });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        activeProjectId: project.id,
        projects: [project],
        campaignsByProjectId: {
          [project.id]: [createCampaign({ sourceId: "source_newsletter" })],
        },
        historyByProjectId: {
          [project.id]: [createHistoryItem()],
        },
      }),
    );

    const loaded = loadPersistedState();

    expect(loaded.projects).toHaveLength(1);
    expect(loaded.projects[0].allowedSources[0]).toMatchObject({
      id: "source_newsletter",
      utmSource: "newsletter",
      roistatMarker: "newsletter11",
      channelId: 11,
    });
    expect(loaded.campaignsByProjectId[project.id][0].sourceId).toBe("source_newsletter");
  });

  it("does not reset the whole state when persisted sources contain a duplicate key", () => {
    const project = createProject({
      allowedSources: [
        createSource({
          id: "source_newsletter",
          name: "Newsletter",
          utmSource: "newsletter",
          roistatMarker: "newsletter11",
          channelId: 11,
        }),
        createSource({
          id: "source_newsletter",
          name: "Newsletter copy",
          utmSource: "newsletter_copy",
          roistatMarker: "newsletter_copy12",
          channelId: 12,
        }),
      ],
    });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        activeProjectId: project.id,
        projects: [project],
        campaignsByProjectId: {
          [project.id]: [createCampaign({ sourceId: "source_newsletter" })],
        },
        historyByProjectId: {
          [project.id]: [createHistoryItem()],
        },
      }),
    );

    const loaded = loadPersistedState();

    expect(loaded.projects).toHaveLength(1);
    expect(loaded.projects[0].allowedSources).toHaveLength(1);
    expect(loaded.projects[0].allowedSources[0]).toMatchObject({
      id: "source_newsletter",
      utmSource: "newsletter",
    });
    expect(loaded.campaignsByProjectId[project.id]).toHaveLength(1);
    expect(loaded.historyByProjectId[project.id]).toHaveLength(1);
  });

  it("migrates source_telegram without leaving duplicate tg_booster sources", () => {
    const project = createProject({
      allowedSources: [
        createSource({
          id: "source_telegram",
          name: "Telegram",
          utmSource: "telegram",
          roistatMarker: "telegram4",
          channelId: 4,
        }),
        createSource({
          id: "source_tg_booster",
          name: "TG Booster",
          utmSource: "tg_booster",
          roistatMarker: "tgbooster4",
          channelId: 4,
        }),
      ],
    });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        activeProjectId: project.id,
        projects: [project],
        campaignsByProjectId: {
          [project.id]: [
            createCampaign({ id: "campaign_telegram", sourceId: "source_telegram" }),
            createCampaign({ id: "campaign_tg_booster", sourceId: "source_tg_booster", utmCampaign: "tg_booster_campaign" }),
          ],
        },
        historyByProjectId: {
          [project.id]: [createHistoryItem()],
        },
      }),
    );

    const loaded = loadPersistedState();

    expect(loaded.projects).toHaveLength(1);
    expect(loaded.projects[0].allowedSources).toHaveLength(1);
    expect(loaded.projects[0].allowedSources[0]).toMatchObject({
      id: "source_tg_booster",
      utmSource: "tg_booster",
      roistatMarker: "tgbooster4",
    });
    expect(loaded.campaignsByProjectId[project.id].map((campaign) => campaign.sourceId)).toEqual([
      "source_tg_booster",
      "source_tg_booster",
    ]);
    expect(() => savePersistedState(loaded)).not.toThrow();
  });

  it("remaps campaigns from duplicate recovered sources to the kept source", () => {
    const project = createProject({
      allowedSources: [
        createSource({
          id: "source_newsletter_a",
          name: "Newsletter A",
          utmSource: "newsletter",
          roistatMarker: "newsletter11",
          channelId: 11,
        }),
        createSource({
          id: "source_newsletter_b",
          name: "Newsletter B",
          utmSource: "newsletter",
          roistatMarker: "newsletter12",
          channelId: 12,
        }),
      ],
    });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        activeProjectId: project.id,
        projects: [project],
        campaignsByProjectId: {
          [project.id]: [createCampaign({ sourceId: "source_newsletter_b" })],
        },
        historyByProjectId: {
          [project.id]: [createHistoryItem()],
        },
      }),
    );

    const loaded = loadPersistedState();

    expect(loaded.projects).toHaveLength(1);
    expect(loaded.projects[0].allowedSources).toHaveLength(1);
    expect(loaded.projects[0].allowedSources[0].id).toBe("source_newsletter_a");
    expect(loaded.campaignsByProjectId[project.id][0].sourceId).toBe("source_newsletter_a");
    expect(() => savePersistedState(loaded)).not.toThrow();
  });

  it("remaps duplicate persisted project ids and keeps records on the first project only", () => {
    const firstProject = createProject({
      id: "project_same",
      roistatProjectId: "1001",
      name: "First project",
    });
    const secondProject = createProject({
      id: "project_same",
      roistatProjectId: "2002",
      name: "Second project",
    });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        activeProjectId: firstProject.id,
        projects: [firstProject, secondProject],
        campaignsByProjectId: {
          [firstProject.id]: [createCampaign({ id: "campaign_first" })],
        },
        historyByProjectId: {
          [firstProject.id]: [createHistoryItem({ id: "history_first" })],
        },
      }),
    );

    const loaded = loadPersistedState();
    const firstLoaded = loaded.projects.find((project) => project.roistatProjectId === "1001");
    const secondLoaded = loaded.projects.find((project) => project.roistatProjectId === "2002");

    expect(loaded.projects).toHaveLength(2);
    expect(new Set(loaded.projects.map((project) => project.id)).size).toBe(2);
    expect(firstLoaded?.id).toBe("project_same");
    expect(secondLoaded?.id).toBeDefined();
    expect(secondLoaded?.id).not.toBe("project_same");
    expect(loaded.activeProjectId).toBe(firstLoaded?.id);
    expect(loaded.campaignsByProjectId[firstLoaded?.id ?? ""]).toHaveLength(1);
    expect(loaded.campaignsByProjectId[secondLoaded?.id ?? ""]).toEqual([]);
    expect(loaded.historyByProjectId[firstLoaded?.id ?? ""]).toHaveLength(1);
    expect(loaded.historyByProjectId[secondLoaded?.id ?? ""]).toEqual([]);
    expect(() => savePersistedState(loaded)).not.toThrow();
  });

  it("drops duplicate persisted roistatProjectId projects during recovery", () => {
    const firstProject = createProject({
      id: "project_first",
      roistatProjectId: "1001",
    });
    const secondProject = createProject({
      id: "project_second",
      roistatProjectId: "1001",
    });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        activeProjectId: secondProject.id,
        projects: [firstProject, secondProject],
        campaignsByProjectId: {
          [firstProject.id]: [createCampaign()],
          [secondProject.id]: [createCampaign({ id: "campaign_second" })],
        },
        historyByProjectId: {
          [firstProject.id]: [createHistoryItem()],
          [secondProject.id]: [createHistoryItem({ id: "history_second" })],
        },
      }),
    );

    const loaded = loadPersistedState();

    expect(loaded.projects).toHaveLength(1);
    expect(loaded.projects[0].id).toBe(firstProject.id);
    expect(loaded.projects[0].roistatProjectId).toBe("1001");
    expect(loaded.activeProjectId).toBe(firstProject.id);
    expect(Object.keys(loaded.campaignsByProjectId)).toEqual([firstProject.id]);
    expect(Object.keys(loaded.historyByProjectId)).toEqual([firstProject.id]);
    expect(() => savePersistedState(loaded)).not.toThrow();
  });
});
