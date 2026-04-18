import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/plugin.js";
import { ACTION_KEYS, DATA_KEYS, DATA_QUERY_KEYS, JOB_KEYS, TOOL_KEYS } from "../src/constants.js";
import type { AdminDashboardData, CalendarEvent, DailyBriefing, InboxItem, Meeting, SyncState } from "../src/types.js";

async function setupHarness(config: Record<string, unknown> = {}) {
  const harness = createTestHarness({ manifest, config });
  await plugin.definition.setup(harness.ctx);
  return harness;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Personal Admin integrated plugin", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs Gmail full sync, auto-triages, and sends guarded replies", async () => {
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      fetchCalls.push({ url, init });
      const parsed = new URL(url);

      if (parsed.hostname === "oauth2.googleapis.com") {
        return jsonResponse({ access_token: "access-token" });
      }

      if (parsed.pathname.endsWith("/messages") && !parsed.pathname.endsWith("/send")) {
        return jsonResponse({ messages: [{ id: "m1", threadId: "thread-1" }] });
      }

      if (parsed.pathname.endsWith("/messages/m1")) {
        return jsonResponse({
          id: "m1",
          threadId: "thread-1",
          historyId: "101",
          labelIds: ["UNREAD", "INBOX", "IMPORTANT"],
          snippet: "Can you confirm the updated budget?",
          payload: {
            headers: [
              { name: "Subject", value: "Budget follow-up" },
              { name: "From", value: "Boss <boss@example.com>" },
              { name: "To", value: "Ola <ola@example.com>" },
              { name: "Date", value: "Sat, 18 Apr 2026 09:00:00 +0000" },
              { name: "Message-ID", value: "<m1@example.com>" },
            ],
          },
        });
      }

      if (parsed.pathname.endsWith("/modify")) {
        return jsonResponse({ id: "m1" });
      }

      if (parsed.pathname.endsWith("/send")) {
        return jsonResponse({ id: "sent-1", threadId: "thread-1" });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const harness = await setupHarness({
      gmailEnabled: true,
      gmailUserId: "me",
      gmailQuery: "label:inbox newer_than:7d",
      gmailMaxResults: 10,
      gmailAutoReplyEnabled: true,
      gmailReplySignature: "— Personal Admin",
      calendarEnabled: false,
      jobsEnabled: true,
      rulesEnabled: true,
      googleClientId: "google-client",
      googleClientSecretRef: "GOOGLE_CLIENT_SECRET",
      googleRefreshTokenRef: "GOOGLE_REFRESH_TOKEN",
    });

    await harness.performAction(ACTION_KEYS.UPSERT_RULE, {
      name: "Boss priority",
      appliesTo: "gmail",
      conditions: [
        { field: "from", operator: "contains", value: "boss@example.com" },
      ],
      actions: {
        triageStatus: "action",
        priority: "urgent",
        markRead: true,
        star: true,
        autoReplyTemplate: "Confirmed receipt of {{subject}}.",
      },
      stopProcessing: true,
    });

    const result = await harness.performAction<{ success: boolean; syncedCount: number }>(ACTION_KEYS.GMAIL_FULL_SYNC, {
      companyId: "company_1",
      applyRules: true,
    });

    expect(result.success).toBe(true);
    expect(result.syncedCount).toBe(1);

    const inbox = harness.getState({ scopeKind: "instance", stateKey: DATA_KEYS.INBOX_ITEMS }) as InboxItem[];
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({
      source: "gmail",
      triageStatus: "action",
      unread: false,
      starred: true,
      priority: "urgent",
      subject: "Budget follow-up",
    });
    expect(inbox[0]?.autoRepliedAt).toBeTruthy();
    expect(inbox[0]?.ruleMatches.length).toBe(1);

    const syncState = harness.getState({ scopeKind: "instance", stateKey: DATA_KEYS.SYNC_STATE }) as SyncState;
    expect(syncState.gmail.historyId).toBe("101");
    expect(syncState.gmail.inboxCount).toBe(1);

    const dashboard = await harness.getData<AdminDashboardData>(DATA_QUERY_KEYS.DASHBOARD);
    expect(dashboard.inbox.pending).toBe(0);
    expect(dashboard.inbox.total).toBe(1);
    expect(dashboard.rules).toHaveLength(1);

    expect(fetchCalls.some(call => call.url.includes("/modify"))).toBe(true);
    expect(fetchCalls.some(call => call.url.includes("/messages/send"))).toBe(true);
    expect(harness.activity.some(entry => entry.message.includes("Gmail full sync imported 1 messages"))).toBe(true);
  });

  it("runs Calendar full sync and incremental job refreshes meetings + prep", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const parsed = new URL(url);

      if (parsed.hostname === "oauth2.googleapis.com") {
        return jsonResponse({ access_token: "calendar-token" });
      }

      if (parsed.pathname === "/calendar/v3/calendars/primary/events") {
        if (parsed.searchParams.get("syncToken") === "sync-token-1") {
          return jsonResponse({
            items: [
              {
                id: "evt-2",
                summary: "Passport office",
                status: "confirmed",
                start: { dateTime: "2026-04-20T10:00:00.000Z" },
                end: { dateTime: "2026-04-20T10:30:00.000Z" },
                attendees: [{ email: "office@example.com" }],
              },
            ],
            nextSyncToken: "sync-token-2",
          });
        }

        return jsonResponse({
          items: [
            {
              id: "evt-1",
              summary: "Tax meeting",
              description: "Bring receipts",
              status: "confirmed",
              start: { dateTime: "2026-04-19T09:00:00.000Z" },
              end: { dateTime: "2026-04-19T10:00:00.000Z" },
              attendees: [{ email: "accountant@example.com", displayName: "Accountant" }],
              organizer: { email: "accountant@example.com" },
              hangoutLink: "https://meet.google.com/tax-meeting",
            },
          ],
          nextSyncToken: "sync-token-1",
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const harness = await setupHarness({
      gmailEnabled: false,
      calendarEnabled: true,
      calendarIds: ["primary"],
      calendarLookaheadDays: 30,
      calendarLookbackDays: 3,
      calendarPrepLeadDays: 14,
      jobsEnabled: true,
      googleClientId: "google-client",
      googleClientSecretRef: "GOOGLE_CLIENT_SECRET",
      googleRefreshTokenRef: "GOOGLE_REFRESH_TOKEN",
    });

    const fullSync = await harness.performAction<{ success: boolean; syncedCount: number }>(ACTION_KEYS.CALENDAR_FULL_SYNC, {
      companyId: "company_1",
    });
    expect(fullSync.success).toBe(true);
    expect(fullSync.syncedCount).toBe(1);

    const eventsAfterFull = harness.getState({ scopeKind: "instance", stateKey: DATA_KEYS.CALENDAR_EVENTS }) as CalendarEvent[];
    const meetingsAfterFull = harness.getState({ scopeKind: "instance", stateKey: DATA_KEYS.MEETINGS }) as Meeting[];
    expect(eventsAfterFull).toHaveLength(1);
    expect(meetingsAfterFull[0]).toMatchObject({ title: "Tax meeting", source: "calendar" });

    await harness.runJob(JOB_KEYS.CALENDAR_INCREMENTAL_SYNC);

    const eventsAfterIncremental = harness.getState({ scopeKind: "instance", stateKey: DATA_KEYS.CALENDAR_EVENTS }) as CalendarEvent[];
    const preps = await harness.performAction<{ items: Array<{ meetingTitle?: string }> }>(ACTION_KEYS.GET_CALENDAR_PREP, {
      all: true,
    });
    const syncState = harness.getState({ scopeKind: "instance", stateKey: DATA_KEYS.SYNC_STATE }) as SyncState;

    expect(eventsAfterIncremental).toHaveLength(2);
    expect(preps.items.some(item => item.meetingTitle === "Tax meeting")).toBe(true);
    expect(syncState.calendar.calendars.primary?.syncToken).toBe("sync-token-2");
  });

  it("declares UI/jobs/tools and refreshes briefings through tools + events", async () => {
    const harness = await setupHarness();

    expect(manifest.entrypoints.ui).toBe("./dist/ui");
    expect(manifest.jobs?.map(job => job.jobKey)).toEqual([
      JOB_KEYS.GMAIL_INCREMENTAL_SYNC,
      JOB_KEYS.CALENDAR_INCREMENTAL_SYNC,
      JOB_KEYS.DAILY_ADMIN_REFRESH,
    ]);
    expect(manifest.tools?.map(tool => tool.name)).toEqual(expect.arrayContaining([
      TOOL_KEYS.SYNC_GMAIL,
      TOOL_KEYS.SYNC_CALENDAR,
      TOOL_KEYS.RUN_RULES,
      TOOL_KEYS.GENERATE_BRIEFING,
      TOOL_KEYS.REPLY_TO_EMAIL,
    ]));
    expect(manifest.ui?.slots?.map(slot => slot.exportName)).toEqual(expect.arrayContaining([
      "AdminPage",
      "AdminWidget",
      "AdminSidebarLink",
    ]));

    await harness.performAction(ACTION_KEYS.ADD_INBOX_ITEM, {
      content: "Book dentist appointment",
      source: "manual",
      priority: "high",
    });

    const toolResult = await harness.executeTool(TOOL_KEYS.GENERATE_BRIEFING, { date: "2026-04-18" });
    expect(toolResult.content).toContain("Daily briefing generated");

    await harness.emit("agent.run.finished", { runId: "run_1" }, {
      companyId: "company_1",
      entityId: "run_1",
      entityType: "run",
    });

    const briefings = harness.getState({ scopeKind: "instance", stateKey: DATA_KEYS.DAILY_BRIEFINGS }) as DailyBriefing[];
    expect(briefings.length).toBeGreaterThan(0);
    expect(harness.activity.some(entry => entry.message.includes("Daily briefing refreshed after agent run"))).toBe(true);

    const dashboard = await harness.getData<AdminDashboardData>(DATA_QUERY_KEYS.DASHBOARD);
    expect(dashboard.latestBriefing?.items.length).toBeGreaterThan(0);
    expect(dashboard.configHints.length).toBeGreaterThan(0);
  });

  it("tracks the last rule matched during the current run instead of stale rule history", async () => {
    const harness = await setupHarness({
      gmailEnabled: false,
      calendarEnabled: false,
      rulesEnabled: true,
    });

    const firstRule = await harness.performAction<{ rule: { id: string } }>(ACTION_KEYS.UPSERT_RULE, {
      name: "First manual rule",
      appliesTo: "manual",
      conditions: [{ field: "content", operator: "contains", value: "first" }],
      actions: { priority: "high" },
      stopProcessing: true,
    });
    const secondRule = await harness.performAction<{ rule: { id: string } }>(ACTION_KEYS.UPSERT_RULE, {
      name: "Second manual rule",
      appliesTo: "manual",
      conditions: [{ field: "content", operator: "contains", value: "second" }],
      actions: { priority: "urgent" },
      stopProcessing: true,
    });

    await harness.performAction(ACTION_KEYS.ADD_INBOX_ITEM, {
      content: "first follow-up",
      source: "manual",
    });
    await harness.performAction(ACTION_KEYS.RUN_RULES, {
      applyRemote: false,
    });

    await harness.performAction(ACTION_KEYS.ADD_INBOX_ITEM, {
      content: "second follow-up",
      source: "manual",
    });
    await harness.performAction(ACTION_KEYS.RUN_RULES, {
      applyRemote: false,
    });

    const syncState = harness.getState({ scopeKind: "instance", stateKey: DATA_KEYS.SYNC_STATE }) as SyncState;
    expect(syncState.rules.lastRuleId).toBe(secondRule.rule.id);
    expect(syncState.rules.lastRuleId).not.toBe(firstRule.rule.id);
  });

  it("reports sync-all failures instead of claiming success when a branch fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const parsed = new URL(url);

      if (parsed.hostname === "oauth2.googleapis.com") {
        return jsonResponse({ access_token: "access-token" });
      }

      if (parsed.pathname.endsWith("/messages")) {
        return jsonResponse({ error: { message: "boom" } }, 500);
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const harness = await setupHarness({
      gmailEnabled: true,
      gmailUserId: "me",
      gmailQuery: "label:inbox newer_than:7d",
      gmailMaxResults: 10,
      calendarEnabled: false,
      jobsEnabled: true,
      rulesEnabled: true,
      googleClientId: "google-client",
      googleClientSecretRef: "GOOGLE_CLIENT_SECRET",
      googleRefreshTokenRef: "GOOGLE_REFRESH_TOKEN",
    });

    const result = await harness.performAction<{ success: boolean; errors?: unknown[] }>(ACTION_KEYS.SYNC_ALL, {
      companyId: "company_1",
      mode: "full",
      applyRules: true,
    });

    expect(result.success).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining("Google API request failed with 500")]));
  });

  it("persists sync errors for failed Gmail actions and surfaces disabled tool failures honestly", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const parsed = new URL(url);

      if (parsed.hostname === "oauth2.googleapis.com") {
        return jsonResponse({ access_token: "access-token" });
      }

      if (parsed.pathname.endsWith("/messages")) {
        return jsonResponse({ error: { message: "boom" } }, 500);
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const harness = await setupHarness({
      gmailEnabled: true,
      gmailUserId: "me",
      gmailQuery: "label:inbox newer_than:7d",
      gmailMaxResults: 10,
      calendarEnabled: false,
      jobsEnabled: true,
      rulesEnabled: false,
      googleClientId: "google-client",
      googleClientSecretRef: "GOOGLE_CLIENT_SECRET",
      googleRefreshTokenRef: "GOOGLE_REFRESH_TOKEN",
    });

    await expect(harness.performAction(ACTION_KEYS.GMAIL_FULL_SYNC, {
      companyId: "company_1",
      applyRules: false,
    })).rejects.toThrow("Google API request failed with 500");

    const syncState = harness.getState({ scopeKind: "instance", stateKey: DATA_KEYS.SYNC_STATE }) as SyncState;
    expect(syncState.gmail.lastError).toContain("Google API request failed with 500");

    const disabledHarness = await setupHarness({
      gmailEnabled: false,
      calendarEnabled: false,
      rulesEnabled: false,
    });
    const gmailTool = await disabledHarness.executeTool(TOOL_KEYS.SYNC_GMAIL, { mode: "incremental" });
    const rulesTool = await disabledHarness.executeTool(TOOL_KEYS.RUN_RULES, { applyRemote: true });

    expect(gmailTool.error).toBe("gmail_disabled");
    expect(rulesTool.error).toBe("rules_disabled");
  });

  it("validates config when sync features are enabled without required credentials", async () => {
    const validation = await plugin.definition.onValidateConfig?.({
      gmailEnabled: true,
      calendarEnabled: true,
      calendarIds: [],
      jobsEnabled: true,
      rulesEnabled: false,
      gmailAutoReplyEnabled: true,
    });

    expect(validation).toBeDefined();
    expect(validation?.ok).toBe(false);
    expect(validation?.errors).toEqual(expect.arrayContaining([
      expect.stringContaining("Google sync is enabled"),
      expect.stringContaining("no calendar IDs"),
    ]));
    expect(validation?.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("inbox rules are disabled"),
    ]));
  });
});
