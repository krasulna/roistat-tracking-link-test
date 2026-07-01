import { Download, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useActiveProject, useAppStore, useProjectCampaigns, useProjectHistory } from "../app/store";
import { Button } from "../shared/ui/Button";
import { DemoNotice } from "../shared/ui/DemoNotice";
import { Page } from "../shared/ui/Page";
import styles from "./pages.module.css";
import { getSettingsFormState, validateSettingsForm } from "./settingsForm";

export function SettingsPage() {
  const project = useActiveProject();
  const updateProject = useAppStore((state) => state.updateProject);
  const deleteProject = useAppStore((state) => state.deleteProject);
  const schemaVersion = useAppStore((state) => state.schemaVersion);
  const campaigns = useProjectCampaigns(project?.id);
  const history = useProjectHistory(project?.id);
  const [saved, setSaved] = useState(false);
  const [formErrors, setFormErrors] = useState<string[]>([]);

  const [form, setForm] = useState(() => getSettingsFormState(project));

  useEffect(() => {
    if (!project) {
      return;
    }

    setForm(getSettingsFormState(project));
    setSaved(false);
    setFormErrors([]);
  }, [project?.id]);

  const exportJson = useMemo(
    () =>
      JSON.stringify(
        project
          ? {
              schemaVersion,
              activeProjectId: project.id,
              projects: [project],
              campaignsByProjectId: {
                [project.id]: campaigns,
              },
              historyByProjectId: {
                [project.id]: history,
              },
            }
          : {},
        null,
        2,
      ),
    [campaigns, history, project, schemaVersion],
  );

  if (!project) {
    return null;
  }

  const activeProject = project;

  function patchForm(key: keyof typeof form, value: string) {
    setSaved(false);
    setFormErrors([]);
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSave() {
    const validation = validateSettingsForm(form, activeProject.allowedSources);
    if (!validation.ok) {
      setFormErrors(validation.errors);
      setSaved(false);
      return;
    }

    try {
      updateProject(activeProject.id, validation.patch);
      setFormErrors([]);
      setSaved(true);
    } catch (error) {
      setFormErrors([error instanceof Error ? error.message : "Project settings are invalid and were not saved."]);
      setSaved(false);
    }
  }

  function handleExport() {
    const blob = new Blob([exportJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeProject.name || "roistat-tracking-project"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleDelete() {
    const confirmed = window.confirm(`Удалить проект "${activeProject.name}"? Это удалит его кампании и историю.`);
    if (confirmed) {
      deleteProject(activeProject.id);
    }
  }

  return (
    <Page
      title="Настройки проекта"
      description="Редактирование demo-данных, источников, доменов и бюджета проекта."
      actions={
        <>
          <Button icon={<Download size={14} />} onClick={handleExport} variant="secondary">
            Экспорт JSON
          </Button>
          <Button icon={<Trash2 size={14} />} onClick={handleDelete} variant="danger">
            Удалить проект
          </Button>
        </>
      }
    >
      <DemoNotice />

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Основные настройки</h2>
          {saved ? <span className={styles.muted}>Сохранено</span> : null}
        </div>
        <div className={styles.panelBody}>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Название проекта</span>
              <input value={form.name} onChange={(event) => patchForm("name", event.target.value)} />
            </label>
            <label className={styles.field}>
              <span>Project ID</span>
              <div className={styles.readonlyValue}>№{activeProject.roistatProjectId}</div>
            </label>
            <label className={styles.field}>
              <span>Доверенный домен</span>
              <input value={form.trustedDomain} onChange={(event) => patchForm("trustedDomain", event.target.value)} />
            </label>
            <label className={styles.field}>
              <span>Бюджет проекта</span>
              <input min={0} type="number" value={form.budgetLimit} onChange={(event) => patchForm("budgetLimit", event.target.value)} />
            </label>
            <label className={`${styles.field} ${styles.fieldFull}`}>
              <span>Дополнительные разрешенные домены</span>
              <textarea value={form.allowedDomains} onChange={(event) => patchForm("allowedDomains", event.target.value)} />
            </label>
            <label className={`${styles.field} ${styles.fieldFull}`}>
              <span>Источники: name;utm_source;roistat_marker;channel_id</span>
              <textarea value={form.sources} onChange={(event) => patchForm("sources", event.target.value)} />
            </label>
          </div>
          <div className={styles.actions} style={{ marginTop: 14 }}>
            <Button icon={<Save size={14} />} onClick={handleSave}>
              Сохранить
            </Button>
          </div>
          {formErrors.length > 0 ? (
            <ul className={styles.errorList}>
              {formErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>
    </Page>
  );
}
