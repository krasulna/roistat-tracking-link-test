import type { Project, TrafficSource } from "../../entities/project/model";
import { createId, createRoistatProjectId } from "../../shared/lib/id";
import { createDefaultSources } from "../../shared/lib/roistatChannels";

const DEMO_DOMAINS = ["shop.example.com", "demo-shop.ru", "brand-store.ru", "lead-market.ru"];

export const defaultSources: TrafficSource[] = createDefaultSources();

export function createDemoProject(overrides?: Partial<Project>): Project {
  const now = new Date().toISOString();
  const domain = overrides?.trustedDomain ?? DEMO_DOMAINS[Math.floor(Math.random() * DEMO_DOMAINS.length)];
  const roistatProjectId = overrides?.roistatProjectId ?? createRoistatProjectId();

  return {
    id: overrides?.id ?? createId("project"),
    roistatProjectId,
    name: overrides?.name ?? `Тестовый проект #${roistatProjectId}`,
    trustedDomain: domain,
    allowedDomains: overrides?.allowedDomains ?? [`promo.${domain}`],
    allowedSources: overrides?.allowedSources ?? defaultSources,
    budgetLimit: overrides?.budgetLimit ?? 150000,
    currency: "RUB",
    isDemo: true,
    createdAt: overrides?.createdAt ?? now,
    updatedAt: now,
  };
}
