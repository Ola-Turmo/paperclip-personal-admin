import React, { useMemo, useState } from "react";
import { usePluginAction, usePluginData, usePluginStream, usePluginToast, type PluginPageProps, type PluginSidebarProps, type PluginWidgetProps } from "@paperclipai/plugin-sdk/ui";
import { ACTION_KEYS, DATA_QUERY_KEYS, STREAM_KEYS } from "../constants.js";
import type { AdminDashboardData } from "../types.js";

type QuickActionKey = keyof typeof ACTION_KEYS;

const styles = {
  shell: {
    display: "grid",
    gap: 20,
    padding: 20,
    color: "#e7ecff",
    background: "linear-gradient(180deg, #0c1222 0%, #121a33 100%)",
    minHeight: "100%",
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  },
  hero: {
    display: "grid",
    gap: 12,
    padding: 20,
    borderRadius: 20,
    background: "linear-gradient(135deg, rgba(83,129,255,0.24), rgba(24,204,167,0.18))",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  muted: { color: "#9fb0d8", fontSize: 14 },
  grid: { display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" },
  card: {
    display: "grid",
    gap: 12,
    padding: 16,
    borderRadius: 16,
    background: "rgba(13, 20, 38, 0.9)",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 18px 40px rgba(0,0,0,0.22)",
  },
  statValue: { fontSize: 28, fontWeight: 700 },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.08)",
    color: "#dce7ff",
    fontSize: 12,
  },
  buttonRow: { display: "flex", flexWrap: "wrap" as const, gap: 10 },
  button: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(83,129,255,0.18)",
    color: "white",
    fontWeight: 600,
    cursor: "pointer",
  },
  list: { display: "grid", gap: 10, margin: 0, padding: 0, listStyle: "none" },
  item: {
    display: "grid",
    gap: 6,
    padding: 12,
    borderRadius: 12,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  badge: (tone: "green" | "amber" | "red" | "blue") => ({
    display: "inline-flex",
    width: "fit-content",
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.3,
    background:
      tone === "green" ? "rgba(53, 208, 143, 0.18)" :
      tone === "amber" ? "rgba(255, 178, 71, 0.18)" :
      tone === "red" ? "rgba(255, 99, 132, 0.18)" :
      "rgba(83,129,255,0.18)",
    color:
      tone === "green" ? "#81f2c6" :
      tone === "amber" ? "#ffd18a" :
      tone === "red" ? "#ffb0c4" :
      "#b9cbff",
  }),
};

function useDashboard(companyId?: string | null) {
  return usePluginData<AdminDashboardData>(DATA_QUERY_KEYS.DASHBOARD, { companyId: companyId ?? undefined });
}

function StatCard(props: { label: string; value: string | number; hint?: string; tone?: "green" | "amber" | "red" | "blue" }) {
  return (
    <div style={styles.card}>
      <span style={styles.badge(props.tone ?? "blue")}>{props.label}</span>
      <div style={styles.statValue}>{props.value}</div>
      {props.hint ? <span style={styles.muted}>{props.hint}</span> : null}
    </div>
  );
}

function LoadingCard() {
  return <div style={styles.card}>Loading Personal Admin…</div>;
}

function ErrorCard({ message }: { message: string }) {
  return <div style={{ ...styles.card, color: "#ffb0c4" }}>Error: {message}</div>;
}

function fmtDate(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function QuickActions({ companyId, compact = false }: { companyId?: string | null; compact?: boolean }) {
  const toast = usePluginToast();
  const syncAll = usePluginAction(ACTION_KEYS.SYNC_ALL);
  const gmailSync = usePluginAction(ACTION_KEYS.GMAIL_INCREMENTAL_SYNC);
  const calendarSync = usePluginAction(ACTION_KEYS.CALENDAR_INCREMENTAL_SYNC);
  const runRules = usePluginAction(ACTION_KEYS.RUN_RULES);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(label);
    try {
      const result = await action();
      if (
        result &&
        typeof result === "object" &&
        "success" in result &&
        result.success === false
      ) {
        const failedResult = result as { error?: unknown; errors?: unknown };
        const body =
          typeof failedResult.error === "string" ? failedResult.error :
          Array.isArray(failedResult.errors) ? failedResult.errors.filter((entry: unknown): entry is string => typeof entry === "string").join("\n") :
          "The action reported a failure.";
        throw new Error(body);
      }
      toast({ tone: "success", title: `${label} completed` });
    } catch (error) {
      toast({ tone: "error", title: "Action failed", body: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  }

  const buttons = [
    { label: "Sync all", action: () => syncAll({ companyId: companyId ?? undefined, mode: "incremental", applyRules: true }) },
    { label: "Gmail sync", action: () => gmailSync({ companyId: companyId ?? undefined, applyRules: true }) },
    { label: "Calendar sync", action: () => calendarSync({ companyId: companyId ?? undefined }) },
    { label: "Run rules", action: () => runRules({ companyId: companyId ?? undefined, applyRemote: true }) },
  ];

  return (
    <div style={styles.buttonRow}>
      {buttons.map(button => (
        <button
          key={button.label}
          style={styles.button}
          disabled={busy !== null}
          onClick={() => void run(button.label, button.action)}
        >
          {busy === button.label ? (compact ? "Running…" : `${button.label}…`) : button.label}
        </button>
      ))}
    </div>
  );
}

function InboxList({ items }: { items: AdminDashboardData["inbox"]["recent"] }) {
  return (
    <ul style={styles.list}>
      {items.map(item => (
        <li key={item.id} style={styles.item}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <strong>{item.subject ?? item.content}</strong>
            <span style={styles.badge(item.priority === "urgent" ? "red" : item.priority === "high" ? "amber" : "blue")}>{item.priority}</span>
          </div>
          <span style={styles.muted}>{item.from ?? item.source} · {item.triageStatus} · {fmtDate(item.receivedAt)}</span>
          {item.snippet ? <span style={styles.muted}>{item.snippet}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function MeetingsList({ items }: { items: AdminDashboardData["meetings"]["items"] }) {
  return (
    <ul style={styles.list}>
      {items.map(item => (
        <li key={item.id} style={styles.item}>
          <strong>{item.title}</strong>
          <span style={styles.muted}>{fmtDate(item.scheduledAt)}</span>
          <span style={styles.muted}>{item.attendees.join(", ") || "No attendees captured yet"}</span>
        </li>
      ))}
    </ul>
  );
}

function Hints({ hints }: { hints: string[] }) {
  if (hints.length === 0) return <span style={styles.muted}>Google credentials and sync settings look ready.</span>;
  return (
    <ul style={styles.list}>
      {hints.map(hint => (
        <li key={hint} style={styles.item}>{hint}</li>
      ))}
    </ul>
  );
}

export function AdminWidget({ context }: PluginWidgetProps) {
  const { data, loading, error } = useDashboard(context.companyId);
  const stream = usePluginStream<{ type: string; at: string }>(STREAM_KEYS.ADMIN_UPDATES, { companyId: context.companyId ?? undefined });
  const lastEvent = stream.lastEvent;

  if (loading) return <LoadingCard />;
  if (error || !data) return <ErrorCard message={error?.message ?? "Missing dashboard data"} />;

  return (
    <div style={{ ...styles.card, gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <strong>Personal Admin</strong>
          <div style={styles.muted}>Live Gmail + Calendar operations</div>
        </div>
        <span style={styles.badge(data.inbox.urgent > 0 ? "red" : "green")}>{data.inbox.pending} pending</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
        <StatCard label="Inbox" value={data.inbox.total} tone="blue" />
        <StatCard label="Meetings" value={data.meetings.upcoming} tone="amber" />
        <StatCard label="Rules" value={data.rules.length} tone="green" />
      </div>
      <QuickActions companyId={context.companyId} compact />
      <div style={styles.muted}>Last live event: {lastEvent ? `${lastEvent.type} at ${fmtDate(lastEvent.at)}` : "No stream activity yet"}</div>
    </div>
  );
}

export function AdminPage({ context }: PluginPageProps) {
  const { data, loading, error, refresh } = useDashboard(context.companyId);
  const stream = usePluginStream<{ type: string; at: string; [key: string]: unknown }>(STREAM_KEYS.ADMIN_UPDATES, { companyId: context.companyId ?? undefined });
  const syncStatus = usePluginData(DATA_QUERY_KEYS.SYNC_STATUS, { companyId: context.companyId ?? undefined });

  const lastEventLabel = useMemo(() => {
    if (!stream.lastEvent) return "No live sync events yet";
    return `${stream.lastEvent.type} · ${fmtDate(String(stream.lastEvent.at))}`;
  }, [stream.lastEvent]);

  if (loading) return <div style={styles.shell}><LoadingCard /></div>;
  if (error || !data) return <div style={styles.shell}><ErrorCard message={error?.message ?? "Missing dashboard data"} /></div>;

  return (
    <div style={styles.shell}>
      <section style={styles.hero}>
        <span style={styles.badge(data.inbox.urgent > 0 ? "red" : "green")}>Operational visibility</span>
        <h1 style={{ margin: 0 }}>Personal Admin command center</h1>
        <p style={{ ...styles.muted, margin: 0 }}>
          Unified Gmail triage, Calendar prep, rules, renewals, errands, cleanup work, and daily briefings — all inside Paperclip.
        </p>
        <QuickActions companyId={context.companyId} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <span style={styles.pill}>Live stream: {lastEventLabel}</span>
          <span style={styles.pill}>Gmail sync: {data.sync.gmail.lastIncrementalSyncAt || data.sync.gmail.lastFullSyncAt ? fmtDate(data.sync.gmail.lastIncrementalSyncAt ?? data.sync.gmail.lastFullSyncAt) : "not yet"}</span>
          <span style={styles.pill}>Calendar sync: {data.sync.calendar.lastIncrementalSyncAt || data.sync.calendar.lastFullSyncAt ? fmtDate(data.sync.calendar.lastIncrementalSyncAt ?? data.sync.calendar.lastFullSyncAt) : "not yet"}</span>
          <button style={styles.button} onClick={() => void refresh()}>Refresh dashboard</button>
        </div>
      </section>

      <section style={styles.grid}>
        <StatCard label="Inbox items" value={data.inbox.total} hint={`${data.inbox.pending} pending triage`} tone="blue" />
        <StatCard label="Urgent inbox" value={data.inbox.urgent} hint="High/urgent messages in queue" tone={data.inbox.urgent > 0 ? "red" : "green"} />
        <StatCard label="Upcoming meetings" value={data.meetings.upcoming} hint={`${data.calendarEvents.length} synced events shown`} tone="amber" />
        <StatCard label="Advanced rules" value={data.rules.length} hint={`Last match count: ${data.sync.rules.lastMatchCount}`} tone="green" />
      </section>

      <section style={styles.grid}>
        <div style={styles.card}>
          <strong>Recent inbox</strong>
          <InboxList items={data.inbox.recent} />
        </div>
        <div style={styles.card}>
          <strong>Upcoming meetings</strong>
          <MeetingsList items={data.meetings.items} />
        </div>
      </section>

      <section style={styles.grid}>
        <div style={styles.card}>
          <strong>Config readiness</strong>
          <Hints hints={data.configHints} />
        </div>
        <div style={styles.card}>
          <strong>Sync state</strong>
          {syncStatus.loading ? <span style={styles.muted}>Loading sync state…</span> : <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "#b9cbff" }}>{JSON.stringify(syncStatus.data, null, 2)}</pre>}
        </div>
      </section>

      <section style={styles.grid}>
        <div style={styles.card}>
          <strong>Renewals due soon</strong>
          <ul style={styles.list}>
            {data.renewalsDue.map(item => (
              <li key={item.id} style={styles.item}>
                <strong>{item.name}</strong>
                <span style={styles.muted}>{item.renewalDate}</span>
              </li>
            ))}
            {data.renewalsDue.length === 0 ? <li style={styles.item}>No near-term renewals tracked.</li> : null}
          </ul>
        </div>
        <div style={styles.card}>
          <strong>Open errands</strong>
          <ul style={styles.list}>
            {data.errandsOpen.map(item => (
              <li key={item.id} style={styles.item}>
                <strong>{item.description}</strong>
                <span style={styles.muted}>{item.dueDate ? `Due ${item.dueDate}` : "No due date"}</span>
              </li>
            ))}
            {data.errandsOpen.length === 0 ? <li style={styles.item}>No open errands right now.</li> : null}
          </ul>
        </div>
      </section>

      <section style={styles.card}>
        <strong>Latest daily briefing</strong>
        {data.latestBriefing ? (
          <ul style={styles.list}>
            {data.latestBriefing.items.map(item => (
              <li key={item.id} style={styles.item}>
                <span style={styles.badge(item.priority === "high" ? "red" : "blue")}>{item.category}</span>
                <span>{item.content}</span>
              </li>
            ))}
          </ul>
        ) : (
          <span style={styles.muted}>No briefing generated yet. Run Sync all to create one.</span>
        )}
      </section>
    </div>
  );
}

export function AdminSidebarLink({ context }: PluginSidebarProps) {
  const prefix = context.companyPrefix ? `/${context.companyPrefix}` : "";
  return (
    <a href={`${prefix}/personal-admin`} style={{ color: "#dce7ff", textDecoration: "none", fontWeight: 600 }}>
      Personal Admin
    </a>
  );
}
