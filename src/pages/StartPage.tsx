import { FileInput, PlugZap } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../app/store";
import { Button } from "../shared/ui/Button";
import styles from "./pages.module.css";

export function StartPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const createProject = useAppStore((state) => state.createDemoProject);
  const importProjectJson = useAppStore((state) => state.importProjectJson);
  const projects = useAppStore((state) => state.projects);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [emptyProjectNotice, setEmptyProjectNotice] = useState(false);

  async function handleCreateDemo() {
    setIsCreating(true);
    setError("");
    try {
      await createProject();
      navigate("/dashboard");
    } finally {
      setIsCreating(false);
    }
  }

  function handleGoToProject() {
    if (projects.length === 0) {
      setEmptyProjectNotice(true);
      return;
    }

    navigate("/dashboard");
  }

  async function handleFile(file?: File) {
    if (!file) {
      return;
    }

    setError("");
    try {
      const raw = await file.text();
      const importedProjects = importProjectJson(raw);
      if (importedProjects.length === 0) {
        throw new Error("В JSON нет проектов для импорта.");
      }
      setEmptyProjectNotice(false);
      navigate("/dashboard");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось импортировать JSON. Проверьте структуру файла.");
    } finally {
      if (fileRef.current) {
        fileRef.current.value = "";
      }
    }
  }

  return (
    <main className={styles.startShell}>
      <section className={styles.startPanel}>
        <div className={styles.startTop}>
          <div>
            <h1>Подготовка рекламных ссылок с Roistat-метками</h1>
            <p>Frontend-only demo: проекты, ссылки, предупреждения и история хранятся локально.</p>
          </div>
          <Button onClick={handleGoToProject} variant="secondary">
            К проекту
          </Button>
        </div>

        {emptyProjectNotice ? (
          <div className={styles.emptyProjectNotice}>
            У вас сейчас отсутствуют проекты. Чтобы создать новый, нажмите “Создать demo-проект”.
          </div>
        ) : null}

        <div className={styles.startCards}>
          <article className={styles.startCard}>
            <PlugZap size={24} color="#1d86ff" />
            <h2>Создать demo-проект через Roistat</h2>
            <p>Приложение имитирует подключение к Roistat и генерирует Project ID, домен, источники и бюджет.</p>
            <Button onClick={handleCreateDemo} disabled={isCreating}>
              {isCreating ? "Создание..." : "Создать demo-проект"}
            </Button>
          </article>

          <article className={styles.startCard}>
            <FileInput size={24} color="#1d86ff" />
            <h2>Импортировать JSON</h2>
            <p>Поддерживается импорт проекта или полного локального состояния, ранее экспортированного из приложения.</p>
            <input
              ref={fileRef}
              hidden
              type="file"
              accept="application/json"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
            <Button onClick={() => fileRef.current?.click()} variant="secondary">
              Выбрать файл
            </Button>
          </article>

        </div>
        {error ? <p className={styles.error}>{error}</p> : null}
      </section>
    </main>
  );
}
