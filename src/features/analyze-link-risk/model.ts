import type { Campaign } from "../../entities/campaign/model";
import type { LinkCheckResult, RiskWarning, TrackingLinkDraft } from "../../entities/link/model";
import type { Project } from "../../entities/project/model";
import { getCampaignBudgetWarnings } from "../../shared/lib/budget";
import { formatMoney, formatPercent } from "../../shared/lib/format";
import { buildTrackingUrl } from "../../shared/lib/url";
import { hasCyrillic, looksSimilar } from "../../shared/lib/similarity";

export function analyzeTrackingLink(
  project: Project,
  campaigns: Campaign[],
  draft: TrackingLinkDraft,
): LinkCheckResult {
  try {
    const built = buildTrackingUrl(project, draft);
    const warnings = collectWarnings(project, campaigns, draft, built);
    const status = warnings.some((warning) => warning.code === "campaign_budget_exceeds_remaining")
      ? "failed"
      : warnings.some((warning) => warning.severity !== "info")
        ? "warning"
        : "success";

    return {
      status,
      finalUrl: built.finalUrl,
      diffs: built.diffs,
      warnings,
    };
  } catch {
    return {
      status: "failed",
      finalUrl: "",
      diffs: [],
      warnings: [
        {
          code: "invalid_url",
          severity: "critical",
          title: "URL не удалось прочитать",
          message: "Введите полный целевой URL с протоколом, например https://shop.example.com/catalog.",
          requiresConfirmation: false,
        },
      ],
    };
  }
}

function collectWarnings(
  project: Project,
  campaigns: Campaign[],
  draft: TrackingLinkDraft,
  built: ReturnType<typeof buildTrackingUrl>,
): RiskWarning[] {
  const warnings: RiskWarning[] = [];
  const targetHost = built.url.hostname.toLowerCase();
  const trustedDomains = [project.trustedDomain, ...project.allowedDomains].map((domain) => domain.toLowerCase());
  const isTrustedDomain = trustedDomains.includes(targetHost);

  if (!isTrustedDomain) {
    warnings.push({
      code: "domain_mismatch",
      severity: "critical",
      title: "Целевой домен отличается от доверенного",
      message: "Целевой домен отличается от доверенного домена проекта. Проверьте ссылку перед запуском рекламы.",
      requiresConfirmation: true,
    });
  }

  const similarDomain = trustedDomains.find((domain) => looksSimilar(targetHost, domain));
  if (!isTrustedDomain && similarDomain) {
    warnings.push({
      code: "domain_looks_similar",
      severity: "critical",
      title: "Домен похож на доверенный",
      message: `Домен "${targetHost}" похож на "${similarDomain}", но не совпадает. Возможна опечатка или подмена домена.`,
      requiresConfirmation: true,
    });
  }

  const suspiciousPathWarning = getSuspiciousPathWarning(built.url.pathname);
  if (suspiciousPathWarning) {
    warnings.push(suspiciousPathWarning);
  }

  const allowedSources = project.allowedSources.filter((source) => source.enabled);
  const exactSource = allowedSources.find((source) => source.utmSource === draft.utmSource);
  const similarSource = allowedSources.find((source) => looksSimilar(draft.utmSource, source.utmSource));

  if (!exactSource) {
    warnings.push({
      code: "source_not_allowed",
      severity: "warning",
      title: "Источник не входит в разрешенные",
      message: `Источник "${draft.utmSource}" отсутствует в разрешенных источниках проекта. Если вы подтвердите предупреждение, ссылка и кампания будут созданы, а источник будет добавлен как demo-источник.`,
      requiresConfirmation: true,
    });
  }

  if (!exactSource && similarSource) {
    warnings.push({
      code: "source_looks_similar",
      severity: "warning",
      title: "Источник похож на разрешенный",
      message: `Источник "${draft.utmSource}" похож на "${similarSource.utmSource}", но не совпадает. Возможно, это опечатка или подмена source-параметра.`,
      requiresConfirmation: true,
    });
  }

  if (hasCyrillic(draft.utmSource)) {
    warnings.push({
      code: "source_has_cyrillic",
      severity: "warning",
      title: "Источник содержит кириллицу",
      message: "В utm_source есть кириллические символы. В латинских идентификаторах это часто выглядит как незаметная подмена.",
      requiresConfirmation: true,
    });
  }

  if (built.existingRoistatValue) {
    const roistatDiff = built.diffs.find((diff) => diff.param === "roistat");
    if (roistatDiff) {
      warnings.push({
        code: "roistat_replaced",
        severity: "critical",
        title: "В ссылке уже есть другая Roistat-метка",
        message: `В ссылке уже указана другая Roistat-метка: ${built.existingRoistatValue}. Она будет заменена на ${roistatDiff.to}.`,
        requiresConfirmation: true,
      });
    }
  }

  const changedTrackingParams = built.diffs.filter((diff) =>
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "roistat"].includes(diff.param),
  );
  if (changedTrackingParams.length > 0) {
    warnings.push({
      code: "already_marked_url",
      severity: "warning",
      title: "Исходная ссылка уже была размечена",
      message: "В исходной ссылке уже были UTM- или Roistat-метки. Ниже показаны параметры, которые будут заменены.",
      requiresConfirmation: false,
    });
  }

  if (built.suspiciousRoistatParams.length > 0) {
    warnings.push({
      code: "suspicious_roistat_param",
      severity: "critical",
      title: "Есть похожий, но неверный Roistat-параметр",
      message: `Параметры ${built.suspiciousRoistatParams.join(", ")} похожи на Roistat-метки, но не будут обработаны как roistat или roistat_paramN.`,
      requiresConfirmation: true,
    });
  }

  const roistatParamDiffs = built.diffs.filter((diff) => diff.param.startsWith("roistat_param"));
  if (roistatParamDiffs.length > 0) {
    warnings.push({
      code: "roistat_params_conflict",
      severity: "warning",
      title: "Конфликт дополнительных Roistat-параметров",
      message: "В исходной ссылке уже были дополнительные Roistat-параметры. Они будут заменены значениями из формы.",
      requiresConfirmation: false,
    });
  }

  const isNewCampaign = !campaigns.some(
    (campaign) => campaign.utmCampaign === draft.utmCampaign && getCampaignSource(project, campaign.sourceId) === draft.utmSource,
  );
  const budget = Number(draft.budget ?? 0);
  const budgetWarnings = getCampaignBudgetWarnings(project, campaigns, budget);

  if (isNewCampaign && project.budgetLimit > 0 && budget > project.budgetLimit * 0.5) {
    warnings.push({
      code: "new_campaign_high_budget",
      severity: "critical",
      title: "Новая кампания с большим бюджетом",
      message: `Вы создаете новую кампанию с бюджетом ${formatMoney(budget)}. Это ${formatPercent(budget / project.budgetLimit)} бюджета проекта. Проверьте источник, домен, UTM- и Roistat-метки.`,
      requiresConfirmation: true,
    });
  }

  for (const budgetWarning of budgetWarnings) {
    if (budgetWarning.code === "campaign_budget_high" && warnings.some((warning) => warning.code === "new_campaign_high_budget")) {
      continue;
    }

    warnings.push({
      code: budgetWarning.code,
      severity: "critical",
      title: budgetWarning.title,
      message: budgetWarning.message,
      requiresConfirmation: !budgetWarning.blocking,
    });
  }

  return warnings;
}

function getCampaignSource(project: Project, sourceId: string): string | undefined {
  return project.allowedSources.find((source) => source.id === sourceId)?.utmSource;
}

function getSuspiciousPathWarning(pathname: string): RiskWarning | undefined {
  const decodedPathname = decodeURIComponent(pathname);
  const segments = decodedPathname.split("/").filter(Boolean);
  const hasConfusablePathSegment = segments.some((segment) => /[A-Za-z][01I][A-Za-z]/.test(segment));

  if (!hasConfusablePathSegment && !hasCyrillic(decodedPathname)) {
    return undefined;
  }

  return {
    code: "path_looks_suspicious",
    severity: "warning",
    title: "Путь URL выглядит подозрительно",
    message:
      "В пути ссылки есть символы, похожие на буквы, например 0 вместо o, 1/I вместо l или кириллица внутри латиницы. Проверьте целевой URL перед запуском рекламы.",
    requiresConfirmation: true,
  };
}
