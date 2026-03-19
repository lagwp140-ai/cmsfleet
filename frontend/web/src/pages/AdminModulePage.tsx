import { buildModuleDefinition, canAccessSection, type AdminSectionKey } from "../admin/console";
import { useAdminConsole } from "../admin/useAdminConsole";
import { useAuth } from "../auth/AuthProvider";
import { DetailList, MetricCard, Notice, Panel, SectionHeader } from "../components/admin/AdminPrimitives";

interface AdminModulePageProps {
  moduleKey: Exclude<AdminSectionKey, "dashboard" | "logs" | "users">;
}

export function AdminModulePage({ moduleKey }: AdminModulePageProps) {
  const { activeSection, dashboard } = useAdminConsole();
  const { user } = useAuth();
  const definition = buildModuleDefinition(moduleKey, dashboard);
  const hasAccess = canAccessSection(user?.permissions ?? [], activeSection);

  return (
    <div className="page-stack">
      <SectionHeader
        description={definition.summary}
        eyebrow={definition.eyebrow}
        title={definition.title}
      />

      {!hasAccess ? (
        <Notice
          body={`Your ${user?.role ?? "viewer"} role can review the shell layout here, but changes for ${activeSection.label.toLowerCase()} require the ${activeSection.permission ?? "admin:access"} permission.`}
          title="Read-only module view"
          tone="warn"
        />
      ) : null}

      <section className="metric-grid">
        {definition.metrics.map((metric) => (
          <MetricCard
            detail={metric.detail}
            key={`${definition.title}-${metric.label}`}
            label={metric.label}
            tone={metric.tone}
            value={metric.value}
          />
        ))}
      </section>

      <section className="panel-grid panel-grid--two">
        {definition.panels.map((panel) => (
          <Panel description={panel.description} key={`${definition.title}-${panel.title}`} title={panel.title}>
            <DetailList rows={panel.rows} />
          </Panel>
        ))}
      </section>

      <Panel
        description="Keep the operational shell intentional and configuration-led as new workflows are added."
        title="Implementation notes"
      >
        <ul className="note-list">
          {definition.notes.map((note) => (
            <li className="note-list__item" key={note}>
              {note}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
