import {
  BarChart3,
  History,
  LayoutDashboard,
  Link2,
  ListChecks,
  Plus,
  Settings,
  Tags,
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAppStore, useActiveProject } from "../store";
import styles from "./AppLayout.module.css";

const navItems = [
  { to: "/dashboard", label: "Главная", icon: LayoutDashboard },
  { to: "/create-link", label: "Создать ссылку", icon: Link2 },
  { to: "/template", label: "Шаблон", icon: Tags },
  { to: "/campaigns", label: "Кампании", icon: BarChart3 },
  { to: "/history", label: "История", icon: History },
  { to: "/settings", label: "Настройки", icon: Settings },
];

export function AppLayout() {
  const navigate = useNavigate();
  const project = useActiveProject();
  const projects = useAppStore((state) => state.projects);
  const setActiveProject = useAppStore((state) => state.setActiveProject);

  if (!project) {
    return <StartPageRedirect />;
  }

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <button className={styles.logoButton} onClick={() => navigate("/dashboard")} type="button">
          Roi<span>stat</span>
        </button>

        <select
          className={styles.projectSelect}
          value={project.id}
          onChange={(event) => setActiveProject(event.target.value)}
          aria-label="Активный проект"
        >
          {projects.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} (№{item.roistatProjectId})
            </option>
          ))}
        </select>

        <button className={styles.topbarIcon} type="button" onClick={() => navigate("/start")} title="Создать проект">
          <Plus size={16} />
        </button>
        <div className={styles.topbarSpacer} />
      </header>

      <div className={styles.body}>
        <aside className={styles.sidebar}>
          {navItems.map((item) => (
            <NavLink
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
              key={item.to}
              to={item.to}
            >
              <item.icon size={17} />
              <span>{item.label}</span>
            </NavLink>
          ))}
          <div className={styles.sidebarFooter}>
            <ListChecks size={16} />
            <span>Demo mode</span>
          </div>
        </aside>

        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function StartPageRedirect() {
  const navigate = useNavigate();
  queueMicrotask(() => navigate("/start", { replace: true }));
  return null;
}
