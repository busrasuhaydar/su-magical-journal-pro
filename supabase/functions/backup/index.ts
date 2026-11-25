// Yedekleme: haftalık (pg_cron, x-cron-secret) veya kullanıcı isteğiyle tüm tabloların JSON yedeği.
// Storage 'backups' kovasına yazar; Google Drive bağlıysa Drive'a da yükler. Geri yükleme: kayıtları id ile upsert eder.
import { createClient } from "npm:@supabase/supabase-js@2.46.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const G_ID = Deno.env.get("GOOGLE_DRIVE_CLIENT_ID") ?? Deno.env.get("GOOGLE_CLIENT_ID");
const G_SECRET = Deno.env.get("GOOGLE_DRIVE_CLIENT_SECRET") ?? Deno.env.get("GOOGLE_CLIENT_SECRET");
const CALLBACK = `${SUPABASE_URL}/functions/v1/backup?drive_callback=1`;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function secret(key: string) { const { data } = await db.from("app_secrets").select("value").eq("key", key).maybeSingle(); return data?.value as string | undefined; }
async function setSecret(key: string, value: string) { await db.from("app_secrets").upsert({ key, value, updated_at: new Date().toISOString() }); }

async function tables(): Promise<string[]> {
  const { data, error } = await db.rpc("backup_tables");
  if (error) throw error;
  return (data as string[]).map((t) => (typeof t === "string" ? t : Object.values(t as Record<string, string>)[0]));
}

async function driveToken(owner: string): Promise<string | null> {
  const refresh = await secret(`gdrive_refresh:${owner}`);
  if (!refresh || !G_ID || !G_SECRET) return null;
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: G_ID, client_secret: G_SECRET, refresh_token: refresh, grant_type: "refresh_token" }) });
  if (!r.ok) return null;
  return (await r.json()).access_token as string;
}

async function uploadDrive(owner: string, name: string, body: string): Promise<{ status: string; id?: string }> {
  const token = await driveToken(owner);
  if (!token) return { status: (await secret(`gdrive_refresh:${owner}`)) ? "auth_error" : "not_configured" };
  const boundary = "su" + crypto.randomUUID();
  const meta = JSON.stringify({ name, mimeType: "application/json", ...(await secret(`gdrive_folder:${owner}`) ? { parents: [await secret(`gdrive_folder:${owner}`)] } : {}) });
  const payload = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body: payload });
  if (!r.ok) { console.error("drive", r.status, await r.text()); return { status: "error" }; }
  return { status: "uploaded", id: (await r.json()).id };
}

/** Uygulama klasörü ("Su's Magical Journal Backups") yoksa oluşturur. */
async function ensureFolder(owner: string, token: string) {
  if (await secret(`gdrive_folder:${owner}`)) return;
  const r = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Su's Magical Journal Backups", mimeType: "application/vnd.google-apps.folder" }) });
  if (r.ok) await setSecret(`gdrive_folder:${owner}`, (await r.json()).id);
}

async function backupOwner(owner: string, source: "manual" | "cron") {
  const out: Record<string, unknown> = { app: "Su's Magical Journal", version: 2, owner_id: owner, created_at: new Date().toISOString() };
  const counts: Record<string, number> = {};
  let total = 0;
  for (const t of await tables()) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from(t).select("*").eq("owner_id", owner).range(from, from + 999);
      if (error) { console.error(t, error.message); break; }
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    out[t] = rows; counts[t] = rows.length; total += rows.length;
  }
  const body = JSON.stringify(out);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${owner}/${stamp}.json`;
  const up = await db.storage.from("backups").upload(path, new Blob([body], { type: "application/json" }), { contentType: "application/json", upsert: true });
  if (up.error) throw up.error;
  const drive = await uploadDrive(owner, `su-journal-backup-${stamp}.json`, body);
  const { data: rec, error } = await db.from("backups").insert({ owner_id: owner, storage_path: path, size_bytes: body.length, row_count: total, tables: counts, source, drive_status: drive.status, drive_file_id: drive.id ?? null }).select().single();
  if (error) throw error;
  // Storage'da son 12 haftalık yedek tutulur
  const { data: old } = await db.from("backups").select("id, storage_path").eq("owner_id", owner).is("deleted_at", null).order("created_at", { ascending: false }).range(12, 200);
  if (old?.length) { await db.storage.from("backups").remove(old.map((o) => o.storage_path)); await db.from("backups").update({ deleted_at: new Date().toISOString() }).in("id", old.map((o) => o.id)); }
  return rec;
}

async function restore(owner: string, id: string) {
  const { data: rec } = await db.from("backups").select("*").eq("id", id).eq("owner_id", owner).maybeSingle();
  if (!rec) throw new Error("Backup not found.");
  const dl = await db.storage.from("backups").download(rec.storage_path);
  if (dl.error) throw dl.error;
  const data = JSON.parse(await dl.data.text()) as Record<string, unknown>;
  const known = new Set(await tables());
  let pending = Object.keys(data).filter((t) => known.has(t) && Array.isArray(data[t]) && (data[t] as unknown[]).length);
  const restored: Record<string, number> = {};
  const errors: Record<string, string> = {};
  // Yabancı anahtar sırası bilinmediği için birkaç turda dener
  for (let pass = 0; pass < 6 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) {
      const rows = (data[t] as Record<string, unknown>[]).filter((r) => r.owner_id === owner);
      const key = t === "profiles" ? "id" : "id";
      let ok = true;
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await db.from(t).upsert(rows.slice(i, i + 500), { onConflict: key });
        if (error) { ok = false; errors[t] = error.message; break; }
      }
      if (ok) { restored[t] = rows.length; delete errors[t]; } else next.push(t);
    }
    pending = next;
  }
  await db.from("backups").update({ restored_at: new Date().toISOString() }).eq("id", id);
  return { restored, errors };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);

  // Google OAuth geri dönüşü (tarayıcı yönlendirmesi)
  if (url.searchParams.get("drive_callback")) {
    const state = url.searchParams.get("state") ?? "", code = url.searchParams.get("code") ?? "";
    const saved = await secret(`gdrive_state:${state}`);
    if (!saved || !code || !G_ID || !G_SECRET) return new Response("Google Drive connection failed.", { status: 400 });
    const { owner, back } = JSON.parse(saved);
    await db.from("app_secrets").delete().eq("key", `gdrive_state:${state}`);
    const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: G_ID, client_secret: G_SECRET, redirect_uri: CALLBACK, grant_type: "authorization_code" }) });
    const tok = await r.json();
    if (!r.ok || !tok.refresh_token) return new Response(`Google Drive connection failed: ${tok.error_description ?? tok.error ?? "no refresh token"}`, { status: 400 });
    await setSecret(`gdrive_refresh:${owner}`, tok.refresh_token);
    await ensureFolder(owner, tok.access_token);
    return Response.redirect(`${back}${back.includes("?") ? "&" : "?"}drive=connected#backups`, 302);
  }

  const body = await req.json().catch(() => ({}));
  const cronHeader = req.headers.get("x-cron-secret");
  if (cronHeader) {
    if (cronHeader !== (await secret("cron_secret"))) return json({ error: "unauthorized" }, 401);
    const { data: owners } = await db.from("profiles").select("id");
    const done: string[] = [];
    for (const o of owners ?? []) { try { await backupOwner(o.id, "cron"); done.push(o.id); } catch (e) { console.error("backup", o.id, (e as Error).message); } }
    return json({ backed_up: done.length });
  }
  const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const { data: u } = jwt ? await db.auth.getUser(jwt) : { data: { user: null } };
  if (!u?.user) return json({ error: "Sign-in required." }, 401);
  const owner = u.user.id;
  try {
    if (body.action === "backup") return json(await backupOwner(owner, "manual"));
    if (body.action === "restore" && body.id) return json(await restore(owner, body.id));
    if (body.action === "download" && body.id) {
      const { data: rec } = await db.from("backups").select("storage_path").eq("id", body.id).eq("owner_id", owner).maybeSingle();
      if (!rec) return json({ error: "Backup not found." }, 404);
      const { data, error } = await db.storage.from("backups").createSignedUrl(rec.storage_path, 600, { download: true });
      if (error) throw error;
      return json({ url: data.signedUrl });
    }
    if (body.action === "drive_status") return json({ configured: !!(G_ID && G_SECRET), connected: !!(await secret(`gdrive_refresh:${owner}`)), callback: CALLBACK });
    if (body.action === "drive_connect") {
      if (!G_ID || !G_SECRET) return json({ error: "Google Drive isn’t set up yet (GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET secrets missing)." }, 400);
      const state = crypto.randomUUID();
      await setSecret(`gdrive_state:${state}`, JSON.stringify({ owner, back: String(body.return_to ?? "") }));
      const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      auth.search = new URLSearchParams({ client_id: G_ID, redirect_uri: CALLBACK, response_type: "code", scope: "https://www.googleapis.com/auth/drive.file", access_type: "offline", prompt: "consent", state }).toString();
      return json({ url: auth.toString() });
    }
    if (body.action === "drive_disconnect") { await db.from("app_secrets").delete().in("key", [`gdrive_refresh:${owner}`, `gdrive_folder:${owner}`]); return json({ ok: true }); }
    return json({ error: "Unknown action." }, 400);
  } catch (e) { return json({ error: (e as Error).message }, 500); }
});
