# PRD: paperclip-personal-admin

## 1. Product Intent

Personal admin and productivity plugin for Paperclip — a unified layer for inbox triage, calendar prep, renewals, document tracking, subscription management, errands, weekly reviews, and daily briefings. Turns scattered admin into an AI-operable system.

## 2. Problem

Admin piles up: emails go untriaged, appointments lack prep, subscriptions renew silently, errands get forgotten, files accumulate, backups are never checked. There's no unified personal admin layer that an AI agent can actually operate on.

## 3. Target Users

Single user (Ola) managing personal life admin.

## 4. Features (MVP Scope)

### Now
- **Inbox triage** — add items from any source (email, SMS, Signal, Discord), triage to action/delegate/defer/done, clear inbox
- **Calendar prep** — generate talking points, questions, and follow-ups per meeting
- **Renewal reminders** — track insurance, licenses, memberships; check upcoming renewals
- **Document tracking** — store legal, financial, medical, identity documents with expiry dates
- **Subscription management** — track active subscriptions, billing dates, costs; flag cancellations
- **Errands queue** — add, prioritize, complete errands with location and due date
- **Weekly reviews** — structured weekly review with wins, blockers, next-week goals, habit/energy scores
- **Daily briefings** — auto-generated morning briefing from inbox, errands, meetings, renewals
- **File cleanup tasks** — track old files due for cleanup, mark complete
- **Backup checks** — register backup targets, check status, track failures

## 5. Architecture

```
Personal Admin Plugin
├── State: instance-scoped (per-plugin persistent storage)
├── Actions: one per feature (add, get, triage, complete, check)
├── Events: subscribes to agent.run.finished for ambient briefing generation
└── Integrations (future): Gmail/email, calendar APIs, Norwegian governmental portals
```

## 6. State Schema

| Namespace | Content |
|---|---|
| `admin.inboxItems` | InboxItem[] |
| `admin.inboxRules` | InboxRule[] |
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

## 7. Integrations (Future)

| Source | Data |
|---|---|
| Gmail | inbox sync, auto-triage rules |
| Google Calendar | meeting data, auto-generate prep |
| Norwegian government portals | license renewals, documents |
| Bank APIs | subscription detection |
| VPS/cloud providers | backup status checks |

## 8. Non-Goals

- Email sending or automated replies
- Financial transaction categorization (use finance plugin)
- Medical advice
- Legal document generation

## 9. Definition of Done

- Plugin builds, typechecks, and passes tests
- Manifest declares all actions
- Each action reads/writes correct state namespace
- PRD is current and reflects what was built
