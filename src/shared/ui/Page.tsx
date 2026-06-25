import type { ReactNode } from "react";
import styles from "./Page.module.css";

type PageProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function Page({ title, description, actions, children }: PageProps) {
  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

