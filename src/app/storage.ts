import { z } from "zod";
import { campaignSchema, type Campaign } from "../entities/campaign/model";
import { historyItemSchema, type LinkHistoryItem } from "../entities/history/model";
import { projectSchema, type Project } from "../entities/project/model";
import { createDefaultSources } from "../shared/lib/roistatChannels";

export const STORAGE_KEY = "roistat-tracking-link-test";
export const SCHEMA_VERSION = 1;

export type PersistedAppState = {
  schemaVersion: number;
  activeProjectId?: string;
  projects: Project[];
  campaignsByProjectId: Record<string, Campaign[]>;
  historyByProjectId: Record<string, LinkHistoryItem[]>;
};

const persistedAppStateSchema = z.object({
  schemaVersion: z.number(),
  activeProjectId: z.string().optional(),
  projects: z.array(projectSchema),
  campaignsByProjectId: z.record(z.string(), z.array(campaignSchema)),
  historyByProjectId: z.record(z.string(), z.array(historyItemSchema)),
});

export const emptyPersistedState: PersistedAppState = {
  schemaVersion: SCHEMA_VERSION,
  activeProjectId: undefined,
  projects: [],
  campaignsByProjectId: {},
  historyByProjectId: {},
};

export function loadPersistedState(): PersistedAppState {
  if (typeof localStorage === "undefined") {
    return emptyPersistedState;
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return emptyPersistedState;
  }

  try {
    const parsed = JSON.parse(raw);
    return migratePersistedState(persistedAppStateSchema.parse(parsed));
  } catch {
    return emptyPersistedState;
  }
}

function migratePersistedState(state: PersistedAppState): PersistedAppState {
  const defaultSources = createDefaultSources();
  const projects = state.projects.map((project) => ({
    ...project,
    allowedSources: mergeDefaultSources(
      project.allowedSources.map((source) => {
        if (source.id === "source_yandex_direct") {
          return { ...source, roistatMarker: `direct${source.channelId}` };
        }
        if (source.id === "source_google_ads") {
          return { ...source, roistatMarker: `google${source.channelId}` };
        }
        if (source.id === "source_vk_ads") {
          return { ...source, roistatMarker: `vkads${source.channelId}` };
        }
        if (source.id === "source_avito") {
          return { ...source, roistatMarker: `avito${source.channelId}` };
        }
        if (source.id === "source_telegram") {
          return {
            ...source,
            id: "source_tg_booster",
            name: "TG Booster",
            utmSource: "tg_booster",
            roistatMarker: `tgbooster${source.channelId}`,
          };
        }
        return source;
      }),
      defaultSources,
    ),
  }));
  const projectIds = new Set(projects.map((project) => project.id));
  const activeProjectId =
    state.activeProjectId && projectIds.has(state.activeProjectId) ? state.activeProjectId : projects[0]?.id;

  return {
    ...state,
    activeProjectId,
    campaignsByProjectId: Object.fromEntries(
      Object.entries(state.campaignsByProjectId).map(([projectId, campaigns]) => [
        projectId,
        campaigns.map((campaign) =>
          campaign.sourceId === "source_telegram" ? { ...campaign, sourceId: "source_tg_booster" } : campaign,
        ),
      ]),
    ),
    projects,
  };
}

function mergeDefaultSources(projectSources: Project["allowedSources"], defaultSources: Project["allowedSources"]) {
  const existingIds = new Set(projectSources.map((source) => source.id));
  const existingUtmSources = new Set(projectSources.map((source) => source.utmSource));
  const missingDefaults = defaultSources.filter(
    (source) => !existingIds.has(source.id) && !existingUtmSources.has(source.utmSource),
  );

  return [...projectSources, ...missingDefaults];
}

export function savePersistedState(state: PersistedAppState): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function parseProjectImport(raw: string): PersistedAppState | Project {
  const parsed = JSON.parse(raw);
  const appState = persistedAppStateSchema.safeParse(parsed);
  if (appState.success) {
    return migratePersistedState(appState.data);
  }

  const project = projectSchema.parse(parsed);
  return migratePersistedState({
    ...emptyPersistedState,
    activeProjectId: project.id,
    projects: [project],
    campaignsByProjectId: { [project.id]: [] },
    historyByProjectId: { [project.id]: [] },
  }).projects[0];
}
