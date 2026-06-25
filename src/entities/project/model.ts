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

export const trafficSourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  utmSource: z.string().min(1),
  roistatMarker: z.string().min(1),
  channelId: z.number().int().positive(),
  enabled: z.boolean(),
});

export const projectSchema = z.object({
  id: z.string().min(1),
  roistatProjectId: z.string().min(1),
  name: z.string().min(1),
  trustedDomain: z.string().min(1),
  allowedDomains: z.array(z.string()),
  allowedSources: z.array(trafficSourceSchema),
  budgetLimit: z.number().nonnegative(),
  currency: z.literal("RUB"),
  isDemo: z.literal(true),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
