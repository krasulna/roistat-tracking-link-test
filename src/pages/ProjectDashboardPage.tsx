import { Copy, ExternalLink, Plus } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Link, useLocation } from "react-router-dom";
import { useActiveProject, useAppStore, useProjectCampaigns, useProjectHistory } from "../app/store";
import { calculateRemainingBudget, calculateUsedBudget } from "../shared/lib/budget";
import { formatMoney } from "../shared/lib/format";
import { buildTemplateUrl } from "../shared/lib/roistat";
import { Button } from "../shared/ui/Button";
import { DemoNotice } from "../shared/ui/DemoNotice";
import { Page } from "../shared/ui/Page";
import { StatusBadge } from "../shared/ui/StatusBadge";
import styles from "./pages.module.css";

export function ProjectDashboardPage() {
  const location = useLocation();
  const project = useActiveProject();
  const campaigns = useProjectCampaigns(project?.id);
  const history = useProjectHistory(project?.id);
  const logHistoryEvent = useAppStore((state) => state.logHistoryEvent);

  if (!project) {
    return null;
  }

  const activeProject = project;
  const recentHistory = history.slice(0, 5);
  const usedBudget = calculateUsedBudget(campaigns);
  const remainingBudget = calculateRemainingBudget(activeProject, campaigns);
  const createdLinkState = location.state as { createdLinkStatus?: string; createdLinkUrl?: string } | null;
  const template = buildTemplateUrl(activeProject);

  function handleCopyTemplate() {
    void navigator.clipboard.writeText(template);
    logHistoryEvent(activeProject.id, {
      type: "template",
      status: "success",
      title: "Шаблон ссылки скопирован",
      details: "Пользователь скопировал текущий шаблон рекламной ссылки.",
      finalUrl: template,
    });
  }

  return (
    <Page
      title="Главная"
      description="Сводка активного проекта и последние операции со ссылками."
      actions={
        <Link to="/create-link">
          <Button icon={<Plus size={15} />}>Создать ссылку</Button>
        </Link>
      }
    >
      <DemoNotice />

      {createdLinkState?.createdLinkUrl ? (
        <section className={`${styles.alert} ${createdLinkState.createdLinkStatus === "warning" ? "" : styles.alertInfo}`}>
          <h3>{createdLinkState.createdLinkStatus === "warning" ? "Ссылка создана с предупреждениями" : "Ссылка создана"}</h3>
          <p>Готовая рекламная ссылка сохранена в истории.</p>
          <div className={styles.createdLinkResult}>
            <code className={styles.code}>{createdLinkState.createdLinkUrl}</code>
            <div className={styles.qrBox}>
              <QRCodeSVG value={createdLinkState.createdLinkUrl} size={96} />
            </div>
          </div>
        </section>
      ) : null}

      <div className={styles.grid}>
        <div className={styles.metric}>
          <p className={styles.metricLabel}>Project ID</p>
          <p className={styles.metricValue}>№{activeProject.roistatProjectId}</p>
        </div>
        <div className={styles.metric}>
          <p className={styles.metricLabel}>Доверенный домен</p>
          <p className={styles.metricValue}>{activeProject.trustedDomain}</p>
        </div>
        <div className={styles.metric}>
          <p className={styles.metricLabel}>Бюджет проекта</p>
          <p className={styles.metricValue}>{formatMoney(activeProject.budgetLimit)}</p>
        </div>
        <div className={styles.metric}>
          <p className={styles.metricLabel}>Остаток бюджета</p>
          <p className={styles.metricValue}>{formatMoney(remainingBudget)}</p>
          {usedBudget > 0 ? <p className={styles.hint}>Потрачено: {formatMoney(usedBudget)}</p> : null}
        </div>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Шаблон рекламной ссылки</h2>
          <Button
            icon={<Copy size={14} />}
            onClick={handleCopyTemplate}
            variant="secondary"
          >
            Копировать
          </Button>
        </div>
        <div className={styles.panelBody}>
          <code className={styles.code}>{template}</code>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Разрешенные источники</h2>
          <Link to="/settings">
            <Button icon={<ExternalLink size={14} />} variant="ghost">
              Настроить
            </Button>
          </Link>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Название</th>
                <th>utm_source</th>
                <th>ID канала</th>
                <th>Roistat marker</th>
              </tr>
            </thead>
            <tbody>
              {activeProject.allowedSources.map((source) => (
                <tr key={source.id}>
                  <td>{source.name}</td>
                  <td>
                    <code>{source.utmSource}</code>
                  </td>
                  <td>{source.channelId}</td>
                  <td>
                    <code>{source.roistatMarker}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Последние события</h2>
          <Link to="/history">
            <Button variant="ghost">Вся история</Button>
          </Link>
        </div>
        {recentHistory.length === 0 ? (
          <div className={styles.empty}>История пока пустая. Создайте первую рекламную ссылку.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Тип</th>
                  <th>Статус</th>
                  <th>Источник / кампания</th>
                  <th>Ссылка</th>
                </tr>
              </thead>
              <tbody>
                {recentHistory.map((item) => (
                  <tr key={item.id}>
                    <td>{new Date(item.createdAt).toLocaleString("ru-RU")}</td>
                    <td>{item.title ?? item.type}</td>
                    <td>
                      <StatusBadge status={item.status} />
                    </td>
                    <td>
                      {item.source || item.campaign ? `${item.source ?? "—"} / ${item.campaign ?? "—"}` : (item.details ?? "—")}
                    </td>
                    <td>
                      {item.finalUrl || item.originalUrl ? (
                        <code className={styles.code}>{item.finalUrl || item.originalUrl}</code>
                      ) : (
                        <span className={styles.muted}>{item.details ?? "—"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Page>
  );
}
