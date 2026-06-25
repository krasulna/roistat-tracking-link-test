import { useState } from "react";
import { useActiveProject, useProjectHistory } from "../app/store";
import { DemoNotice } from "../shared/ui/DemoNotice";
import { Page } from "../shared/ui/Page";
import { StatusBadge } from "../shared/ui/StatusBadge";
import styles from "./pages.module.css";

export function HistoryPage() {
  const project = useActiveProject();
  const history = useProjectHistory(project?.id);
  const [query, setQuery] = useState("");

  if (!project) {
    return null;
  }

  const filteredHistory = history.filter((item) => {
    const haystack = [
      item.type,
      item.status,
      item.title,
      item.details,
      item.source,
      item.campaign,
      item.originalUrl,
      item.finalUrl,
      ...item.warnings.map((warning) => `${warning.title} ${warning.message}`),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(query.toLowerCase());
  });

  return (
    <Page title="История" description="Созданные ссылки, проверки, предупреждения и diff замененных параметров.">
      <DemoNotice />

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Поиск по истории</h2>
          <input className={styles.searchInput} placeholder="URL, source, campaign, warning..." value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>

        {filteredHistory.length === 0 ? (
          <div className={styles.empty}>История пока пустая.</div>
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
                  <th>Diff / warnings</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((item) => (
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
                    <td>
                      {item.diffs.length > 0 ? (
                        <ul className={styles.diffList}>
                          {item.diffs.map((diff) => (
                            <li key={`${item.id}-${diff.param}`}>
                              {diff.param}: {diff.from} -&gt; {diff.to}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {item.warnings.length > 0 ? (
                        <ul className={styles.diffList} style={{ marginTop: 6 }}>
                          {item.warnings.map((warning) => (
                            <li key={`${item.id}-${warning.code}`}>{warning.title}</li>
                          ))}
                        </ul>
                      ) : null}
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
