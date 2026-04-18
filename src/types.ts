export type InboxSource = "email" | "sms" | "signal" | "discord" | "other";
export type TriageStatus = "pending" | "action" | "delegate" | "defer" | "done";
export type Priority = "low" | "medium" | "high" | "urgent";
export type RenewalType = "insurance" | "subscription" | "license" | "membership" | "contract" | "other";
export type DocumentType = "legal" | "financial" | "medical" | "insurance" | "property" | "identity" | "other";
export type BillingCycle = "monthly" | "quarterly" | "yearly";
export type ErrandCategory = "shopping" | "bureaucracy" | "repair" | "health" | "other";
export type BriefingCategory = "inbox" | "errands" | "meetings" | "renewals" | "habits" | "general";
export type BackupStatus = "ok" | "warning" | "fail" | "never";
export type BackupFrequency = "daily" | "weekly" | "monthly";

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
}

export interface InboxRule {
  id: string;
  name: string;
  conditions: { field: string; operator: string; value: string }[];
  action: Exclude<TriageStatus, "pending">;
  deferUntil?: string;
}

export interface CalendarPrepItem {
  id: string;
  meetingId?: string;
  attendeeName: string;
  meetingTitle?: string;
  agenda?: string;
  myTalkingPoints: string[];
  questionsToAsk: string[];
  followUpTasks: string[];
  prepCompleted: boolean;
  prepDate: string;
  notes?: string;
}

export interface Meeting {
  id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  attendees: string[];
  notes?: string;
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
