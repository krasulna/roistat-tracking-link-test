import { z } from "zod";

export type Currency = "RUB";

export type TrafficSource = {
  id: string;
  name: string;
  utmSource: string;
  roistatMarker: string;
  channelId: number;
  enabled: boolean;
};

export type Project = {
  id: string;
  roistatProjectId: string;
  name: string;
  trustedDomain: string;
  allowedDomains: string[];
  allowedSources: TrafficSource[];
  budgetLimit: number;
  currency: Currency;
  isDemo: true;
  createdAt: string;
  updatedAt: string;
};

export const ROISTAT_MARKER_PATTERN = /^[a-z]+(?:_[a-z]+)*[1-9]\d*$/;
const HOSTNAME_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$|^localhost$/i;

export function isValidHostname(value: string): boolean {
  const hostname = value.trim();

  return (
    hostname.length > 0 &&
    hostname.length <= 253 &&
    !hostname.includes("://") &&
    !/[/?#:\s]/.test(hostname) &&
    HOSTNAME_PATTERN.test(hostname)
  );
}

function normalizeRoistatMarkerPrefix(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[0-9]+$/g, "")
    .replace(/[^a-z_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function createRoistatMarkerForChannel(value: string, channelId: number): string {
  const prefix = normalizeRoistatMarkerPrefix(value) || "source";

  return `${prefix}${channelId}`;
}

export function recoverRoistatMarkerForChannel(marker: string, fallback: string, channelId: number): string {
  if (isRoistatMarkerForChannel(marker, channelId)) {
    return marker;
  }

  return createRoistatMarkerForChannel(marker || fallback, channelId);
}

export function getRoistatMarkerChannelId(marker: string): number | undefined {
  const match = marker.match(/[1-9]\d*$/);

  return match ? Number(match[0]) : undefined;
}

export function isRoistatMarkerForChannel(marker: string, channelId: number): boolean {
  return ROISTAT_MARKER_PATTERN.test(marker) && getRoistatMarkerChannelId(marker) === channelId;
}

export const trafficSourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  utmSource: z.string().min(1),
  roistatMarker: z.string().min(1),
  channelId: z.number().int().positive(),
  enabled: z.boolean(),
}).superRefine((source, context) => {
  if (!ROISTAT_MARKER_PATTERN.test(source.roistatMarker)) {
    context.addIssue({
      code: "custom",
      message: `roistatMarker must match ${ROISTAT_MARKER_PATTERN}.`,
      path: ["roistatMarker"],
    });
    return;
  }

  if (getRoistatMarkerChannelId(source.roistatMarker) !== source.channelId) {
    context.addIssue({
      code: "custom",
      message: "roistatMarker numeric suffix must equal channelId.",
      path: ["roistatMarker"],
    });
  }
});

export const projectSchema = z.object({
  id: z.string().min(1),
  roistatProjectId: z.string().min(1),
  name: z.string().min(1),
  trustedDomain: z.string().min(1).refine(isValidHostname, "trustedDomain must be a hostname without protocol, path, or port."),
  allowedDomains: z.array(z.string().refine(isValidHostname, "allowedDomains must contain hostnames without protocol, path, or port.")),
  allowedSources: z.array(trafficSourceSchema),
  budgetLimit: z.number().nonnegative(),
  currency: z.literal("RUB"),
  isDemo: z.literal(true),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).superRefine((project, context) => {
  const sourceIds = new Set<string>();
  const utmSources = new Set<string>();
  const roistatMarkers = new Set<string>();
  const channelIds = new Set<number>();

  project.allowedSources.forEach((source, index) => {
    if (sourceIds.has(source.id)) {
      context.addIssue({
        code: "custom",
        message: "allowedSources ids must be unique.",
        path: ["allowedSources", index, "id"],
      });
    }
    sourceIds.add(source.id);

    if (utmSources.has(source.utmSource)) {
      context.addIssue({
        code: "custom",
        message: "allowedSources utmSource values must be unique.",
        path: ["allowedSources", index, "utmSource"],
      });
    }
    utmSources.add(source.utmSource);

    if (roistatMarkers.has(source.roistatMarker)) {
      context.addIssue({
        code: "custom",
        message: "allowedSources roistatMarker values must be unique.",
        path: ["allowedSources", index, "roistatMarker"],
      });
    }
    roistatMarkers.add(source.roistatMarker);

    if (channelIds.has(source.channelId)) {
      context.addIssue({
        code: "custom",
        message: "allowedSources channelId values must be unique.",
        path: ["allowedSources", index, "channelId"],
      });
    }
    channelIds.add(source.channelId);
  });
});
