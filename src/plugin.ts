import { definePlugin, type PluginContext } from "@paperclipai/plugin-sdk";
import { ACTION_KEYS, DATA_KEYS, DATA_QUERY_KEYS, JOB_KEYS, PLUGIN_ID, STREAM_KEYS, TOOL_KEYS } from "./constants.js";
import { calendarListEvents, exchangeRefreshToken, getHeader, gmailGetMessage, gmailListHistoryPage, gmailListMessagesPage, gmailModifyMessage, gmailSendMessage, GoogleApiError, toBase64Url } from "./google.js";
import type {
  AdminConfig,
  AdminDashboardData,
  BackupCheck,
  BackupFrequency,
  BackupStatus,
  BillingCycle,
  BriefingItem,
  CalendarEvent,
  CalendarPrepItem,
  DailyBriefing,
  Document,
  DocumentType,
  Errand,
  ErrandCategory,
  FileCleanupTask,
  GoogleCalendarEvent,
  GoogleGmailMessage,
  InboxItem,
  InboxRule,
  InboxRuleActionSet,
  InboxRuleCondition,
  InboxSource,
  Meeting,
  Priority,
  Renewal,
  RenewalType,
  RuleField,
  RuleOperator,
  Subscription,
  SyncState,
  TriageStatus,
  WeeklyReview,
} from "./types.js";

type ActionParams = Record<string, unknown>;
type CollectionKey = (typeof DATA_KEYS)[keyof typeof DATA_KEYS];

const INSTANCE_SCOPE = { scopeKind: "instance" as const };
const PRIORITY_ORDER: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const ERRAND_PRIORITY_ORDER: Record<Errand["priority"], number> = { high: 0, medium: 1, low: 2 };
const VALID_TRIAGE_STATUS = new Set<TriageStatus>(["pending", "action", "delegate", "defer", "done"]);
const VALID_INBOX_SOURCES = new Set<InboxSource>(["email", "sms", "signal", "discord", "gmail", "manual", "other"]);
const VALID_RENEWAL_TYPES = new Set<RenewalType>(["insurance", "subscription", "license", "membership", "contract", "other"]);
const VALID_DOCUMENT_TYPES = new Set<DocumentType>(["legal", "financial", "medical", "insurance", "property", "identity", "other"]);
const VALID_ERRAND_CATEGORIES = new Set<ErrandCategory>(["shopping", "bureaucracy", "repair", "health", "other"]);
const VALID_BILLING_CYCLES = new Set<BillingCycle>(["monthly", "quarterly", "yearly"]);
const VALID_BACKUP_STATUS = new Set<BackupStatus>(["ok", "warning", "fail", "never"]);
const VALID_BACKUP_FREQUENCY = new Set<BackupFrequency>(["daily", "weekly", "monthly"]);
const VALID_RULE_FIELDS = new Set<RuleField>(["source", "from", "subject", "snippet", "content", "priority", "triageStatus", "labels", "tags", "unread"]);
const VALID_RULE_OPERATORS = new Set<RuleOperator>(["contains", "not_contains", "equals", "not_equals", "starts_with", "ends_with", "in", "exists", "true", "false"]);

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
  if (Array.isArray(value)) {
    return value.map(entry => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map(part => part.trim()).filter(Boolean);
  }
  return [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
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

function normalizePriority(value: unknown, fallback: Priority = "medium"): Priority {
  return value === "low" || value === "medium" || value === "high" || value === "urgent" ? value : fallback;
}

function normalizeErrandPriority(value: unknown, fallback: Errand["priority"] = "medium"): Errand["priority"] {
  return value === "low" || value === "medium" || value === "high" ? value : fallback;
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
    if (left.triageStatus !== right.triageStatus) {
      if (left.triageStatus === "done") return 1;
      if (right.triageStatus === "done") return -1;
    }
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

function sortCalendarEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((left, right) => parseDate(left.startAt).getTime() - parseDate(right.startAt).getTime());
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
  return { id: generateId("brief"), category, content, priority, completed: false };
}

function computeNextDueDate(frequency: BackupFrequency, checkedAt: string): string {
  if (frequency === "daily") return addDays(checkedAt, 1);
  if (frequency === "weekly") return addDays(checkedAt, 7);
  return addDays(checkedAt, 30);
}

function defaultSyncState(): SyncState {
  return {
    gmail: {
      enabled: false,
      configured: false,
      inboxCount: 0,
    },
    calendar: {
      enabled: false,
      configured: false,
      calendars: {},
      eventCount: 0,
    },
    rules: {
      lastMatchCount: 0,
    },
  };
}

async function getSyncState(ctx: PluginContext): Promise<SyncState> {
  const value = await ctx.state.get({ ...INSTANCE_SCOPE, stateKey: DATA_KEYS.SYNC_STATE });
  if (isObject(value)) {
    return {
      ...defaultSyncState(),
      ...value,
      gmail: { ...defaultSyncState().gmail, ...(isObject(value.gmail) ? value.gmail : {}) },
      calendar: {
        ...defaultSyncState().calendar,
        ...(isObject(value.calendar) ? value.calendar : {}),
        calendars: isObject(value.calendar) && isObject(value.calendar.calendars) ? value.calendar.calendars as SyncState["calendar"]["calendars"] : {},
      },
      rules: { ...defaultSyncState().rules, ...(isObject(value.rules) ? value.rules : {}) },
    };
  }
  return defaultSyncState();
}

async function setSyncState(ctx: PluginContext, value: SyncState): Promise<void> {
  await ctx.state.set({ ...INSTANCE_SCOPE, stateKey: DATA_KEYS.SYNC_STATE }, value);
}

async function updateSyncState(ctx: PluginContext, updater: (current: SyncState) => SyncState): Promise<SyncState> {
  const next = updater(await getSyncState(ctx));
  await setSyncState(ctx, next);
  return next;
}

function parseEmailAddress(headerValue?: string): string | undefined {
  if (!headerValue) return undefined;
  const match = headerValue.match(/<([^>]+)>/);
  return match?.[1] ?? headerValue;
}

function getReplySubject(subject?: string): string {
  if (!subject) return "Re: your message";
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

function derivePriority(input: { labels?: string[]; subject?: string; snippet?: string }): Priority {
  const haystack = `${input.subject ?? ""} ${input.snippet ?? ""}`.toLowerCase();
  const labels = input.labels ?? [];
  if (labels.includes("IMPORTANT") || haystack.includes("urgent") || haystack.includes("asap")) return "urgent";
  if (labels.includes("STARRED") || haystack.includes("follow up") || haystack.includes("invoice")) return "high";
  if (haystack.includes("reminder") || haystack.includes("meeting")) return "medium";
  return "low";
}

function renderRuleTemplate(template: string, item: InboxItem, signature?: string): string {
  const replacements: Record<string, string> = {
    "{{subject}}": item.subject ?? item.content,
    "{{from}}": item.from ?? "sender",
    "{{snippet}}": item.snippet ?? "",
    "{{content}}": item.content,
  };
  let output = template;
  for (const [key, value] of Object.entries(replacements)) {
    output = output.split(key).join(value);
  }
  return signature ? `${output}\n\n${signature}`.trim() : output.trim();
}

function normalizeRuleCondition(value: unknown): InboxRuleCondition | null {
  if (!isObject(value)) return null;
  const field = toStringValue(value.field) as RuleField;
  const operator = toStringValue(value.operator) as RuleOperator;
  if (!VALID_RULE_FIELDS.has(field) || !VALID_RULE_OPERATORS.has(operator)) return null;
  return {
    field,
    operator,
    value: toOptionalString(value.value),
  };
}

function normalizeRuleActions(value: unknown): InboxRuleActionSet {
  const input = isObject(value) ? value : {};
  return {
    triageStatus: input.triageStatus === "action" || input.triageStatus === "delegate" || input.triageStatus === "defer" || input.triageStatus === "done" ? input.triageStatus : undefined,
    priority: input.priority ? normalizePriority(input.priority, "medium") : undefined,
    addTags: uniqueStrings(toArrayOfStrings(input.addTags)),
    archive: input.archive === true ? true : undefined,
    markRead: input.markRead === true ? true : undefined,
    star: input.star === true ? true : undefined,
    deferDays: typeof input.deferDays === "number" ? clampMin(input.deferDays, 0) : undefined,
    appendNote: toOptionalString(input.appendNote),
    autoReplyTemplate: toOptionalString(input.autoReplyTemplate),
  };
}

function normalizeRule(value: unknown): InboxRule {
  const input = isObject(value) ? value : {};
  const conditions = Array.isArray(input.conditions) ? input.conditions.map(normalizeRuleCondition).filter(Boolean) as InboxRuleCondition[] : [];
  return {
    id: toOptionalString(input.id) ?? generateId("rule"),
    name: toStringValue(input.name, "Untitled rule"),
    enabled: input.enabled !== false,
    appliesTo: input.appliesTo === "gmail" || input.appliesTo === "manual" ? input.appliesTo : "all",
    matchMode: input.matchMode === "any" ? "any" : "all",
    stopProcessing: input.stopProcessing === true,
    conditions,
    actions: normalizeRuleActions(input.actions),
    lastAppliedAt: toOptionalString(input.lastAppliedAt),
  };
}

function getRuleFieldValue(item: InboxItem, field: RuleField): string | boolean | string[] | undefined {
  switch (field) {
    case "source":
      return item.source;
    case "from":
      return item.from;
    case "subject":
      return item.subject;
    case "snippet":
      return item.snippet;
    case "content":
      return item.content;
    case "priority":
      return item.priority;
    case "triageStatus":
      return item.triageStatus;
    case "labels":
      return item.labels;
    case "tags":
      return item.tags;
    case "unread":
      return item.unread;
    default:
      return undefined;
  }
}

function matchesRuleCondition(item: InboxItem, condition: InboxRuleCondition): boolean {
  const actual = getRuleFieldValue(item, condition.field);
  const value = condition.value ?? "";
  if (condition.operator === "exists") return actual !== undefined && actual !== null && `${actual}` !== "";
  if (condition.operator === "true") return actual === true;
  if (condition.operator === "false") return actual === false;

  if (Array.isArray(actual)) {
    const haystack = actual.map(entry => entry.toLowerCase());
    const needle = value.toLowerCase();
    if (condition.operator === "contains" || condition.operator === "in") return haystack.some(entry => entry.includes(needle));
    if (condition.operator === "not_contains") return haystack.every(entry => !entry.includes(needle));
    if (condition.operator === "equals") return haystack.includes(needle);
    if (condition.operator === "not_equals") return !haystack.includes(needle);
    return false;
  }

  const actualString = `${actual ?? ""}`.toLowerCase();
  const normalized = value.toLowerCase();
  switch (condition.operator) {
    case "contains":
      return actualString.includes(normalized);
    case "not_contains":
      return !actualString.includes(normalized);
    case "equals":
      return actualString === normalized;
    case "not_equals":
      return actualString !== normalized;
    case "starts_with":
      return actualString.startsWith(normalized);
    case "ends_with":
      return actualString.endsWith(normalized);
    case "in":
      return normalized.split(",").map(part => part.trim()).filter(Boolean).includes(actualString);
    default:
      return false;
  }
}

function matchesRule(item: InboxItem, rule: InboxRule): boolean {
  if (!rule.enabled) return false;
  if (rule.appliesTo === "gmail" && item.source !== "gmail") return false;
  if (rule.appliesTo === "manual" && item.source === "gmail") return false;
  if (rule.conditions.length === 0) return true;
  if (rule.matchMode === "any") return rule.conditions.some(condition => matchesRuleCondition(item, condition));
  return rule.conditions.every(condition => matchesRuleCondition(item, condition));
}

function applyRuleToItem(item: InboxItem, rule: InboxRule): { item: InboxItem; modify?: { addLabelIds: string[]; removeLabelIds: string[] }; replyTemplate?: string } {
  let next: InboxItem = {
    ...item,
    ruleMatches: uniqueStrings([...item.ruleMatches, rule.id]),
    tags: uniqueStrings(item.tags),
    labels: uniqueStrings(item.labels),
  };
  const addLabelIds: string[] = [];
  const removeLabelIds: string[] = [];

  if (rule.actions.triageStatus) next.triageStatus = rule.actions.triageStatus;
  if (rule.actions.priority) next.priority = rule.actions.priority;
  if (rule.actions.addTags?.length) next.tags = uniqueStrings([...next.tags, ...rule.actions.addTags]);
  if (rule.actions.deferDays !== undefined) next.deferUntil = addDays(todayKey(), rule.actions.deferDays);
  if (rule.actions.appendNote) next.triageNotes = [next.triageNotes, rule.actions.appendNote].filter(Boolean).join("\n");
  if (rule.actions.markRead) {
    next.unread = false;
    next.labels = next.labels.filter(label => label !== "UNREAD");
    removeLabelIds.push("UNREAD");
  }
  if (rule.actions.star) {
    next.starred = true;
    next.labels = uniqueStrings([...next.labels, "STARRED"]);
    addLabelIds.push("STARRED");
  }
  if (rule.actions.archive) {
    next.archived = true;
    next.labels = next.labels.filter(label => label !== "INBOX");
    removeLabelIds.push("INBOX");
  }
  next.lastTriagedAt = nowIso();

  return {
    item: next,
    modify: addLabelIds.length || removeLabelIds.length ? { addLabelIds, removeLabelIds } : undefined,
    replyTemplate: rule.actions.autoReplyTemplate,
  };
}

async function getAdminConfig(ctx: PluginContext): Promise<AdminConfig> {
  const raw = await ctx.config.get();
  const hints: string[] = [];
  const gmailEnabled = raw.gmailEnabled !== false;
  const calendarEnabled = raw.calendarEnabled !== false;
  const jobsEnabled = raw.jobsEnabled !== false;
  const rulesEnabled = raw.rulesEnabled !== false;
  const gmailUserId = toStringValue(raw.gmailUserId, "me");
  const calendarIds = uniqueStrings(toArrayOfStrings(raw.calendarIds)).length > 0 ? uniqueStrings(toArrayOfStrings(raw.calendarIds)) : ["primary"];
  const clientId = toOptionalString(raw.googleClientId);
  const clientSecretRef = toOptionalString(raw.googleClientSecretRef);
  const refreshTokenRef = toOptionalString(raw.googleRefreshTokenRef);

  let googleAuth: AdminConfig["googleAuth"];
  if (clientId && clientSecretRef && refreshTokenRef) {
    googleAuth = {
      clientId,
      clientSecretRef,
      refreshTokenRef,
    };
  } else {
    hints.push("Add Google client ID, client secret ref, and refresh token ref in plugin settings to enable live sync.");
  }

  if (gmailEnabled && !googleAuth) hints.push("Gmail sync is enabled but Google credentials are incomplete.");
  if (calendarEnabled && !googleAuth) hints.push("Calendar sync is enabled but Google credentials are incomplete.");
  if (calendarEnabled && calendarIds.length === 0) hints.push("Add at least one calendar ID to enable calendar sync.");
  if (raw.gmailAutoReplyEnabled === true && raw.rulesEnabled !== true) hints.push("Auto-reply is enabled, but rules are disabled so it will never run.");

  return {
    gmailEnabled,
    gmailUserId,
    gmailQuery: toOptionalString(raw.gmailQuery),
    gmailMaxResults: clampMin(toNumber(raw.gmailMaxResults, 50), 1),
    gmailAutoReplyEnabled: toBoolean(raw.gmailAutoReplyEnabled, false),
    gmailReplySignature: toOptionalString(raw.gmailReplySignature),
    calendarEnabled,
    calendarIds,
    calendarLookaheadDays: clampMin(toNumber(raw.calendarLookaheadDays, 21), 1),
    calendarLookbackDays: clampMin(toNumber(raw.calendarLookbackDays, 7), 0),
    calendarPrepLeadDays: clampMin(toNumber(raw.calendarPrepLeadDays, 7), 1),
    jobsEnabled,
    rulesEnabled,
    googleAuth,
    configHints: hints,
  };
}

function ensureGoogleConfig(config: AdminConfig): asserts config is AdminConfig & { googleAuth: NonNullable<AdminConfig["googleAuth"]> } {
  if (!config.googleAuth) {
    throw new Error("Google integration is not configured. Add client ID plus secret and refresh-token refs in instance settings.");
  }
}

async function getGoogleAccessToken(ctx: PluginContext, config: AdminConfig): Promise<string> {
  ensureGoogleConfig(config);
  const clientSecret = await ctx.secrets.resolve(config.googleAuth.clientSecretRef);
  const refreshToken = await ctx.secrets.resolve(config.googleAuth.refreshTokenRef);
  return exchangeRefreshToken(ctx, {
    clientId: config.googleAuth.clientId,
    clientSecret,
    refreshToken,
  });
}

function buildGmailQuery(config: AdminConfig): string | undefined {
  const base = config.gmailQuery?.trim();
  return base || undefined;
}

function inboxItemFromGmailMessage(message: GoogleGmailMessage, existing?: InboxItem): InboxItem {
  const headers = message.payload?.headers;
  const subject = getHeader(headers, "Subject");
  const from = getHeader(headers, "From");
  const to = getHeader(headers, "To");
  const dateHeader = getHeader(headers, "Date");
  const messageIdHeader = getHeader(headers, "Message-ID");
  const labels = uniqueStrings(message.labelIds ?? []);
  const receivedAt = dateHeader ? parseDate(dateHeader).toISOString() : existing?.receivedAt ?? nowIso();
  return {
    id: existing?.id ?? generateId("gmail"),
    content: [subject, message.snippet].filter(Boolean).join(" — ") || existing?.content || "Gmail message",
    source: "gmail",
    receivedAt,
    triageStatus: existing?.triageStatus ?? "pending",
    triageNotes: existing?.triageNotes,
    relatedItems: existing?.relatedItems ?? [],
    priority: existing?.priority ?? derivePriority({ labels, subject, snippet: message.snippet }),
    deferUntil: existing?.deferUntil,
    lastTriagedAt: existing?.lastTriagedAt,
    subject,
    from,
    to,
    snippet: message.snippet,
    threadId: message.threadId,
    externalId: message.id,
    messageIdHeader,
    labels,
    tags: existing?.tags ?? [],
    unread: labels.includes("UNREAD"),
    starred: labels.includes("STARRED"),
    archived: !labels.includes("INBOX"),
    ruleMatches: existing?.ruleMatches ?? [],
    autoRepliedAt: existing?.autoRepliedAt,
    syncedAt: nowIso(),
  };
}

async function fetchMessagesById(ctx: PluginContext, accessToken: string, userId: string, ids: string[]): Promise<GoogleGmailMessage[]> {
  const results: GoogleGmailMessage[] = [];
  for (let index = 0; index < ids.length; index += 10) {
    const batch = ids.slice(index, index + 10);
    const loaded = await Promise.all(batch.map(id => gmailGetMessage(ctx, accessToken, userId, id)));
    results.push(...loaded);
  }
  return results;
}

function getLatestHistoryId(messages: GoogleGmailMessage[]): string | undefined {
  return messages.map(message => message.historyId).filter(Boolean).sort((left, right) => Number(right) - Number(left))[0];
}

async function logActivity(ctx: PluginContext, companyId: string | undefined, message: string, metadata?: Record<string, unknown>): Promise<void> {
  if (!companyId) return;
  await ctx.activity.log({ companyId, message, metadata });
}

async function emitAdminUpdate(ctx: PluginContext, event: Record<string, unknown>): Promise<void> {
  ctx.streams.emit(STREAM_KEYS.ADMIN_UPDATES, {
    at: nowIso(),
    ...event,
  });
}

async function runGmailFullSync(
  ctx: PluginContext,
  params: ActionParams = {},
  options: { companyId?: string; reason?: string } = {},
): Promise<Record<string, unknown>> {
  const config = await getAdminConfig(ctx);
  if (!config.gmailEnabled) return { success: false, reason: "gmail_disabled" };
  const accessToken = await getGoogleAccessToken(ctx, config);
  const query = toOptionalString(params.query) ?? buildGmailQuery(config);
  const maxResults = clampMin(toNumber(params.maxResults, config.gmailMaxResults), 1);

  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await gmailListMessagesPage(ctx, accessToken, config.gmailUserId, { q: query, maxResults: Math.min(maxResults, 100), pageToken });
    ids.push(...(page.messages ?? []).map(message => message.id));
    pageToken = ids.length >= maxResults ? undefined : page.nextPageToken;
  } while (pageToken);

  const uniqueIds = uniqueStrings(ids).slice(0, maxResults);
  const messages = uniqueIds.length ? await fetchMessagesById(ctx, accessToken, config.gmailUserId, uniqueIds) : [];
  const existing = await getCollection<InboxItem>(ctx, DATA_KEYS.INBOX_ITEMS);
  const existingByExternalId = new Map(existing.filter(item => item.source === "gmail" && item.externalId).map(item => [item.externalId as string, item]));
  const syncedGmailItems = messages.map(message => inboxItemFromGmailMessage(message, existingByExternalId.get(message.id)));
  const manualItems = existing.filter(item => item.source !== "gmail");
  const combined = sortInboxItems([...manualItems, ...syncedGmailItems]);
  await setCollection(ctx, DATA_KEYS.INBOX_ITEMS, combined);

  const syncState = await updateSyncState(ctx, current => ({
    ...current,
    gmail: {
      ...current.gmail,
      enabled: true,
      configured: Boolean(config.googleAuth),
      lastFullSyncAt: nowIso(),
      lastError: undefined,
      historyId: getLatestHistoryId(messages) ?? current.gmail.historyId,
      inboxCount: syncedGmailItems.length,
    },
  }));

  await emitAdminUpdate(ctx, { type: "gmail-full-sync", syncedCount: syncedGmailItems.length, query });
  await logActivity(ctx, options.companyId, `Gmail full sync imported ${syncedGmailItems.length} messages`, { reason: options.reason ?? "action", query });

  if (config.rulesEnabled && params.applyRules !== false) {
    await runRulesEngine(ctx, { ids: syncedGmailItems.map(item => item.id), applyRemote: true }, { companyId: options.companyId, reason: "gmail-full-sync" });
  }

  return {
    success: true,
    syncedCount: syncedGmailItems.length,
    historyId: syncState.gmail.historyId,
    query,
  };
}

async function runGmailIncrementalSync(
  ctx: PluginContext,
  params: ActionParams = {},
  options: { companyId?: string; reason?: string } = {},
): Promise<Record<string, unknown>> {
  const config = await getAdminConfig(ctx);
  if (!config.gmailEnabled) return { success: false, reason: "gmail_disabled" };
  const state = await getSyncState(ctx);
  if (!state.gmail.historyId) {
    return runGmailFullSync(ctx, params, { ...options, reason: options.reason ?? "fallback-full-sync" });
  }

  const accessToken = await getGoogleAccessToken(ctx, config);
  const changedIds = new Set<string>();
  const deletedIds = new Set<string>();
  let nextPageToken: string | undefined;
  let latestHistoryId = state.gmail.historyId;

  try {
    do {
      const page = await gmailListHistoryPage(ctx, accessToken, config.gmailUserId, state.gmail.historyId, nextPageToken);
      latestHistoryId = page.historyId ?? latestHistoryId;
      for (const entry of page.history ?? []) {
        latestHistoryId = entry.id ?? latestHistoryId;
        for (const message of entry.messages ?? []) if (message.id) changedIds.add(message.id);
        for (const message of entry.messagesAdded ?? []) if (message.message?.id) changedIds.add(message.message.id);
        for (const message of entry.labelsAdded ?? []) if (message.message?.id) changedIds.add(message.message.id);
        for (const message of entry.labelsRemoved ?? []) if (message.message?.id) changedIds.add(message.message.id);
        for (const message of entry.messagesDeleted ?? []) if (message.message?.id) deletedIds.add(message.message.id);
      }
      nextPageToken = page.nextPageToken;
    } while (nextPageToken);
  } catch (error) {
    if (error instanceof GoogleApiError && (error.status === 404 || error.status === 400)) {
      return runGmailFullSync(ctx, params, { ...options, reason: "invalid-history-fallback" });
    }
    throw error;
  }

  const idsToFetch = [...changedIds].filter(id => !deletedIds.has(id));
  const messages = idsToFetch.length ? await fetchMessagesById(ctx, accessToken, config.gmailUserId, idsToFetch) : [];
  const existing = await getCollection<InboxItem>(ctx, DATA_KEYS.INBOX_ITEMS);
  const existingGmail = existing.filter(item => item.source === "gmail");
  const manualItems = existing.filter(item => item.source !== "gmail");
  const updatedByExternalId = new Map(existingGmail.map(item => [item.externalId as string, item]));
  const changedItems = messages.map(message => inboxItemFromGmailMessage(message, updatedByExternalId.get(message.id)));
  const changedExternalIds = new Set(changedItems.map(item => item.externalId));
  const retained = existingGmail.filter(item => item.externalId && !deletedIds.has(item.externalId) && !changedExternalIds.has(item.externalId));
  const combined = sortInboxItems([...manualItems, ...retained, ...changedItems]);
  await setCollection(ctx, DATA_KEYS.INBOX_ITEMS, combined);

  await updateSyncState(ctx, current => ({
    ...current,
    gmail: {
      ...current.gmail,
      enabled: true,
      configured: Boolean(config.googleAuth),
      historyId: latestHistoryId,
      inboxCount: combined.filter(item => item.source === "gmail").length,
      lastIncrementalSyncAt: nowIso(),
      lastError: undefined,
    },
  }));

  await emitAdminUpdate(ctx, { type: "gmail-incremental-sync", changedCount: changedItems.length, deletedCount: deletedIds.size });
  await logActivity(ctx, options.companyId, `Gmail incremental sync refreshed ${changedItems.length} messages`, {
    reason: options.reason ?? "action",
    changedCount: changedItems.length,
    deletedCount: deletedIds.size,
  });

  if (config.rulesEnabled && params.applyRules !== false && changedItems.length > 0) {
    await runRulesEngine(ctx, { ids: changedItems.map(item => item.id), applyRemote: true }, { companyId: options.companyId, reason: "gmail-incremental-sync" });
  }

  return {
    success: true,
    changedCount: changedItems.length,
    deletedCount: deletedIds.size,
    historyId: latestHistoryId,
  };
}

function normalizeCalendarEvent(apiEvent: GoogleCalendarEvent, calendarId: string, existing?: CalendarEvent): CalendarEvent | null {
  const startAt = apiEvent.start?.dateTime ?? (apiEvent.start?.date ? `${apiEvent.start.date}T00:00:00.000Z` : undefined);
  if (!startAt) return null;
  const endAt = apiEvent.end?.dateTime ?? (apiEvent.end?.date ? `${apiEvent.end.date}T00:00:00.000Z` : undefined);
  const attendees = uniqueStrings((apiEvent.attendees ?? [])
    .filter(attendee => attendee.responseStatus !== "declined")
    .map(attendee => attendee.displayName ?? attendee.email ?? ""));
  return {
    id: existing?.id ?? generateId("evt"),
    calendarId,
    externalId: apiEvent.id,
    title: apiEvent.summary ?? existing?.title ?? "Untitled event",
    description: apiEvent.description ?? existing?.description,
    status: apiEvent.status ?? "confirmed",
    startAt,
    endAt,
    allDay: Boolean(apiEvent.start?.date && !apiEvent.start?.dateTime),
    location: apiEvent.location ?? existing?.location,
    attendees,
    organizer: apiEvent.organizer?.displayName ?? apiEvent.organizer?.email ?? existing?.organizer,
    meetingLink: apiEvent.hangoutLink ?? existing?.meetingLink,
    syncedAt: nowIso(),
    prepItemId: existing?.prepItemId,
  };
}

async function rebuildMeetingsAndPrep(ctx: PluginContext, events: CalendarEvent[], prepLeadDays: number): Promise<void> {
  const existingMeetings = await getCollection<Meeting>(ctx, DATA_KEYS.MEETINGS);
  const existingPreps = await getCollection<CalendarPrepItem>(ctx, DATA_KEYS.CALENDAR_PREP_ITEMS);
  const manualMeetings = existingMeetings.filter(meeting => meeting.source !== "calendar");
  const manualPreps = existingPreps.filter(prep => prep.source !== "calendar");
  const existingMeetingByExternal = new Map(existingMeetings.filter(meeting => meeting.externalEventId).map(meeting => [meeting.externalEventId as string, meeting]));
  const existingPrepByEvent = new Map(existingPreps.filter(prep => prep.calendarEventId).map(prep => [prep.calendarEventId as string, prep]));

  const generatedMeetings: Meeting[] = [];
  const generatedPreps: CalendarPrepItem[] = [];
  const latestPrepDate = addDays(todayKey(), prepLeadDays);

  for (const event of events.filter(item => item.status !== "cancelled")) {
    const existingMeeting = existingMeetingByExternal.get(event.externalId);
    const durationMinutes = event.endAt ? Math.max(15, Math.round((parseDate(event.endAt).getTime() - parseDate(event.startAt).getTime()) / 60000)) : 30;
    let prepItemId = existingMeeting?.prepItemId;
    const existingPrep = existingPrepByEvent.get(event.externalId);

    if (!event.allDay && event.startAt.slice(0, 10) <= latestPrepDate) {
      prepItemId = existingPrep?.id ?? prepItemId ?? generateId("prep");
      generatedPreps.push({
        id: prepItemId,
        meetingId: existingMeeting?.id,
        calendarEventId: event.externalId,
        attendeeName: event.attendees[0] ?? event.organizer ?? "Meeting participants",
        meetingTitle: event.title,
        agenda: existingPrep?.agenda ?? event.description,
        myTalkingPoints: existingPrep?.myTalkingPoints ?? ["Clarify goal", "Capture decision", "Confirm owner and next step"],
        questionsToAsk: existingPrep?.questionsToAsk ?? ["What is blocked?", "What matters before the next checkpoint?"],
        followUpTasks: existingPrep?.followUpTasks ?? [],
        prepCompleted: existingPrep?.prepCompleted ?? false,
        prepDate: event.startAt.slice(0, 10),
        notes: existingPrep?.notes,
        source: "calendar",
      });
    }

    generatedMeetings.push({
      id: existingMeeting?.id ?? generateId("mtg"),
      externalEventId: event.externalId,
      calendarId: event.calendarId,
      title: event.title,
      scheduledAt: event.startAt,
      durationMinutes,
      attendees: event.attendees,
      notes: existingMeeting?.notes,
      prepItemId,
      location: event.location,
      meetingLink: event.meetingLink,
      source: "calendar",
    });
  }

  const withLinkedPrep = generatedPreps.map(prep => {
    const meeting = generatedMeetings.find(item => item.prepItemId === prep.id || item.externalEventId === prep.calendarEventId);
    return {
      ...prep,
      meetingId: meeting?.id ?? prep.meetingId,
    };
  });

  await Promise.all([
    setCollection(ctx, DATA_KEYS.MEETINGS, sortMeetings([...manualMeetings, ...generatedMeetings])),
    setCollection(ctx, DATA_KEYS.CALENDAR_PREP_ITEMS, [...manualPreps, ...withLinkedPrep].sort((left, right) => left.prepDate.localeCompare(right.prepDate))),
  ]);
}

async function runCalendarFullSync(
  ctx: PluginContext,
  params: ActionParams = {},
  options: { companyId?: string; reason?: string } = {},
): Promise<Record<string, unknown>> {
  const config = await getAdminConfig(ctx);
  if (!config.calendarEnabled) return { success: false, reason: "calendar_disabled" };
  const accessToken = await getGoogleAccessToken(ctx, config);
  const existing = await getCollection<CalendarEvent>(ctx, DATA_KEYS.CALENDAR_EVENTS);
  const existingByExternal = new Map(existing.map(event => [`${event.calendarId}:${event.externalId}`, event]));
  const timeMin = new Date(parseDate(todayKey()).getTime() - config.calendarLookbackDays * 86400000).toISOString();
  const timeMax = new Date(parseDate(todayKey()).getTime() + config.calendarLookaheadDays * 86400000).toISOString();
  const nextEvents: CalendarEvent[] = [];
  const calendarStatus: SyncState["calendar"]["calendars"] = {};

  for (const calendarId of config.calendarIds) {
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    do {
      const page = await calendarListEvents(ctx, accessToken, calendarId, {
        pageToken,
        timeMin,
        timeMax,
        maxResults: 250,
      });
      for (const apiEvent of page.items ?? []) {
        const normalized = normalizeCalendarEvent(apiEvent, calendarId, existingByExternal.get(`${calendarId}:${apiEvent.id}`));
        if (normalized) nextEvents.push(normalized);
      }
      nextSyncToken = page.nextSyncToken ?? nextSyncToken;
      pageToken = page.nextPageToken;
    } while (pageToken);
    calendarStatus[calendarId] = {
      calendarId,
      syncToken: nextSyncToken,
      lastSyncAt: nowIso(),
      eventCount: nextEvents.filter(event => event.calendarId === calendarId).length,
    };
  }

  await setCollection(ctx, DATA_KEYS.CALENDAR_EVENTS, sortCalendarEvents(nextEvents));
  await rebuildMeetingsAndPrep(ctx, nextEvents, config.calendarPrepLeadDays);
  await updateSyncState(ctx, current => ({
    ...current,
    calendar: {
      ...current.calendar,
      enabled: true,
      configured: Boolean(config.googleAuth),
      lastFullSyncAt: nowIso(),
      lastError: undefined,
      calendars: calendarStatus,
      eventCount: nextEvents.length,
    },
  }));

  await emitAdminUpdate(ctx, { type: "calendar-full-sync", syncedCount: nextEvents.length });
  await logActivity(ctx, options.companyId, `Calendar full sync imported ${nextEvents.length} events`, { reason: options.reason ?? "action" });
  return { success: true, syncedCount: nextEvents.length };
}

async function runCalendarIncrementalSync(
  ctx: PluginContext,
  params: ActionParams = {},
  options: { companyId?: string; reason?: string } = {},
): Promise<Record<string, unknown>> {
  const config = await getAdminConfig(ctx);
  if (!config.calendarEnabled) return { success: false, reason: "calendar_disabled" };
  const state = await getSyncState(ctx);
  const allTokensPresent = config.calendarIds.every(calendarId => state.calendar.calendars[calendarId]?.syncToken);
  if (!allTokensPresent) {
    return runCalendarFullSync(ctx, params, { ...options, reason: options.reason ?? "fallback-full-sync" });
  }

  const accessToken = await getGoogleAccessToken(ctx, config);
  const existing = await getCollection<CalendarEvent>(ctx, DATA_KEYS.CALENDAR_EVENTS);
  const existingMap = new Map(existing.map(event => [`${event.calendarId}:${event.externalId}`, event]));
  const deletedKeys = new Set<string>();
  const calendarStatus = { ...state.calendar.calendars };

  try {
    for (const calendarId of config.calendarIds) {
      let pageToken: string | undefined;
      let nextSyncToken = state.calendar.calendars[calendarId]?.syncToken;
      do {
        const page = await calendarListEvents(ctx, accessToken, calendarId, {
          pageToken,
          syncToken: state.calendar.calendars[calendarId]?.syncToken,
          showDeleted: true,
        });
        for (const apiEvent of page.items ?? []) {
          const key = `${calendarId}:${apiEvent.id}`;
          if (apiEvent.status === "cancelled") {
            deletedKeys.add(key);
            existingMap.delete(key);
            continue;
          }
          const normalized = normalizeCalendarEvent(apiEvent, calendarId, existingMap.get(key));
          if (normalized) existingMap.set(key, normalized);
        }
        nextSyncToken = page.nextSyncToken ?? nextSyncToken;
        pageToken = page.nextPageToken;
      } while (pageToken);
      calendarStatus[calendarId] = {
        calendarId,
        syncToken: nextSyncToken,
        lastSyncAt: nowIso(),
        eventCount: [...existingMap.values()].filter(event => event.calendarId === calendarId).length,
      };
    }
  } catch (error) {
    if (error instanceof GoogleApiError && (error.status === 410 || error.status === 400)) {
      return runCalendarFullSync(ctx, params, { ...options, reason: "invalid-sync-token-fallback" });
    }
    throw error;
  }

  const combined = sortCalendarEvents([...existingMap.values()]);
  await setCollection(ctx, DATA_KEYS.CALENDAR_EVENTS, combined);
  await rebuildMeetingsAndPrep(ctx, combined, config.calendarPrepLeadDays);
  await updateSyncState(ctx, current => ({
    ...current,
    calendar: {
      ...current.calendar,
      enabled: true,
      configured: Boolean(config.googleAuth),
      lastIncrementalSyncAt: nowIso(),
      lastError: undefined,
      calendars: calendarStatus,
      eventCount: combined.length,
    },
  }));

  await emitAdminUpdate(ctx, { type: "calendar-incremental-sync", syncedCount: combined.length, removedCount: deletedKeys.size });
  await logActivity(ctx, options.companyId, `Calendar incremental sync refreshed ${combined.length} events`, { reason: options.reason ?? "action", removedCount: deletedKeys.size });
  return { success: true, syncedCount: combined.length, removedCount: deletedKeys.size };
}

async function runGmailReply(
  ctx: PluginContext,
  params: ActionParams,
  options: { companyId?: string; reason?: string; accessToken?: string } = {},
): Promise<Record<string, unknown>> {
  const config = await getAdminConfig(ctx);
  if (!config.gmailEnabled) return { success: false, reason: "gmail_disabled" };
  const items = await getCollection<InboxItem>(ctx, DATA_KEYS.INBOX_ITEMS);
  const item = items.find(entry => entry.id === params.id || entry.externalId === params.id);
  if (!item || item.source !== "gmail" || !item.externalId) return { success: false, reason: "not_found" };
  const body = toStringValue(params.body);
  if (!body) return { success: false, reason: "missing_body" };

  const accessToken = options.accessToken ?? await getGoogleAccessToken(ctx, config);
  const subject = toOptionalString(params.subject) ?? getReplySubject(item.subject);
  const recipient = parseEmailAddress(item.from);
  if (!recipient) return { success: false, reason: "missing_recipient" };

  const lines = [
    `To: ${recipient}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=UTF-8",
  ];
  if (item.messageIdHeader) {
    lines.push(`In-Reply-To: ${item.messageIdHeader}`);
    lines.push(`References: ${item.messageIdHeader}`);
  }
  lines.push("", body);
  const raw = toBase64Url(lines.join("\r\n"));

  const sent = await gmailSendMessage(ctx, accessToken, config.gmailUserId, { raw, threadId: item.threadId });
  const nextItems = items.map(entry => entry.id === item.id ? { ...entry, autoRepliedAt: nowIso() } : entry);
  await setCollection(ctx, DATA_KEYS.INBOX_ITEMS, sortInboxItems(nextItems));
  await updateSyncState(ctx, current => ({
    ...current,
    gmail: {
      ...current.gmail,
      lastReplyAt: nowIso(),
    },
  }));

  await emitAdminUpdate(ctx, { type: "gmail-reply", id: item.id });
  await logActivity(ctx, options.companyId, `Sent Gmail reply for ${item.subject ?? item.content}`, { reason: options.reason ?? "action" });
  return { success: true, sentId: sent.id, threadId: sent.threadId ?? item.threadId };
}

async function runRulesEngine(
  ctx: PluginContext,
  params: ActionParams = {},
  options: { companyId?: string; reason?: string } = {},
): Promise<Record<string, unknown>> {
  const config = await getAdminConfig(ctx);
  if (!config.rulesEnabled) return { success: false, reason: "rules_disabled" };
  const rules = (await getCollection<InboxRule>(ctx, DATA_KEYS.INBOX_RULES)).map(normalizeRule);
  const items = await getCollection<InboxItem>(ctx, DATA_KEYS.INBOX_ITEMS);
  const restrictedIds = new Set(toArrayOfStrings(params.ids));
  const applyRemote = toBoolean(params.applyRemote, true);
  const accessToken = applyRemote && config.googleAuth ? await getGoogleAccessToken(ctx, config) : undefined;
  let matchedCount = 0;
  let lastMatchedRuleId: string | undefined;
  const nextItems: InboxItem[] = [];

  for (const item of items) {
    if (restrictedIds.size > 0 && !restrictedIds.has(item.id) && !restrictedIds.has(item.externalId ?? "")) {
      nextItems.push(item);
      continue;
    }
    let nextItem = item;
    for (const rule of rules) {
      if (!matchesRule(nextItem, rule)) continue;
      matchedCount += 1;
      const result = applyRuleToItem(nextItem, rule);
      nextItem = { ...result.item };
      if (applyRemote && accessToken && nextItem.source === "gmail" && nextItem.externalId && result.modify) {
        await gmailModifyMessage(ctx, accessToken, config.gmailUserId, nextItem.externalId, result.modify);
      }
      if (applyRemote && accessToken && result.replyTemplate && config.gmailAutoReplyEnabled && !nextItem.autoRepliedAt && nextItem.source === "gmail") {
        await runGmailReply(ctx, {
          id: nextItem.id,
          body: renderRuleTemplate(result.replyTemplate, nextItem, config.gmailReplySignature),
        }, {
          companyId: options.companyId,
          reason: `rule:${rule.id}`,
          accessToken,
        });
        nextItem.autoRepliedAt = nowIso();
      }
      rule.lastAppliedAt = nowIso();
      lastMatchedRuleId = rule.id;
      if (rule.stopProcessing) break;
    }
    nextItems.push(nextItem);
  }

  await Promise.all([
    setCollection(ctx, DATA_KEYS.INBOX_ITEMS, sortInboxItems(nextItems)),
    setCollection(ctx, DATA_KEYS.INBOX_RULES, rules),
  ]);
  await updateSyncState(ctx, current => ({
    ...current,
    rules: {
      ...current.rules,
      lastRunAt: nowIso(),
      lastMatchCount: matchedCount,
      lastRuleId: lastMatchedRuleId,
    },
  }));

  await emitAdminUpdate(ctx, { type: "rules-run", matchedCount });
  await logActivity(ctx, options.companyId, `Personal Admin rules processed ${matchedCount} matches`, { reason: options.reason ?? "action", matchedCount });
  return { success: true, matchedCount, itemCount: nextItems.length };
}

async function upsertDailyBriefing(ctx: PluginContext, briefing: DailyBriefing): Promise<void> {
  const existing = await getCollection<DailyBriefing>(ctx, DATA_KEYS.DAILY_BRIEFINGS);
  const others = existing.filter(entry => entry.date !== briefing.date);
  others.push(briefing);
  others.sort((left, right) => left.date.localeCompare(right.date));
  await setCollection(ctx, DATA_KEYS.DAILY_BRIEFINGS, others);
}

async function generateDailyBriefing(
  ctx: PluginContext,
  params: ActionParams = {},
  reason = "manual",
): Promise<{ briefing: DailyBriefing; summary: Record<string, unknown> }> {
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

  const [inbox, errands, renewals, meetings, fileCleanupTasks, backupChecks, syncState] = await Promise.all([
    getCollection<InboxItem>(ctx, DATA_KEYS.INBOX_ITEMS),
    getCollection<Errand>(ctx, DATA_KEYS.ERRANDS),
    getCollection<Renewal>(ctx, DATA_KEYS.RENEWALS),
    getCollection<Meeting>(ctx, DATA_KEYS.MEETINGS),
    getCollection<FileCleanupTask>(ctx, DATA_KEYS.FILE_CLEANUP_TASKS),
    getCollection<BackupCheck>(ctx, DATA_KEYS.BACKUP_CHECKS),
    getSyncState(ctx),
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
    items.push(createBriefingItem("errands", dueErrands.length > 0 ? `${dueErrands.length} errands are due now out of ${openErrands.length} open.` : `${openErrands.length} errands are still open.`, dueErrands.length ? "high" : "medium"));
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
    items.push(createBriefingItem("general", `${staleCleanupTasks.length} file cleanup task${staleCleanupTasks.length === 1 ? " is" : "s are"} ready for deletion review.`, "medium"));
  }

  const failingBackups = backupChecks.filter(check => check.lastStatus === "fail");
  const overdueBackups = backupChecks.filter(check => diffDays(check.nextDue, requestedDate) <= 0);
  if (failingBackups.length > 0 || overdueBackups.length > 0) {
    items.push(createBriefingItem("general", `${failingBackups.length} failing backup target${failingBackups.length === 1 ? "" : "s"}, ${overdueBackups.length} backup check${overdueBackups.length === 1 ? "" : "s"} due now.`, failingBackups.length ? "high" : "medium"));
  }

  if (syncState.gmail.enabled || syncState.calendar.enabled) {
    const syncSummary = `Gmail ${syncState.gmail.lastIncrementalSyncAt || syncState.gmail.lastFullSyncAt ? "synced" : "not synced yet"}; Calendar ${syncState.calendar.lastIncrementalSyncAt || syncState.calendar.lastFullSyncAt ? "synced" : "not synced yet"}.`;
    items.push(createBriefingItem("sync", syncSummary, "low"));
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
  const input = isObject(value) ? value : {};
  return {
    wins: toStringValue(input.wins),
    blockers: toStringValue(input.blockers),
    nextWeekGoals: toStringValue(input.nextWeekGoals),
    habitsScore: clampMin(toNumber(input.habitsScore, 0)),
    energyScore: clampMin(toNumber(input.energyScore, 0)),
  };
}

async function buildDashboardData(ctx: PluginContext): Promise<AdminDashboardData> {
  const [config, sync, inbox, meetings, calendarEvents, rules, renewals, errands, briefings] = await Promise.all([
    getAdminConfig(ctx),
    getSyncState(ctx),
    getCollection<InboxItem>(ctx, DATA_KEYS.INBOX_ITEMS),
    getCollection<Meeting>(ctx, DATA_KEYS.MEETINGS),
    getCollection<CalendarEvent>(ctx, DATA_KEYS.CALENDAR_EVENTS),
    getCollection<InboxRule>(ctx, DATA_KEYS.INBOX_RULES),
    getCollection<Renewal>(ctx, DATA_KEYS.RENEWALS),
    getCollection<Errand>(ctx, DATA_KEYS.ERRANDS),
    getCollection<DailyBriefing>(ctx, DATA_KEYS.DAILY_BRIEFINGS),
  ]);

  const latestBriefing = [...briefings].sort((left, right) => right.date.localeCompare(left.date))[0];
  const recentInbox = sortInboxItems(inbox).slice(0, 8);
  const upcomingMeetings = sortMeetings(meetings).filter(meeting => meeting.scheduledAt >= nowIso()).slice(0, 6);
  const upcomingEvents = sortCalendarEvents(calendarEvents).filter(event => event.startAt >= nowIso()).slice(0, 6);

  return {
    sync,
    inbox: {
      total: inbox.length,
      pending: inbox.filter(item => item.triageStatus === "pending").length,
      urgent: inbox.filter(item => item.priority === "high" || item.priority === "urgent").length,
      recent: recentInbox,
    },
    meetings: {
      upcoming: upcomingMeetings.length,
      items: upcomingMeetings,
    },
    calendarEvents: upcomingEvents,
    rules,
    renewalsDue: sortRenewals(renewals.filter(renewal => diffDays(renewal.renewalDate) <= 30)).slice(0, 6),
    errandsOpen: sortErrands(errands.filter(errand => !errand.completed)).slice(0, 6),
    latestBriefing,
    configHints: config.configHints,
  };
}

async function runSyncAll(ctx: PluginContext, params: ActionParams = {}, options: { companyId?: string; reason?: string } = {}): Promise<Record<string, unknown>> {
  const mode = toOptionalString(params.mode) ?? "incremental";
  const gmailResult = mode === "full"
    ? await runGmailFullSync(ctx, { applyRules: params.applyRules !== false }, { companyId: options.companyId, reason: options.reason ?? "sync-all" }).catch(error => ({ success: false, error: error instanceof Error ? error.message : String(error) }))
    : await runGmailIncrementalSync(ctx, { applyRules: params.applyRules !== false }, { companyId: options.companyId, reason: options.reason ?? "sync-all" }).catch(error => ({ success: false, error: error instanceof Error ? error.message : String(error) }));
  const calendarResult = mode === "full"
    ? await runCalendarFullSync(ctx, {}, { companyId: options.companyId, reason: options.reason ?? "sync-all" }).catch(error => ({ success: false, error: error instanceof Error ? error.message : String(error) }))
    : await runCalendarIncrementalSync(ctx, {}, { companyId: options.companyId, reason: options.reason ?? "sync-all" }).catch(error => ({ success: false, error: error instanceof Error ? error.message : String(error) }));
  const briefing = await generateDailyBriefing(ctx, { refresh: true }, options.reason ?? "sync-all");
  const failures = [gmailResult, calendarResult].filter(result => isObject(result) && result.success === false) as Array<Record<string, unknown>>;
  return {
    success: failures.length === 0,
    gmail: gmailResult,
    calendar: calendarResult,
    briefing: briefing.summary,
    errors: failures.map(result => result.error ?? result.reason).filter(Boolean),
  };
}

const toolSchemas = {
  [TOOL_KEYS.SYNC_GMAIL]: {
    displayName: "Sync Gmail",
    description: "Run a Gmail sync to import inbox messages into Personal Admin.",
    parametersSchema: {
      type: "object",
      properties: { mode: { type: "string", enum: ["full", "incremental"], default: "incremental" } },
      additionalProperties: false,
    },
  },
  [TOOL_KEYS.SYNC_CALENDAR]: {
    displayName: "Sync Calendar",
    description: "Run a Google Calendar sync to refresh meetings and prep items.",
    parametersSchema: {
      type: "object",
      properties: { mode: { type: "string", enum: ["full", "incremental"], default: "incremental" } },
      additionalProperties: false,
    },
  },
  [TOOL_KEYS.RUN_RULES]: {
    displayName: "Run inbox rules",
    description: "Apply advanced inbox rules and optional Gmail auto-triage actions.",
    parametersSchema: {
      type: "object",
      properties: { applyRemote: { type: "boolean", default: true } },
      additionalProperties: false,
    },
  },
  [TOOL_KEYS.GENERATE_BRIEFING]: {
    displayName: "Generate daily briefing",
    description: "Create or refresh the Personal Admin daily briefing.",
    parametersSchema: {
      type: "object",
      properties: { date: { type: "string" } },
      additionalProperties: false,
    },
  },
  [TOOL_KEYS.REPLY_TO_EMAIL]: {
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
} as const;

const plugin = definePlugin({
  async setup(ctx) {
    ctx.data.register(DATA_QUERY_KEYS.DASHBOARD, async () => buildDashboardData(ctx));
    ctx.data.register(DATA_QUERY_KEYS.SYNC_STATUS, async () => getSyncState(ctx));
    ctx.data.register(DATA_QUERY_KEYS.RULES, async () => ({ rules: await getCollection<InboxRule>(ctx, DATA_KEYS.INBOX_RULES) }));

    ctx.actions.register(ACTION_KEYS.ADD_INBOX_ITEM, async params => {
      const item: InboxItem = {
        id: generateId("inbox"),
        content: toStringValue(params.content, "Untitled inbox item"),
        source: normalizeInboxSource(params.source, "manual"),
        receivedAt: typeof params.receivedAt === "string" ? parseDate(params.receivedAt).toISOString() : nowIso(),
        triageStatus: normalizeTriageStatus(params.triageStatus, "pending"),
        triageNotes: toOptionalString(params.triageNotes),
        relatedItems: uniqueStrings(toArrayOfStrings(params.relatedItems)),
        priority: normalizePriority(params.priority, "medium"),
        deferUntil: toOptionalString(params.deferUntil),
        lastTriagedAt: undefined,
        subject: toOptionalString(params.subject),
        from: toOptionalString(params.from),
        to: toOptionalString(params.to),
        snippet: toOptionalString(params.snippet),
        threadId: toOptionalString(params.threadId),
        externalId: toOptionalString(params.externalId),
        messageIdHeader: toOptionalString(params.messageIdHeader),
        labels: uniqueStrings(toArrayOfStrings(params.labels)),
        tags: uniqueStrings(toArrayOfStrings(params.tags)),
        unread: toBoolean(params.unread, true),
        starred: toBoolean(params.starred, false),
        archived: toBoolean(params.archived, false),
        ruleMatches: [],
        autoRepliedAt: undefined,
        syncedAt: undefined,
      };
      const items = await getCollection<InboxItem>(ctx, DATA_KEYS.INBOX_ITEMS);
      items.push(item);
      await setCollection(ctx, DATA_KEYS.INBOX_ITEMS, sortInboxItems(items));
      return { success: true, item };
    });

    ctx.actions.register(ACTION_KEYS.TRIAGE_INBOX_ITEM, async params => {
      const items = await getCollection<InboxItem>(ctx, DATA_KEYS.INBOX_ITEMS);
      const index = items.findIndex(item => item.id === params.id || item.externalId === params.id);
      if (index === -1) return { success: false, reason: "not_found" };
      items[index] = {
        ...items[index],
        triageStatus: normalizeTriageStatus(params.status, items[index].triageStatus),
        triageNotes: toOptionalString(params.notes) ?? items[index].triageNotes,
        deferUntil: toOptionalString(params.deferUntil) ?? items[index].deferUntil,
        relatedItems: uniqueStrings([...(items[index].relatedItems ?? []), ...toArrayOfStrings(params.relatedItems)]),
        tags: uniqueStrings([...(items[index].tags ?? []), ...toArrayOfStrings(params.tags)]),
        priority: params.priority ? normalizePriority(params.priority, items[index].priority) : items[index].priority,
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
      const unreadOnly = toBoolean(params.unreadOnly, false);

      if (status && status !== "all") items = items.filter(item => item.triageStatus === status);
      else if (!status) items = items.filter(item => item.triageStatus !== "done");
      if (source) items = items.filter(item => item.source === source);
      if (priority) items = items.filter(item => item.priority === priority);
      if (unreadOnly) items = items.filter(item => item.unread);
      if (search) {
        items = items.filter(item => [item.content, item.subject, item.from, item.snippet, item.triageNotes].filter(Boolean).some(value => value?.toLowerCase().includes(search)));
      }

      const sorted = sortInboxItems(items);
      return {
        items: sorted,
        summary: {
          total: sorted.length,
          pending: sorted.filter(item => item.triageStatus === "pending").length,
          highPriority: sorted.filter(item => item.priority === "high" || item.priority === "urgent").length,
          unread: sorted.filter(item => item.unread).length,
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

    ctx.actions.register(ACTION_KEYS.UPSERT_RULE, async params => {
      const rules = await getCollection<InboxRule>(ctx, DATA_KEYS.INBOX_RULES);
      const rule = normalizeRule(params.rule ?? params);
      const index = rules.findIndex(entry => entry.id === rule.id);
      if (index === -1) rules.push(rule);
      else rules[index] = rule;
      await setCollection(ctx, DATA_KEYS.INBOX_RULES, rules);
      return { success: true, rule };
    });

    ctx.actions.register(ACTION_KEYS.DELETE_RULE, async params => {
      const rules = await getCollection<InboxRule>(ctx, DATA_KEYS.INBOX_RULES);
      const remaining = rules.filter(rule => rule.id !== params.id);
      await setCollection(ctx, DATA_KEYS.INBOX_RULES, remaining);
      return { success: true, removed: rules.length - remaining.length };
    });

    ctx.actions.register(ACTION_KEYS.GET_RULES, async () => ({ rules: await getCollection<InboxRule>(ctx, DATA_KEYS.INBOX_RULES) }));
    ctx.actions.register(ACTION_KEYS.RUN_RULES, async params => runRulesEngine(ctx, params, { companyId: toOptionalString(params.companyId), reason: "action" }));
    ctx.actions.register(ACTION_KEYS.GMAIL_FULL_SYNC, async params => runGmailFullSync(ctx, params, { companyId: toOptionalString(params.companyId), reason: "action" }));
    ctx.actions.register(ACTION_KEYS.GMAIL_INCREMENTAL_SYNC, async params => runGmailIncrementalSync(ctx, params, { companyId: toOptionalString(params.companyId), reason: "action" }));
    ctx.actions.register(ACTION_KEYS.GMAIL_REPLY, async params => runGmailReply(ctx, params, { companyId: toOptionalString(params.companyId), reason: "action" }));

    ctx.actions.register(ACTION_KEYS.ADD_CALENDAR_PREP, async params => {
      const scheduledAt = typeof params.scheduledAt === "string" ? parseDate(params.scheduledAt).toISOString() : `${toDateString(params.prepDate)}T09:00:00.000Z`;
      const preps = await getCollection<CalendarPrepItem>(ctx, DATA_KEYS.CALENDAR_PREP_ITEMS);
      const meetings = await getCollection<Meeting>(ctx, DATA_KEYS.MEETINGS);
      const meetingId = toOptionalString(params.meetingId) ?? (params.title || params.scheduledAt ? generateId("mtg") : undefined);
      const prep: CalendarPrepItem = {
        id: generateId("prep"),
        meetingId,
        calendarEventId: toOptionalString(params.calendarEventId),
        attendeeName: toStringValue(params.attendeeName, "Unknown attendee"),
        meetingTitle: toOptionalString(params.title),
        agenda: toOptionalString(params.agenda),
        myTalkingPoints: toArrayOfStrings(params.talkingPoints),
        questionsToAsk: toArrayOfStrings(params.questions),
        followUpTasks: toArrayOfStrings(params.followUpTasks),
        prepCompleted: false,
        prepDate: toDateString(params.prepDate, scheduledAt),
        notes: toOptionalString(params.notes),
        source: toOptionalString(params.source) === "calendar" ? "calendar" : "manual",
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
          location: toOptionalString(params.location),
          meetingLink: toOptionalString(params.meetingLink),
          source: toOptionalString(params.source) === "calendar" ? "calendar" : "manual",
        };
        if (meetingIndex === -1) meetings.push(meeting);
        else meetings[meetingIndex] = { ...meetings[meetingIndex], ...meeting };
      }

      await Promise.all([
        setCollection(ctx, DATA_KEYS.CALENDAR_PREP_ITEMS, preps.sort((left, right) => left.prepDate.localeCompare(right.prepDate))),
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
        meetings[meetingIndex] = { ...meetings[meetingIndex], notes: toOptionalString(params.notes) };
      }

      await Promise.all([
        setCollection(ctx, DATA_KEYS.CALENDAR_PREP_ITEMS, preps.sort((left, right) => left.prepDate.localeCompare(right.prepDate))),
        setCollection(ctx, DATA_KEYS.MEETINGS, sortMeetings(meetings)),
      ]);
      return { success: true, prep: preps[prepIndex] };
    });

    ctx.actions.register(ACTION_KEYS.GET_CALENDAR_EVENTS, async params => {
      const events = await getCollection<CalendarEvent>(ctx, DATA_KEYS.CALENDAR_EVENTS);
      const calendarId = toOptionalString(params.calendarId);
      const includePast = toBoolean(params.includePast, false);
      const filtered = sortCalendarEvents(events.filter(event => {
        if (calendarId && event.calendarId !== calendarId) return false;
        if (!includePast && event.startAt < nowIso()) return false;
        return true;
      }));
      return { events: filtered };
    });

    ctx.actions.register(ACTION_KEYS.CALENDAR_FULL_SYNC, async params => runCalendarFullSync(ctx, params, { companyId: toOptionalString(params.companyId), reason: "action" }));
    ctx.actions.register(ACTION_KEYS.CALENDAR_INCREMENTAL_SYNC, async params => runCalendarIncrementalSync(ctx, params, { companyId: toOptionalString(params.companyId), reason: "action" }));

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
      const days = clampMin(toNumber(params.days, 30), 0);
      const includeOverdue = toBoolean(params.includeOverdue, true);
      const filtered = sortRenewals(renewals.filter(renewal => {
        const delta = diffDays(renewal.renewalDate);
        if (!includeOverdue && delta < 0) return false;
        return delta <= days;
      }));
      return {
        renewals: filtered,
        summary: {
          total: filtered.length,
          overdue: filtered.filter(item => diffDays(item.renewalDate) < 0).length,
          withinWeek: filtered.filter(item => diffDays(item.renewalDate) >= 0 && diffDays(item.renewalDate) <= 7).length,
        },
      };
    });

    ctx.actions.register(ACTION_KEYS.CHECK_RENEWALS, async params => {
      const renewals = await getCollection<Renewal>(ctx, DATA_KEYS.RENEWALS);
      const days = clampMin(toNumber(params.days, 30), 0);
      let reminderMarked = 0;
      const updated = renewals.map(renewal => {
        const delta = diffDays(renewal.renewalDate);
        if (delta <= days && toBoolean(params.markReminderSent, false) && !renewal.reminderSent) {
          reminderMarked += 1;
          return { ...renewal, reminderSent: true };
        }
        return renewal;
      });
      await setCollection(ctx, DATA_KEYS.RENEWALS, sortRenewals(updated));
      return {
        success: true,
        renewals: updated.filter(renewal => diffDays(renewal.renewalDate) <= days),
        summary: {
          overdue: updated.filter(item => diffDays(item.renewalDate) < 0).length,
          reminderMarked,
        },
      };
    });

    ctx.actions.register(ACTION_KEYS.ADD_DOCUMENT, async params => {
      const document: Document = {
        id: generateId("doc"),
        name: toStringValue(params.name, "Untitled document"),
        type: normalizeDocumentType(params.type, "other"),
        expiryDate: toOptionalString(params.expiryDate),
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
      const expiringWithinDays = clampMin(toNumber(params.days, 60), 0);
      const filtered = sortDocuments(documents.filter(document => {
        if (toBoolean(params.all, false) || !document.expiryDate) return true;
        return diffDays(document.expiryDate) <= expiringWithinDays;
      }));
      return { documents: filtered };
    });

    ctx.actions.register(ACTION_KEYS.RENEW_DOCUMENT, async params => {
      const documents = await getCollection<Document>(ctx, DATA_KEYS.DOCUMENTS);
      const index = documents.findIndex(document => document.id === params.id);
      if (index === -1) return { success: false, reason: "not_found" };
      documents[index] = {
        ...documents[index],
        expiryDate: toOptionalString(params.newExpiryDate) ?? documents[index].expiryDate,
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
        provider: toStringValue(params.provider, "unknown-provider"),
        cost: toNumber(params.cost, 0),
        currency: toOptionalString(params.currency) ?? "NOK",
        billingCycle: normalizeBillingCycle(params.billingCycle, "monthly"),
        nextBillingDate: toDateString(params.nextBillingDate),
        active: params.active !== false,
        category: toStringValue(params.category, "general"),
        cancelAtPeriodEnd: toBoolean(params.cancelAtPeriodEnd, false),
        notes: toStringValue(params.notes),
        cancelledAt: undefined,
      };
      const subscriptions = await getCollection<Subscription>(ctx, DATA_KEYS.SUBSCRIPTIONS);
      subscriptions.push(subscription);
      await setCollection(ctx, DATA_KEYS.SUBSCRIPTIONS, subscriptions.sort((left, right) => parseDate(left.nextBillingDate).getTime() - parseDate(right.nextBillingDate).getTime()));
      return { success: true, subscription };
    });

    ctx.actions.register(ACTION_KEYS.GET_SUBSCRIPTIONS, async params => {
      const subscriptions = await getCollection<Subscription>(ctx, DATA_KEYS.SUBSCRIPTIONS);
      const includeInactive = toBoolean(params.includeInactive, false);
      const filtered = subscriptions.filter(subscription => includeInactive || subscription.active);
      return {
        subscriptions: filtered,
        summary: {
          total: filtered.length,
          monthlyRunRate: Number(summarizeActiveSubscriptionSpend(filtered).toFixed(2)),
          cancelling: filtered.filter(subscription => subscription.cancelAtPeriodEnd).length,
        },
      };
    });

    ctx.actions.register(ACTION_KEYS.CANCEL_SUBSCRIPTION, async params => {
      const subscriptions = await getCollection<Subscription>(ctx, DATA_KEYS.SUBSCRIPTIONS);
      const index = subscriptions.findIndex(subscription => subscription.id === params.id);
      if (index === -1) return { success: false, reason: "not_found" };
      subscriptions[index] = {
        ...subscriptions[index],
        cancelAtPeriodEnd: true,
        active: params.immediate === true ? false : subscriptions[index].active,
        notes: toOptionalString(params.notes) ?? subscriptions[index].notes,
        cancelledAt: nowIso(),
      };
      await setCollection(ctx, DATA_KEYS.SUBSCRIPTIONS, subscriptions);
      return { success: true, subscription: subscriptions[index] };
    });

    ctx.actions.register(ACTION_KEYS.ADD_ERRAND, async params => {
      const errand: Errand = {
        id: generateId("errand"),
        description: toStringValue(params.description, "Untitled errand"),
        location: toOptionalString(params.location),
        dueDate: toOptionalString(params.dueDate),
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
      errands[index] = { ...errands[index], completed: true, completedAt: nowIso(), notes: toOptionalString(params.notes) ?? errands[index].notes };
      await setCollection(ctx, DATA_KEYS.ERRANDS, sortErrands(errands));
      return { success: true, errand: errands[index] };
    });

    ctx.actions.register(ACTION_KEYS.GET_ERRANDS, async params => {
      const errands = await getCollection<Errand>(ctx, DATA_KEYS.ERRANDS);
      const includeCompleted = toBoolean(params.includeCompleted, false);
      return { errands: sortErrands(errands.filter(errand => includeCompleted || !errand.completed)) };
    });

    ctx.actions.register(ACTION_KEYS.START_WEEKLY_REVIEW, async params => {
      const reviews = await getCollection<WeeklyReview>(ctx, DATA_KEYS.WEEKLY_REVIEWS);
      const weekOf = getIsoWeek(parseDate(params.startedAt, new Date()));
      const existing = reviews.find(review => review.weekOf === weekOf && !review.completedAt);
      if (existing) return { review: existing, reused: true };
      const review: WeeklyReview = {
        id: generateId("review"),
        weekOf,
        startedAt: parseDate(params.startedAt, new Date()).toISOString(),
        completedAt: undefined,
        sections: parseSections(params.sections),
      };
      reviews.push(review);
      await setCollection(ctx, DATA_KEYS.WEEKLY_REVIEWS, reviews.sort((left, right) => left.weekOf.localeCompare(right.weekOf)));
      return { review, reused: false };
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
      await setCollection(ctx, DATA_KEYS.WEEKLY_REVIEWS, reviews.sort((left, right) => left.weekOf.localeCompare(right.weekOf)));
      return { success: true, review: reviews[index] };
    });

    ctx.actions.register(ACTION_KEYS.GET_WEEKLY_REVIEWS, async params => {
      const reviews = await getCollection<WeeklyReview>(ctx, DATA_KEYS.WEEKLY_REVIEWS);
      return { reviews: toBoolean(params.includeAll, false) ? reviews : reviews.filter(review => !review.completedAt) };
    });

    ctx.actions.register(ACTION_KEYS.GET_DAILY_BRIEFING, async params => generateDailyBriefing(ctx, params, "manual-action"));
    ctx.actions.register(ACTION_KEYS.ADD_BRIEFING_ITEM, async params => {
      const date = toDateString(params.date, todayKey());
      const result = await generateDailyBriefing(ctx, { date, refresh: false }, "add-briefing-item");
      const updated: DailyBriefing = {
        ...result.briefing,
        items: [...result.briefing.items, createBriefingItem(toStringValue(params.category, "general") as BriefingItem["category"], toStringValue(params.content, "Untitled item"), (() => { const priority = normalizePriority(params.priority, "medium"); return priority === "urgent" ? "high" : priority; })())],
        generatedAt: nowIso(),
      };
      await upsertDailyBriefing(ctx, updated);
      return { success: true, briefing: updated };
    });

    ctx.actions.register(ACTION_KEYS.GET_SYNC_STATUS, async () => getSyncState(ctx));
    ctx.actions.register(ACTION_KEYS.SYNC_ALL, async params => runSyncAll(ctx, params, { companyId: toOptionalString(params.companyId), reason: "action" }));

    ctx.actions.register(ACTION_KEYS.ADD_FILE_CLEANUP_TASK, async params => {
      const task: FileCleanupTask = {
        id: generateId("cleanup"),
        path: toStringValue(params.path, "/tmp"),
        description: toStringValue(params.description, "Cleanup review"),
        ageDays: clampMin(toNumber(params.ageDays, 90), 0),
        sizeMb: typeof params.sizeMb === "number" ? params.sizeMb : undefined,
        safeToDelete: toBoolean(params.safeToDelete, false),
        completed: false,
        completedAt: undefined,
      };
      const tasks = await getCollection<FileCleanupTask>(ctx, DATA_KEYS.FILE_CLEANUP_TASKS);
      tasks.push(task);
      await setCollection(ctx, DATA_KEYS.FILE_CLEANUP_TASKS, tasks.sort((left, right) => right.ageDays - left.ageDays));
      return { success: true, task };
    });

    ctx.actions.register(ACTION_KEYS.GET_FILE_CLEANUP_TASKS, async params => {
      const tasks = await getCollection<FileCleanupTask>(ctx, DATA_KEYS.FILE_CLEANUP_TASKS);
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
      const tasks = await getCollection<FileCleanupTask>(ctx, DATA_KEYS.FILE_CLEANUP_TASKS);
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

    ctx.jobs.register(JOB_KEYS.GMAIL_INCREMENTAL_SYNC, async () => {
      const config = await getAdminConfig(ctx);
      if (!config.jobsEnabled || !config.gmailEnabled) return;
      try {
        await runGmailIncrementalSync(ctx, { applyRules: true }, { reason: JOB_KEYS.GMAIL_INCREMENTAL_SYNC });
      } catch (error) {
        await updateSyncState(ctx, current => ({
          ...current,
          gmail: { ...current.gmail, lastError: error instanceof Error ? error.message : String(error) },
        }));
        ctx.logger.error("Gmail incremental sync job failed", { error: error instanceof Error ? error.message : String(error) });
      }
    });

    ctx.jobs.register(JOB_KEYS.CALENDAR_INCREMENTAL_SYNC, async () => {
      const config = await getAdminConfig(ctx);
      if (!config.jobsEnabled || !config.calendarEnabled) return;
      try {
        await runCalendarIncrementalSync(ctx, {}, { reason: JOB_KEYS.CALENDAR_INCREMENTAL_SYNC });
      } catch (error) {
        await updateSyncState(ctx, current => ({
          ...current,
          calendar: { ...current.calendar, lastError: error instanceof Error ? error.message : String(error) },
        }));
        ctx.logger.error("Calendar incremental sync job failed", { error: error instanceof Error ? error.message : String(error) });
      }
    });

    ctx.jobs.register(JOB_KEYS.DAILY_ADMIN_REFRESH, async () => {
      const config = await getAdminConfig(ctx);
      if (!config.jobsEnabled) return;
      await runSyncAll(ctx, { mode: "full", applyRules: true }, { reason: JOB_KEYS.DAILY_ADMIN_REFRESH });
    });

    ctx.events.on("agent.run.finished", async event => {
      try {
        await generateDailyBriefing(ctx, { refresh: true }, "agent.run.finished");
        await logActivity(ctx, event.companyId, "Daily briefing refreshed after agent run", { entityId: event.entityId, entityType: event.entityType });
      } catch (error) {
        ctx.logger.error("Failed to refresh daily briefing after agent run", { error: error instanceof Error ? error.message : String(error) });
      }
    });

    ctx.tools.register(TOOL_KEYS.SYNC_GMAIL, toolSchemas[TOOL_KEYS.SYNC_GMAIL], async params => {
      const input = isObject(params) ? params : {};
      const result = input.mode === "full" ? await runGmailFullSync(ctx, {}, { reason: "tool" }) : await runGmailIncrementalSync(ctx, {}, { reason: "tool" });
      return { content: `Gmail sync complete`, data: result };
    });
    ctx.tools.register(TOOL_KEYS.SYNC_CALENDAR, toolSchemas[TOOL_KEYS.SYNC_CALENDAR], async params => {
      const input = isObject(params) ? params : {};
      const result = input.mode === "full" ? await runCalendarFullSync(ctx, {}, { reason: "tool" }) : await runCalendarIncrementalSync(ctx, {}, { reason: "tool" });
      return { content: `Calendar sync complete`, data: result };
    });
    ctx.tools.register(TOOL_KEYS.RUN_RULES, toolSchemas[TOOL_KEYS.RUN_RULES], async params => {
      const input = isObject(params) ? params : {};
      const result = await runRulesEngine(ctx, { applyRemote: input.applyRemote !== false }, { reason: "tool" });
      return { content: `Rules processed ${result.matchedCount ?? 0} matches`, data: result };
    });
    ctx.tools.register(TOOL_KEYS.GENERATE_BRIEFING, toolSchemas[TOOL_KEYS.GENERATE_BRIEFING], async params => {
      const input = isObject(params) ? params : {};
      const result = await generateDailyBriefing(ctx, { date: input.date, refresh: true }, "tool");
      return { content: `Daily briefing generated for ${result.briefing.date}`, data: result };
    });
    ctx.tools.register(TOOL_KEYS.REPLY_TO_EMAIL, toolSchemas[TOOL_KEYS.REPLY_TO_EMAIL], async params => {
      const input = isObject(params) ? params : {};
      const result = await runGmailReply(ctx, { id: input.id, body: input.body, subject: input.subject }, { reason: "tool" });
      if (!result.success) return { error: String(result.reason ?? "reply_failed"), data: result };
      return { content: `Reply sent`, data: result };
    });

    ctx.logger.info("Personal Admin plugin initialized", { pluginId: PLUGIN_ID, featureSet: "integrated-admin-console" });
  },

  async onHealth() {
    return {
      status: "ok",
      details: {
        pluginId: PLUGIN_ID,
        featureSet: "integrated-admin-console",
      },
    };
  },
});

export default plugin;
