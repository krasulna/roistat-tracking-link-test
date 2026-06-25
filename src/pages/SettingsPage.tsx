import { Download, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useActiveProject, useAppStore, useProjectCampaigns, useProjectHistory } from "../app/store";
import type { TrafficSource } from "../entities/project/model";
import { Button } from "../shared/ui/Button";
import { DemoNotice } from "../shared/ui/DemoNotice";
import { Page } from "../shared/ui/Page";
import styles from "./pages.module.css";

function sourcesToText(sources: TrafficSource[]): string {
  return sources.map((source) => `${source.name};${source.utmSource};${source.roistatMarker};${source.channelId}`).join("\n");
}

function sourcesFromText(value: string, fallback: TrafficSource[]): TrafficSource[] {
  const rows = value
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean);

  if (rows.length === 0) {
    return fallback;
  }

  return rows.map((row, index) => {
    const [name, utmSource, roistatMarker, channelId] = row.split(";").map((item) => item.trim());
    const existing = fallback[index];
    return {
      id: existing?.id ?? `source_${utmSource || index}`,
      name: name || utmSource || `Источник ${index + 1}`,
      utmSource: utmSource || `source_${index + 1}`,
      roistatMarker: roistatMarker || utmSource || `source_${index + 1}`,
      channelId: Number(channelId || index + 1),
      enabled: true,
    };
  });
}

export function SettingsPage() {
  const project = useActiveProject();
  const updateProject = useAppStore((state) => state.updateProject);
  const deleteProject = useAppStore((state) => state.deleteProject);
  const schemaVersion = useAppStore((state) => state.schemaVersion);
  const campaigns = useProjectCampaigns(project?.id);
  const history = useProjectHistory(project?.id);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState(() => ({
    name: project?.name ?? "",
    trustedDomain: project?.trustedDomain ?? "",
    allowedDomains: project?.allowedDomains.join("\n") ?? "",
    budgetLimit: String(project?.budgetLimit ?? 0),
    sources: project ? sourcesToText(project.allowedSources) : "",
  }));

  useEffect(() => {
    if (!project) {
      return;
    }

    setForm({
      name: project.name,
      trustedDomain: project.trustedDomain,
      allowedDomains: project.allowedDomains.join("\n"),
      budgetLimit: String(project.budgetLimit),
      sources: sourcesToText(project.allowedSources),
    });
    setSaved(false);
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
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSave() {
    updateProject(activeProject.id, {
      name: form.name,
      trustedDomain: form.trustedDomain,
      allowedDomains: form.allowedDomains
        .split(/\r?\n|,/)
        .map((domain) => domain.trim())
        .filter(Boolean),
      budgetLimit: Number(form.budgetLimit),
      allowedSources: sourcesFromText(form.sources, activeProject.allowedSources),
    });
    setSaved(true);
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
        </div>
      </section>
    </Page>
  );
}
