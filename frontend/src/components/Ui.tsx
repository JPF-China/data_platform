import type { ReactNode } from "react";

type ShellProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function SectionShell({ title, description, actions, children }: ShellProps) {
  return (
    <section className="section-shell">
      <div className="section-shell__header">
        <div>
          <h3 className="section-shell__title">{title}</h3>
          {description ? <p className="section-shell__desc">{description}</p> : null}
        </div>
        {actions ? <div className="section-shell__actions">{actions}</div> : null}
      </div>
      <div className="section-shell__body">{children}</div>
    </section>
  );
}

type MetricCardProps = {
  label: string;
  value: string | number;
  hint?: string;
};

export function MetricCard({ label, value, hint }: MetricCardProps) {
  return (
    <article className="metric-card">
      <p className="metric-card__label">{label}</p>
      <div className="metric-card__value">{value}</div>
      {hint ? <p className="metric-card__hint">{hint}</p> : null}
    </article>
  );
}

type SurfaceCardProps = {
  title?: string;
  children: ReactNode;
  className?: string;
};

export function SurfaceCard({ title, children, className = "" }: SurfaceCardProps) {
  return (
    <article className={`surface-card ${className}`.trim()}>
      {title ? <h4 className="surface-card__title">{title}</h4> : null}
      {children}
    </article>
  );
}

type BadgeProps = {
  children: ReactNode;
  tone?: "primary" | "success" | "warning" | "danger" | "neutral";
};

export function Badge({ children, tone = "neutral" }: BadgeProps) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}
