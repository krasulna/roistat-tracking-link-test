import type { Campaign } from "../../entities/campaign/model";
import type { Project } from "../../entities/project/model";
import { formatMoney, formatPercent } from "./format";

export type BudgetWarning = {
  code: "campaign_budget_high" | "campaign_budget_exceeds_remaining";
  title: string;
  message: string;
  blocking: boolean;
};

export function calculateUsedBudget(campaigns: Campaign[]): number {
  return campaigns.reduce((sum, campaign) => sum + Number(campaign.budget ?? 0), 0);
}

export function calculateRemainingBudget(project: Project, campaigns: Campaign[]): number {
  return Math.max(project.budgetLimit - calculateUsedBudget(campaigns), 0);
}

export function getCampaignBudgetWarnings(project: Project, campaigns: Campaign[], budget?: number): BudgetWarning[] {
  const value = Number(budget ?? 0);
  const warnings: BudgetWarning[] = [];

  if (!value || value <= 0) {
    return warnings;
  }

  const remainingBudget = calculateRemainingBudget(project, campaigns);

  if (project.budgetLimit > 0 && value > project.budgetLimit * 0.5) {
    warnings.push({
      code: "campaign_budget_high",
      title: "Крупный бюджет кампании",
      message: `Бюджет кампании ${formatMoney(value)} составляет ${formatPercent(value / project.budgetLimit)} бюджета проекта.`,
      blocking: false,
    });
  }

  if (value > remainingBudget) {
    warnings.push({
      code: "campaign_budget_exceeds_remaining",
      title: "Бюджета проекта не хватает",
      message: `Остаток бюджета проекта: ${formatMoney(remainingBudget)}. Кампания с бюджетом ${formatMoney(value)} превысит лимит. Скорректируйте бюджет кампании.`,
      blocking: true,
    });
  }

  return warnings;
}
