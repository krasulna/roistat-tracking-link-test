import { z } from "zod";
import { campaignSchema, type Campaign } from "../entities/campaign/model";
import { historyItemSchema, type LinkHistoryItem } from "../entities/history/model";
import {
  isValidHostname,
  projectSchema,
  recoverRoistatMarkerForChannel,
  trafficSourceSchema,
  type Project,
  type TrafficSource,
} from "../entities/project/model";

export const STORAGE_KEY = "roistat-tracking-link-test";
export const SCHEMA_VERSION = 1;

export type PersistedAppState = {
  schemaVersion: number;
  activeProjectId?: string;
  projects: Project[];
  campaignsByProjectId: Record<string, Campaign[]>;
  historyByProjectId: Record<string, LinkHistoryItem[]>;
};

type SourceNormalization = {
  sources: TrafficSource[];
  sourceIdRemap: Record<string, string>;
};

type RecoveredProject = {
  project: Project;
  sourceIdRemap: Record<string, string>;
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
    return parsePersistedState(parsed);
  } catch {
    return emptyPersistedState;
  }
}

function parsePersistedState(value: unknown): PersistedAppState {
  const strictState = persistedAppStateSchema.safeParse(value);

  if (strictState.success) {
    return migratePersistedState(strictState.data);
  }

  return recoverPersistedState(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function recoverHostname(value: unknown): string | undefined {
  const raw = readNonEmptyString(value);
  if (!raw) {
    return undefined;
  }

  if (isValidHostname(raw)) {
    return raw.trim().toLowerCase();
  }

  try {
    const url = new URL(raw);
    return isValidHostname(url.hostname) ? url.hostname.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}

function recoverHostnameArray(value: unknown): string[] {
  return readStringArray(value).map(recoverHostname).filter((item): item is string => Boolean(item));
}

function readNonnegativeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function readPositiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function recoverTrafficSource(value: unknown, index: number): TrafficSource | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const utmSource = readNonEmptyString(value.utmSource);
  const name = readNonEmptyString(value.name) ?? utmSource;
  const channelId = readPositiveInteger(value.channelId, index + 1);
  const roistatMarker = utmSource
    ? recoverRoistatMarkerForChannel(readNonEmptyString(value.roistatMarker) ?? "", utmSource, channelId)
    : undefined;

  if (!utmSource || !name || !roistatMarker) {
    return undefined;
  }

  const source = {
    id: readNonEmptyString(value.id) ?? `source_${utmSource}`,
    name,
    utmSource,
    roistatMarker,
    channelId,
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
  };
  const parsedSource = trafficSourceSchema.safeParse(source);

  return parsedSource.success ? parsedSource.data : undefined;
}

function normalizeTrafficSources(
  candidates: Array<{ source: TrafficSource; originalId?: string }>,
): SourceNormalization {
  const usedById = new Map<string, TrafficSource>();
  const usedByUtmSource = new Map<string, TrafficSource>();
  const usedByRoistatMarker = new Map<string, TrafficSource>();
  const usedByChannelId = new Map<number, TrafficSource>();
  const sourceIdRemap: Record<string, string> = {};
  const sources: TrafficSource[] = [];

  for (const candidate of candidates) {
    const { source } = candidate;
    const originalId = candidate.originalId ?? source.id;
    const keptSource =
      usedById.get(source.id) ??
      usedByUtmSource.get(source.utmSource) ??
      usedByRoistatMarker.get(source.roistatMarker) ??
      usedByChannelId.get(source.channelId);

    if (keptSource) {
      if (originalId !== keptSource.id) {
        sourceIdRemap[originalId] = keptSource.id;
      }
      if (source.id !== keptSource.id) {
        sourceIdRemap[source.id] = keptSource.id;
      }
      continue;
    }

    if (originalId !== source.id) {
      sourceIdRemap[originalId] = source.id;
    }
    usedById.set(source.id, source);
    usedByUtmSource.set(source.utmSource, source);
    usedByRoistatMarker.set(source.roistatMarker, source);
    usedByChannelId.set(source.channelId, source);
    sources.push(source);
  }

  return { sources, sourceIdRemap };
}

function recoverProject(value: unknown): RecoveredProject | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = readNonEmptyString(value.id);
  const roistatProjectId = readNonEmptyString(value.roistatProjectId);
  const name = readNonEmptyString(value.name);
  const trustedDomain = recoverHostname(value.trustedDomain);

  if (!id || !roistatProjectId || !name || !trustedDomain) {
    return undefined;
  }

  const rawSources = Array.isArray(value.allowedSources) ? value.allowedSources : [];
  const sourceCandidates = rawSources
    .map((source, index) => recoverTrafficSource(source, index))
    .filter((source): source is TrafficSource => Boolean(source))
    .map((source) => ({
      originalId: source.id,
      source: migrateTrafficSource(source),
    }));
  const orderedCandidates = orderSourceCandidatesForMigration(sourceCandidates);
  const normalizedSources = normalizeTrafficSources(
    orderedCandidates,
  );
  const candidate = {
    id,
    roistatProjectId,
    name,
    trustedDomain,
    allowedDomains: recoverHostnameArray(value.allowedDomains),
    allowedSources: normalizedSources.sources,
    budgetLimit: readNonnegativeNumber(value.budgetLimit, 0),
    currency: "RUB",
    isDemo: true,
    createdAt: readNonEmptyString(value.createdAt) ?? "1970-01-01T00:00:00.000Z",
    updatedAt: readNonEmptyString(value.updatedAt) ?? "1970-01-01T00:00:00.000Z",
  };
  const parsedProject = projectSchema.safeParse(candidate);

  return parsedProject.success
    ? { project: parsedProject.data, sourceIdRemap: normalizedSources.sourceIdRemap }
    : undefined;
}

function recoverRecordArray<T>(records: unknown, projectId: string, schema: z.ZodType<T>): T[] {
  if (!isRecord(records)) {
    return [];
  }

  const rawRecords = records[projectId];
  if (!Array.isArray(rawRecords)) {
    return [];
  }

  const recoveredRecords: T[] = [];
  for (const item of rawRecords) {
    const result = schema.safeParse(item);
    if (result.success) {
      recoveredRecords.push(result.data);
    }
  }

  return recoveredRecords;
}

function remapCampaignSources(
  campaigns: Campaign[],
  project: Project,
  sourceIdRemap: Record<string, string>,
): Campaign[] {
  const validSourceIds = new Set(project.allowedSources.map((source) => source.id));

  return campaigns
    .map((campaign) => ({
      ...campaign,
      sourceId: sourceIdRemap[campaign.sourceId] ?? campaign.sourceId,
    }))
    .filter((campaign) => validSourceIds.has(campaign.sourceId));
}

function recoverPersistedState(value: unknown): PersistedAppState {
  if (!isRecord(value)) {
    return emptyPersistedState;
  }

  const recoveredProjects = (Array.isArray(value.projects) ? value.projects : [])
    .map(recoverProject)
    .filter((project): project is RecoveredProject => Boolean(project));
  const projects = recoveredProjects.map((item) => item.project);
  const sourceIdRemaps = new Map(recoveredProjects.map((item) => [item.project.id, item.sourceIdRemap]));

  if (projects.length === 0) {
    return emptyPersistedState;
  }

  const projectIds = new Set(projects.map((project) => project.id));
  const activeProjectId = projectIds.has(readNonEmptyString(value.activeProjectId) ?? "")
    ? readNonEmptyString(value.activeProjectId)
    : projects[0]?.id;
  const recoveredState: PersistedAppState = {
    schemaVersion: readNonnegativeNumber(value.schemaVersion, SCHEMA_VERSION),
    activeProjectId,
    projects,
    campaignsByProjectId: Object.fromEntries(
      projects.map((project) => [
        project.id,
        remapCampaignSources(
          recoverRecordArray(value.campaignsByProjectId, project.id, campaignSchema),
          project,
          sourceIdRemaps.get(project.id) ?? {},
        ),
      ]),
    ),
    historyByProjectId: Object.fromEntries(
      projects.map((project) => [
        project.id,
        recoverRecordArray(value.historyByProjectId, project.id, historyItemSchema),
      ]),
    ),
  };

  return migratePersistedState(persistedAppStateSchema.parse(recoveredState));
}

function hasDuplicateImportedSourceKeys(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.projects)) {
    return false;
  }

  return value.projects.some((project) => {
    if (!isRecord(project) || !Array.isArray(project.allowedSources)) {
      return false;
    }

    const sourceIds = new Set<string>();
    const utmSources = new Set<string>();
    const roistatMarkers = new Set<string>();
    const channelIds = new Set<number>();
    for (const source of project.allowedSources) {
      if (!isRecord(source)) {
        continue;
      }

      const id = readNonEmptyString(source.id);
      if (id) {
        if (sourceIds.has(id)) {
          return true;
        }
        sourceIds.add(id);
      }

      const utmSource = readNonEmptyString(source.utmSource);
      if (utmSource) {
        if (utmSources.has(utmSource)) {
          return true;
        }
        utmSources.add(utmSource);
      }

      const roistatMarker = readNonEmptyString(source.roistatMarker);
      if (roistatMarker) {
        if (roistatMarkers.has(roistatMarker)) {
          return true;
        }
        roistatMarkers.add(roistatMarker);
      }

      if (typeof source.channelId === "number" && Number.isFinite(source.channelId)) {
        if (channelIds.has(source.channelId)) {
          return true;
        }
        channelIds.add(source.channelId);
      }
    }

    return false;
  });
}

function migrateTrafficSource(source: TrafficSource): TrafficSource {
  if (source.id !== "source_telegram") {
    return source;
  }

  return {
    ...source,
    id: "source_tg_booster",
    name: "TG Booster",
    utmSource: "tg_booster",
    roistatMarker: source.roistatMarker || `tgbooster${source.channelId}`,
  };
}

function orderSourceCandidatesForMigration(
  candidates: Array<{ source: TrafficSource; originalId?: string }>,
): Array<{ source: TrafficSource; originalId?: string }> {
  return [
    ...candidates.filter((candidate) => candidate.originalId !== "source_telegram"),
    ...candidates.filter((candidate) => candidate.originalId === "source_telegram"),
  ];
}

function migrateProject(project: Project): RecoveredProject {
  const sourceCandidates = project.allowedSources.map((source) => ({
    originalId: source.id,
    source: migrateTrafficSource(source),
  }));
  const orderedCandidates = orderSourceCandidatesForMigration(sourceCandidates);
  const normalizedSources = normalizeTrafficSources(
    orderedCandidates,
  );
  const migratedProject = projectSchema.parse({
    ...project,
    allowedSources: normalizedSources.sources,
  });

  return {
    project: migratedProject,
    sourceIdRemap: normalizedSources.sourceIdRemap,
  };
}

function migratePersistedState(state: PersistedAppState): PersistedAppState {
  const migratedProjects = state.projects.map(migrateProject);
  const projects = migratedProjects.map((item) => item.project);
  const sourceIdRemaps = new Map(migratedProjects.map((item) => [item.project.id, item.sourceIdRemap]));
  const projectIds = new Set(projects.map((project) => project.id));
  const activeProjectId =
    state.activeProjectId && projectIds.has(state.activeProjectId) ? state.activeProjectId : projects[0]?.id;

  const migratedState = {
    ...state,
    activeProjectId,
    campaignsByProjectId: Object.fromEntries(
      projects.map((project) => [
        project.id,
        remapCampaignSources(
          state.campaignsByProjectId[project.id] ?? [],
          project,
          sourceIdRemaps.get(project.id) ?? {},
        ),
      ]),
    ),
    historyByProjectId: Object.fromEntries(
      projects.map((project) => [
        project.id,
        state.historyByProjectId[project.id] ?? [],
      ]),
    ),
    projects,
  };

  return persistedAppStateSchema.parse(migratedState);
}

export function savePersistedState(state: PersistedAppState): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedAppStateSchema.parse(state)));
}

export function parseProjectImport(raw: string): PersistedAppState | Project {
  const parsed = JSON.parse(raw);
  const appState = persistedAppStateSchema.safeParse(parsed);
  if (appState.success) {
    return migratePersistedState(appState.data);
  }

  if (isRecord(parsed) && Array.isArray(parsed.projects)) {
    if (hasDuplicateImportedSourceKeys(parsed)) {
      throw new Error("Imported projects contain duplicate source ids, utm_source values, roistat markers, or channel ids.");
    }

    return recoverPersistedState(parsed);
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
