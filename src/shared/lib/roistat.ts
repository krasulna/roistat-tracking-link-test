import { createRoistatMarkerForChannel, type Project, type TrafficSource } from "../../entities/project/model";
import type { TrackingLinkDraft } from "../../entities/link/model";

export function escapeRoistatLevel(value: string): string {
  return value.trim().replaceAll("_", ":u:");
}

export function findSource(project: Project, utmSource: string): TrafficSource | undefined {
  return project.allowedSources.find((source) => source.utmSource === utmSource);
}

function getNextChannelId(project: Project): number {
  return Math.max(0, ...project.allowedSources.map((source) => source.channelId)) + 1;
}

export function generateRoistatMarker(project: Project, draft: TrackingLinkDraft): string {
  if (draft.roistat?.trim()) {
    return draft.roistat.trim();
  }

  const sourceMarker = findSource(project, draft.utmSource)?.roistatMarker
    ?? createRoistatMarkerForChannel(draft.utmSource, getNextChannelId(project));

  return [sourceMarker, draft.utmMedium, draft.utmCampaign].map(escapeRoistatLevel).join("_");
}

export function buildTemplateUrl(project: Project): string {
  return [
    `https://${project.trustedDomain}/?utm_source={source}`,
    "utm_medium={medium}",
    "utm_campaign={campaign}",
    "utm_content={content}",
    "utm_term={term}",
    "roistat={source_marker}_{medium}_{campaign}",
    "roistat_param1={campaign_id}",
    "roistat_param2={ad_id}",
  ].join("&");
}
