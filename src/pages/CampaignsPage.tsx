import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useActiveProject, useAppStore, useProjectCampaigns } from "../app/store";
import type { LinkStatus, RiskWarning } from "../entities/link/model";
import { calculateRemainingBudget, calculateUsedBudget, getCampaignBudgetWarnings } from "../shared/lib/budget";
import { formatMoney } from "../shared/lib/format";
import { Button } from "../shared/ui/Button";
import { DemoNotice } from "../shared/ui/DemoNotice";
import { Page } from "../shared/ui/Page";
import { StatusBadge } from "../shared/ui/StatusBadge";
import styles from "./pages.module.css";

export function CampaignsPage() {
  const project = useActiveProject();
  const campaigns = useProjectCampaigns(project?.id);
  const addCampaign = useAppStore((state) => state.addCampaign);
  const logHistoryEvent = useAppStore((state) => state.logHistoryEvent);
  const [sourceId, setSourceId] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [budget, setBudget] = useState("");
  const [query, setQuery] = useState("");
  const [confirmedBudgetWarnings, setConfirmedBudgetWarnings] = useState(false);
  const [formError, setFormError] = useState("");
  const [actionStatus, setActionStatus] = useState<LinkStatus | null>(null);
  const projectId = project?.id;

  useEffect(() => {
    setSourceId("");
    setUtmCampaign("");
    setBudget("");
    setConfirmedBudgetWarnings(false);
    setFormError("");
    setActionStatus(null);
  }, [projectId]);

  if (!project) {
    return null;
  }

  const activeProject = project;
  const sources = activeProject.allowedSources.filter((source) => source.enabled);
  const selectedSourceId = sourceId || sources[0]?.id || "";
  const usedBudget = calculateUsedBudget(campaigns);
  const remainingBudget = calculateRemainingBudget(activeProject, campaigns);
  const budgetValue = budget ? Number(budget) : undefined;
  const budgetWarnings = getCampaignBudgetWarnings(activeProject, campaigns, budgetValue);
  const blockingBudgetWarnings = budgetWarnings.filter((warning) => warning.blocking);
  const confirmableBudgetWarnings = budgetWarnings.filter((warning) => !warning.blocking);
  const riskWarnings: RiskWarning[] = budgetWarnings.map((warning) => ({
    code: warning.code,
    severity: "critical",
    title: warning.title,
    message: warning.message,
    requiresConfirmation: !warning.blocking,
  }));
  const filteredCampaigns = campaigns.filter((campaign) => {
    const source = activeProject.allowedSources.find((item) => item.id === campaign.sourceId);
    const haystack = `${campaign.name} ${campaign.utmCampaign} ${source?.utmSource ?? ""}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  function handleAddCampaign() {
    setFormError("");
    const selectedSource = activeProject.allowedSources.find((source) => source.id === selectedSourceId);

    if (!utmCampaign.trim() || !selectedSourceId || !selectedSource) {
      setFormError(selectedSourceId && !selectedSource ? "Выберите источник активного проекта." : "Укажите источник и utm_campaign.");
      setActionStatus("failed");
      logHistoryEvent(activeProject.id, {
        type: "campaign",
        status: "failed",
        title: "Кампания не добавлена",
        details: selectedSourceId && !selectedSource ? "Источник не найден в активном проекте." : "Источник или utm_campaign не указан.",
        source: selectedSource?.utmSource,
        campaign: utmCampaign.trim() || undefined,
      });
      return;
    }

    const alreadyExists = campaigns.some((campaign) => campaign.sourceId === selectedSourceId && campaign.utmCampaign === utmCampaign.trim());
    if (alreadyExists) {
      setFormError("Кампания с такой парой source + campaign уже существует.");
      setActionStatus("failed");
      logHistoryEvent(activeProject.id, {
        type: "campaign",
        status: "failed",
        title: "Кампания не добавлена",
        details: "Кампания с такой парой source + campaign уже существует.",
        source: selectedSource?.utmSource,
        campaign: utmCampaign.trim(),
      });
      return;
    }

    const budgetNumber = Number(budget);

    if (!budget || !Number.isFinite(budgetNumber) || budgetNumber <= 0) {
      setActionStatus("failed");
      setFormError("Статус failed: укажите бюджет кампании больше 0.");
      logHistoryEvent(activeProject.id, {
        type: "campaign",
        status: "failed",
        title: "Кампания не добавлена",
        details: "Бюджет кампании не указан или меньше 1.",
        source: selectedSource?.utmSource,
        campaign: utmCampaign.trim(),
      });
      return;
    }

    if (blockingBudgetWarnings.length > 0) {
      setActionStatus("failed");
      setFormError("Статус failed: бюджет кампании больше остатка бюджета проекта. Скорректируйте бюджет.");
      logHistoryEvent(activeProject.id, {
        type: "campaign",
        status: "failed",
        title: "Кампания не добавлена",
        details: "Бюджет кампании больше остатка бюджета проекта.",
        source: selectedSource?.utmSource,
        campaign: utmCampaign.trim(),
        warnings: riskWarnings,
      });
      return;
    }

    if (confirmableBudgetWarnings.length > 0 && !confirmedBudgetWarnings) {
      setActionStatus("warning");
      setFormError("Есть предупреждения по бюджету. Ознакомьтесь с ними перед добавлением кампании.");
      return;
    }

    const nextStatus: LinkStatus = confirmableBudgetWarnings.length > 0 ? "warning" : "success";
    addCampaign(activeProject.id, {
      sourceId: selectedSourceId,
      name: utmCampaign.trim(),
      utmCampaign: utmCampaign.trim(),
      budget: budgetNumber,
      createdManually: true,
    }, {
      status: nextStatus,
      warnings: riskWarnings,
    });
    setActionStatus(nextStatus);
    setUtmCampaign("");
    setBudget("");
    setConfirmedBudgetWarnings(false);
  }

  return (
    <Page title="Кампании" description="Кампании можно добавлять вручную; новые кампании также появляются после создания ссылки.">
      <DemoNotice />

      <div className={styles.grid}>
        <div className={styles.metric}>
          <p className={styles.metricLabel}>Бюджет проекта</p>
          <p className={styles.metricValue}>{formatMoney(activeProject.budgetLimit)}</p>
        </div>
        <div className={styles.metric}>
          <p className={styles.metricLabel}>Потрачено на кампании</p>
          <p className={styles.metricValue}>{formatMoney(usedBudget)}</p>
        </div>
        <div className={styles.metric}>
          <p className={styles.metricLabel}>Остаток бюджета</p>
          <p className={styles.metricValue}>{formatMoney(remainingBudget)}</p>
        </div>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Добавить кампанию</h2>
          {actionStatus ? <StatusBadge status={actionStatus} /> : null}
        </div>
        <div className={styles.panelBody}>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Источник</span>
              <select
                value={selectedSourceId}
                onChange={(event) => {
                  setSourceId(event.target.value);
                  setActionStatus(null);
                  setConfirmedBudgetWarnings(false);
                }}
              >
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.utmSource}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>utm_campaign</span>
              <input
                value={utmCampaign}
                onChange={(event) => {
                  setUtmCampaign(event.target.value);
                  setActionStatus(null);
                  setConfirmedBudgetWarnings(false);
                }}
              />
            </label>
            <label className={styles.field}>
              <span>Бюджет</span>
              <input
                min={0}
                type="number"
                value={budget}
                onChange={(event) => {
                  setBudget(event.target.value);
                  setActionStatus(null);
                  setConfirmedBudgetWarnings(false);
                }}
              />
            </label>
            <div className={styles.field} style={{ alignContent: "end" }}>
              <Button icon={<Plus size={14} />} onClick={handleAddCampaign}>
                Добавить
              </Button>
            </div>
          </div>
          {budgetWarnings.length > 0 ? (
            <div className={styles.alertList} style={{ marginTop: 12 }}>
              {budgetWarnings.map((warning) => (
                <article className={`${styles.alert} ${styles.alertCritical}`} key={warning.code}>
                  <h3>{warning.title}</h3>
                  <p>{warning.message}</p>
                </article>
              ))}
            </div>
          ) : null}
          {confirmableBudgetWarnings.length > 0 && blockingBudgetWarnings.length === 0 ? (
            <label className={styles.checkboxLine} style={{ marginTop: 12 }}>
              <input
                checked={confirmedBudgetWarnings}
                onChange={(event) => setConfirmedBudgetWarnings(event.target.checked)}
                type="checkbox"
              />
              <span>Я ознакомлен с предупреждениями</span>
            </label>
          ) : null}
          {formError ? <p className={styles.error}>{formError}</p> : null}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Список кампаний</h2>
          <input className={styles.searchInput} placeholder="Поиск по кампаниям" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        {filteredCampaigns.length === 0 ? (
          <div className={styles.empty}>Кампаний пока нет.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Кампания</th>
                  <th>Источник</th>
                  <th>Бюджет</th>
                  <th>Тип</th>
                  <th>Дата</th>
                </tr>
              </thead>
              <tbody>
                {filteredCampaigns.map((campaign) => {
                  const source = activeProject.allowedSources.find((item) => item.id === campaign.sourceId);
                  return (
                    <tr key={campaign.id}>
                      <td>
                        <code>{campaign.utmCampaign}</code>
                      </td>
                      <td>{source?.utmSource}</td>
                      <td>{campaign.budget ? formatMoney(campaign.budget) : "—"}</td>
                      <td>{campaign.createdManually ? "ручная" : "авто"}</td>
                      <td>{new Date(campaign.createdAt).toLocaleString("ru-RU")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Page>
  );
}
