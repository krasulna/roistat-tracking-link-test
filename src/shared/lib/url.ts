import type { ParameterDiff, RoistatParamKey, TrackingLinkDraft } from "../../entities/link/model";
import type { Project } from "../../entities/project/model";
import { generateRoistatMarker } from "./roistat";
import { looksSimilar, normalizeConfusables } from "./similarity";

const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "roistat",
  "rs",
  "roistat_param1",
  "roistat_param2",
  "roistat_param3",
  "roistat_param4",
  "roistat_param5",
];

const ROISTAT_PARAM_KEYS: RoistatParamKey[] = [
  "roistat_param1",
  "roistat_param2",
  "roistat_param3",
  "roistat_param4",
  "roistat_param5",
];

export type BuiltTrackingUrl = {
  url: URL;
  finalUrl: string;
  diffs: ParameterDiff[];
  existingRoistatValue?: string;
  existingRoistatParamName?: "roistat" | "rs";
  existingRsValue?: string;
  suspiciousRoistatParams: string[];
};

function serializeReadableUrl(url: URL): string {
  return url.toString().replaceAll("%3A", ":").replaceAll("%3a", ":");
}

export function parseUserUrl(value: string): URL {
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Unsupported URL protocol");
  }

  return url;
}

export function isHttpUrl(value: string): boolean {
  try {
    parseUserUrl(value);
    return true;
  } catch {
    return false;
  }
}

function getParamDiffValue(params: URLSearchParams, param: string): string | undefined {
  const values = params.getAll(param);

  return values.length > 0 ? values.join(", ") : undefined;
}

function setParamWithDiff(url: URL, diffs: ParameterDiff[], param: string, value?: string): void {
  const nextValue = value?.trim();
  const previousValues = url.searchParams.getAll(param);
  const previous = previousValues.length > 0 ? previousValues.join(", ") : undefined;

  if (!nextValue) {
    if (previous !== undefined) {
      diffs.push({ param, from: previous, to: "" });
      url.searchParams.delete(param);
    }
    return;
  }

  if (previous !== undefined && (previousValues.length > 1 || previous !== nextValue)) {
    diffs.push({ param, from: previous, to: nextValue });
  }

  url.searchParams.set(param, nextValue);
}

export function buildTrackingUrl(project: Project, draft: TrackingLinkDraft): BuiltTrackingUrl {
  const url = parseUserUrl(draft.targetUrl);
  const diffs: ParameterDiff[] = [];
  const existingRoistatParamName = url.searchParams.has("roistat")
    ? "roistat"
    : url.searchParams.has("rs")
      ? "rs"
      : undefined;
  const existingRoistatValue = existingRoistatParamName
    ? getParamDiffValue(url.searchParams, existingRoistatParamName)
    : undefined;
  const existingRsValue = getParamDiffValue(url.searchParams, "rs");
  const suspiciousRoistatParams = findSuspiciousRoistatParams(url.searchParams);
  const roistat = generateRoistatMarker(project, draft);

  setParamWithDiff(url, diffs, "utm_source", draft.utmSource);
  setParamWithDiff(url, diffs, "utm_medium", draft.utmMedium);
  setParamWithDiff(url, diffs, "utm_campaign", draft.utmCampaign);
  setParamWithDiff(url, diffs, "utm_term", draft.utmTerm);
  setParamWithDiff(url, diffs, "utm_content", draft.utmContent);

  if (existingRsValue !== undefined) {
    diffs.push({ param: "rs", from: existingRsValue, to: "" });
    url.searchParams.delete("rs");
  }

  if (existingRoistatParamName === "rs" && existingRoistatValue && existingRoistatValue !== roistat) {
    diffs.push({ param: "roistat", from: existingRoistatValue, to: roistat });
  }

  setParamWithDiff(url, diffs, "roistat", roistat);

  for (const key of ROISTAT_PARAM_KEYS) {
    setParamWithDiff(url, diffs, key, draft.roistatParams[key]);
  }

  return {
    url,
    finalUrl: serializeReadableUrl(url),
    diffs,
    existingRoistatValue,
    existingRoistatParamName,
    existingRsValue,
    suspiciousRoistatParams,
  };
}

export function isTrackingParam(name: string): boolean {
  return TRACKING_PARAMS.includes(name);
}

export function findSuspiciousRoistatParams(params: URLSearchParams): string[] {
  const suspicious: string[] = [];

  for (const name of params.keys()) {
    if (isTrackingParam(name)) {
      continue;
    }

    const normalized = normalizeConfusables(name);
    const isRoistatLike =
      looksSimilar(normalized, "roistat") ||
      looksSimilar(normalized, "roistat_param1") ||
      /^roistat_param[^1-5]$/i.test(normalized) ||
      normalized.includes("roistat");

    if (isRoistatLike) {
      suspicious.push(name);
    }
  }

  return suspicious;
}
