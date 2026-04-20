---
name: personal-admin-ops
description: Use for real personal-admin operations involving Gmail, Google Calendar, renewals, errands, briefings, cleanup, backups, or any task where Paperclip is acting as the operator of Ola’s actual personal admin stack rather than a generic task list.
---

# Personal Admin Ops

Use this skill when working on the real Personal Admin product or using it as the personal operating layer.

## Read First

Read these files in order:

1. `README.md`
2. `PRD.md`
3. `src/manifest.ts`
4. `src/worker.ts`

Then inspect the specific surface:

- UI: `src/ui/`
- tests: `tests/`
- visuals and product framing: `assets/`

## What This Repo Owns

This repo owns the personal admin operating system for:

- inbox and rule-driven triage
- calendar sync and meeting prep
- renewals, documents, subscriptions, and errands
- briefings, cleanup, and backup awareness

## Working Rules

- Optimize for real operational calm, not activity theater.
- Prefer reliable automation and reversible actions.
- Treat email replies, archive rules, and cleanup automations as potentially user-visible actions.
- Keep privacy and secret handling explicit.

## Non-Negotiable Guardrails

- Never expose raw credentials or secret values in logs, screenshots, or repo files.
- Guarded replies should stay clearly bounded.
- The system should reduce admin load without becoming noisy or brittle.

## Default Workflow

1. Identify the operational surface.
   Gmail, Calendar, renewals, errands, documents, briefings, cleanup, or backups.

2. Verify the source of truth.
   Sync status and persisted state matter more than optimistic UI assumptions.

3. Fix the durable workflow before tuning presentation.

4. Verify the job and dashboard implications.
   Personal Admin is both a plugin and an ongoing operating substrate.

## Expected Outcomes

Good work in this repo should make the personal system:

- calmer
- more reliable
- less repetitive
- more legible when something fails
