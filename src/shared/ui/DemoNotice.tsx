import { Lightbulb } from "lucide-react";
import styles from "./DemoNotice.module.css";

export function DemoNotice() {
  return (
    <div className={styles.notice}>
      <Lightbulb size={20} />
      <span>Вы видите проект с демо-данными</span>
    </div>
  );
}

