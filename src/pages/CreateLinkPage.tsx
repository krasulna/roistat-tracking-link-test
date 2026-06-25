import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useActiveProject, useAppStore, useProjectCampaigns } from "../app/store";
import type { LinkCheckResult, TrackingLinkDraft } from "../entities/link/model";
import { analyzeTrackingLink } from "../features/analyze-link-risk/model";
import { Button } from "../shared/ui/Button";
import { DemoNotice } from "../shared/ui/DemoNotice";
import { Page } from "../shared/ui/Page";
import { StatusBadge } from "../shared/ui/StatusBadge";
import styles from "./pages.module.css";

const formSchema = z.object({
  targetUrl: z.string().url("Введите полный URL, например https://shop.example.com/catalog"),
  utmSource: z.string().min(1, "Укажите utm_source"),
  utmMedium: z.string().min(1, "Укажите utm_medium"),
  utmCampaign: z.string().min(1, "Укажите utm_campaign"),
  utmTerm: z.string().optional(),
  utmContent: z.string().optional(),
  roistat: z.string().optional(),
  roistatParam1: z.string().optional(),
  roistatParam2: z.string().optional(),
  roistatParam3: z.string().optional(),
  roistatParam4: z.string().optional(),
  roistatParam5: z.string().optional(),
  budget: z
    .string()
    .trim()
    .min(1, "Укажите бюджет кампании")
    .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, "Бюджет должен быть больше 0"),
  confirmWarnings: z.boolean().optional(),
});

type LinkFormValues = z.infer<typeof formSchema>;

function toDraft(values: LinkFormValues): TrackingLinkDraft {
  return {
    targetUrl: values.targetUrl,
    utmSource: values.utmSource,
    utmMedium: values.utmMedium,
    utmCampaign: values.utmCampaign,
    utmTerm: values.utmTerm,
    utmContent: values.utmContent,
    roistat: values.roistat,
    roistatParams: {
      roistat_param1: values.roistatParam1,
      roistat_param2: values.roistatParam2,
      roistat_param3: values.roistatParam3,
      roistat_param4: values.roistatParam4,
      roistat_param5: values.roistatParam5,
    },
    budget: values.budget ? Number(values.budget) : undefined,
  };
}

export function CreateLinkPage() {
  const navigate = useNavigate();
  const project = useActiveProject();
  const campaigns = useProjectCampaigns(project?.id);
  const createTrackingLink = useAppStore((state) => state.createTrackingLink);
  const [result, setResult] = useState<LinkCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const firstSource = project?.allowedSources.find((source) => source.enabled);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<LinkFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      targetUrl: project ? `https://${project.trustedDomain}/catalog` : "",
      utmSource: firstSource?.utmSource ?? "",
      utmMedium: "cpc",
      utmCampaign: "brand_search",
      utmTerm: "brand",
      utmContent: "ad_15",
      roistatParam1: "campaign_42",
      roistatParam2: "ad_15",
      budget: "",
      confirmWarnings: false,
    },
  });
  const watched = useWatch({ control });

  const preview = useMemo(() => {
    if (!project || !watched.targetUrl || !watched.utmSource || !watched.utmMedium || !watched.utmCampaign) {
      return null;
    }

    return analyzeTrackingLink(project, campaigns, toDraft(watched as LinkFormValues));
  }, [campaigns, project, watched]);

  async function onSubmit(values: LinkFormValues) {
    if (!project) {
      return;
    }

    const draft = toDraft(values);
    const nextPreview = analyzeTrackingLink(project, campaigns, draft);
    const requiresConfirmation = nextPreview.warnings.some((warning) => warning.requiresConfirmation);

    if (nextPreview.status !== "failed" && requiresConfirmation && !values.confirmWarnings) {
      setResult(nextPreview);
      setSubmitError("Есть критичные предупреждения. Подтвердите проверку перед созданием ссылки.");
      return;
    }

    setSubmitError("");
    setIsChecking(true);
    setResult({ ...nextPreview, status: "checking" });
    await new Promise((resolve) => setTimeout(resolve, 2400));
    const savedResult = createTrackingLink(project.id, draft);
    setResult(savedResult);
    setIsChecking(false);
    if (savedResult.status === "failed") {
      setSubmitError("Статус failed: ссылка не создана. Скорректируйте бюджет кампании или другие критичные параметры.");
      return;
    }

    navigate("/dashboard", {
      state: {
        createdLinkStatus: savedResult.status,
        createdLinkUrl: savedResult.finalUrl,
      },
    });
  }

  if (!project) {
    return null;
  }

  const visibleResult = result ?? preview;

  return (
    <Page title="Создание рекламной ссылки" description="Соберите UTM- и Roistat-метки, проверьте риски и скопируйте готовую ссылку.">
      <DemoNotice />

      <form className={styles.panel} onSubmit={handleSubmit(onSubmit)}>
        <div className={styles.panelHeader}>
          <h2>Параметры ссылки</h2>
          {visibleResult ? <StatusBadge status={isChecking ? "checking" : visibleResult.status} /> : null}
        </div>
        <div className={styles.panelBody}>
          <div className={styles.formGrid}>
            <label className={`${styles.field} ${styles.fieldFull}`}>
              <span>Целевой URL</span>
              <input {...register("targetUrl")} placeholder={`https://${project.trustedDomain}/catalog`} />
              {errors.targetUrl ? <span className={styles.error}>{errors.targetUrl.message}</span> : null}
            </label>

            <label className={styles.field}>
              <span>utm_source</span>
              <input {...register("utmSource")} list="sources" />
              <datalist id="sources">
                {project.allowedSources.map((source) => (
                  <option key={source.id} value={source.utmSource}>
                    {source.utmSource}
                  </option>
                ))}
              </datalist>
            </label>

            <label className={styles.field}>
              <span>utm_medium</span>
              <input {...register("utmMedium")} />
            </label>

            <label className={styles.field}>
              <span>utm_campaign</span>
              <input {...register("utmCampaign")} list="campaigns" />
              <datalist id="campaigns">
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.utmCampaign} />
                ))}
              </datalist>
            </label>

            <label className={styles.field}>
              <span>Бюджет кампании</span>
              <input {...register("budget")} min={0} type="number" />
              {errors.budget ? <span className={styles.error}>{errors.budget.message}</span> : null}
            </label>

            <label className={styles.field}>
              <span>utm_term</span>
              <input {...register("utmTerm")} />
            </label>

            <label className={styles.field}>
              <span>utm_content</span>
              <input {...register("utmContent")} />
            </label>

            <label className={`${styles.field} ${styles.fieldFull}`}>
              <span>roistat</span>
              <input {...register("roistat")} placeholder="Оставьте пустым для автогенерации" />
              <p className={styles.hint}>Итоговая ссылка всегда содержит параметр roistat. Внутренние "_" экранируются как ":u:".</p>
            </label>

            {(["1", "2", "3", "4", "5"] as const).map((index) => (
              <label className={styles.field} key={index}>
                <span>roistat_param{index}</span>
                <input {...register(`roistatParam${index}` as const)} />
              </label>
            ))}
          </div>

          <div className={styles.actions} style={{ marginTop: 14 }}>
            <label className={styles.field} style={{ display: "flex", gridTemplateColumns: "auto 1fr", alignItems: "center" }}>
              <input {...register("confirmWarnings")} type="checkbox" style={{ width: 16, minHeight: 16 }} />
              <span>Я проверил критичные предупреждения</span>
            </label>
          </div>
          {submitError ? <p className={styles.error}>{submitError}</p> : null}

          <div className={styles.actions} style={{ marginTop: 14 }}>
            <Button disabled={isChecking} type="submit">
              {isChecking ? "Проверка..." : "Создать ссылку"}
            </Button>
          </div>
        </div>
      </form>

      {visibleResult ? (
        <>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>Предпросмотр результата</h2>
              {visibleResult.finalUrl ? (
                <Button
                  icon={<Copy size={14} />}
                  onClick={() => void navigator.clipboard.writeText(visibleResult.finalUrl)}
                  variant="secondary"
                >
                  Копировать
                </Button>
              ) : null}
            </div>
            <div className={styles.panelBody}>
              {visibleResult.finalUrl ? <code className={styles.code}>{visibleResult.finalUrl}</code> : <p className={styles.error}>Ссылка не создана.</p>}
            </div>
          </section>

          {visibleResult.warnings.length > 0 ? (
            <section className={styles.alertList}>
              {visibleResult.warnings.map((warning) => (
                <article
                  className={`${styles.alert} ${warning.severity === "critical" ? styles.alertCritical : ""} ${
                    warning.severity === "info" ? styles.alertInfo : ""
                  }`}
                  key={warning.code}
                >
                  <h3>{warning.title}</h3>
                  <p>{warning.message}</p>
                </article>
              ))}
            </section>
          ) : null}

          {visibleResult.diffs.length > 0 ? (
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>В исходной ссылке уже были метки</h2>
              </div>
              <div className={styles.panelBody}>
                <ul className={styles.diffList}>
                  {visibleResult.diffs.map((diff) => (
                    <li key={`${diff.param}-${diff.from}-${diff.to}`}>
                      {diff.param}: {diff.from} -&gt; {diff.to}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : null}

          {result?.finalUrl ? (
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>
                  <QrCode size={15} /> QR-код
                </h2>
              </div>
              <div className={styles.panelBody}>
                <div className={styles.qrBox}>
                  <QRCodeSVG value={result.finalUrl} size={132} />
                </div>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </Page>
  );
}
