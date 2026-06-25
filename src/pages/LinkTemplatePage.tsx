import { Copy, HelpCircle } from "lucide-react";
import { useActiveProject, useAppStore } from "../app/store";
import { buildTemplateUrl } from "../shared/lib/roistat";
import { Button } from "../shared/ui/Button";
import { DemoNotice } from "../shared/ui/DemoNotice";
import { Page } from "../shared/ui/Page";
import styles from "./pages.module.css";

const supportedTagsHint =
  "Обязательные: utm_source, utm_medium, utm_campaign, roistat. Дополнительные: utm_term, utm_content, roistat_param1..roistat_param5.";

export function LinkTemplatePage() {
  const project = useActiveProject();
  const logHistoryEvent = useAppStore((state) => state.logHistoryEvent);

  if (!project) {
    return null;
  }

  const activeProject = project;
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
    <Page title="Шаблон рекламной ссылки" description="UTM- и Roistat-параметры, которые будут использоваться в ссылках.">
      <DemoNotice />

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Данные проекта</h2>
        </div>
        <div className={styles.grid}>
          <div className={styles.metric}>
            <p className={styles.metricLabel}>Project ID</p>
            <p className={styles.metricValue}>№{activeProject.roistatProjectId}</p>
          </div>
          <div className={styles.metric}>
            <p className={styles.metricLabel}>Доверенный домен</p>
            <p className={styles.metricValue}>{activeProject.trustedDomain}</p>
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2 className={styles.titleWithHint}>
            Шаблон ссылки
            <span className={styles.hintIcon} title={supportedTagsHint} aria-label={supportedTagsHint}>
              <HelpCircle size={15} />
            </span>
          </h2>
          <Button icon={<Copy size={14} />} onClick={handleCopyTemplate} variant="secondary">
            Копировать
          </Button>
        </div>
        <div className={styles.panelBody}>
          <code className={styles.code}>{template}</code>
        </div>
      </section>

    </Page>
  );
}
