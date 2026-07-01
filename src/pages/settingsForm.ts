import {
  getRoistatMarkerChannelId,
  isRoistatMarkerForChannel,
  isValidHostname,
  ROISTAT_MARKER_PATTERN,
  type Project,
  type TrafficSource,
} from "../entities/project/model";

export type SettingsFormState = {
  name: string;
  trustedDomain: string;
  allowedDomains: string;
  budgetLimit: string;
  sources: string;
};

export type SettingsProjectPatch = Pick<
  Project,
  "name" | "trustedDomain" | "allowedDomains" | "budgetLimit" | "allowedSources"
>;

export type SettingsValidationResult =
  | { ok: true; patch: SettingsProjectPatch }
  | { ok: false; errors: string[] };

export function sourcesToText(sources: TrafficSource[]): string {
  return sources.map((source) => `${source.name};${source.utmSource};${source.roistatMarker};${source.channelId}`).join("\n");
}

export function getSettingsFormState(project?: Project): SettingsFormState {
  return {
    name: project?.name ?? "",
    trustedDomain: project?.trustedDomain ?? "",
    allowedDomains: project?.allowedDomains.join("\n") ?? "",
    budgetLimit: String(project?.budgetLimit ?? 0),
    sources: project ? sourcesToText(project.allowedSources) : "",
  };
}

function parseNonnegativeNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function parseSourcesFromText(
  value: string,
  fallback: TrafficSource[],
): { ok: true; sources: TrafficSource[] } | { ok: false; errors: string[] } {
  const rows = value
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean);

  if (rows.length === 0) {
    return { ok: false, errors: ["Sources list cannot be empty."] };
  }

  const errors: string[] = [];
  const fallbackByUtmSource = new Map(fallback.map((source) => [source.utmSource, source]));
  const usedIds = new Set<string>();
  const usedUtmSources = new Set<string>();
  const usedRoistatMarkers = new Set<string>();
  const usedChannelIds = new Set<number>();
  const sources = rows.map((row, index) => {
    const [name, utmSource, roistatMarker, channelId] = row.split(";").map((item) => item.trim());
    const existing = fallbackByUtmSource.get(utmSource);
    const parsedChannelId = parsePositiveInteger(channelId);

    if (!name) {
      errors.push(`Row ${index + 1}: name is required.`);
    }

    if (!utmSource) {
      errors.push(`Row ${index + 1}: utm_source is required.`);
    } else if (usedUtmSources.has(utmSource)) {
      errors.push(`Row ${index + 1}: utm_source must be unique.`);
    }

    if (parsedChannelId === undefined) {
      errors.push(`Row ${index + 1}: channel_id must be a positive integer.`);
    } else if (usedChannelIds.has(parsedChannelId)) {
      errors.push(`Row ${index + 1}: channel_id must be unique.`);
    }

    if (!roistatMarker) {
      errors.push(`Row ${index + 1}: roistat_marker is required.`);
    } else if (usedRoistatMarkers.has(roistatMarker)) {
      errors.push(`Row ${index + 1}: roistat_marker must be unique.`);
    } else if (!ROISTAT_MARKER_PATTERN.test(roistatMarker)) {
      errors.push(`Row ${index + 1}: roistat_marker must match ${ROISTAT_MARKER_PATTERN}.`);
    } else if (parsedChannelId !== undefined && !isRoistatMarkerForChannel(roistatMarker, parsedChannelId)) {
      errors.push(
        `Row ${index + 1}: roistat_marker numeric suffix (${getRoistatMarkerChannelId(roistatMarker)}) must equal channel_id (${parsedChannelId}).`,
      );
    }

    const id = existing?.id ?? createUniqueSourceId(utmSource || `source_${index + 1}`, usedIds);
    if (usedIds.has(id)) {
      errors.push(`Row ${index + 1}: source id must be unique.`);
    }
    usedIds.add(id);
    if (utmSource) {
      usedUtmSources.add(utmSource);
    }
    if (roistatMarker) {
      usedRoistatMarkers.add(roistatMarker);
    }
    if (parsedChannelId !== undefined) {
      usedChannelIds.add(parsedChannelId);
    }

    return {
      id,
      name: name || utmSource || `Source ${index + 1}`,
      utmSource: utmSource || `source_${index + 1}`,
      roistatMarker: roistatMarker || utmSource || `source_${index + 1}`,
      channelId: parsedChannelId ?? index + 1,
      enabled: existing?.enabled ?? true,
    };
  });

  return errors.length > 0 ? { ok: false, errors } : { ok: true, sources };
}

function createUniqueSourceId(value: string, usedIds: Set<string>): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const base = `source_${normalized || "custom"}`;
  let candidate = base;
  let suffix = 2;

  while (usedIds.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export function validateSettingsForm(form: SettingsFormState, fallbackSources: TrafficSource[]): SettingsValidationResult {
  const errors: string[] = [];
  const budgetLimit = parseNonnegativeNumber(form.budgetLimit);
  const parsedSources = parseSourcesFromText(form.sources, fallbackSources);
  const trustedDomain = form.trustedDomain.trim();
  const allowedDomains = form.allowedDomains
    .split(/\r?\n|,/)
    .map((domain) => domain.trim())
    .filter(Boolean);

  if (!form.name.trim()) {
    errors.push("Project name is required.");
  }

  if (!trustedDomain) {
    errors.push("Trusted domain is required.");
  } else if (!isValidHostname(trustedDomain)) {
    errors.push("Trusted domain must be a hostname without protocol, path, or port.");
  }

  for (const domain of allowedDomains) {
    if (!isValidHostname(domain)) {
      errors.push(`Allowed domain "${domain}" must be a hostname without protocol, path, or port.`);
    }
  }

  if (budgetLimit === undefined) {
    errors.push("Project budget must be a finite non-negative number.");
  }

  if (!parsedSources.ok) {
    errors.push(...parsedSources.errors);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    patch: {
      name: form.name.trim(),
      trustedDomain,
      allowedDomains,
      budgetLimit: budgetLimit ?? 0,
      allowedSources: parsedSources.ok ? parsedSources.sources : fallbackSources,
    },
  };
}
