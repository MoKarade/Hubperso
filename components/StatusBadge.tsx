import type { StatusBadgeInfo } from "@/lib/status";

export function StatusBadge({ tone, label }: StatusBadgeInfo) {
  return (
    <span className={`badge badge--${tone}`}>
      <span className="badge__dot" aria-hidden="true" />
      {label}
    </span>
  );
}
