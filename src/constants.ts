export const PLUGIN_ID = "personal-admin";

export const DATA_KEYS = {
  // Unified inbox + rules
  INBOX_ITEMS: "admin.inboxItems",
  INBOX_RULES: "admin.inboxRules",

  // Calendar + meeting prep
  CALENDAR_EVENTS: "admin.calendarEvents",
  CALENDAR_PREP_ITEMS: "admin.calendarPrepItems",
  MEETINGS: "admin.meetings",

  // Existing personal-admin domains
  RENEWALS: "admin.renewals",
  DOCUMENTS: "admin.documents",
  SUBSCRIPTIONS: "admin.subscriptions",
  ERRANDS: "admin.errands",
  WEEKLY_REVIEWS: "admin.weeklyReviews",
  DAILY_BRIEFINGS: "admin.dailyBriefings",
  FILE_CLEANUP_TASKS: "admin.fileCleanupTasks",
  BACKUP_CHECKS: "admin.backupChecks",

  // Integration/runtime state
  SYNC_STATE: "admin.syncState",
} as const;

export const ACTION_KEYS = {
  // Inbox + rules
  ADD_INBOX_ITEM: "admin.add-inbox-item",
  TRIAGE_INBOX_ITEM: "admin.triage-inbox-item",
  GET_INBOX: "admin.get-inbox",
  CLEAR_INBOX: "admin.clear-inbox",
  UPSERT_RULE: "admin.upsert-rule",
  DELETE_RULE: "admin.delete-rule",
  GET_RULES: "admin.get-rules",
  RUN_RULES: "admin.run-rules",

  // Gmail integration
  GMAIL_FULL_SYNC: "admin.gmail-full-sync",
  GMAIL_INCREMENTAL_SYNC: "admin.gmail-incremental-sync",
  GMAIL_REPLY: "admin.gmail-reply",

  // Calendar prep + Google Calendar integration
  ADD_CALENDAR_PREP: "admin.add-calendar-prep",
  GET_CALENDAR_PREP: "admin.get-calendar-prep",
  PREP_MEETING: "admin.prep-meeting",
  GET_CALENDAR_EVENTS: "admin.get-calendar-events",
  CALENDAR_FULL_SYNC: "admin.calendar-full-sync",
  CALENDAR_INCREMENTAL_SYNC: "admin.calendar-incremental-sync",

  // Renewals
  ADD_RENEWAL: "admin.add-renewal",
  GET_RENEWALS: "admin.get-renewals",
  CHECK_RENEWALS: "admin.check-renewals",

  // Documents
  ADD_DOCUMENT: "admin.add-document",
  GET_DOCUMENTS: "admin.get-documents",
  RENEW_DOCUMENT: "admin.renew-document",

  // Subscriptions
  ADD_SUBSCRIPTION: "admin.add-subscription",
  GET_SUBSCRIPTIONS: "admin.get-subscriptions",
  CANCEL_SUBSCRIPTION: "admin.cancel-subscription",

  // Errands
  ADD_ERRAND: "admin.add-errand",
  COMPLETE_ERRAND: "admin.complete-errand",
  GET_ERRANDS: "admin.get-errands",

  // Weekly reviews
  START_WEEKLY_REVIEW: "admin.start-weekly-review",
  COMPLETE_WEEKLY_REVIEW: "admin.complete-weekly-review",
  GET_WEEKLY_REVIEWS: "admin.get-weekly-reviews",

  // Daily briefings + orchestration
  GET_DAILY_BRIEFING: "admin.get-daily-briefing",
  ADD_BRIEFING_ITEM: "admin.add-briefing-item",
  GET_SYNC_STATUS: "admin.get-sync-status",
  SYNC_ALL: "admin.sync-all",

  // File cleanup
  ADD_FILE_CLEANUP_TASK: "admin.add-file-cleanup-task",
  GET_FILE_CLEANUP_TASKS: "admin.get-file-cleanup-tasks",
  COMPLETE_FILE_CLEANUP: "admin.complete-file-cleanup",

  // Backup checks
  ADD_BACKUP_CHECK: "admin.add-backup-check",
  GET_BACKUP_CHECKS: "admin.get-backup-checks",
  RUN_BACKUP_CHECK: "admin.run-backup-check",
} as const;

export const DATA_QUERY_KEYS = {
  DASHBOARD: "admin.dashboard",
  SYNC_STATUS: "admin.sync-status",
  RULES: "admin.rules",
} as const;

export const JOB_KEYS = {
  GMAIL_INCREMENTAL_SYNC: "gmail-incremental-sync",
  CALENDAR_INCREMENTAL_SYNC: "calendar-incremental-sync",
  DAILY_ADMIN_REFRESH: "daily-admin-refresh",
} as const;

export const TOOL_KEYS = {
  SYNC_GMAIL: "sync_gmail",
  SYNC_CALENDAR: "sync_calendar",
  RUN_RULES: "run_rules",
  GENERATE_BRIEFING: "generate_briefing",
  REPLY_TO_EMAIL: "reply_to_email",
} as const;

export const STREAM_KEYS = {
  ADMIN_UPDATES: "admin-updates",
} as const;
