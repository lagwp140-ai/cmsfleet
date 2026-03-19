import { startTransition, useEffect, useEffectEvent, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import {
  adminSections,
  canAccessSection,
  findAdminSection,
  formatConsoleTime,
  getAdminHref,
  getSectionGroups,
  type AdminConsoleContextValue
} from "../admin/console";
import { ApiError, fetchAdminDashboard, fetchAuditEvents } from "../auth/authClient";
import { useAuth } from "../auth/AuthProvider";
import type { AdminDashboardResponse, AuditEvent } from "../auth/types";

export function AdminShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [dashboard, setDashboard] = useState<AdminDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const activeSection = findAdminSection(location.pathname);
  const permissionsKey = user?.permissions.join(",") ?? "";
  const systemTone = error ? "warn" : dashboard ? "good" : "accent";
  const locale = dashboard?.tenant.locale;

  const handleUnauthorized = useEffectEvent(async () => {
    await logout();
    navigate("/login", { replace: true });
  });

  const refreshConsole = useEffectEvent(async () => {
    if (!user) {
      return;
    }

    const initialLoad = dashboard === null;

    if (initialLoad) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    setError(null);

    try {
      const nextDashboardPromise = fetchAdminDashboard();
      const nextAuditPromise = user.permissions.includes("audit:read") ? fetchAuditEvents(12) : Promise.resolve([]);
      const [nextDashboard, nextAuditEvents] = await Promise.all([nextDashboardPromise, nextAuditPromise]);

      startTransition(() => {
        setDashboard(nextDashboard);
        setAuditEvents(nextAuditEvents);
        setLastUpdatedAt(new Date().toISOString());
      });
    } catch (refreshError) {
      if (refreshError instanceof ApiError && refreshError.status === 401) {
        await handleUnauthorized();
        return;
      }

      setError(refreshError instanceof Error ? refreshError.message : "Unable to load console data.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  });

  useEffect(() => {
    void refreshConsole();
  }, [permissionsKey, user?.id]);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  const contextValue: AdminConsoleContextValue = {
    activeSection,
    auditEvents,
    dashboard,
    error,
    isLoading,
    isRefreshing,
    lastUpdatedAt,
    refreshConsole: async () => refreshConsole()
  };

  return (
    <div className="console-shell">
      <aside className="console-sidebar">
        <div className="console-brand">
          <div className="console-brand__mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <div className="console-brand__label">cmsfleet control</div>
            <div className="console-brand__subtext">Transport operations shell</div>
          </div>
        </div>

        <section className="sidebar-status-card">
          <div className="sidebar-status-card__title">System posture</div>
          <div className="sidebar-status-grid">
            <div className="sidebar-stat">
              <span className="sidebar-stat__label">Status</span>
              <strong className={`tone-pill tone-pill--${systemTone}`}>{error ? "Attention" : "Nominal"}</strong>
            </div>
            <div className="sidebar-stat">
              <span className="sidebar-stat__label">Tenant</span>
              <strong>{dashboard?.tenant.id ?? "core"}</strong>
            </div>
            <div className="sidebar-stat">
              <span className="sidebar-stat__label">Profile</span>
              <strong>{dashboard?.auth.roleLabel ?? user?.role ?? "viewer"}</strong>
            </div>
            <div className="sidebar-stat">
              <span className="sidebar-stat__label">Sync</span>
              <strong>{formatConsoleTime(lastUpdatedAt, locale)}</strong>
            </div>
          </div>
        </section>

        <nav className="sidebar-nav" aria-label="Admin navigation">
          {getSectionGroups().map((group) => (
            <div className="sidebar-nav__group" key={group.label}>
              <div className="sidebar-nav__heading">{group.label}</div>
              {group.sections.map((section) => {
                const accessible = canAccessSection(user?.permissions ?? [], section);

                return (
                  <NavLink
                    className={({ isActive }) =>
                      `sidebar-nav__item${isActive ? " sidebar-nav__item--active" : ""}${accessible ? "" : " sidebar-nav__item--restricted"}`
                    }
                    key={section.key}
                    to={getAdminHref(section)}
                  >
                    <div>
                      <div className="sidebar-nav__item-label">{section.label}</div>
                      <div className="sidebar-nav__item-description">{section.description}</div>
                    </div>
                    {!accessible ? <span className="nav-badge">Restricted</span> : null}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <section className="sidebar-profile-card">
          <div className="sidebar-profile-card__eyebrow">Signed in</div>
          <div className="sidebar-profile-card__name">{user?.displayName}</div>
          <div className="sidebar-profile-card__email">{user?.email}</div>
          <div className="sidebar-profile-card__chips">
            <span className="tone-pill tone-pill--accent">{user?.role}</span>
            <span className="tone-pill tone-pill--neutral">{(user?.permissions.length ?? 0).toString().padStart(2, "0")} perms</span>
          </div>
        </section>
      </aside>

      <div className="console-main">
        <header className="console-header">
          <div>
            <div className="console-header__eyebrow">{activeSection.group}</div>
            <h1 className="console-header__title">{activeSection.label}</h1>
            <p className="console-header__description">{activeSection.description}</p>
          </div>

          <div className="console-header__meta">
            <div className="header-meta-card">
              <span className="header-meta-card__label">Current user</span>
              <strong>{user?.displayName}</strong>
              <span className="header-meta-card__subtext">{dashboard?.auth.roleLabel ?? user?.role}</span>
            </div>
            <div className="header-meta-card">
              <span className="header-meta-card__label">System status</span>
              <strong>{error ? "Attention required" : "Control plane nominal"}</strong>
              <span className="header-meta-card__subtext">Last sync {formatConsoleTime(lastUpdatedAt, locale)}</span>
            </div>
            <div className="header-meta-card">
              <span className="header-meta-card__label">Quick posture</span>
              <div className="header-meta-card__chips">
                <span className={`tone-pill tone-pill--${systemTone}`}>{dashboard ? "API linked" : "Syncing"}</span>
                <span className="tone-pill tone-pill--good">Auth secured</span>
                <span className="tone-pill tone-pill--neutral">{adminSections.length} modules</span>
              </div>
            </div>
          </div>

          <div className="console-header__actions">
            <button className="action-button action-button--secondary" onClick={() => navigate("/admin/logs")} type="button">
              Open logs
            </button>
            <button className="action-button action-button--primary" onClick={() => void refreshConsole()} type="button">
              {isRefreshing || isLoading ? "Refreshing..." : "Refresh status"}
            </button>
            <button className="action-button action-button--ghost" onClick={() => void handleLogout()} type="button">
              Sign out
            </button>
          </div>
        </header>

        <main className="console-content">
          {isLoading ? (
            <section className="notice-card notice-card--good">
              <div className="notice-card__title">Synchronizing console state</div>
              <p className="notice-card__body">
                Pulling the latest admin posture, user role context, and audit-ready system indicators.
              </p>
            </section>
          ) : null}

          {error ? (
            <section className="notice-card notice-card--critical">
              <div className="notice-card__title">Console data is degraded</div>
              <p className="notice-card__body">{error}</p>
            </section>
          ) : null}

          <Outlet context={contextValue} />
        </main>
      </div>
    </div>
  );
}


