export type RoistatParamKey =
  | "roistat_param1"
  | "roistat_param2"
  | "roistat_param3"
  | "roistat_param4"
  | "roistat_param5";

export type TrackingLinkDraft = {
  targetUrl: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmTerm?: string;
  utmContent?: string;
  roistat?: string;
  roistatParams: Partial<Record<RoistatParamKey, string>>;
  budget?: number;
};

export type LinkStatus = "checking" | "success" | "warning" | "failed";

export type ParameterDiff = {
  param: string;
  from: string;
  to: string;
};

export type RiskWarning = {
  code: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  requiresConfirmation: boolean;
};

export type LinkCheckResult = {
  status: LinkStatus;
  finalUrl: string;
  diffs: ParameterDiff[];
  warnings: RiskWarning[];
};

