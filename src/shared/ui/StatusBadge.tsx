import type { LinkStatus } from "../../entities/link/model";
import styles from "./StatusBadge.module.css";

type StatusBadgeProps = {
  status: LinkStatus;
};

const labels: Record<LinkStatus, string> = {
  checking: "checking",
  success: "success",
  warning: "warning",
  failed: "failed",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`${styles.badge} ${styles[status]}`}>{labels[status]}</span>;
}

