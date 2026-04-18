import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { GoogleAuthConfig, GoogleCalendarEvent, GoogleGmailHistoryResponse, GoogleGmailMessage, GoogleMessageHeader } from "./types.js";

export class GoogleApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
    this.payload = payload;
  }
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function requestJson<T>(ctx: PluginContext, url: string, init: RequestInit): Promise<T> {
  const response = await ctx.http.fetch(url, init);
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new GoogleApiError(`Google API request failed with ${response.status}`, response.status, payload);
  }
  return payload as T;
}

export async function exchangeRefreshToken(ctx: PluginContext, auth: GoogleAuthConfig): Promise<string> {
  const body = new URLSearchParams({
    client_id: auth.clientId,
    client_secret: auth.clientSecret,
    refresh_token: auth.refreshToken,
    grant_type: "refresh_token",
  });

  const payload = await requestJson<{ access_token: string }>(ctx, "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  return payload.access_token;
}

function withQuery(url: string, query: Record<string, string | number | undefined>): string {
  const target = new URL(url);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "") continue;
    target.searchParams.set(key, String(value));
  }
  return target.toString();
}

export async function gmailListMessagesPage(
  ctx: PluginContext,
  accessToken: string,
  userId: string,
  input: { q?: string; maxResults?: number; pageToken?: string },
): Promise<{ messages?: Array<{ id: string; threadId: string }>; nextPageToken?: string; resultSizeEstimate?: number }> {
  return requestJson(ctx, withQuery(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(userId)}/messages`, {
    q: input.q,
    maxResults: input.maxResults,
    pageToken: input.pageToken,
  }), {
    method: "GET",
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

export async function gmailGetMessage(ctx: PluginContext, accessToken: string, userId: string, messageId: string): Promise<GoogleGmailMessage> {
  return requestJson(ctx, withQuery(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(userId)}/messages/${encodeURIComponent(messageId)}`, {
    format: "full",
  }), {
    method: "GET",
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

export async function gmailListHistoryPage(
  ctx: PluginContext,
  accessToken: string,
  userId: string,
  startHistoryId: string,
  pageToken?: string,
): Promise<GoogleGmailHistoryResponse> {
  return requestJson(ctx, withQuery(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(userId)}/history`, {
    startHistoryId,
    pageToken,
  }), {
    method: "GET",
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

export async function gmailModifyMessage(
  ctx: PluginContext,
  accessToken: string,
  userId: string,
  messageId: string,
  input: { addLabelIds?: string[]; removeLabelIds?: string[] },
): Promise<void> {
  await requestJson(ctx, `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(userId)}/messages/${encodeURIComponent(messageId)}/modify`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function gmailSendMessage(
  ctx: PluginContext,
  accessToken: string,
  userId: string,
  input: { raw: string; threadId?: string },
): Promise<{ id?: string; threadId?: string; labelIds?: string[] }> {
  return requestJson(ctx, `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(userId)}/messages/send`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function calendarListEvents(
  ctx: PluginContext,
  accessToken: string,
  calendarId: string,
  input: {
    pageToken?: string;
    syncToken?: string;
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
    showDeleted?: boolean;
  },
): Promise<{ items?: GoogleCalendarEvent[]; nextPageToken?: string; nextSyncToken?: string }> {
  const query: Record<string, string | number | undefined> = {
    singleEvents: "true",
    pageToken: input.pageToken,
    syncToken: input.syncToken,
    timeMin: input.syncToken ? undefined : input.timeMin,
    timeMax: input.syncToken ? undefined : input.timeMax,
    maxResults: input.maxResults,
    showDeleted: input.showDeleted ? "true" : undefined,
    orderBy: input.syncToken ? undefined : "startTime",
  };

  return requestJson(ctx, withQuery(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, query), {
    method: "GET",
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

export function getHeader(headers: GoogleMessageHeader[] | undefined, name: string): string | undefined {
  return headers?.find(header => header.name.toLowerCase() === name.toLowerCase())?.value;
}

export function toBase64Url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}
