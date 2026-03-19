import type { ReactNode } from "react";

import type { ModuleRow } from "../../admin/console";

interface SectionHeaderProps {
  actions?: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
}

interface PanelProps {
  children: ReactNode;
  description?: string;
  title: string;
}

interface MetricCardProps {
  detail: string;
  label: string;
  tone?: "accent" | "critical" | "good" | "neutral" | "warn";
  value: string;
}

interface NoticeProps {
  body: string;
  title: string;
  tone?: "critical" | "good" | "warn";
}

export function DetailList({ rows }: { rows: ModuleRow[] }) {
  return (
    <div className="detail-list">
      {rows.map((row) => (
        <div className="detail-row" key={`${row.label}-${row.value}`}>
          <div>
            <div className="detail-row__label">{row.label}</div>
            {row.meta ? <div className="detail-row__meta">{row.meta}</div> : null}
          </div>
          <span className={`tone-pill tone-pill--${row.tone ?? "neutral"}`}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

export function MetricCard({ detail, label, tone = "neutral", value }: MetricCardProps) {
  return (
    <article className="metric-card">
      <div className="metric-card__label">{label}</div>
      <div className="metric-card__value">{value}</div>
      <div className={`metric-card__detail metric-card__detail--${tone}`}>{detail}</div>
    </article>
  );
}

export function Notice({ body, title, tone = "warn" }: NoticeProps) {
  return (
    <section className={`notice-card notice-card--${tone}`}>
      <div className="notice-card__title">{title}</div>
      <p className="notice-card__body">{body}</p>
    </section>
  );
}

export function Panel({ children, description, title }: PanelProps) {
  return (
    <section className="console-panel">
      <header className="console-panel__header">
        <div>
          <h3 className="console-panel__title">{title}</h3>
          {description ? <p className="console-panel__description">{description}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

export function SectionHeader({ actions, description, eyebrow, title }: SectionHeaderProps) {
  return (
    <header className="page-header">
      <div>
        <div className="page-header__eyebrow">{eyebrow}</div>
        <h2 className="page-header__title">{title}</h2>
        <p className="page-header__description">{description}</p>
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}
