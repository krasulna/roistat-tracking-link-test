import type { Campaign } from "../entities/campaign/model";
import type { LinkHistoryItem } from "../entities/history/model";
import type { TrackingLinkDraft } from "../entities/link/model";
import type { Project, TrafficSource } from "../entities/project/model";

export const fixedDate = "2026-01-01T00:00:00.000Z";

export function createSource(overrides: Partial<TrafficSource> = {}): TrafficSource {
  return {
    id: "source_yandex",
    name: "Yandex Direct",
    utmSource: "yandex_direct",
    roistatMarker: "direct1",
    channelId: 1,
    enabled: true,
    ...overrides,
  };
}

export function createProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project_1",
    roistatProjectId: "1001",
    name: "Demo project",
    trustedDomain: "shop.example.com",
    allowedDomains: [],
    allowedSources: [createSource()],
    budgetLimit: 1000,
    currency: "RUB",
    isDemo: true,
    createdAt: fixedDate,
    updatedAt: fixedDate,
    ...overrides,
  };
}

export function createCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "campaign_1",
    sourceId: "source_yandex",
    name: "Brand search",
    utmCampaign: "brand_search",
    budget: 100,
    createdManually: false,
    createdAt: fixedDate,
    updatedAt: fixedDate,
    ...overrides,
  };
}

export function createDraft(overrides: Partial<TrackingLinkDraft> = {}): TrackingLinkDraft {
  return {
    targetUrl: "https://shop.example.com/catalog",
    utmSource: "yandex_direct",
    utmMedium: "cpc",
    utmCampaign: "brand_search",
    utmTerm: "brand",
    utmContent: "ad_15",
    roistatParams: {
      roistat_param1: "campaign_42",
      roistat_param2: "ad_15",
    },
    budget: 100,
    ...overrides,
  };
}

export function createHistoryItem(overrides: Partial<LinkHistoryItem> = {}): LinkHistoryItem {
  return {
    id: "history_1",
    type: "created",
    status: "success",
    title: "Created",
    details: "Created link",
    diffs: [],
    warnings: [],
    createdAt: fixedDate,
    ...overrides,
  };
}
