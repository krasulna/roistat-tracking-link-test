import { z } from "zod";
import type { LinkStatus, ParameterDiff, RiskWarning } from "../link/model";

export type HistoryType = "created" | "checked" | "warning" | "failed" | "campaign" | "settings" | "template";

export type LinkHistoryItem = {
  id: string;
  type: HistoryType;
  status: LinkStatus;
  title?: string;
  details?: string;
  source?: string;
  campaign?: string;
  originalUrl?: string;
  finalUrl?: string;
  diffs: ParameterDiff[];
  warnings: RiskWarning[];
  createdAt: string;
};

const riskWarningSchema = z.object({
  code: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
  title: z.string(),
  message: z.string(),
  requiresConfirmation: z.boolean(),
});

const parameterDiffSchema = z.object({
  param: z.string(),
  from: z.string(),
  to: z.string(),
});

export const historyItemSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["created", "checked", "warning", "failed", "campaign", "settings", "template"]),
  status: z.enum(["checking", "success", "warning", "failed"]),
  title: z.string().optional(),
  details: z.string().optional(),
  source: z.string().optional(),
  campaign: z.string().optional(),
  originalUrl: z.string().optional(),
  finalUrl: z.string().optional(),
  diffs: z.array(parameterDiffSchema),
  warnings: z.array(riskWarningSchema),
  createdAt: z.string().min(1),
});
