# PRD: paperclip-personal-admin

## 1. Product Intent

Integrated personal operations plugin for Paperclip — a single control layer for Gmail triage, Google Calendar meeting prep, renewals, document tracking, subscriptions, errands, weekly reviews, cleanup work, backup checks, and daily briefings.

## 2. Problem

Personal admin breaks because the work is fragmented:
- Gmail holds action items that never become a queue
- calendars fill up without structured prep
- renewals and documents expire quietly
- subscriptions keep charging because nobody reviews them
- errands, cleanup work, and backup hygiene stay invisible until they hurt

Paperclip needs a plugin that does more than store notes — it needs one that syncs operational inputs, applies rules, keeps state current, and exposes a UI the user can actually run their life from.

## 3. Target User

Single primary operator (Ola) managing personal life admin with Paperclip.

## 4. Current Scope

### Inbox + Gmail
- Gmail full sync and incremental sync
- Unified inbox state for synced Gmail messages and manual items
- Advanced rules for auto-triage
- Optional guarded Gmail auto-reply
- Remote Gmail actions for mark-read, star, and archive

### Calendar + Meeting Prep
- Google Calendar full sync and incremental sync
- Synced calendar events stored in plugin state
- Automatic meeting records and prep items generated from events
- Manual meeting prep enrichment and follow-up tracking

### Core Personal Admin Domains
- Renewal reminders
- Document tracking
- Subscription tracking and cancellation state
- Errands queue
- Weekly reviews
- Daily briefings
- File cleanup tasks
- Backup checks

### UI + Automation
- Full plugin page dashboard
- Dashboard widget
- Sidebar entry
- Scheduled sync jobs
- Ambient daily briefing refresh on `agent.run.finished`

## 5. Architecture

```text
Personal Admin Plugin
├── Instance-scoped state
│   ├── inbox + rules
│   ├── calendar events + meeting prep
│   ├── personal admin records (renewals, docs, subscriptions, errands, reviews)
│   └── sync status / cursors
├── Worker actions
│   ├── CRUD-style personal admin actions
│   ├── Gmail sync + reply actions
│   ├── Calendar sync actions
│   ├── rules engine
│   └── dashboard / briefing orchestration
├── Jobs
│   ├── gmail-incremental-sync
│   ├── calendar-incremental-sync
│   └── daily-admin-refresh
├── UI
│   ├── page dashboard
│   ├── dashboard widget
│   └── sidebar link
└── Integrations
    ├── Google OAuth refresh-token auth
    ├── Gmail REST API
    └── Google Calendar REST API
```

## 6. State Schema

| Namespace | Content |
|---|---|
| `admin.inboxItems` | Unified InboxItem[] including Gmail-synced messages |
| `admin.inboxRules` | InboxRule[] |
| `admin.calendarEvents` | CalendarEvent[] |
| `admin.calendarPrepItems` | CalendarPrepItem[] |
| `admin.meetings` | Meeting[] |
| `admin.renewals` | Renewal[] |
| `admin.documents` | Document[] |
| `admin.subscriptions` | Subscription[] |
| `admin.errands` | Errand[] |
| `admin.weeklyReviews` | WeeklyReview[] |
| `admin.dailyBriefings` | DailyBriefing[] |
| `admin.fileCleanupTasks` | FileCleanupTask[] |
| `admin.backupChecks` | BackupCheck[] |
| `admin.syncState` | SyncState |

## 7. Action Surface

| Area | Actions |
|---|---|
| Inbox | `add-inbox-item`, `triage-inbox-item`, `get-inbox`, `clear-inbox` |
| Rules | `upsert-rule`, `delete-rule`, `get-rules`, `run-rules` |
| Gmail | `gmail-full-sync`, `gmail-incremental-sync`, `gmail-reply` |
| Calendar prep | `add-calendar-prep`, `get-calendar-prep`, `prep-meeting`, `get-calendar-events` |
| Calendar sync | `calendar-full-sync`, `calendar-incremental-sync` |
| Renewals | `add-renewal`, `get-renewals`, `check-renewals` |
| Documents | `add-document`, `get-documents`, `renew-document` |
| Subscriptions | `add-subscription`, `get-subscriptions`, `cancel-subscription` |
| Errands | `add-errand`, `complete-errand`, `get-errands` |
| Weekly reviews | `start-weekly-review`, `complete-weekly-review`, `get-weekly-reviews` |
| Briefing / orchestration | `get-daily-briefing`, `add-briefing-item`, `get-sync-status`, `sync-all` |
| File cleanup | `add-file-cleanup-task`, `get-file-cleanup-tasks`, `complete-file-cleanup` |
| Backup checks | `add-backup-check`, `get-backup-checks`, `run-backup-check` |

## 8. UI Surface

- **Page:** full Personal Admin command center
- **Dashboard widget:** at-a-glance sync + workload summary
- **Sidebar entry:** quick navigation into the plugin

## 9. Agent Tool Surface

- `sync_gmail`
- `sync_calendar`
- `run_rules`
- `generate_briefing`
- `reply_to_email`

## 10. Scheduled Jobs

- **Gmail incremental sync** every 10 minutes
- **Calendar incremental sync** every 15 minutes
- **Daily admin refresh** daily at 06:00

## 11. Configuration Model

The host stores operator-edited instance config. The plugin resolves secret references at runtime for:
- Google client secret
- Google refresh token

The plugin intentionally does **not** persist resolved secret values.

## 12. Non-Goals

- Norwegian public-sector portal integrations
- Bank-feed-based subscription discovery
- Live VPS/cloud backup provider polling
- Multi-user collaboration features
- Host-managed OAuth callback flow that writes secrets for the user

## 13. Definition of Done

- Plugin builds, typechecks, and passes tests
- Manifest declares worker + UI entrypoints, jobs, tools, capabilities, and config schema
- Gmail full/incremental sync works against the implemented API adapter
- Calendar full/incremental sync works against the implemented API adapter
- Rules engine supports advanced matching and guarded auto-reply
- UI page + widget expose sync health and operational state
- Daily briefings include synced operational context
- PRD and README accurately reflect the shipped product
