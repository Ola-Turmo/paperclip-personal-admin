import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { JOB_KEYS, TOOL_KEYS } from "./constants.js";

const manifest: PaperclipPluginManifestV1 = {
  id: "personal-admin",
  apiVersion: 1,
  version: "0.2.0",
  displayName: "Personal Admin",
  description: "Integrated personal operations console for Paperclip with Gmail sync, Calendar sync, rules, meeting prep, briefings, renewals, errands, and admin health dashboards.",
  author: "turmo.dev",
  categories: ["automation"],
  capabilities: [
    "events.subscribe",
    "plugin.state.read",
    "plugin.state.write",
    "jobs.schedule",
    "http.outbound",
    "secrets.read-ref",
    "agent.tools.register",
    "instance.settings.register",
    "ui.page.register",
    "ui.dashboardWidget.register",
    "ui.sidebar.register",
    "activity.log.write",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      gmailEnabled: { type: "boolean", title: "Enable Gmail sync", default: true },
      gmailUserId: { type: "string", title: "Gmail user id", default: "me" },
      gmailQuery: { type: "string", title: "Gmail search query", default: "category:primary newer_than:30d" },
      gmailMaxResults: { type: "integer", title: "Gmail max results per sync", default: 50, minimum: 1, maximum: 250 },
      gmailAutoReplyEnabled: { type: "boolean", title: "Allow rule-based auto replies", default: false },
      gmailReplySignature: { type: "string", title: "Auto-reply signature", default: "Sent from Personal Admin" },
      calendarEnabled: { type: "boolean", title: "Enable Google Calendar sync", default: true },
      calendarIds: {
        type: "array",
        title: "Calendar IDs",
        items: { type: "string" },
        default: ["primary"],
      },
      calendarLookbackDays: { type: "integer", title: "Calendar lookback days", default: 7, minimum: 0, maximum: 90 },
      calendarLookaheadDays: { type: "integer", title: "Calendar lookahead days", default: 21, minimum: 1, maximum: 180 },
      calendarPrepLeadDays: { type: "integer", title: "Auto-prep lead days", default: 7, minimum: 1, maximum: 30 },
      jobsEnabled: { type: "boolean", title: "Enable scheduled sync jobs", default: true },
      rulesEnabled: { type: "boolean", title: "Enable advanced triage rules", default: true },
      googleClientId: { type: "string", title: "Google OAuth client ID" },
      googleClientSecretRef: { type: "string", title: "Google OAuth client secret ref" },
      googleRefreshTokenRef: { type: "string", title: "Google OAuth refresh token ref" },
    },
    additionalProperties: false,
  },
  jobs: [
    {
      jobKey: JOB_KEYS.GMAIL_INCREMENTAL_SYNC,
      displayName: "Gmail incremental sync",
      description: "Refresh Gmail state, apply rules, and keep the inbox queue current.",
      schedule: "*/10 * * * *",
    },
    {
      jobKey: JOB_KEYS.CALENDAR_INCREMENTAL_SYNC,
      displayName: "Calendar incremental sync",
      description: "Refresh Google Calendar events and keep meeting prep current.",
      schedule: "*/15 * * * *",
    },
    {
      jobKey: JOB_KEYS.DAILY_ADMIN_REFRESH,
      displayName: "Daily admin refresh",
      description: "Run daily sync/briefing refresh for the full personal-admin surface.",
      schedule: "0 6 * * *",
    },
  ],
  tools: [
    {
      name: TOOL_KEYS.SYNC_GMAIL,
      displayName: "Sync Gmail",
      description: "Run a Gmail sync to import inbox messages into Personal Admin.",
      parametersSchema: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["full", "incremental"], default: "incremental" },
        },
        additionalProperties: false,
      },
    },
    {
      name: TOOL_KEYS.SYNC_CALENDAR,
      displayName: "Sync Calendar",
      description: "Run a Google Calendar sync to refresh meetings and prep items.",
      parametersSchema: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["full", "incremental"], default: "incremental" },
        },
        additionalProperties: false,
      },
    },
    {
      name: TOOL_KEYS.RUN_RULES,
      displayName: "Run inbox rules",
      description: "Apply advanced inbox rules and optional Gmail auto-triage actions.",
      parametersSchema: {
        type: "object",
        properties: {
          applyRemote: { type: "boolean", default: true },
        },
        additionalProperties: false,
      },
    },
    {
      name: TOOL_KEYS.GENERATE_BRIEFING,
      displayName: "Generate daily briefing",
      description: "Create or refresh the Personal Admin daily briefing.",
      parametersSchema: {
        type: "object",
        properties: {
          date: { type: "string" },
        },
        additionalProperties: false,
      },
    },
    {
      name: TOOL_KEYS.REPLY_TO_EMAIL,
      displayName: "Reply to synced email",
      description: "Send a Gmail reply to a message already synced into Personal Admin.",
      parametersSchema: {
        type: "object",
        required: ["id", "body"],
        properties: {
          id: { type: "string" },
          body: { type: "string" },
          subject: { type: "string" },
        },
        additionalProperties: false,
      },
    },
  ],
  ui: {
    slots: [
      {
        type: "page",
        id: "admin-page",
        displayName: "Personal Admin",
        exportName: "AdminPage",
        routePath: "personal-admin",
        order: 10,
      },
      {
        type: "dashboardWidget",
        id: "admin-widget",
        displayName: "Personal Admin",
        exportName: "AdminWidget",
        order: 10,
      },
      {
        type: "sidebar",
        id: "admin-sidebar-link",
        displayName: "Personal Admin",
        exportName: "AdminSidebarLink",
        order: 30,
      },
    ],
  },
};

export default manifest;
