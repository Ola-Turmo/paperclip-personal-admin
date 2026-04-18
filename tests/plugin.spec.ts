import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/plugin.js";
import { ACTION_KEYS, DATA_KEYS } from "../src/constants.js";
import type { BackupCheck, DailyBriefing, Document, InboxItem, Subscription, WeeklyReview } from "../src/types.js";

async function setupHarness() {
  const harness = createTestHarness({ manifest });
  await plugin.definition.setup(harness.ctx);
  return harness;
}

describe("Personal Admin plugin", () => {
  it("covers inbox triage, meeting prep, renewals, errands, and daily briefing synthesis", async () => {
    const harness = await setupHarness();

    const inboxAdd = await harness.performAction<{ item: InboxItem }>(ACTION_KEYS.ADD_INBOX_ITEM, {
      content: "Insurance renewal email",
      source: "email",
      priority: "urgent",
    });

    await harness.performAction(ACTION_KEYS.TRIAGE_INBOX_ITEM, {
      id: inboxAdd.item.id,
      status: "action",
      notes: "Call insurer",
    });

    await harness.performAction(ACTION_KEYS.ADD_INBOX_ITEM, {
      content: "SMS from dentist",
      source: "sms",
      priority: "high",
    });

    const prepResult = await harness.performAction<{ prep: { id: string; meetingId?: string } }>(ACTION_KEYS.ADD_CALENDAR_PREP, {
      attendeeName: "Accountant",
      title: "Quarterly tax check-in",
      scheduledAt: "2026-04-18T10:00:00.000Z",
      talkingPoints: ["Ask about deductions"],
      questions: ["What documents are missing?"],
    });

    await harness.performAction(ACTION_KEYS.PREP_MEETING, {
      id: prepResult.prep.id,
      followUpTasks: ["Send receipts"],
    });

    await harness.performAction(ACTION_KEYS.ADD_RENEWAL, {
      name: "Travel insurance",
      type: "insurance",
      renewalDate: "2026-04-20",
      autoRenew: true,
    });

    await harness.performAction(ACTION_KEYS.ADD_ERRAND, {
      description: "Pick up passport photos",
      dueDate: "2026-04-18",
      priority: "high",
      category: "bureaucracy",
    });

    await harness.performAction(ACTION_KEYS.ADD_FILE_CLEANUP_TASK, {
      path: "/archive/old-downloads",
      description: "Archive unused installers",
      ageDays: 180,
      safeToDelete: true,
    });

    const backupResult = await harness.performAction<{ check: BackupCheck }>(ACTION_KEYS.ADD_BACKUP_CHECK, {
      name: "Laptop Time Machine",
      target: "macbook-air",
      frequency: "weekly",
      nextDue: "2026-04-18",
    });

    await harness.performAction(ACTION_KEYS.RUN_BACKUP_CHECK, {
      id: backupResult.check.id,
      status: "fail",
      checkedAt: "2026-04-18T06:00:00.000Z",
      notes: "Disk not mounted",
    });

    const briefingResult = await harness.performAction<{ briefing: DailyBriefing; summary: { source: string } }>(ACTION_KEYS.GET_DAILY_BRIEFING, {
      date: "2026-04-18",
      refresh: true,
    });

    expect(briefingResult.summary.source).toBe("generated");
    expect(briefingResult.briefing.items.map(item => item.category)).toEqual(
      expect.arrayContaining(["inbox", "errands", "meetings", "renewals", "general"]),
    );

    const inboxState = harness.getState({ scopeKind: "instance", stateKey: DATA_KEYS.INBOX_ITEMS }) as InboxItem[];
    expect(inboxState).toHaveLength(2);
    expect(inboxState.some(item => item.triageStatus === "action")).toBe(true);

    const meetingsState = harness.getState({ scopeKind: "instance", stateKey: DATA_KEYS.MEETINGS }) as Array<{ prepItemId?: string }>;
    expect(meetingsState[0]?.prepItemId).toBe(prepResult.prep.id);

    const storedBriefings = harness.getState({ scopeKind: "instance", stateKey: DATA_KEYS.DAILY_BRIEFINGS }) as DailyBriefing[];
    expect(storedBriefings).toHaveLength(1);
    expect(storedBriefings[0]?.date).toBe("2026-04-18");
  });

  it("handles document, subscription, weekly review, and cleanup lifecycles", async () => {
    const harness = await setupHarness();

    const documentResult = await harness.performAction<{ document: Document }>(ACTION_KEYS.ADD_DOCUMENT, {
      name: "Passport",
      type: "identity",
      expiryDate: "2026-05-01",
      issuingAuthority: "Police",
    });

    const renewedDocument = await harness.performAction<{ success: boolean; document: Document }>(ACTION_KEYS.RENEW_DOCUMENT, {
      id: documentResult.document.id,
      newExpiryDate: "2031-05-01",
      notes: "Renewed at district office",
    });

    expect(renewedDocument.success).toBe(true);
    expect(renewedDocument.document.expiryDate).toBe("2031-05-01");
    expect(renewedDocument.document.renewedAt).toBeTruthy();

    const subscriptionResult = await harness.performAction<{ subscription: Subscription }>(ACTION_KEYS.ADD_SUBSCRIPTION, {
      name: "Gym membership",
      provider: "SATS",
      cost: 699,
      billingCycle: "monthly",
      nextBillingDate: "2026-05-01",
    });

    const cancelledSubscription = await harness.performAction<{ subscription: Subscription }>(ACTION_KEYS.CANCEL_SUBSCRIPTION, {
      id: subscriptionResult.subscription.id,
      immediate: true,
      notes: "Paused for summer",
    });

    expect(cancelledSubscription.subscription.cancelAtPeriodEnd).toBe(true);
    expect(cancelledSubscription.subscription.active).toBe(false);

    const startedReview = await harness.performAction<{ review: WeeklyReview; reused: boolean }>(ACTION_KEYS.START_WEEKLY_REVIEW, {
      startedAt: "2026-04-18T07:00:00.000Z",
    });

    expect(startedReview.reused).toBe(false);

    const completedReview = await harness.performAction<{ review: WeeklyReview }>(ACTION_KEYS.COMPLETE_WEEKLY_REVIEW, {
      id: startedReview.review.id,
      sections: {
        wins: "Closed every admin loop",
        blockers: "Waiting for a bank letter",
        nextWeekGoals: "Renew passport and archive files",
        habitsScore: 4,
        energyScore: 3,
      },
    });

    expect(completedReview.review.completedAt).toBeTruthy();
    expect(completedReview.review.sections.habitsScore).toBe(4);

    const cleanupTask = await harness.performAction<{ task: { id: string } }>(ACTION_KEYS.ADD_FILE_CLEANUP_TASK, {
      path: "/tmp/downloads",
      description: "Delete stale uploads",
      safeToDelete: true,
      ageDays: 120,
    });
    await harness.performAction(ACTION_KEYS.COMPLETE_FILE_CLEANUP, { id: cleanupTask.task.id });

    const documentsState = harness.getState({ scopeKind: "instance", stateKey: DATA_KEYS.DOCUMENTS }) as Document[];
    const subscriptionsState = harness.getState({ scopeKind: "instance", stateKey: DATA_KEYS.SUBSCRIPTIONS }) as Subscription[];
    const reviewsState = harness.getState({ scopeKind: "instance", stateKey: DATA_KEYS.WEEKLY_REVIEWS }) as WeeklyReview[];
    const cleanupState = harness.getState({ scopeKind: "instance", stateKey: DATA_KEYS.FILE_CLEANUP_TASKS }) as Array<{ completed: boolean }>;

    expect(documentsState[0]?.expiryDate).toBe("2031-05-01");
    expect(subscriptionsState[0]?.active).toBe(false);
    expect(reviewsState[0]?.completedAt).toBeTruthy();
    expect(cleanupState[0]?.completed).toBe(true);
  });

  it("checks renewals and refreshes briefing when agent runs finish", async () => {
    const harness = await setupHarness();

    await harness.performAction(ACTION_KEYS.ADD_RENEWAL, {
      name: "Driver license",
      type: "license",
      renewalDate: "2026-04-10",
    });
    await harness.performAction(ACTION_KEYS.ADD_INBOX_ITEM, {
      content: "Reply to insurance follow-up",
      source: "email",
      priority: "high",
    });

    const renewalCheck = await harness.performAction<{ summary: { overdue: number; reminderMarked: number } }>(ACTION_KEYS.CHECK_RENEWALS, {
      days: 30,
      markReminderSent: true,
    });

    expect(renewalCheck.summary.overdue).toBe(1);
    expect(renewalCheck.summary.reminderMarked).toBe(1);

    await harness.emit("agent.run.finished", { runId: "run_123" }, {
      entityId: "run_123",
      entityType: "run",
      companyId: "company_1",
    });

    const briefings = harness.getState({ scopeKind: "instance", stateKey: DATA_KEYS.DAILY_BRIEFINGS }) as DailyBriefing[];
    expect(briefings).toHaveLength(1);
    expect(briefings[0]?.items.some(item => item.category === "inbox")).toBe(true);

    const renewalsState = harness.getState({ scopeKind: "instance", stateKey: DATA_KEYS.RENEWALS }) as Array<{ reminderSent: boolean }>;
    expect(renewalsState[0]?.reminderSent).toBe(true);
  });
});
