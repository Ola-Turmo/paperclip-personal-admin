import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "personal-admin",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Personal Admin",
  description: "AI-operable personal admin plugin for Paperclip: inbox triage, calendar prep, renewals, documents, subscriptions, errands, reviews, and daily briefings.",
  author: "turmo.dev",
  categories: ["automation"],
  capabilities: [
    "events.subscribe",
    "plugin.state.read",
    "plugin.state.write",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
};

export default manifest;
