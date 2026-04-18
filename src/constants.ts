export const PLUGIN_ID = "personal-admin";

export const DATA_KEYS = {
  // Inbox
  INBOX_ITEMS: "admin.inboxItems",
  INBOX_RULES: "admin.inboxRules",

  // Calendar
  CALENDAR_PREP_ITEMS: "admin.calendarPrepItems",
  MEETINGS: "admin.meetings",

  // Renewals
  RENEWALS: "admin.renewals",

  // Documents
  DOCUMENTS: "admin.documents",

  // Subscriptions
  SUBSCRIPTIONS: "admin.subscriptions",

  // Errands
  ERRANDS: "admin.errands",

  // Weekly reviews
  WEEKLY_REVIEWS: "admin.weeklyReviews",

  // Daily briefings
  DAILY_BRIEFINGS: "admin.dailyBriefings",

  // File cleanup
  FILE_CLEANUP_TASKS: "admin.fileCleanupTasks",
  BACKUP_CHECKS: "admin.backupChecks",
} as const;

export const ACTION_KEYS = {
  // Inbox
  ADD_INBOX_ITEM: "admin.add-inbox-item",
  TRIAGE_INBOX_ITEM: "admin.triage-inbox-item",
  GET_INBOX: "admin.get-inbox",
  CLEAR_INBOX: "admin.clear-inbox",

  // Calendar prep
  ADD_CALENDAR_PREP: "admin.add-calendar-prep",
  GET_CALENDAR_PREP: "admin.get-calendar-prep",
  PREP_MEETING: "admin.prep-meeting",

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

  // Daily briefings
  GET_DAILY_BRIEFING: "admin.get-daily-briefing",
  ADD_BRIEFING_ITEM: "admin.add-briefing-item",

  // File cleanup
  ADD_FILE_CLEANUP_TASK: "admin.add-file-cleanup-task",
  GET_FILE_CLEANUP_TASKS: "admin.get-file-cleanup-tasks",
  COMPLETE_FILE_CLEANUP: "admin.complete-file-cleanup",

  // Backup checks
  ADD_BACKUP_CHECK: "admin.add-backup-check",
  GET_BACKUP_CHECKS: "admin.get-backup-checks",
  RUN_BACKUP_CHECK: "admin.run-backup-check",
} as const;
