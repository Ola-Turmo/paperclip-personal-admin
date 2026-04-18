export type InboxSource = "email" | "sms" | "signal" | "discord" | "gmail" | "manual" | "other";
export type TriageStatus = "pending" | "action" | "delegate" | "defer" | "done";
export type Priority = "low" | "medium" | "high" | "urgent";
export type RenewalType = "insurance" | "subscription" | "license" | "membership" | "contract" | "other";
export type DocumentType = "legal" | "financial" | "medical" | "insurance" | "property" | "identity" | "other";
export type BillingCycle = "monthly" | "quarterly" | "yearly";
export type ErrandCategory = "shopping" | "bureaucracy" | "repair" | "health" | "other";
export type BriefingCategory = "inbox" | "errands" | "meetings" | "renewals" | "habits" | "general" | "sync";
export type BackupStatus = "ok" | "warning" | "fail" | "never";
export type BackupFrequency = "daily" | "weekly" | "monthly";
export type RuleOperator = "contains" | "not_contains" | "equals" | "not_equals" | "starts_with" | "ends_with" | "in" | "exists" | "true" | "false";
export type RuleMatchMode = "all" | "any";
export type RuleField = "source" | "from" | "subject" | "snippet" | "content" | "priority" | "triageStatus" | "labels" | "tags" | "unread";

export interface InboxItem {
  id: string;
  content: string;
  source: InboxSource;
  receivedAt: string;
  triageStatus: TriageStatus;
  triageNotes?: string;
  relatedItems: string[];
  priority: Priority;
  deferUntil?: string;
  lastTriagedAt?: string;
  subject?: string;
  from?: string;
  to?: string;
  snippet?: string;
  threadId?: string;
  externalId?: string;
  messageIdHeader?: string;
  labels: string[];
  tags: string[];
  unread: boolean;
  starred?: boolean;
  archived?: boolean;
  ruleMatches: string[];
  autoRepliedAt?: string;
  syncedAt?: string;
}

export interface InboxRuleCondition {
  field: RuleField;
  operator: RuleOperator;
  value?: string;
}

export interface InboxRuleActionSet {
  triageStatus?: Exclude<TriageStatus, "pending">;
  priority?: Priority;
  addTags?: string[];
  archive?: boolean;
  markRead?: boolean;
  star?: boolean;
  deferDays?: number;
  appendNote?: string;
  autoReplyTemplate?: string;
}

export interface InboxRule {
  id: string;
  name: string;
  enabled: boolean;
  appliesTo: "all" | "gmail" | "manual";
  matchMode: RuleMatchMode;
  stopProcessing: boolean;
  conditions: InboxRuleCondition[];
  actions: InboxRuleActionSet;
  lastAppliedAt?: string;
}

export interface CalendarPrepItem {
  id: string;
  meetingId?: string;
  calendarEventId?: string;
  attendeeName: string;
  meetingTitle?: string;
  agenda?: string;
  myTalkingPoints: string[];
  questionsToAsk: string[];
  followUpTasks: string[];
  prepCompleted: boolean;
  prepDate: string;
  notes?: string;
  source?: "manual" | "calendar";
}

export interface Meeting {
  id: string;
  externalEventId?: string;
  calendarId?: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  attendees: string[];
  notes?: string;
  prepItemId?: string;
  location?: string;
  meetingLink?: string;
  source?: "manual" | "calendar";
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  externalId: string;
  title: string;
  description?: string;
  status: string;
  startAt: string;
  endAt?: string;
  allDay: boolean;
  location?: string;
  attendees: string[];
  organizer?: string;
  meetingLink?: string;
  syncedAt: string;
  prepItemId?: string;
}

export interface Renewal {
  id: string;
  name: string;
  type: RenewalType;
  renewalDate: string;
  cost?: number;
  currency?: string;
  autoRenew: boolean;
  reminderSent: boolean;
  notes: string;
  lastRenewedAt?: string;
}

export interface Document {
  id: string;
  name: string;
  type: DocumentType;
  expiryDate?: string;
  issuingAuthority?: string;
  documentRef?: string;
  uploadedAt: string;
  notes: string;
  renewedAt?: string;
}

export interface Subscription {
  id: string;
  name: string;
  provider: string;
  cost: number;
  currency: string;
  billingCycle: BillingCycle;
  nextBillingDate: string;
  active: boolean;
  category: string;
  cancelAtPeriodEnd: boolean;
  notes: string;
  cancelledAt?: string;
}

export interface Errand {
  id: string;
  description: string;
  location?: string;
  dueDate?: string;
  priority: Exclude<Priority, "urgent">;
  completed: boolean;
  completedAt?: string;
  category: ErrandCategory;
  notes: string;
}

export interface WeeklyReview {
  id: string;
  weekOf: string;
  startedAt: string;
  completedAt?: string;
  sections: {
    wins: string;
    blockers: string;
    nextWeekGoals: string;
    habitsScore: number;
    energyScore: number;
  };
}

export interface DailyBriefing {
  id: string;
  date: string;
  items: BriefingItem[];
  generatedAt: string;
}

export interface BriefingItem {
  id: string;
  category: BriefingCategory;
  content: string;
  priority: Exclude<Priority, "urgent"> | "high";
  completed: boolean;
}

export interface FileCleanupTask {
  id: string;
  path: string;
  description: string;
  ageDays: number;
  sizeMb?: number;
  safeToDelete: boolean;
  completed: boolean;
  completedAt?: string;
}

export interface BackupCheck {
  id: string;
  name: string;
  target: string;
  lastCheckedAt?: string;
  lastStatus: BackupStatus;
  frequency: BackupFrequency;
  nextDue: string;
  notes: string;
}

export interface SyncBranchStatus {
  enabled: boolean;
  configured: boolean;
  lastFullSyncAt?: string;
  lastIncrementalSyncAt?: string;
  lastError?: string;
}

export interface GmailSyncStatus extends SyncBranchStatus {
  historyId?: string;
  inboxCount: number;
  lastReplyAt?: string;
}

export interface CalendarSyncCalendarStatus {
  calendarId: string;
  syncToken?: string;
  lastSyncAt?: string;
  lastError?: string;
  eventCount: number;
}

export interface CalendarSyncStatus extends SyncBranchStatus {
  calendars: Record<string, CalendarSyncCalendarStatus>;
  eventCount: number;
}

export interface RuleEngineStatus {
  lastRunAt?: string;
  lastRuleId?: string;
  lastMatchCount: number;
}

export interface SyncState {
  gmail: GmailSyncStatus;
  calendar: CalendarSyncStatus;
  rules: RuleEngineStatus;
}

export interface AdminDashboardData {
  sync: SyncState;
  inbox: {
    total: number;
    pending: number;
    urgent: number;
    recent: InboxItem[];
  };
  meetings: {
    upcoming: number;
    items: Meeting[];
  };
  calendarEvents: CalendarEvent[];
  rules: InboxRule[];
  renewalsDue: Renewal[];
  errandsOpen: Errand[];
  latestBriefing?: DailyBriefing;
  configHints: string[];
}

export interface GoogleAuthConfig {
  clientId: string;
  clientSecretRef: string;
  refreshTokenRef: string;
}

export interface AdminConfig {
  gmailEnabled: boolean;
  gmailUserId: string;
  gmailQuery?: string;
  gmailMaxResults: number;
  gmailAutoReplyEnabled: boolean;
  gmailReplySignature?: string;
  calendarEnabled: boolean;
  calendarIds: string[];
  calendarLookaheadDays: number;
  calendarLookbackDays: number;
  calendarPrepLeadDays: number;
  jobsEnabled: boolean;
  rulesEnabled: boolean;
  googleAuth?: GoogleAuthConfig;
  configHints: string[];
}

export interface GoogleMessageHeader {
  name: string;
  value: string;
}

export interface GoogleMessagePayload {
  headers?: GoogleMessageHeader[];
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GoogleMessagePayload[];
}

export interface GoogleGmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  payload?: GoogleMessagePayload;
}

export interface GoogleGmailHistoryResponse {
  history?: Array<{
    id?: string;
    messages?: Array<{ id?: string; threadId?: string }>;
    messagesAdded?: Array<{ message?: { id?: string; threadId?: string } }>;
    messagesDeleted?: Array<{ message?: { id?: string; threadId?: string } }>;
    labelsAdded?: Array<{ message?: { id?: string; threadId?: string } }>;
    labelsRemoved?: Array<{ message?: { id?: string; threadId?: string } }>;
  }>;
  historyId?: string;
  nextPageToken?: string;
}

export interface GoogleCalendarEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  hangoutLink?: string;
  attendees?: Array<{ email?: string; displayName?: string; responseStatus?: string }>;
  organizer?: { email?: string; displayName?: string };
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}
