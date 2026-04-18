import { definePlugin, type PluginContext } from "@paperclipai/plugin-sdk";
import { ACTION_KEYS, DATA_KEYS, PLUGIN_ID } from "./constants.js";
import type {
  BackupCheck,
  BackupFrequency,
  BackupStatus,
  BillingCycle,
  BriefingItem,
  CalendarPrepItem,
  DailyBriefing,
  Document,
  DocumentType,
  Errand,
  ErrandCategory,
  InboxItem,
  InboxSource,
  Meeting,
  Priority,
  Renewal,
  RenewalType,
  Subscription,
  TriageStatus,
  WeeklyReview,
} from "./types.js";

type ActionParams = Record<string, unknown>;
const INSTANCE_SCOPE = { scopeKind: "instance" as const };
const PRIORITY_ORDER: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const ERRAND_PRIORITY_ORDER: Record<Errand["priority"], number> = { high: 0, medium: 1, low: 2 };
const VALID_TRIAGE_STATUS = new Set<TriageStatus>(["pending", "action", "delegate", "defer", "done"]);
const VALID_INBOX_SOURCES = new Set<InboxSource>(["email", "sms", "signal", "discord", "other"]);
const VALID_RENEWAL_TYPES = new Set<RenewalType>(["insurance", "subscription", "license", "membership", "contract", "other"]);
const VALID_DOCUMENT_TYPES = new Set<DocumentType>(["legal", "financial", "medical", "insurance", "property", "identity", "other"]);
const VALID_ERRAND_CATEGORIES = new Set<ErrandCategory>(["shopping", "bureaucracy", "repair", "health", "other"]);
const VALID_BILLING_CYCLES = new Set<BillingCycle>(["monthly", "quarterly", "yearly"]);
const VALID_BACKUP_STATUS = new Set<BackupStatus>(["ok", "warning", "fail", "never"]);
const VALID_BACKUP_FREQUENCY = new Set<BackupFrequency>(["daily", "weekly", "monthly"]);

type CollectionKey = (typeof DATA_KEYS)[keyof typeof DATA_KEYS];

function nowIso(): string {
  return new Date().toISOString();
}

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function generateId(prefix = "adm"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toStringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toOptionalString(value: unknown): string | undefined {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized ? normalized : undefined;
}

function toArrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(entry => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function normalizePriority(value: unknown, fallback: Priority = "medium"): Priority {
  if (value === "low" || value === "medium" || value === "high" || value === "urgent") return value;
  return fallback;
}

function normalizeErrandPriority(value: unknown, fallback: Errand["priority"] = "medium"): Errand["priority"] {
  if (value === "low" || value === "medium" || value === "high") return value;
  return fallback;
}

function normalizeTriageStatus(value: unknown, fallback: TriageStatus = "pending"): TriageStatus {
  return VALID_TRIAGE_STATUS.has(value as TriageStatus) ? (value as TriageStatus) : fallback;
}

function normalizeInboxSource(value: unknown, fallback: InboxSource = "other"): InboxSource {
  return VALID_INBOX_SOURCES.has(value as InboxSource) ? (value as InboxSource) : fallback;
}

function normalizeRenewalType(value: unknown, fallback: RenewalType = "other"): RenewalType {
  return VALID_RENEWAL_TYPES.has(value as RenewalType) ? (value as RenewalType) : fallback;
}

function normalizeDocumentType(value: unknown, fallback: DocumentType = "other"): DocumentType {
  return VALID_DOCUMENT_TYPES.has(value as DocumentType) ? (value as DocumentType) : fallback;
}

function normalizeErrandCategory(value: unknown, fallback: ErrandCategory = "other"): ErrandCategory {
  return VALID_ERRAND_CATEGORIES.has(value as ErrandCategory) ? (value as ErrandCategory) : fallback;
}

function normalizeBillingCycle(value: unknown, fallback: BillingCycle = "monthly"): BillingCycle {
  return VALID_BILLING_CYCLES.has(value as BillingCycle) ? (value as BillingCycle) : fallback;
}

function normalizeBackupStatus(value: unknown, fallback: BackupStatus = "ok"): BackupStatus {
  return VALID_BACKUP_STATUS.has(value as BackupStatus) ? (value as BackupStatus) : fallback;
}

function normalizeBackupFrequency(value: unknown, fallback: BackupFrequency = "weekly"): BackupFrequency {
  return VALID_BACKUP_FREQUENCY.has(value as BackupFrequency) ? (value as BackupFrequency) : fallback;
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function parseDate(value: unknown, fallback = new Date()): Date {
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
}

function toDateString(value: unknown, fallback = todayKey()): string {
  return todayKey(parseDate(value, parseDate(fallback)));
}

function clampMin(value: number, min = 0): number {
  return value < min ? min : value;
}

function addDays(input: string | Date, days: number): string {
  const date = input instanceof Date ? new Date(input) : parseDate(input, new Date());
  date.setUTCDate(date.getUTCDate() + days);
  return todayKey(date);
}

function diffDays(target: string, from = todayKey()): number {
  const targetDate = parseDate(target);
  const fromDate = parseDate(from);
  const utcTarget = Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate());
  const utcFrom = Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate());
  return Math.floor((utcTarget - utcFrom) / 86400000);
}

function asSortDate(value?: string): number {
  return value ? parseDate(value).getTime() : Number.MAX_SAFE_INTEGER;
}

function getIsoWeek(input: Date): string {
  const date = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

async function getCollection<T>(ctx: PluginContext, key: CollectionKey): Promise<T[]> {
  const value = await ctx.state.get({ ...INSTANCE_SCOPE, stateKey: key });
  return Array.isArray(value) ? (value as T[]) : [];
}

async function setCollection<T>(ctx: PluginContext, key: CollectionKey, value: T[]): Promise<void> {
  await ctx.state.set({ ...INSTANCE_SCOPE, stateKey: key }, value);
}

function sortInboxItems(items: InboxItem[]): InboxItem[] {
  return [...items].sort((left, right) => {
    const priorityDelta = PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];
    if (priorityDelta !== 0) return priorityDelta;
    return parseDate(right.receivedAt).getTime() - parseDate(left.receivedAt).getTime();
  });
}

function sortErrands(errands: Errand[]): Errand[] {
  return [...errands].sort((left, right) => {
    if (left.completed !== right.completed) return Number(left.completed) - Number(right.completed);
    const dueDelta = asSortDate(left.dueDate) - asSortDate(right.dueDate);
    if (dueDelta !== 0) return dueDelta;
    return ERRAND_PRIORITY_ORDER[left.priority] - ERRAND_PRIORITY_ORDER[right.priority];
  });
}

function sortMeetings(meetings: Meeting[]): Meeting[] {
  return [...meetings].sort((left, right) => parseDate(left.scheduledAt).getTime() - parseDate(right.scheduledAt).getTime());
}

function sortRenewals(renewals: Renewal[]): Renewal[] {
  return [...renewals].sort((left, right) => parseDate(left.renewalDate).getTime() - parseDate(right.renewalDate).getTime());
}

function sortDocuments(documents: Document[]): Document[] {
  return [...documents].sort((left, right) => asSortDate(left.expiryDate) - asSortDate(right.expiryDate));
}

function sortBackupChecks(checks: BackupCheck[]): BackupCheck[] {
  return [...checks].sort((left, right) => asSortDate(left.nextDue) - asSortDate(right.nextDue));
}

function summarizeActiveSubscriptionSpend(subscriptions: Subscription[]): number {
  return subscriptions
    .filter(subscription => subscription.active)
    .reduce((sum, subscription) => {
      if (subscription.billingCycle === "monthly") return sum + subscription.cost;
      if (subscription.billingCycle === "quarterly") return sum + subscription.cost / 3;
      return sum + subscription.cost / 12;
    }, 0);
}

function createBriefingItem(category: BriefingItem["category"], content: string, priority: BriefingItem["priority"]): BriefingItem {
  return {
    id: generateId("brief"),
    category,
    content,
    priority,
    completed: false,
  };
}

function computeNextDueDate(frequency: BackupFrequency, checkedAt: string): string {
  if (frequency === "daily") return addDays(checkedAt, 1);
  if (frequency === "weekly") return addDays(checkedAt, 7);
  return addDays(checkedAt, 30);
}

async function upsertDailyBriefing(ctx: PluginContext, briefing: DailyBriefing): Promise<void> {
  const existing = await getCollection<DailyBriefing>(ctx, DATA_KEYS.DAILY_BRIEFINGS);
  const others = existing.filter(entry => entry.date !== briefing.date);
  others.push(briefing);
  others.sort((left, right) => left.date.localeCompare(right.date));
  await setCollection(ctx, DATA_KEYS.DAILY_BRIEFINGS, others);
}

async function generateDailyBriefing(ctx: PluginContext, params: ActionParams = {}, reason = "manual"): Promise<{ briefing: DailyBriefing; summary: Record<string, unknown> }> {
  const requestedDate = toDateString(params.date, todayKey());
  const refresh = toBoolean(params.refresh, true);
  const storedBriefings = await getCollection<DailyBriefing>(ctx, DATA_KEYS.DAILY_BRIEFINGS);
  const existing = storedBriefings.find(entry => entry.date === requestedDate);

  if (existing && !refresh) {
    return {
      briefing: existing,
      summary: {
        source: "stored",
        itemCount: existing.items.length,
      },
    };
  }

  const [inbox, errands, renewals, meetings, fileCleanupTasks, backupChecks] = await Promise.all([
    getCollection<InboxItem>(ctx, DATA_KEYS.INBOX_ITEMS),
    getCollection<Errand>(ctx, DATA_KEYS.ERRANDS),
    getCollection<Renewal>(ctx, DATA_KEYS.RENEWALS),
    getCollection<Meeting>(ctx, DATA_KEYS.MEETINGS),
    getCollection(ctx, DATA_KEYS.FILE_CLEANUP_TASKS) as Promise<import("./types.js").FileCleanupTask[]>,
    getCollection<BackupCheck>(ctx, DATA_KEYS.BACKUP_CHECKS),
  ]);

  const items: BriefingItem[] = [];
  const pendingInbox = sortInboxItems(inbox.filter(item => item.triageStatus === "pending"));
  if (pendingInbox.length > 0) {
    const urgentInbox = pendingInbox.filter(item => item.priority === "high" || item.priority === "urgent");
    items.push(createBriefingItem("inbox", `${pendingInbox.length} inbox items need triage${urgentInbox.length ? ` (${urgentInbox.length} high priority)` : ""}.`, urgentInbox.length ? "high" : "medium"));
  }

  const openErrands = sortErrands(errands.filter(errand => !errand.completed));
  const dueErrands = openErrands.filter(errand => !errand.dueDate || errand.dueDate <= requestedDate);
  if (openErrands.length > 0) {
    const summary = dueErrands.length > 0 ? `${dueErrands.length} errands are due now out of ${openErrands.length} open.` : `${openErrands.length} errands are still open.`;
    items.push(createBriefingItem("errands", summary, dueErrands.length ? "high" : "medium"));
  }

  const upcomingMeetings = sortMeetings(meetings.filter(meeting => meeting.scheduledAt.slice(0, 10) === requestedDate));
  if (upcomingMeetings.length > 0) {
    items.push(createBriefingItem("meetings", `${upcomingMeetings.length} meeting${upcomingMeetings.length === 1 ? "" : "s"} scheduled today.`, "medium"));
  }

  const upcomingRenewals = sortRenewals(renewals.filter(renewal => diffDays(renewal.renewalDate, requestedDate) <= 14));
  if (upcomingRenewals.length > 0) {
    const overdueCount = upcomingRenewals.filter(renewal => diffDays(renewal.renewalDate, requestedDate) < 0).length;
    items.push(createBriefingItem("renewals", overdueCount > 0 ? `${overdueCount} renewals are overdue and ${upcomingRenewals.length - overdueCount} more are due within 14 days.` : `${upcomingRenewals.length} renewals are due within the next 14 days.`, "high"));
  }

  const staleCleanupTasks = fileCleanupTasks.filter(task => !task.completed && task.safeToDelete);
  if (staleCleanupTasks.length > 0) {
    items.push(createBriefingItem("general", `${staleCleanupTasks.length} file cleanup task${staleCleanupTasks.length === 1 ? "" : "s"} are ready for deletion review.`, "medium"));
  }

  const failingBackups = backupChecks.filter(check => check.lastStatus === "fail");
  const overdueBackups = backupChecks.filter(check => diffDays(check.nextDue, requestedDate) <= 0);
  if (failingBackups.length > 0 || overdueBackups.length > 0) {
    items.push(createBriefingItem("general", `${failingBackups.length} failing backup target${failingBackups.length === 1 ? "" : "s"}, ${overdueBackups.length} backup check${overdueBackups.length === 1 ? "" : "s"} due now.`, failingBackups.length ? "high" : "medium"));
  }

  if (items.length === 0) {
    items.push(createBriefingItem("general", `No urgent admin items detected for ${requestedDate}.`, "low"));
  }

  const briefing: DailyBriefing = {
    id: existing?.id ?? generateId("day"),
    date: requestedDate,
    items,
    generatedAt: nowIso(),
  };

  await upsertDailyBriefing(ctx, briefing);
  ctx.logger.info("Daily briefing generated", { date: requestedDate, reason, itemCount: briefing.items.length });

  return {
    briefing,
    summary: {
      source: "generated",
      itemCount: briefing.items.length,
      pendingInbox: pendingInbox.length,
      openErrands: openErrands.length,
      upcomingMeetings: upcomingMeetings.length,
      upcomingRenewals: upcomingRenewals.length,
      failingBackups: failingBackups.length,
    },
  };
}

function parseSections(value: unknown): WeeklyReview["sections"] {
  const input = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    wins: toStringValue(input.wins),
    blockers: toStringValue(input.blockers),
    nextWeekGoals: toStringValue(input.nextWeekGoals),
    habitsScore: clampMin(toNumber(input.habitsScore, 0)),
    energyScore: clampMin(toNumber(input.energyScore, 0)),
  };
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.actions.register(ACTION_KEYS.ADD_INBOX_ITEM, async params => {
      const item: InboxItem = {
        id: generateId("inbox"),
        content: toStringValue(params.content, "Untitled inbox item"),
        source: normalizeInboxSource(params.source, "other"),
        receivedAt: typeof params.receivedAt === "string" ? parseDate(params.receivedAt).toISOString() : nowIso(),
        triageStatus: normalizeTriageStatus(params.triageStatus, "pending"),
        triageNotes: toOptionalString(params.triageNotes),
        relatedItems: uniqueStrings(toArrayOfStrings(params.relatedItems)),
        priority: normalizePriority(params.priority, "medium"),
        deferUntil: toOptionalString(params.deferUntil),
        lastTriagedAt: undefined,
      };
      const items = await getCollection<InboxItem>(ctx, DATA_KEYS.INBOX_ITEMS);
      items.push(item);
      await setCollection(ctx, DATA_KEYS.INBOX_ITEMS, sortInboxItems(items));
      return { success: true, item };
    });

    ctx.actions.register(ACTION_KEYS.TRIAGE_INBOX_ITEM, async params => {
      const items = await getCollection<InboxItem>(ctx, DATA_KEYS.INBOX_ITEMS);
      const index = items.findIndex(item => item.id === params.id);
      if (index === -1) return { success: false, reason: "not_found" };
      items[index] = {
        ...items[index],
        triageStatus: normalizeTriageStatus(params.status, items[index].triageStatus),
        triageNotes: toOptionalString(params.notes) ?? items[index].triageNotes,
        deferUntil: toOptionalString(params.deferUntil) ?? items[index].deferUntil,
        relatedItems: uniqueStrings([...(items[index].relatedItems ?? []), ...toArrayOfStrings(params.relatedItems)]),
        lastTriagedAt: nowIso(),
      };
      await setCollection(ctx, DATA_KEYS.INBOX_ITEMS, sortInboxItems(items));
      return { success: true, item: items[index] };
    });

    ctx.actions.register(ACTION_KEYS.GET_INBOX, async params => {
      let items = await getCollection<InboxItem>(ctx, DATA_KEYS.INBOX_ITEMS);
      const status = typeof params.status === "string" ? params.status : undefined;
      const source = typeof params.source === "string" ? params.source : undefined;
      const priority = typeof params.priority === "string" ? params.priority : undefined;
      const search = toOptionalString(params.search)?.toLowerCase();

      if (status && status !== "all") items = items.filter(item => item.triageStatus === status);
      else if (!status) items = items.filter(item => item.triageStatus !== "done");
      if (source) items = items.filter(item => item.source === source);
      if (priority) items = items.filter(item => item.priority === priority);
      if (search) items = items.filter(item => item.content.toLowerCase().includes(search) || item.triageNotes?.toLowerCase().includes(search));

      const sorted = sortInboxItems(items);
      return {
        items: sorted,
        summary: {
          total: sorted.length,
          pending: sorted.filter(item => item.triageStatus === "pending").length,
          highPriority: sorted.filter(item => item.priority === "high" || item.priority === "urgent").length,
        },
      };
    });

    ctx.actions.register(ACTION_KEYS.CLEAR_INBOX, async params => {
      const items = await getCollection<InboxItem>(ctx, DATA_KEYS.INBOX_ITEMS);
      const status = typeof params.status === "string" ? params.status : "done";
      const remaining = status === "all" ? [] : items.filter(item => item.triageStatus !== status);
      const removedCount = items.length - remaining.length;
      await setCollection(ctx, DATA_KEYS.INBOX_ITEMS, sortInboxItems(remaining));
      return { success: true, removedCount, remainingCount: remaining.length };
    });

    ctx.actions.register(ACTION_KEYS.ADD_CALENDAR_PREP, async params => {
      const scheduledAt = typeof params.scheduledAt === "string" ? parseDate(params.scheduledAt).toISOString() : `${toDateString(params.prepDate)}T09:00:00.000Z`;
      const preps = await getCollection<CalendarPrepItem>(ctx, DATA_KEYS.CALENDAR_PREP_ITEMS);
      const meetings = await getCollection<Meeting>(ctx, DATA_KEYS.MEETINGS);
      const meetingId = toOptionalString(params.meetingId) ?? (params.title || params.scheduledAt ? generateId("mtg") : undefined);
      const prep: CalendarPrepItem = {
        id: generateId("prep"),
        meetingId,
        attendeeName: toStringValue(params.attendeeName, "Unknown attendee"),
        meetingTitle: toOptionalString(params.title),
        agenda: toOptionalString(params.agenda),
        myTalkingPoints: toArrayOfStrings(params.talkingPoints),
        questionsToAsk: toArrayOfStrings(params.questions),
        followUpTasks: toArrayOfStrings(params.followUpTasks),
        prepCompleted: false,
        prepDate: toDateString(params.prepDate, scheduledAt),
        notes: toOptionalString(params.notes),
      };
      preps.push(prep);

      if (meetingId) {
        const meetingIndex = meetings.findIndex(meeting => meeting.id === meetingId);
        const meeting: Meeting = {
          id: meetingId,
          title: toStringValue(params.title, prep.meetingTitle ?? prep.attendeeName),
          scheduledAt,
          durationMinutes: clampMin(toNumber(params.durationMinutes, 30), 1),
          attendees: uniqueStrings(toArrayOfStrings(params.attendees).concat(prep.attendeeName)),
          notes: toOptionalString(params.notes),
          prepItemId: prep.id,
        };
        if (meetingIndex === -1) meetings.push(meeting);
        else meetings[meetingIndex] = { ...meetings[meetingIndex], ...meeting };
      }

      await Promise.all([
        setCollection(
          ctx,
          DATA_KEYS.CALENDAR_PREP_ITEMS,
          preps.sort((left, right) => left.prepDate.localeCompare(right.prepDate)),
        ),
        setCollection(ctx, DATA_KEYS.MEETINGS, sortMeetings(meetings)),
      ]);

      return { success: true, prep, meetingId };
    });

    ctx.actions.register(ACTION_KEYS.GET_CALENDAR_PREP, async params => {
      const preps = await getCollection<CalendarPrepItem>(ctx, DATA_KEYS.CALENDAR_PREP_ITEMS);
      const meetings = await getCollection<Meeting>(ctx, DATA_KEYS.MEETINGS);
      const requestedDate = toOptionalString(params.date);
      const meetingId = toOptionalString(params.meetingId);
      const daysAhead = clampMin(toNumber(params.days, 7), 0);
      const startDate = requestedDate ?? todayKey();
      const maxDate = addDays(startDate, daysAhead);
      const filtered = preps.filter(prep => {
        if (meetingId && prep.meetingId !== meetingId) return false;
        if (toBoolean(params.all, false)) return true;
        return prep.prepDate >= startDate && prep.prepDate <= maxDate;
      });
      return {
        items: filtered.sort((left, right) => left.prepDate.localeCompare(right.prepDate)),
        meetings: sortMeetings(meetings.filter(meeting => !meetingId || meeting.id === meetingId)),
      };
    });

    ctx.actions.register(ACTION_KEYS.PREP_MEETING, async params => {
      const preps = await getCollection<CalendarPrepItem>(ctx, DATA_KEYS.CALENDAR_PREP_ITEMS);
      const meetings = await getCollection<Meeting>(ctx, DATA_KEYS.MEETINGS);
      const prepIndex = preps.findIndex(prep => prep.id === params.id || prep.meetingId === params.meetingId);
      if (prepIndex === -1) return { success: false, reason: "not_found" };

      preps[prepIndex] = {
        ...preps[prepIndex],
        prepCompleted: true,
        followUpTasks: uniqueStrings(preps[prepIndex].followUpTasks.concat(toArrayOfStrings(params.followUpTasks))),
        notes: toOptionalString(params.notes) ?? preps[prepIndex].notes,
      };

      const meetingIndex = meetings.findIndex(meeting => meeting.id === preps[prepIndex].meetingId);
      if (meetingIndex !== -1 && toOptionalString(params.notes)) {
        meetings[meetingIndex] = {
          ...meetings[meetingIndex],
          notes: toOptionalString(params.notes),
        };
      }

      await Promise.all([
        setCollection(ctx, DATA_KEYS.CALENDAR_PREP_ITEMS, preps.sort((left, right) => left.prepDate.localeCompare(right.prepDate))),
        setCollection(ctx, DATA_KEYS.MEETINGS, sortMeetings(meetings)),
      ]);
      return { success: true, prep: preps[prepIndex] };
    });

    ctx.actions.register(ACTION_KEYS.ADD_RENEWAL, async params => {
      const renewal: Renewal = {
        id: generateId("renewal"),
        name: toStringValue(params.name, "Untitled renewal"),
        type: normalizeRenewalType(params.type, "other"),
        renewalDate: toDateString(params.renewalDate),
        cost: typeof params.cost === "number" ? params.cost : undefined,
        currency: toOptionalString(params.currency) ?? "NOK",
        autoRenew: toBoolean(params.autoRenew, false),
        reminderSent: toBoolean(params.reminderSent, false),
        notes: toStringValue(params.notes),
        lastRenewedAt: undefined,
      };
      const renewals = await getCollection<Renewal>(ctx, DATA_KEYS.RENEWALS);
      renewals.push(renewal);
      await setCollection(ctx, DATA_KEYS.RENEWALS, sortRenewals(renewals));
      return { success: true, renewal };
    });

    ctx.actions.register(ACTION_KEYS.GET_RENEWALS, async params => {
      const renewals = await getCollection<Renewal>(ctx, DATA_KEYS.RENEWALS);
      const includeAll = toBoolean(params.all, false);
      const includePast = toBoolean(params.includePast, false);
      const days = clampMin(toNumber(params.days, 30), 0);
      const type = toOptionalString(params.type);
      const filtered = sortRenewals(renewals.filter(renewal => {
        if (type && renewal.type !== type) return false;
        if (includeAll) return true;
        const delta = diffDays(renewal.renewalDate);
        if (!includePast && delta < 0) return false;
        return delta <= days;
      }));
      return {
        renewals: filtered,
        summary: {
          total: filtered.length,
          overdue: filtered.filter(renewal => diffDays(renewal.renewalDate) < 0).length,
          autoRenewing: filtered.filter(renewal => renewal.autoRenew).length,
        },
      };
    });

    ctx.actions.register(ACTION_KEYS.CHECK_RENEWALS, async params => {
      const renewals = await getCollection<Renewal>(ctx, DATA_KEYS.RENEWALS);
      const days = clampMin(toNumber(params.days, 30), 0);
      const markReminderSent = toBoolean(params.markReminderSent, false);
      const updated = renewals.map(renewal => {
        const dueInDays = diffDays(renewal.renewalDate);
        if (markReminderSent && dueInDays <= days) return { ...renewal, reminderSent: true };
        return renewal;
      });
      if (markReminderSent) await setCollection(ctx, DATA_KEYS.RENEWALS, sortRenewals(updated));
      const overdue = updated.filter(renewal => diffDays(renewal.renewalDate) < 0);
      const upcoming = updated.filter(renewal => {
        const dueInDays = diffDays(renewal.renewalDate);
        return dueInDays >= 0 && dueInDays <= days;
      });
      return {
        overdue: sortRenewals(overdue),
        upcoming: sortRenewals(upcoming),
        summary: {
          overdue: overdue.length,
          upcoming: upcoming.length,
          reminderMarked: markReminderSent ? overdue.length + upcoming.length : 0,
        },
      };
    });

    ctx.actions.register(ACTION_KEYS.ADD_DOCUMENT, async params => {
      const document: Document = {
        id: generateId("doc"),
        name: toStringValue(params.name, "Untitled document"),
        type: normalizeDocumentType(params.type, "other"),
        expiryDate: toOptionalString(params.expiryDate) ? toDateString(params.expiryDate) : undefined,
        issuingAuthority: toOptionalString(params.issuingAuthority),
        documentRef: toOptionalString(params.documentRef),
        uploadedAt: nowIso(),
        notes: toStringValue(params.notes),
        renewedAt: undefined,
      };
      const documents = await getCollection<Document>(ctx, DATA_KEYS.DOCUMENTS);
      documents.push(document);
      await setCollection(ctx, DATA_KEYS.DOCUMENTS, sortDocuments(documents));
      return { success: true, document };
    });

    ctx.actions.register(ACTION_KEYS.GET_DOCUMENTS, async params => {
      const documents = await getCollection<Document>(ctx, DATA_KEYS.DOCUMENTS);
      const days = clampMin(toNumber(params.days, 60), 0);
      const includeExpired = toBoolean(params.includeExpired, true);
      const type = toOptionalString(params.type);
      const filtered = sortDocuments(documents.filter(document => {
        if (type && document.type !== type) return false;
        if (!document.expiryDate) return true;
        const dueInDays = diffDays(document.expiryDate);
        if (!includeExpired && dueInDays < 0) return false;
        return dueInDays <= days || toBoolean(params.all, false);
      }));
      return {
        documents: filtered,
        summary: {
          total: filtered.length,
          expired: filtered.filter(document => document.expiryDate && diffDays(document.expiryDate) < 0).length,
          expiringSoon: filtered.filter(document => document.expiryDate && diffDays(document.expiryDate) >= 0 && diffDays(document.expiryDate) <= days).length,
        },
      };
    });

    ctx.actions.register(ACTION_KEYS.RENEW_DOCUMENT, async params => {
      const documents = await getCollection<Document>(ctx, DATA_KEYS.DOCUMENTS);
      const index = documents.findIndex(document => document.id === params.id);
      if (index === -1) return { success: false, reason: "not_found" };
      documents[index] = {
        ...documents[index],
        expiryDate: toOptionalString(params.newExpiryDate) ? toDateString(params.newExpiryDate) : documents[index].expiryDate,
        notes: toOptionalString(params.notes) ?? documents[index].notes,
        renewedAt: nowIso(),
      };
      await setCollection(ctx, DATA_KEYS.DOCUMENTS, sortDocuments(documents));
      return { success: true, document: documents[index] };
    });

    ctx.actions.register(ACTION_KEYS.ADD_SUBSCRIPTION, async params => {
      const subscription: Subscription = {
        id: generateId("sub"),
        name: toStringValue(params.name, "Untitled subscription"),
        provider: toStringValue(params.provider, "Unknown provider"),
        cost: clampMin(toNumber(params.cost, 0), 0),
        currency: toOptionalString(params.currency) ?? "NOK",
        billingCycle: normalizeBillingCycle(params.billingCycle, "monthly"),
        nextBillingDate: toDateString(params.nextBillingDate),
        active: toBoolean(params.active, true),
        category: toStringValue(params.category, "other"),
        cancelAtPeriodEnd: toBoolean(params.cancelAtPeriodEnd, false),
        notes: toStringValue(params.notes),
        cancelledAt: undefined,
      };
      const subscriptions = await getCollection<Subscription>(ctx, DATA_KEYS.SUBSCRIPTIONS);
      subscriptions.push(subscription);
      await setCollection(ctx, DATA_KEYS.SUBSCRIPTIONS, subscriptions.sort((left, right) => left.nextBillingDate.localeCompare(right.nextBillingDate)));
      return { success: true, subscription };
    });

    ctx.actions.register(ACTION_KEYS.GET_SUBSCRIPTIONS, async params => {
      const subscriptions = await getCollection<Subscription>(ctx, DATA_KEYS.SUBSCRIPTIONS);
      const activeOnly = toBoolean(params.activeOnly, false);
      const days = clampMin(toNumber(params.days, 45), 0);
      const filtered = subscriptions
        .filter(subscription => {
          if (activeOnly && !subscription.active) return false;
          return diffDays(subscription.nextBillingDate) <= days || toBoolean(params.all, false);
        })
        .sort((left, right) => left.nextBillingDate.localeCompare(right.nextBillingDate));
      return {
        subscriptions: filtered,
        summary: {
          total: filtered.length,
          active: filtered.filter(subscription => subscription.active).length,
          estimatedMonthlySpend: Number(summarizeActiveSubscriptionSpend(filtered).toFixed(2)),
        },
      };
    });

    ctx.actions.register(ACTION_KEYS.CANCEL_SUBSCRIPTION, async params => {
      const subscriptions = await getCollection<Subscription>(ctx, DATA_KEYS.SUBSCRIPTIONS);
      const index = subscriptions.findIndex(subscription => subscription.id === params.id);
      if (index === -1) return { success: false, reason: "not_found" };
      const immediate = toBoolean(params.immediate, false);
      subscriptions[index] = {
        ...subscriptions[index],
        active: immediate ? false : subscriptions[index].active,
        cancelAtPeriodEnd: true,
        cancelledAt: nowIso(),
        notes: toOptionalString(params.notes) ?? subscriptions[index].notes,
      };
      await setCollection(ctx, DATA_KEYS.SUBSCRIPTIONS, subscriptions.sort((left, right) => left.nextBillingDate.localeCompare(right.nextBillingDate)));
      return { success: true, subscription: subscriptions[index] };
    });

    ctx.actions.register(ACTION_KEYS.ADD_ERRAND, async params => {
      const errand: Errand = {
        id: generateId("errand"),
        description: toStringValue(params.description, "Untitled errand"),
        location: toOptionalString(params.location),
        dueDate: toOptionalString(params.dueDate) ? toDateString(params.dueDate) : undefined,
        priority: normalizeErrandPriority(params.priority, "medium"),
        completed: false,
        completedAt: undefined,
        category: normalizeErrandCategory(params.category, "other"),
        notes: toStringValue(params.notes),
      };
      const errands = await getCollection<Errand>(ctx, DATA_KEYS.ERRANDS);
      errands.push(errand);
      await setCollection(ctx, DATA_KEYS.ERRANDS, sortErrands(errands));
      return { success: true, errand };
    });

    ctx.actions.register(ACTION_KEYS.COMPLETE_ERRAND, async params => {
      const errands = await getCollection<Errand>(ctx, DATA_KEYS.ERRANDS);
      const index = errands.findIndex(errand => errand.id === params.id);
      if (index === -1) return { success: false, reason: "not_found" };
      errands[index] = {
        ...errands[index],
        completed: true,
        completedAt: nowIso(),
        notes: toOptionalString(params.notes) ?? errands[index].notes,
      };
      await setCollection(ctx, DATA_KEYS.ERRANDS, sortErrands(errands));
      return { success: true, errand: errands[index] };
    });

    ctx.actions.register(ACTION_KEYS.GET_ERRANDS, async params => {
      const errands = await getCollection<Errand>(ctx, DATA_KEYS.ERRANDS);
      const status = typeof params.status === "string" ? params.status : "all";
      const dueBefore = toOptionalString(params.dueBefore);
      const category = toOptionalString(params.category);
      const filtered = sortErrands(errands.filter(errand => {
        if (status === "pending" && errand.completed) return false;
        if (status === "completed" && !errand.completed) return false;
        if (category && errand.category !== category) return false;
        if (dueBefore && errand.dueDate && errand.dueDate > dueBefore) return false;
        return true;
      }));
      return {
        errands: filtered,
        summary: {
          total: filtered.length,
          completed: filtered.filter(errand => errand.completed).length,
          dueNow: filtered.filter(errand => !errand.completed && (!errand.dueDate || errand.dueDate <= todayKey())).length,
        },
      };
    });

    ctx.actions.register(ACTION_KEYS.START_WEEKLY_REVIEW, async params => {
      const reviews = await getCollection<WeeklyReview>(ctx, DATA_KEYS.WEEKLY_REVIEWS);
      const startedAt = parseDate(params.startedAt, new Date());
      const weekOf = getIsoWeek(startedAt);
      const existingOpen = reviews.find(review => review.weekOf === weekOf && !review.completedAt);
      if (existingOpen) return { success: true, review: existingOpen, reused: true };
      const review: WeeklyReview = {
        id: generateId("review"),
        weekOf,
        startedAt: startedAt.toISOString(),
        sections: {
          wins: "",
          blockers: "",
          nextWeekGoals: "",
          habitsScore: 0,
          energyScore: 0,
        },
      };
      reviews.push(review);
      await setCollection(ctx, DATA_KEYS.WEEKLY_REVIEWS, reviews.sort((left, right) => right.weekOf.localeCompare(left.weekOf)));
      return { success: true, review, reused: false };
    });

    ctx.actions.register(ACTION_KEYS.COMPLETE_WEEKLY_REVIEW, async params => {
      const reviews = await getCollection<WeeklyReview>(ctx, DATA_KEYS.WEEKLY_REVIEWS);
      const index = reviews.findIndex(review => review.id === params.id);
      if (index === -1) return { success: false, reason: "not_found" };
      reviews[index] = {
        ...reviews[index],
        completedAt: nowIso(),
        sections: parseSections(params.sections),
      };
      await setCollection(ctx, DATA_KEYS.WEEKLY_REVIEWS, reviews.sort((left, right) => right.weekOf.localeCompare(left.weekOf)));
      return { success: true, review: reviews[index] };
    });

    ctx.actions.register(ACTION_KEYS.GET_WEEKLY_REVIEWS, async params => {
      const reviews = await getCollection<WeeklyReview>(ctx, DATA_KEYS.WEEKLY_REVIEWS);
      const limit = clampMin(toNumber(params.limit, reviews.length), 0);
      const sorted = reviews.sort((left, right) => right.weekOf.localeCompare(left.weekOf));
      return { reviews: limit ? sorted.slice(0, limit) : sorted };
    });

    ctx.actions.register(ACTION_KEYS.GET_DAILY_BRIEFING, async params => generateDailyBriefing(ctx, params, "manual-action"));

    ctx.actions.register(ACTION_KEYS.ADD_BRIEFING_ITEM, async params => {
      const result = await generateDailyBriefing(ctx, { date: params.date, refresh: false }, "seed-briefing");
      const updated: DailyBriefing = {
        ...result.briefing,
        items: result.briefing.items.concat(createBriefingItem(
          (params.category === "inbox" || params.category === "errands" || params.category === "meetings" || params.category === "renewals" || params.category === "habits" || params.category === "general") ? params.category : "general",
          toStringValue(params.content, "Untitled briefing item"),
          normalizeErrandPriority(params.priority, "medium"),
        )),
        generatedAt: nowIso(),
      };
      await upsertDailyBriefing(ctx, updated);
      return { success: true, briefing: updated };
    });

    ctx.actions.register(ACTION_KEYS.ADD_FILE_CLEANUP_TASK, async params => {
      const task = {
        id: generateId("cleanup"),
        path: toStringValue(params.path, "/tmp"),
        description: toStringValue(params.description, "Cleanup review"),
        ageDays: clampMin(toNumber(params.ageDays, 90), 0),
        sizeMb: typeof params.sizeMb === "number" ? params.sizeMb : undefined,
        safeToDelete: toBoolean(params.safeToDelete, false),
        completed: false,
        completedAt: undefined,
      };
      const tasks = await getCollection<typeof task>(ctx, DATA_KEYS.FILE_CLEANUP_TASKS);
      tasks.push(task);
      await setCollection(ctx, DATA_KEYS.FILE_CLEANUP_TASKS, tasks.sort((left, right) => right.ageDays - left.ageDays));
      return { success: true, task };
    });

    ctx.actions.register(ACTION_KEYS.GET_FILE_CLEANUP_TASKS, async params => {
      const tasks = await getCollection<import("./types.js").FileCleanupTask>(ctx, DATA_KEYS.FILE_CLEANUP_TASKS);
      const includeCompleted = toBoolean(params.includeCompleted, false);
      const safeOnly = toBoolean(params.safeOnly, false);
      const filtered = tasks.filter(task => {
        if (!includeCompleted && task.completed) return false;
        if (safeOnly && !task.safeToDelete) return false;
        return true;
      }).sort((left, right) => right.ageDays - left.ageDays);
      return { tasks: filtered };
    });

    ctx.actions.register(ACTION_KEYS.COMPLETE_FILE_CLEANUP, async params => {
      const tasks = await getCollection<import("./types.js").FileCleanupTask>(ctx, DATA_KEYS.FILE_CLEANUP_TASKS);
      const index = tasks.findIndex(task => task.id === params.id);
      if (index === -1) return { success: false, reason: "not_found" };
      tasks[index] = { ...tasks[index], completed: true, completedAt: nowIso() };
      await setCollection(ctx, DATA_KEYS.FILE_CLEANUP_TASKS, tasks.sort((left, right) => right.ageDays - left.ageDays));
      return { success: true, task: tasks[index] };
    });

    ctx.actions.register(ACTION_KEYS.ADD_BACKUP_CHECK, async params => {
      const nextDueInput = toOptionalString(params.nextDue) ?? todayKey();
      const frequency = normalizeBackupFrequency(params.frequency, "weekly");
      const check: BackupCheck = {
        id: generateId("backup"),
        name: toStringValue(params.name, "Untitled backup target"),
        target: toStringValue(params.target, "unknown-target"),
        lastCheckedAt: undefined,
        lastStatus: normalizeBackupStatus(params.lastStatus, "never"),
        frequency,
        nextDue: toDateString(nextDueInput),
        notes: toStringValue(params.notes),
      };
      const checks = await getCollection<BackupCheck>(ctx, DATA_KEYS.BACKUP_CHECKS);
      checks.push(check);
      await setCollection(ctx, DATA_KEYS.BACKUP_CHECKS, sortBackupChecks(checks));
      return { success: true, check };
    });

    ctx.actions.register(ACTION_KEYS.GET_BACKUP_CHECKS, async params => {
      const checks = await getCollection<BackupCheck>(ctx, DATA_KEYS.BACKUP_CHECKS);
      const includeHealthy = toBoolean(params.includeHealthy, true);
      const days = clampMin(toNumber(params.days, 14), 0);
      const filtered = sortBackupChecks(checks.filter(check => {
        if (!includeHealthy && check.lastStatus === "ok") return false;
        return diffDays(check.nextDue) <= days || toBoolean(params.all, false) || check.lastStatus === "fail";
      }));
      return {
        checks: filtered,
        summary: {
          total: filtered.length,
          failing: filtered.filter(check => check.lastStatus === "fail").length,
          dueNow: filtered.filter(check => diffDays(check.nextDue) <= 0).length,
        },
      };
    });

    ctx.actions.register(ACTION_KEYS.RUN_BACKUP_CHECK, async params => {
      const checks = await getCollection<BackupCheck>(ctx, DATA_KEYS.BACKUP_CHECKS);
      const index = checks.findIndex(check => check.id === params.id);
      if (index === -1) return { success: false, reason: "not_found" };
      const checkedAt = parseDate(params.checkedAt, new Date()).toISOString();
      const status = normalizeBackupStatus(params.status, "ok");
      checks[index] = {
        ...checks[index],
        lastCheckedAt: checkedAt,
        lastStatus: status,
        nextDue: toOptionalString(params.nextDue) ? toDateString(params.nextDue) : computeNextDueDate(checks[index].frequency, checkedAt),
        notes: toOptionalString(params.notes) ?? checks[index].notes,
      };
      await setCollection(ctx, DATA_KEYS.BACKUP_CHECKS, sortBackupChecks(checks));
      return { success: true, check: checks[index] };
    });

    ctx.events.on("agent.run.finished", async () => {
      try {
        await generateDailyBriefing(ctx, { refresh: true }, "agent.run.finished");
      } catch (error) {
        ctx.logger.error("Failed to refresh daily briefing after agent run", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    ctx.logger.info("Personal Admin plugin initialized", { pluginId: PLUGIN_ID });
  },

  async onHealth() {
    return {
      status: "ok",
      details: {
        pluginId: PLUGIN_ID,
        featureSet: "personal-admin-mvp",
      },
    };
  },
});

export default plugin;
