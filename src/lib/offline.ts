// Çevrimdışı çalışma: (1) TanStack Query önbelleği IndexedDB'de kalıcı, (2) çevrimdışı yazmalar (Supabase REST
// POST/PATCH/DELETE ve RPC) kuyrukta bekler, bağlantı gelince sırayla gönderilir, (3) updated_at çakışmasında kullanıcıya sorulur.
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';

// ── Küçük IndexedDB yardımcıları ───────────────────────
const DB = 'su-offline';
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('queue', { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
let dbp: Promise<IDBDatabase> | null = null;
const db = () => (dbp ??= open());
async function tx<T>(store: string, mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((res, rej) => { const t = d.transaction(store, mode); const r = f(t.objectStore(store)); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
export const idb = {
  get: <T>(store: string, key: IDBValidKey) => tx<T>(store, 'readonly', (s) => s.get(key) as IDBRequest<T>),
  set: (store: string, val: unknown, key?: IDBValidKey) => tx(store, 'readwrite', (s) => s.put(val, key)),
  del: (store: string, key: IDBValidKey) => tx(store, 'readwrite', (s) => s.delete(key)),
  all: <T>(store: string) => tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>),
};

/** TanStack Query önbelleğini IndexedDB'ye yazar (yazmalar 1 sn'de bir toplanır). */
export function idbPersister(): Persister {
  let t: number | undefined, last: PersistedClient | null = null;
  return {
    persistClient: async (c) => { last = c; window.clearTimeout(t); t = window.setTimeout(() => { if (last) void idb.set('kv', last, 'rq').catch(() => undefined); }, 1000); },
    restoreClient: async () => (await idb.get<PersistedClient>('kv', 'rq').catch(() => undefined)) ?? undefined,
    removeClient: async () => { await idb.del('kv', 'rq').catch(() => undefined); },
  };
}

// ── Yazma kuyruğu ──────────────────────────────────────
export interface QueueItem { id: string; url: string; method: string; headers: [string, string][]; body: string | null; baseAt: number; createdAt: number; table: string | null; rowId: string | null }
export type Conflict = { item: QueueItem; server: Record<string, unknown> | null; resolve: (keepMine: boolean) => void };
let cfg: { url: string; anon: string; token: () => string | null } | null = null;
let lastSyncAt = Date.now();
let pending = 0;
let draining = false;
const READ_RPC = /\/rest\/v1\/rpc\/(search_content|search_query|trash_list|backup_tables)\b/;
const realFetch: typeof fetch = (...a) => fetch(...a);

export function configureOffline(c: typeof cfg) { cfg = c; void refreshCount(); window.addEventListener('online', () => void drain()); setInterval(() => { if (navigator.onLine && pending) void drain(); }, 30_000); }
const emit = (detail: Record<string, unknown> = {}) => window.dispatchEvent(new CustomEvent('su-offline', { detail: { pending, online: navigator.onLine, draining, ...detail } }));
async function refreshCount() { pending = (await idb.all<QueueItem>('queue').catch(() => [])).length; emit(); }
export const offlineState = () => ({ pending, online: navigator.onLine, draining });

function parseTarget(url: string) {
  const m = /\/rest\/v1\/([^/?]+)/.exec(url);
  const table = m && m[1] !== 'rpc' ? m[1] : null;
  const rowId = /[?&]id=eq\.([0-9a-f-]{36})/.exec(url)?.[1] ?? null;
  return { table, rowId };
}

async function enqueue(url: string, init: RequestInit): Promise<Response> {
  const h = new Headers(init.headers);
  let body = typeof init.body === 'string' ? init.body : null;
  const { table, rowId } = parseTarget(url);
  const method = (init.method ?? 'GET').toUpperCase();
  // Eklemelerde kimlik yoksa şimdi üret: sonraki işlemler (ör. hatırlatıcı) aynı kimliği kullanabilsin
  let rows: unknown = null;
  if (body) { try { rows = JSON.parse(body); } catch { rows = null; } }
  if (method === 'POST' && table && rows) {
    const add = (r: Record<string, unknown>) => (r && typeof r === 'object' && !r.id ? { id: crypto.randomUUID(), ...r } : r);
    rows = Array.isArray(rows) ? rows.map(add) : add(rows as Record<string, unknown>);
    body = JSON.stringify(rows);
  }
  const headers = [...h.entries()].filter(([k]) => !['authorization', 'apikey'].includes(k.toLowerCase()));
  const item: QueueItem = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, url, method, headers, body, baseAt: lastSyncAt, createdAt: Date.now(), table, rowId };
  await idb.set('queue', item);
  await refreshCount();
  // Uygulama "kaydedildi" görsün: istenen biçimde sahte yanıt
  const wantsRep = /return=representation/.test(h.get('prefer') ?? '');
  const single = /vnd\.pgrst\.object/.test(h.get('accept') ?? '');
  if (!wantsRep || !rows) return new Response(null, { status: method === 'POST' ? 201 : 204 });
  const withId = (r: unknown) => (rowId && r && typeof r === 'object' && !Array.isArray(r) ? { id: rowId, ...(r as object) } : r);
  const arr = Array.isArray(rows) ? rows : [withId(rows)];
  return new Response(JSON.stringify(single ? arr[0] : arr), { status: method === 'POST' ? 201 : 200, headers: { 'Content-Type': 'application/json' } });
}

/** Supabase istemcisi için fetch: çevrimdışıyken yazmaları kuyruğa alır. */
export const offlineFetch: typeof fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const queueable = url.includes('/rest/v1/') && method !== 'GET' && method !== 'HEAD' && !READ_RPC.test(url);
  if (queueable && (!navigator.onLine || pending > 0)) {
    const r = await enqueue(url, init);
    if (navigator.onLine) void drain();
    return r;
  }
  try {
    const r = await realFetch(input, init);
    if (url.includes('/rest/v1/')) lastSyncAt = Date.now();
    return r;
  } catch (e) {
    if (queueable) return enqueue(url, init);
    throw e;
  }
};

/** Kuyruğu sırayla gönderir; updated_at çakışmasında kullanıcıya sorar. */
export async function drain() {
  if (draining || !cfg || !navigator.onLine) return;
  draining = true; emit();
  let sent = 0;
  try {
    const items = (await idb.all<QueueItem>('queue')).sort((a, b) => a.createdAt - b.createdAt);
    pending = items.length;
    for (const it of items) {
      const auth = { apikey: cfg.anon, Authorization: `Bearer ${cfg.token() ?? cfg.anon}` };
      if (it.method === 'PATCH' && it.table && it.rowId) {
        let server: Record<string, unknown> | null = null;
        try {
          const r = await realFetch(`${cfg.url}/rest/v1/${it.table}?id=eq.${it.rowId}&select=*`, { headers: auth });
          if (r.ok) server = (await r.json())[0] ?? null;
        } catch { break; }
        const upd = server?.updated_at ? Date.parse(String(server.updated_at)) : 0;
        if (server && upd > it.baseAt) {
          const keepMine = await new Promise<boolean>((resolve) => emit({ conflict: { item: it, server, resolve } satisfies Conflict }));
          if (!keepMine) { await idb.del('queue', it.id); await refreshCount(); continue; }
        }
      }
      let res: Response;
      try { res = await realFetch(it.url, { method: it.method, headers: { ...Object.fromEntries(it.headers), ...auth }, body: it.body }); }
      catch { break; } // hâlâ bağlantı yok
      if (!res.ok && res.status !== 409) emit({ error: `A change saved offline couldn’t be sent (${res.status}).` });
      await idb.del('queue', it.id);
      sent++;
      await refreshCount();
    }
  } finally {
    draining = false; lastSyncAt = Date.now();
    emit({ synced: sent });
  }
}
