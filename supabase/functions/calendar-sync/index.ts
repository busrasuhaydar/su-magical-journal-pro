// Takvim eşitleme:
//  GET  ?token=…            → görev ve etkinliklerin ICS aboneliği (Google/Apple takvim abone olur; gizli tokenlı, salt okunur).
//  POST {source:'cron'}     → x-cron-secret ile saatte bir: tüm dış ICS takvimlerini içeri aktarır (salt okunur).
//  POST (kullanıcı JWT'si)  → yalnız o kullanıcının dış takvimlerini hemen eşitler.
import { createClient } from "npm:@supabase/supabase-js@2.46.1";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const TZ = "Europe/Istanbul";

// ── ICS üretimi ──
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const fold = (l: string) => { const out: string[] = []; let s = l; while (s.length > 74) { out.push(s.slice(0, 74)); s = " " + s.slice(74); } out.push(s); return out.join("\r\n"); };
const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dateOnly = (d: string) => d.replace(/-/g, "");
const nextDay = (d: string) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };

async function feed(token: string) {
  const { data: f } = await db.from("calendar_feeds").select("owner_id").eq("token", token).is("deleted_at", null).maybeSingle();
  if (!f) return new Response("Not found", { status: 404, headers: cors });
  const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const [tasks, events] = await Promise.all([
    db.from("tasks").select("id,title,description,due_date,starts_at,ends_at,status,updated_at").eq("owner_id", f.owner_id).is("deleted_at", null).neq("status", "cancelled").or(`due_date.gte.${since},starts_at.gte.${since}`).limit(3000),
    db.from("events").select("id,title,description,location,starts_at,ends_at,all_day,updated_at").eq("owner_id", f.owner_id).is("deleted_at", null).gte("ends_at", since).limit(3000),
  ]);
  const L: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Su's Magical Journal//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Su's Magical Journal", `X-WR-TIMEZONE:${TZ}`, "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
  const stamp = utc(new Date().toISOString());
  for (const t of tasks.data ?? []) {
    if (!t.starts_at && !t.due_date) continue;
    L.push("BEGIN:VEVENT", `UID:task-${t.id}@su-journal`, `DTSTAMP:${stamp}`, `LAST-MODIFIED:${utc(t.updated_at)}`);
    if (t.starts_at) { L.push(`DTSTART:${utc(t.starts_at)}`, `DTEND:${utc(t.ends_at ?? new Date(new Date(t.starts_at).getTime() + 1800000).toISOString())}`); }
    else L.push(`DTSTART;VALUE=DATE:${dateOnly(t.due_date)}`, `DTEND;VALUE=DATE:${dateOnly(nextDay(t.due_date))}`);
    L.push(fold(`SUMMARY:${esc((t.status === "done" ? "✓ " : "☐ ") + t.title)}`));
    if (t.description) L.push(fold(`DESCRIPTION:${esc(t.description)}`));
    L.push("CATEGORIES:Task", "END:VEVENT");
  }
  for (const e of events.data ?? []) {
    L.push("BEGIN:VEVENT", `UID:event-${e.id}@su-journal`, `DTSTAMP:${stamp}`, `LAST-MODIFIED:${utc(e.updated_at)}`);
    if (e.all_day) { const s = new Date(e.starts_at).toLocaleDateString("sv-SE", { timeZone: TZ }), z = new Date(e.ends_at).toLocaleDateString("sv-SE", { timeZone: TZ }); L.push(`DTSTART;VALUE=DATE:${dateOnly(s)}`, `DTEND;VALUE=DATE:${dateOnly(nextDay(z))}`); }
    else L.push(`DTSTART:${utc(e.starts_at)}`, `DTEND:${utc(e.ends_at)}`);
    L.push(fold(`SUMMARY:${esc(e.title)}`));
    if (e.location) L.push(fold(`LOCATION:${esc(e.location)}`));
    if (e.description) L.push(fold(`DESCRIPTION:${esc(e.description)}`));
    L.push("END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return new Response(L.join("\r\n") + "\r\n", { headers: { ...cors, "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "max-age=900" } });
}

// ── ICS içe aktarma ──
function tzOffsetMs(tz: string, at: Date) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - at.getTime();
  } catch { return 0; }
}
function parseDt(v: string, params: string): { iso: string; allDay: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v.trim());
  if (!m) return null;
  if (!m[4]) return { iso: `${m[1]}-${m[2]}-${m[3]}T00:00:00Z`, allDay: true };
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  if (m[7]) return { iso: new Date(naive).toISOString(), allDay: false };
  const tz = /TZID=([^;:]+)/.exec(params)?.[1] ?? TZ;
  const off = tzOffsetMs(tz, new Date(naive));
  return { iso: new Date(naive - off).toISOString(), allDay: false };
}
const unesc = (s: string) => s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
function parseIcs(text: string) {
  const lines = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const out: { uid: string; title: string; starts_at: string; ends_at: string; all_day: boolean; location: string | null }[] = [];
  let cur: Record<string, { p: string; v: string }> | null = null;
  for (const l of lines) {
    if (l === "BEGIN:VEVENT") { cur = {}; continue; }
    if (l === "END:VEVENT" && cur) {
      const s = cur.DTSTART ? parseDt(cur.DTSTART.v, cur.DTSTART.p) : null;
      if (s && cur.STATUS?.v !== "CANCELLED") {
        let e = cur.DTEND ? parseDt(cur.DTEND.v, cur.DTEND.p) : null;
        if (!e) e = { iso: new Date(new Date(s.iso).getTime() + (s.allDay ? 86400000 : 3600000)).toISOString(), allDay: s.allDay };
        const rid = cur["RECURRENCE-ID"]?.v ?? "";
        out.push({ uid: (cur.UID?.v ?? crypto.randomUUID()) + (rid ? `#${rid}` : ""), title: unesc(cur.SUMMARY?.v ?? "(no title)").slice(0, 300), starts_at: s.iso, ends_at: e.iso, all_day: s.allDay, location: cur.LOCATION ? unesc(cur.LOCATION.v).slice(0, 300) : null });
      }
      cur = null; continue;
    }
    if (!cur) continue;
    const i = l.indexOf(":"); if (i < 0) continue;
    const head = l.slice(0, i), v = l.slice(i + 1);
    const [name, ...ps] = head.split(";");
    cur[name.toUpperCase()] = { p: ps.join(";"), v };
  }
  return out;
}
async function syncCalendar(c: { id: string; owner_id: string; url: string }) {
  try {
    const url = c.url.replace(/^webcal:\/\//i, "https://");
    const r = await fetch(url, { headers: { "User-Agent": "JournalCalendarSync/1.0" }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const evs = parseIcs(await r.text());
    const from = Date.now() - 31 * 86400000, to = Date.now() + 400 * 86400000;
    const keep = evs.filter((e) => new Date(e.ends_at).getTime() >= from && new Date(e.starts_at).getTime() <= to).slice(0, 3000);
    await db.from("external_events").delete().eq("calendar_id", c.id);
    for (let i = 0; i < keep.length; i += 500) {
      const { error } = await db.from("external_events").insert(keep.slice(i, i + 500).map((e) => ({ ...e, owner_id: c.owner_id, calendar_id: c.id })));
      if (error) throw error;
    }
    await db.from("external_calendars").update({ last_synced_at: new Date().toISOString(), error: null, event_count: keep.length }).eq("id", c.id);
    return keep.length;
  } catch (x) {
    await db.from("external_calendars").update({ error: String((x as Error).message ?? x).slice(0, 300), last_synced_at: new Date().toISOString() }).eq("id", c.id);
    return -1;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const u = new URL(req.url);
  if (req.method === "GET") {
    const token = u.searchParams.get("token") ?? u.pathname.split("/").pop()?.replace(/\.ics$/, "");
    if (!token || token.length < 20) return new Response("Missing token", { status: 400, headers: cors });
    return feed(token);
  }
  const cron = req.headers.get("x-cron-secret");
  let owner: string | null = null;
  if (cron) {
    const { data } = await db.from("app_secrets").select("value").eq("key", "cron_secret").single();
    if (!data || data.value !== cron) return json({ error: "forbidden" }, 403);
  } else {
    const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer /i, "");
    const { data } = await db.auth.getUser(jwt);
    if (!data.user) return json({ error: "unauthorized" }, 401);
    owner = data.user.id;
  }
  let q = db.from("external_calendars").select("id,owner_id,url").is("deleted_at", null);
  if (owner) q = q.eq("owner_id", owner);
  const { data: cals } = await q;
  const results: Record<string, number> = {};
  for (const c of cals ?? []) results[c.id] = await syncCalendar(c);
  return json({ ok: true, results });
});
