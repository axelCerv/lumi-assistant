/** Google Calendar y Microsoft Graph (Outlook) vía OAuth, solo lectura. */
import type { Meeting } from "@lumi/shared";
import { getSettings } from "../settings";
import { getSecretJson, setSecretJson } from "../secrets";
import { authorizeInBrowser, decodeJwtEmail, refreshTokens, type OAuthTokens } from "./oauth";

const env = import.meta.env as unknown as Record<string, string | undefined>;

export function googleCredentials(): { clientId: string; clientSecret: string } | null {
  const s = getSettings().calendars;
  const clientId = s.googleClientId || env.MAIN_VITE_GOOGLE_CLIENT_ID || "";
  const clientSecret = s.googleClientSecret || env.MAIN_VITE_GOOGLE_CLIENT_SECRET || "";
  return clientId ? { clientId, clientSecret } : null;
}

export function microsoftClientId(): string | null {
  return getSettings().calendars.microsoftClientId || env.MAIN_VITE_MICROSOFT_CLIENT_ID || null;
}

const LINK_RE =
  /https?:\/\/(?:[\w-]+\.)?(?:meet\.google\.com|zoom\.us|teams\.microsoft\.com|teams\.live\.com|webex\.com|whereby\.com|meet\.jit\.si)\/[^\s"<>)\]]+/i;

export function findMeetingLink(...texts: (string | null | undefined)[]): string | null {
  for (const t of texts) {
    const m = t?.match(LINK_RE);
    if (m) return m[0];
  }
  return null;
}

/* -------------------------------- Google -------------------------------- */

const G_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const G_TOKEN = "https://oauth2.googleapis.com/token";
const G_SCOPE = "openid email https://www.googleapis.com/auth/calendar.readonly";

export async function connectGoogle(): Promise<string | null> {
  const cred = googleCredentials();
  if (!cred) throw new Error("Falta configurar el ID de cliente de Google (ver README → Calendario).");
  const t = await authorizeInBrowser({
    authUrl: G_AUTH,
    tokenUrl: G_TOKEN,
    clientId: cred.clientId,
    clientSecret: cred.clientSecret || undefined,
    scope: G_SCOPE,
    extraAuthParams: { access_type: "offline", prompt: "consent" },
  });
  setSecretJson("google-oauth", t);
  return decodeJwtEmail(t.id_token);
}

async function googleToken(): Promise<string> {
  const cred = googleCredentials();
  let t = getSecretJson<OAuthTokens>("google-oauth");
  if (!t || !cred) throw new Error("Google Calendar no está conectado.");
  if (Date.now() > t.expires_at) {
    if (!t.refresh_token) throw new Error("La sesión de Google expiró; vuelve a conectar.");
    t = await refreshTokens(G_TOKEN, cred.clientId, t.refresh_token, cred.clientSecret || undefined);
    setSecretJson("google-oauth", t);
  }
  return t.access_token;
}

interface GEvent {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  description?: string;
  hangoutLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email?: string; displayName?: string; self?: boolean; responseStatus?: string }[];
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
}

export async function googleEvents(from: Date, to: Date): Promise<Meeting[]> {
  const token = await googleToken();
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("timeMin", from.toISOString());
  url.searchParams.set("timeMax", to.toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "250");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Google Calendar respondió ${res.status}`);
  const json = (await res.json()) as { items?: GEvent[] };
  return (json.items ?? [])
    .filter((e) => e.status !== "cancelled" && !e.attendees?.some((a) => a.self && a.responseStatus === "declined"))
    .map((e) => {
      const allDay = !e.start?.dateTime;
      const start = e.start?.dateTime ?? `${e.start?.date}T00:00:00`;
      const end = e.end?.dateTime ?? `${e.end?.date}T00:00:00`;
      const video = e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri;
      return {
        id: `google:${e.id}`,
        title: e.summary ?? "(Sin título)",
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        allDay,
        location: e.location ?? null,
        link: e.hangoutLink ?? video ?? findMeetingLink(e.location, e.description),
        calendar: "Google",
        source: "google" as const,
        attendees: (e.attendees ?? []).filter((a) => !a.self).map((a) => a.displayName ?? a.email ?? "").filter(Boolean),
      };
    });
}

/* ------------------------------- Microsoft ------------------------------- */

const M_AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const M_TOKEN = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const M_SCOPE = "openid email offline_access User.Read Calendars.Read";

export async function connectMicrosoft(): Promise<string | null> {
  const clientId = microsoftClientId();
  if (!clientId) throw new Error("Falta configurar el ID de aplicación de Microsoft (ver README → Calendario).");
  const t = await authorizeInBrowser({ authUrl: M_AUTH, tokenUrl: M_TOKEN, clientId, scope: M_SCOPE, host: "localhost" });
  setSecretJson("microsoft-oauth", t);
  return decodeJwtEmail(t.id_token);
}

async function microsoftToken(): Promise<string> {
  const clientId = microsoftClientId();
  let t = getSecretJson<OAuthTokens>("microsoft-oauth");
  if (!t || !clientId) throw new Error("Outlook no está conectado.");
  if (Date.now() > t.expires_at) {
    if (!t.refresh_token) throw new Error("La sesión de Microsoft expiró; vuelve a conectar.");
    t = await refreshTokens(M_TOKEN, clientId, t.refresh_token, undefined, M_SCOPE);
    setSecretJson("microsoft-oauth", t);
  }
  return t.access_token;
}

interface MEvent {
  id: string;
  subject?: string;
  isAllDay?: boolean;
  isCancelled?: boolean;
  start?: { dateTime: string; timeZone: string };
  end?: { dateTime: string; timeZone: string };
  location?: { displayName?: string };
  onlineMeeting?: { joinUrl?: string } | null;
  webLink?: string;
  bodyPreview?: string;
  attendees?: { emailAddress?: { name?: string; address?: string } }[];
  responseStatus?: { response?: string };
}

export async function microsoftEvents(from: Date, to: Date): Promise<Meeting[]> {
  const token = await microsoftToken();
  const url = new URL("https://graph.microsoft.com/v1.0/me/calendarView");
  url.searchParams.set("startDateTime", from.toISOString());
  url.searchParams.set("endDateTime", to.toISOString());
  url.searchParams.set("$top", "200");
  url.searchParams.set("$orderby", "start/dateTime");
  url.searchParams.set("$select", "id,subject,isAllDay,isCancelled,start,end,location,onlineMeeting,bodyPreview,attendees,responseStatus");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' } });
  if (!res.ok) throw new Error(`Outlook respondió ${res.status}`);
  const json = (await res.json()) as { value?: MEvent[] };
  const utc = (s?: string) => (s ? new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s}Z`).toISOString() : new Date().toISOString());
  return (json.value ?? [])
    .filter((e) => !e.isCancelled && e.responseStatus?.response !== "declined")
    .map((e) => ({
      id: `microsoft:${e.id}`,
      title: e.subject ?? "(Sin título)",
      start: utc(e.start?.dateTime),
      end: utc(e.end?.dateTime),
      allDay: !!e.isAllDay,
      location: e.location?.displayName || null,
      link: e.onlineMeeting?.joinUrl ?? findMeetingLink(e.location?.displayName, e.bodyPreview),
      calendar: "Outlook",
      source: "microsoft" as const,
      attendees: (e.attendees ?? []).map((a) => a.emailAddress?.name ?? a.emailAddress?.address ?? "").filter(Boolean),
    }));
}
