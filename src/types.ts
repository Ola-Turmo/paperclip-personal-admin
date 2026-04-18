export interface InboxItem {
  id: string;
  content: string;
  source: "email" | "sms" | "signal" | "discord" | "other";
  receivedAt: string;
  triageStatus: "pending" | "action" | "delegate" | "defer" | "done";
  triageNotes?: string;
  relatedItems: string[]; // other inbox item ids
  priority: "low" | "medium" | "high" | "urgent";
}

export interface InboxRule {
  id: string;
  name: string;
  conditions: { field: string; operator: string; value: string }[];
  action: "action" | "delegate" | "defer" | "done";
  deferUntil?: string;
}

export interface CalendarPrepItem {
  id: string;
  meetingId?: string;
  attendeeName: string;
  agenda?: string;
  myTalkingPoints: string[];
  questionsToAsk: string[];
  followUpTasks: string[];
  prepCompleted: boolean;
  prepDate: string;
}

export interface Meeting {
  id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  attendees: string[];
  notes?: string;
}

export interface Renewal {
  id: string;
  name: string;
  type: "insurance" | "subscription" | "license" | "membership" | "contract" | "other";
  renewalDate: string;
  cost?: number;
  currency?: string;
  autoRenew: boolean;
  reminderSent: boolean;
  notes: string;
}

export interface Document {
  id: string;
  name: string;
  type: "legal" | "financial" | "medical" | "insurance" | "property" | "identity" | "other";
  expiryDate?: string;
  issuingAuthority?: string;
  documentRef?: string; // reference number
  uploadedAt: string;
  notes: string;
}

export interface Subscription {
  id: string;
  name: string;
  provider: string;
  cost: number;
  currency: string;
  billingCycle: "monthly" | "quarterly" | "yearly";
  nextBillingDate: string;
  active: boolean;
  category: string;
  cancelAtPeriodEnd: boolean;
  notes: string;
}

export interface Errand {
  id: string;
  description: string;
  location?: string;
  dueDate?: string;
  priority: "low" | "medium" | "high";
  completed: boolean;
  completedAt?: string;
  category: "shopping" | " burocracy" | "repair" | "health" | "other";
  notes: string;
}

export interface WeeklyReview {
  id: string;
  weekOf: string; // YYYY-Www
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
  category: "inbox" | "errands" | "meetings" | "renewals" | "habits" | "general";
  content: string;
  priority: "low" | "medium" | "high";
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
  lastStatus: "ok" | "warning" | "fail" | "never";
  frequency: "daily" | "weekly" | "monthly";
  nextDue: string;
  notes: string;
}
