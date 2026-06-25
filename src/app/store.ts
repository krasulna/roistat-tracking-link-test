import { create } from "zustand";
import type { Campaign } from "../entities/campaign/model";
import type { LinkCheckResult, LinkStatus, RiskWarning, TrackingLinkDraft } from "../entities/link/model";
import type { Project, TrafficSource } from "../entities/project/model";
import type { LinkHistoryItem } from "../entities/history/model";
import { analyzeTrackingLink } from "../features/analyze-link-risk/model";
import { createDemoProject } from "../features/create-project/mockRoistat";
import { createId } from "../shared/lib/id";
import {
  emptyPersistedState,
  loadPersistedState,
  parseProjectImport,
  savePersistedState,
  type PersistedAppState,
} from "./storage";

type AppStore = PersistedAppState & {
  createDemoProject: (overrides?: Partial<Project>) => Promise<Project>;
  importProjectJson: (raw: string) => Project[];
  setActiveProject: (projectId: string) => void;
  updateProject: (projectId: string, patch: Partial<Project>) => void;
  deleteProject: (projectId: string) => void;
  addCampaign: (
    projectId: string,
    campaign: Omit<Campaign, "id" | "createdAt" | "updatedAt">,
    options?: { status?: LinkStatus; warnings?: RiskWarning[] },
  ) => Campaign;
  updateCampaign: (projectId: string, campaignId: string, patch: Partial<Campaign>) => void;
  createTrackingLink: (projectId: string, draft: TrackingLinkDraft) => LinkCheckResult;
  logHistoryEvent: (
    projectId: string,
    event: Omit<LinkHistoryItem, "id" | "createdAt" | "diffs" | "warnings"> & {
      diffs?: LinkHistoryItem["diffs"];
      warnings?: LinkHistoryItem["warnings"];
    },
  ) => LinkHistoryItem;
  clearAll: () => void;
};

const initialState = loadPersistedState();

function persistState(state: PersistedAppState): void {
  savePersistedState({
    schemaVersion: state.schemaVersion,
    activeProjectId: state.activeProjectId,
    projects: state.projects,
    campaignsByProjectId: state.campaignsByProjectId,
    historyByProjectId: state.historyByProjectId,
  });
}

function toPersistedState(state: AppStore): PersistedAppState {
  return {
    schemaVersion: state.schemaVersion,
    activeProjectId: state.activeProjectId,
    projects: state.projects,
    campaignsByProjectId: state.campaignsByProjectId,
    historyByProjectId: state.historyByProjectId,
  };
}

function createHistoryItem(
  event: Omit<LinkHistoryItem, "id" | "createdAt" | "diffs" | "warnings"> & {
    diffs?: LinkHistoryItem["diffs"];
    warnings?: LinkHistoryItem["warnings"];
  },
): LinkHistoryItem {
  return {
    ...event,
    id: createId("history"),
    diffs: event.diffs ?? [],
    warnings: event.warnings ?? [],
    createdAt: new Date().toISOString(),
  };
}

function appendHistory(state: AppStore, projectId: string, item: LinkHistoryItem): AppStore {
  return {
    ...state,
    historyByProjectId: {
      ...state.historyByProjectId,
      [projectId]: [item, ...(state.historyByProjectId[projectId] ?? [])].slice(0, 200),
    },
  };
}

function createAutoSource(project: Project, utmSource: string): TrafficSource {
  const channelId = Math.max(0, ...project.allowedSources.map((source) => source.channelId)) + 1;

  return {
    id: createId("source"),
    name: utmSource,
    utmSource,
    roistatMarker: utmSource,
    channelId,
    enabled: true,
  };
}

function pickImportedRecords<T>(
  records: Record<string, T[]>,
  projectId: string,
  projectCount: number,
  usedKeys: Set<string>,
): T[] {
  if (records[projectId]) {
    usedKeys.add(projectId);
    return records[projectId];
  }

  const unusedEntries = Object.entries(records).filter(([key]) => !usedKeys.has(key));
  if (projectCount === 1 && unusedEntries.length === 1) {
    const [key, value] = unusedEntries[0];
    usedKeys.add(key);
    return value;
  }

  return [];
}

export const useAppStore = create<AppStore>((set, get) => ({
  ...initialState,

  createDemoProject: async (overrides) => {
    await new Promise((resolve) => setTimeout(resolve, 650));
    const existingProjects = get().projects;
    const existingRoistatProjectIds = new Set(existingProjects.map((project) => project.roistatProjectId));

    if (overrides?.roistatProjectId && existingRoistatProjectIds.has(overrides.roistatProjectId)) {
      throw new Error(`Project ID ${overrides.roistatProjectId} уже существует.`);
    }

    let project = createDemoProject(overrides);
    for (let attempt = 0; existingRoistatProjectIds.has(project.roistatProjectId) && attempt < 20; attempt += 1) {
      project = createDemoProject({ ...overrides, id: undefined, roistatProjectId: undefined });
    }

    if (existingRoistatProjectIds.has(project.roistatProjectId)) {
      throw new Error("Не удалось сгенерировать уникальный Project ID.");
    }

    set((state) => {
      const next = {
        ...state,
        activeProjectId: project.id,
        projects: [...state.projects, project],
        campaignsByProjectId: {
          ...state.campaignsByProjectId,
          [project.id]: [],
        },
        historyByProjectId: {
          ...state.historyByProjectId,
          [project.id]: [],
        },
      };
      persistState(toPersistedState(next));
      return next;
    });

    return project;
  },

  importProjectJson: (raw) => {
    const imported = parseProjectImport(raw);
    const state = get();
    if ("projects" in imported) {
      if (imported.projects.length === 0) {
        throw new Error("В JSON нет проектов для импорта.");
      }

      const existingRoistatProjectIds = new Set(state.projects.map((project) => project.roistatProjectId));
      const importedRoistatProjectIds = new Set<string>();

      for (const project of imported.projects) {
        if (importedRoistatProjectIds.has(project.roistatProjectId)) {
          throw new Error(`В JSON несколько проектов с одинаковым Project ID ${project.roistatProjectId}.`);
        }
        if (existingRoistatProjectIds.has(project.roistatProjectId)) {
          throw new Error(`Project ID ${project.roistatProjectId} уже существует. Измените roistatProjectId в JSON для создания копии проекта.`);
        }
        importedRoistatProjectIds.add(project.roistatProjectId);
      }

      const existingLocalIds = new Set(state.projects.map((project) => project.id));
      const importedLocalIds = new Set<string>();
      const idMap = new Map<string, string>();
      const projects = imported.projects.map((project) => {
        const nextId = existingLocalIds.has(project.id) || importedLocalIds.has(project.id) ? createId("project") : project.id;
        importedLocalIds.add(nextId);
        idMap.set(project.id, nextId);
        return nextId === project.id ? project : { ...project, id: nextId, updatedAt: new Date().toISOString() };
      });
      const usedCampaignKeys = new Set<string>();
      const usedHistoryKeys = new Set<string>();
      const campaignsByProjectId = Object.fromEntries(
        projects.map((project) => [
          project.id,
          pickImportedRecords(imported.campaignsByProjectId, project.id, projects.length, usedCampaignKeys),
        ]),
      );
      const historyByProjectId = Object.fromEntries(
        projects.map((project) => [
          project.id,
          pickImportedRecords(imported.historyByProjectId, project.id, projects.length, usedHistoryKeys),
        ]),
      );
      const requestedActiveProject = imported.projects.find((project) => project.id === imported.activeProjectId);
      const activeProjectId = requestedActiveProject ? idMap.get(requestedActiveProject.id) : projects[0]?.id;

      set((current) => {
        const next = {
          ...current,
          activeProjectId,
          projects: [...current.projects, ...projects],
          campaignsByProjectId: {
            ...current.campaignsByProjectId,
            ...campaignsByProjectId,
          },
          historyByProjectId: {
            ...current.historyByProjectId,
            ...historyByProjectId,
          },
        };
        persistState(toPersistedState(next));
        return next;
      });

      return imported.projects;
    }

    const importedProject = imported as Project;
    const importedProjects = [importedProject];
    const existingRoistatProjectIds = new Set(state.projects.map((project) => project.roistatProjectId));
    const duplicateRoistatProject = importedProjects.find((project) => existingRoistatProjectIds.has(project.roistatProjectId));

    if (duplicateRoistatProject) {
      throw new Error(`Project ID ${duplicateRoistatProject.roistatProjectId} уже существует.`);
    }

    const existingLocalIds = new Set(state.projects.map((project) => project.id));
    const idMap = new Map<string, string>();
    const projects = importedProjects.map((project) => {
      const nextId = existingLocalIds.has(project.id) ? createId("project") : project.id;
      idMap.set(project.id, nextId);
      return nextId === project.id ? project : { ...project, id: nextId, updatedAt: new Date().toISOString() };
    });
    const campaignsByProjectId = Object.fromEntries(
      projects.map((project) => {
        return [project.id, []];
      }),
    );
    const historyByProjectId = Object.fromEntries(
      projects.map((project) => {
        return [project.id, []];
      }),
    );

    const next = {
      ...state,
      activeProjectId: projects[0]?.id ?? state.activeProjectId,
      projects: [...state.projects, ...projects],
      campaignsByProjectId: {
        ...state.campaignsByProjectId,
        ...campaignsByProjectId,
      },
      historyByProjectId: {
        ...state.historyByProjectId,
        ...historyByProjectId,
      },
    };

    set(next);
    persistState(toPersistedState(next));

    return projects;
  },

  setActiveProject: (projectId) => {
    set((state) => {
      const next = { ...state, activeProjectId: projectId };
      persistState(toPersistedState(next));
      return next;
    });
  },

  updateProject: (projectId, patch) => {
    set((state) => {
      const project = state.projects.find((item) => item.id === projectId);
      const changedFields = Object.keys(patch);
      const historyItem = createHistoryItem({
        type: "settings",
        status: "success",
        title: "Настройки проекта обновлены",
        details: changedFields.length > 0 ? `Изменены поля: ${changedFields.join(", ")}.` : "Настройки проекта сохранены.",
      });
      const next = {
        ...state,
        projects: state.projects.map((project) =>
          project.id === projectId ? { ...project, ...patch, updatedAt: new Date().toISOString() } : project,
        ),
      };
      const withHistory = project ? appendHistory(next, projectId, historyItem) : next;
      persistState(toPersistedState(withHistory));
      return withHistory;
    });
  },

  deleteProject: (projectId) => {
    set((state) => {
      const projects = state.projects.filter((project) => project.id !== projectId);
      const { [projectId]: _deletedCampaigns, ...campaignsByProjectId } = state.campaignsByProjectId;
      const { [projectId]: _deletedHistory, ...historyByProjectId } = state.historyByProjectId;
      const activeProjectId = state.activeProjectId === projectId ? projects[0]?.id : state.activeProjectId;
      const next = { ...state, activeProjectId, projects, campaignsByProjectId, historyByProjectId };
      persistState(toPersistedState(next));
      return next;
    });
  },

  addCampaign: (projectId, campaignInput, options) => {
    const existingCampaign = (get().campaignsByProjectId[projectId] ?? []).find(
      (item) => item.sourceId === campaignInput.sourceId && item.utmCampaign === campaignInput.utmCampaign,
    );

    if (existingCampaign) {
      return existingCampaign;
    }

    const now = new Date().toISOString();
    const campaign: Campaign = {
      ...campaignInput,
      id: createId("campaign"),
      createdAt: now,
      updatedAt: now,
    };

    set((state) => {
      const project = state.projects.find((item) => item.id === projectId);
      const source = project?.allowedSources.find((item) => item.id === campaign.sourceId);
      const historyItem = createHistoryItem({
        type: "campaign",
        status: options?.status ?? "success",
        title: campaign.createdManually ? "Кампания добавлена вручную" : "Кампания добавлена автоматически",
        details: campaign.budget ? `Бюджет кампании: ${campaign.budget} RUB.` : "Бюджет кампании не указан.",
        source: source?.utmSource,
        campaign: campaign.utmCampaign,
        warnings: options?.warnings ?? [],
      });
      const next = {
        ...state,
        campaignsByProjectId: {
          ...state.campaignsByProjectId,
          [projectId]: [...(state.campaignsByProjectId[projectId] ?? []), campaign],
        },
      };
      const withHistory = appendHistory(next, projectId, historyItem);
      persistState(toPersistedState(withHistory));
      return withHistory;
    });

    return campaign;
  },

  updateCampaign: (projectId, campaignId, patch) => {
    set((state) => {
      const campaigns = state.campaignsByProjectId[projectId] ?? [];
      const next = {
        ...state,
        campaignsByProjectId: {
          ...state.campaignsByProjectId,
          [projectId]: campaigns.map((campaign) =>
            campaign.id === campaignId ? { ...campaign, ...patch, updatedAt: new Date().toISOString() } : campaign,
          ),
        },
      };
      persistState(toPersistedState(next));
      return next;
    });
  },

  createTrackingLink: (projectId, draft) => {
    const state = get();
    const project = state.projects.find((item) => item.id === projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const campaigns = state.campaignsByProjectId[projectId] ?? [];
    const result = analyzeTrackingLink(project, campaigns, draft);
    const now = new Date().toISOString();
    const existingSource = project.allowedSources.find((item) => item.enabled && item.utmSource === draft.utmSource);
    const nextSource = existingSource ?? (result.status !== "failed" ? createAutoSource(project, draft.utmSource) : undefined);
    const existingCampaign = campaigns.find(
      (campaign) => campaign.utmCampaign === draft.utmCampaign && campaign.sourceId === nextSource?.id,
    );
    const nextCampaign =
      !existingCampaign && nextSource && result.status !== "failed"
        ? {
            id: createId("campaign"),
            sourceId: nextSource.id,
            name: draft.utmCampaign,
            utmCampaign: draft.utmCampaign,
            budget: draft.budget,
            createdManually: false,
            createdAt: now,
            updatedAt: now,
          }
        : undefined;
    const historyItem = createHistoryItem({
      type: result.status === "failed" ? "failed" : "created",
      status: result.status,
      title: result.status === "failed" ? "Ссылка не создана" : "Ссылка создана",
      details:
        result.status === "failed"
          ? "Создание ссылки заблокировано. Проверьте предупреждения и скорректируйте данные."
          : "Готовая рекламная ссылка сохранена.",
      source: draft.utmSource,
      campaign: draft.utmCampaign,
      originalUrl: draft.targetUrl,
      finalUrl: result.finalUrl,
      diffs: result.diffs,
      warnings: result.warnings,
    });
    const campaignHistoryItem = nextCampaign
      ? createHistoryItem({
          type: "campaign",
          status: "success",
          title: "Кампания добавлена автоматически",
          details: nextCampaign.budget ? `Бюджет кампании: ${nextCampaign.budget} RUB.` : "Бюджет кампании не указан.",
          source: draft.utmSource,
          campaign: draft.utmCampaign,
        })
      : undefined;

    set((current) => {
      const next = {
        ...current,
        projects:
          !existingSource && nextSource
            ? current.projects.map((item) =>
                item.id === projectId
                  ? {
                      ...item,
                      allowedSources: [...item.allowedSources, nextSource],
                      updatedAt: now,
                    }
                  : item,
              )
            : current.projects,
        campaignsByProjectId: {
          ...current.campaignsByProjectId,
          [projectId]: nextCampaign ? [...(current.campaignsByProjectId[projectId] ?? []), nextCampaign] : (current.campaignsByProjectId[projectId] ?? []),
        },
        historyByProjectId: {
          ...current.historyByProjectId,
          [projectId]: [historyItem, ...(campaignHistoryItem ? [campaignHistoryItem] : []), ...(current.historyByProjectId[projectId] ?? [])].slice(0, 200),
        },
      };
      persistState(toPersistedState(next));
      return next;
    });

    return result;
  },

  logHistoryEvent: (projectId, event) => {
    const historyItem = createHistoryItem(event);

    set((state) => {
      const next = appendHistory(state, projectId, historyItem);
      persistState(toPersistedState(next));
      return next;
    });

    return historyItem;
  },

  clearAll: () => {
    set(() => {
      persistState(emptyPersistedState);
      return emptyPersistedState;
    });
  },
}));

export function useActiveProject(): Project | undefined {
  return useAppStore((state) => state.projects.find((project) => project.id === state.activeProjectId));
}

export function useProjectCampaigns(projectId?: string): Campaign[] {
  return useAppStore((state) => (projectId ? (state.campaignsByProjectId[projectId] ?? []) : []));
}

export function useProjectHistory(projectId?: string): LinkHistoryItem[] {
  return useAppStore((state) => (projectId ? (state.historyByProjectId[projectId] ?? []) : []));
}
