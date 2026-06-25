import { z } from "zod";

export type Campaign = {
  id: string;
  sourceId: string;
  name: string;
  utmCampaign: string;
  budget?: number;
  createdManually: boolean;
  createdAt: string;
  updatedAt: string;
};

export const campaignSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  name: z.string().min(1),
  utmCampaign: z.string().min(1),
  budget: z.number().nonnegative().optional(),
  createdManually: z.boolean(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

