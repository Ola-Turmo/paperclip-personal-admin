import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { ACTION_KEYS, DATA_KEYS } from "./constants.js";
import type { InboxItem, Errand, Renewal, Subscription, Document, WeeklyReview, DailyBriefing, CalendarPrepItem, FileCleanupTask, BackupCheck, BriefingItem } from "./types.js";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const INSTANCE = { scopeKind: "instance" as const };

async function getArr<T>(ctx: any, key: string): Promise<T[]> {
  const val = await ctx.state.get({ ...INSTANCE, stateKey: key });
  return (Array.isArray(val) ? val : []) as T[];
}

async function setArr<T>(ctx: any, key: string, val: T[]): Promise<void> {
  await ctx.state.set({ ...INSTANCE, stateKey: key }, val);
}

const plugin = definePlugin({
  async setup(ctx) {

    // ── Inbox ──────────────────────────────────────────────────
    ctx.actions.register(ACTION_KEYS.ADD_INBOX_ITEM, async (params: any) => {
      const item: InboxItem = { id: generateId(), content: params.content, source: params.source ?? "email", receivedAt: new Date().toISOString(), triageStatus: "pending", priority: params.priority ?? "medium", relatedItems: [] };
      const items = await getArr<InboxItem>(ctx, DATA_KEYS.INBOX_ITEMS);
      items.push(item);
      await setArr(ctx, DATA_KEYS.INBOX_ITEMS, items);
      return { success: true, id: item.id };
    });

    ctx.actions.register(ACTION_KEYS.TRIAGE_INBOX_ITEM, async (params: any) => {
      const items = await getArr<InboxItem>(ctx, DATA_KEYS.INBOX_ITEMS);
      const idx = items.findIndex(i => i.id === params.id);
      if (idx !== -1) {
        items[idx].triageStatus = params.status;
        items[idx].triageNotes = params.notes;
        await setArr(ctx, DATA_KEYS.INBOX_ITEMS, items);
      }
      return { success: true };
    });

    ctx.actions.register(ACTION_KEYS.GET_INBOX, async (params: any) => {
      const items = await getArr<InboxItem>(ctx, DATA_KEYS.INBOX_ITEMS);
      const status = params.status ?? "pending";
      return { items: status === "all" ? items : items.filter(i => i.triageStatus === status) };
    });

    ctx.actions.register(ACTION_KEYS.CLEAR_INBOX, async (params: any) => {
      const items = await getArr<InboxItem>(ctx, DATA_KEYS.INBOX_ITEMS);
      const cleared = items.filter(i => i.triageStatus !== "done");
      await setArr(ctx, DATA_KEYS.INBOX_ITEMS, params.keepDone ? items : cleared);
      return { success: true, remaining: cleared.length };
    });

    // ── Calendar prep ──────────────────────────────────────────
    ctx.actions.register(ACTION_KEYS.ADD_CALENDAR_PREP, async (params: any) => {
      const prep: CalendarPrepItem = { id: generateId(), attendeeName: params.attendeeName, agenda: params.agenda, myTalkingPoints: params.talkingPoints ?? [], questionsToAsk: params.questions ?? [], followUpTasks: params.followUpTasks ?? [], prepCompleted: false, prepDate: params.prepDate ?? new Date().toISOString().split("T")[0] };
      const preps = await getArr<CalendarPrepItem>(ctx, DATA_KEYS.CALENDAR_PREP_ITEMS);
      preps.push(prep);
      await setArr(ctx, DATA_KEYS.CALENDAR_PREP_ITEMS, preps);
      return { success: true, id: prep.id };
    });

    ctx.actions.register(ACTION_KEYS.GET_CALENDAR_PREP, async (params: any) => {
      const preps = await getArr<CalendarPrepItem>(ctx, DATA_KEYS.CALENDAR_PREP_ITEMS);
      const today = new Date().toISOString().split("T")[0];
      return { items: params.all ? preps : preps.filter(p => p.prepDate === today && !p.prepCompleted) };
    });

    ctx.actions.register(ACTION_KEYS.PREP_MEETING, async (params: any) => {
      const preps = await getArr<CalendarPrepItem>(ctx, DATA_KEYS.CALENDAR_PREP_ITEMS);
      const idx = preps.findIndex(p => p.id === params.id);
      if (idx !== -1) {
        preps[idx].prepCompleted = true;
        await setArr(ctx, DATA_KEYS.CALENDAR_PREP_ITEMS, preps);
      }
      return { success: true };
    });

    // ── Renewals ────────────────────────────────────────────────
    ctx.actions.register(ACTION_KEYS.ADD_RENEWAL, async (params: any) => {
      const renewal: Renewal = { id: generateId(), name: params.name, type: params.type ?? "other", renewalDate: params.renewalDate, cost: params.cost, currency: params.currency ?? "NOK", autoRenew: params.autoRenew ?? false, reminderSent: false, notes: params.notes ?? "" };
      const renewals = await getArr<Renewal>(ctx, DATA_KEYS.RENEWALS);
      renewals.push(renewal);
      await setArr(ctx, DATA_KEYS.RENEWALS, renewals);
      return { success: true, id: renewal.id };
    });

    ctx.actions.register(ACTION_KEYS.GET_RENEWALS, async (params: any) => {
      const renewals = await getArr<Renewal>(ctx, DATA_KEYS.RENEWALS);
      const withinDays = params.days ?? 30;
      const cutoff = new Date(Date.now() + withinDays * 86400000).toISOString();
      return { renewals: renewals.filter(r => r.renewalDate <= cutoff) };
    });

    // ── Documents ──────────────────────────────────────────────
    ctx.actions.register(ACTION_KEYS.ADD_DOCUMENT, async (params: any) => {
      const doc: Document = { id: generateId(), name: params.name, type: params.type ?? "other", expiryDate: params.expiryDate, issuingAuthority: params.issuingAuthority, documentRef: params.documentRef, uploadedAt: new Date().toISOString(), notes: params.notes ?? "" };
      const docs = await getArr<Document>(ctx, DATA_KEYS.DOCUMENTS);
      docs.push(doc);
      await setArr(ctx, DATA_KEYS.DOCUMENTS, docs);
      return { success: true, id: doc.id };
    });

    ctx.actions.register(ACTION_KEYS.GET_DOCUMENTS, async (_params: any) => {
      return { documents: await getArr<Document>(ctx, DATA_KEYS.DOCUMENTS) };
    });

    // ── Subscriptions ───────────────────────────────────────────
    ctx.actions.register(ACTION_KEYS.ADD_SUBSCRIPTION, async (params: any) => {
      const sub: Subscription = { id: generateId(), name: params.name, provider: params.provider, cost: params.cost ?? 0, currency: params.currency ?? "NOK", billingCycle: params.billingCycle ?? "monthly", nextBillingDate: params.nextBillingDate, active: true, category: params.category ?? "other", cancelAtPeriodEnd: false, notes: params.notes ?? "" };
      const subs = await getArr<Subscription>(ctx, DATA_KEYS.SUBSCRIPTIONS);
      subs.push(sub);
      await setArr(ctx, DATA_KEYS.SUBSCRIPTIONS, subs);
      return { success: true, id: sub.id };
    });

    ctx.actions.register(ACTION_KEYS.GET_SUBSCRIPTIONS, async (_params: any) => {
      return { subscriptions: await getArr<Subscription>(ctx, DATA_KEYS.SUBSCRIPTIONS) };
    });

    ctx.actions.register(ACTION_KEYS.CANCEL_SUBSCRIPTION, async (params: any) => {
      const subs = await getArr<Subscription>(ctx, DATA_KEYS.SUBSCRIPTIONS);
      const idx = subs.findIndex(s => s.id === params.id);
      if (idx !== -1) { subs[idx].active = false; await setArr(ctx, DATA_KEYS.SUBSCRIPTIONS, subs); }
      return { success: true };
    });

    // ── Errands ─────────────────────────────────────────────────
    ctx.actions.register(ACTION_KEYS.ADD_ERRAND, async (params: any) => {
      const errand: Errand = { id: generateId(), description: params.description, location: params.location, dueDate: params.dueDate, priority: params.priority ?? "medium", completed: false, category: params.category ?? "other", notes: params.notes ?? "" };
      const errands = await getArr<Errand>(ctx, DATA_KEYS.ERRANDS);
      errands.push(errand);
      await setArr(ctx, DATA_KEYS.ERRANDS, errands);
      return { success: true, id: errand.id };
    });

    ctx.actions.register(ACTION_KEYS.COMPLETE_ERRAND, async (params: any) => {
      const errands = await getArr<Errand>(ctx, DATA_KEYS.ERRANDS);
      const idx = errands.findIndex(e => e.id === params.id);
      if (idx !== -1) { errands[idx].completed = true; errands[idx].completedAt = new Date().toISOString(); await setArr(ctx, DATA_KEYS.ERRANDS, errands); }
      return { success: true };
    });

    ctx.actions.register(ACTION_KEYS.GET_ERRANDS, async (params: any) => {
      const errands = await getArr<Errand>(ctx, DATA_KEYS.ERRANDS);
      if (params.status === "completed") return { errands: errands.filter(e => e.completed) };
      if (params.status === "pending") return { errands: errands.filter(e => !e.completed) };
      return { errands };
    });

    // ── Weekly reviews ─────────────────────────────────────────
    ctx.actions.register(ACTION_KEYS.START_WEEKLY_REVIEW, async (_params: any) => {
      const now = new Date();
      const weekOf = `${now.getFullYear()}-W${String(Math.ceil(now.getDate() / 7)).padStart(2, "0")}`;
      const review: WeeklyReview = { id: generateId(), weekOf, startedAt: now.toISOString(), sections: { wins: "", blockers: "", nextWeekGoals: "", habitsScore: 0, energyScore: 0 } };
      const reviews = await getArr<WeeklyReview>(ctx, DATA_KEYS.WEEKLY_REVIEWS);
      reviews.push(review);
      await setArr(ctx, DATA_KEYS.WEEKLY_REVIEWS, reviews);
      return { success: true, id: review.id, weekOf };
    });

    ctx.actions.register(ACTION_KEYS.COMPLETE_WEEKLY_REVIEW, async (params: any) => {
      const reviews = await getArr<WeeklyReview>(ctx, DATA_KEYS.WEEKLY_REVIEWS);
      const idx = reviews.findIndex(r => r.id === params.id);
      if (idx !== -1) { reviews[idx].completedAt = new Date().toISOString(); Object.assign(reviews[idx].sections, params.sections); await setArr(ctx, DATA_KEYS.WEEKLY_REVIEWS, reviews); }
      return { success: true };
    });

    ctx.actions.register(ACTION_KEYS.GET_WEEKLY_REVIEWS, async (_params: any) => {
      return { reviews: await getArr<WeeklyReview>(ctx, DATA_KEYS.WEEKLY_REVIEWS) };
    });

    // ── Daily briefings ─────────────────────────────────────────
    ctx.actions.register(ACTION_KEYS.GET_DAILY_BRIEFING, async (params: any) => {
      const date = params.date ?? new Date().toISOString().split("T")[0];
      const briefings = await getArr<DailyBriefing>(ctx, DATA_KEYS.DAILY_BRIEFINGS);
      const today = briefings.find(b => b.date === date);
      if (today) return { briefing: today };

      // Auto-generate from other state
      const errands = (await getArr<Errand>(ctx, DATA_KEYS.ERRANDS)).filter(e => !e.completed && (!e.dueDate || e.dueDate <= date)).slice(0, 5);
      const inbox = (await getArr<InboxItem>(ctx, DATA_KEYS.INBOX_ITEMS)).filter(i => i.triageStatus === "pending").slice(0, 5);
      const renewals = (await getArr<Renewal>(ctx, DATA_KEYS.RENEWALS)).filter(r => r.renewalDate <= date);
      const items: BriefingItem[] = [];
      if (inbox.length) items.push({ id: generateId(), category: "inbox", content: `${inbox.length} pending inbox items`, priority: "medium", completed: false });
      if (errands.length) items.push({ id: generateId(), category: "errands", content: `${errands.length} errands due today`, priority: "high", completed: false });
      if (renewals.length) items.push({ id: generateId(), category: "renewals", content: `${renewals.length} items up for renewal`, priority: "high", completed: false });
      return { briefing: { id: generateId(), date, items, generatedAt: new Date().toISOString() } };
    });

    ctx.actions.register(ACTION_KEYS.ADD_BRIEFING_ITEM, async (params: any) => {
      const date = params.date ?? new Date().toISOString().split("T")[0];
      const briefings = await getArr<DailyBriefing>(ctx, DATA_KEYS.DAILY_BRIEFINGS);
      let brief = briefings.find(b => b.date === date);
      if (!brief) { brief = { id: generateId(), date, items: [], generatedAt: new Date().toISOString() }; briefings.push(brief); }
      brief.items.push({ id: generateId(), category: params.category ?? "general", content: params.content, priority: params.priority ?? "medium", completed: false });
      await setArr(ctx, DATA_KEYS.DAILY_BRIEFINGS, briefings);
      return { success: true };
    });

    // ── File cleanup ────────────────────────────────────────────
    ctx.actions.register(ACTION_KEYS.ADD_FILE_CLEANUP_TASK, async (params: any) => {
      const task: FileCleanupTask = { id: generateId(), path: params.path, description: params.description, ageDays: params.ageDays ?? 90, sizeMb: params.sizeMb, safeToDelete: params.safeToDelete ?? false, completed: false };
      const tasks = await getArr<FileCleanupTask>(ctx, DATA_KEYS.FILE_CLEANUP_TASKS);
      tasks.push(task);
      await setArr(ctx, DATA_KEYS.FILE_CLEANUP_TASKS, tasks);
      return { success: true, id: task.id };
    });

    ctx.actions.register(ACTION_KEYS.GET_FILE_CLEANUP_TASKS, async (params: any) => {
      const tasks = await getArr<FileCleanupTask>(ctx, DATA_KEYS.FILE_CLEANUP_TASKS);
      return { tasks: params.includeCompleted ? tasks : tasks.filter(t => !t.completed) };
    });

    ctx.actions.register(ACTION_KEYS.COMPLETE_FILE_CLEANUP, async (params: any) => {
      const tasks = await getArr<FileCleanupTask>(ctx, DATA_KEYS.FILE_CLEANUP_TASKS);
      const idx = tasks.findIndex(t => t.id === params.id);
      if (idx !== -1) { tasks[idx].completed = true; tasks[idx].completedAt = new Date().toISOString(); await setArr(ctx, DATA_KEYS.FILE_CLEANUP_TASKS, tasks); }
      return { success: true };
    });

    // ── Backup checks ───────────────────────────────────────────
    ctx.actions.register(ACTION_KEYS.ADD_BACKUP_CHECK, async (params: any) => {
      const check: BackupCheck = { id: generateId(), name: params.name, target: params.target, lastCheckedAt: undefined, lastStatus: "never", frequency: params.frequency ?? "weekly", nextDue: params.nextDue ?? new Date().toISOString(), notes: params.notes ?? "" };
      const checks = await getArr<BackupCheck>(ctx, DATA_KEYS.BACKUP_CHECKS);
      checks.push(check);
      await setArr(ctx, DATA_KEYS.BACKUP_CHECKS, checks);
      return { success: true, id: check.id };
    });

    ctx.actions.register(ACTION_KEYS.GET_BACKUP_CHECKS, async (_params: any) => {
      return { checks: await getArr<BackupCheck>(ctx, DATA_KEYS.BACKUP_CHECKS) };
    });

    ctx.actions.register(ACTION_KEYS.RUN_BACKUP_CHECK, async (params: any) => {
      const checks = await getArr<BackupCheck>(ctx, DATA_KEYS.BACKUP_CHECKS);
      const idx = checks.findIndex(c => c.id === params.id);
      if (idx !== -1) { checks[idx].lastCheckedAt = new Date().toISOString(); checks[idx].lastStatus = params.status ?? "ok"; await setArr(ctx, DATA_KEYS.BACKUP_CHECKS, checks); }
      return { success: true };
    });

    ctx.logger.info("Personal Admin plugin initialized");
  },
});

runWorker(plugin, import.meta.url);
