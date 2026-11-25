// Ayarlar · İçe aktar: Notion dışa aktarım ZIP'i (Markdown + CSV), Evernote .enex, düz .md/.txt ve CSV.
// Tarayıcıda ayrıştırılır; önizleme ve onaydan sonra sayfa, koleksiyon (üst sayfa + satır sayfaları) ya da görev olarak eklenir. Görseller files'a yüklenir.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, FileUp, Import, Loader2, X } from 'lucide-react';
import { useToast } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { uploadFile } from '../../lib/data';
import { cleanTitle, mdToBlocks, mimeOf, parseCsv, parseEnex, readZip, type DraftBlock } from '../../lib/importers';
import { parseDateText } from '../../lib/dateParse';

type As = 'page' | 'collection' | 'tasks';
interface Item { id: string; title: string; kind: 'page' | 'csv'; blocks?: DraftBlock[]; rows?: string[][]; include: boolean; as: As; source: string; images: Map<string, () => Promise<Uint8Array>> }

const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '');
function resolve(base: string, rel: string) {
  const parts = (dirOf(base) + rel).split('/');
  const out: string[] = [];
  for (const x of parts) { if (x === '..') out.pop(); else if (x && x !== '.') out.push(x); }
  return out.join('/');
}

export function ImportSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState('');
  const set = (id: string, p: Partial<Item>) => setItems((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));

  async function pick(list: FileList | null) {
    if (!list?.length) return;
    setBusy('Reading files…');
    const out: Item[] = [];
    try {
      for (const f of Array.from(list)) {
        const name = f.name.toLowerCase();
        if (name.endsWith('.zip')) {
          const entries = await readZip(await f.arrayBuffer());
          const byPath = new Map(entries.map((e) => [e.name, e.data]));
          for (const e of entries) {
            const n = e.name.toLowerCase();
            if (n.endsWith('.md') || n.endsWith('.markdown') || n.endsWith('.txt')) {
              const text = new TextDecoder().decode(await e.data());
              let blocks = mdToBlocks(text);
              const title = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() || cleanTitle(e.name);
              if (blocks[0]?.type === 'h1' && blocks[0].text === title) blocks = blocks.slice(1);
              const images = new Map<string, () => Promise<Uint8Array>>();
              blocks.forEach((b) => { if (b.image && !/^https?:/.test(b.image)) { const pth = resolve(e.name, b.image); const d = byPath.get(pth); if (d) images.set(b.image, d); } });
              out.push({ id: crypto.randomUUID(), title, kind: 'page', blocks, include: true, as: 'page', source: e.name, images });
            } else if (n.endsWith('.csv')) {
              const rows = parseCsv(new TextDecoder().decode(await e.data()));
              if (rows.length > 1) out.push({ id: crypto.randomUUID(), title: cleanTitle(e.name), kind: 'csv', rows, include: true, as: 'collection', source: e.name, images: new Map() });
            }
          }
        } else if (name.endsWith('.enex')) {
          for (const note of await parseEnex(await f.text())) {
            const images = new Map<string, () => Promise<Uint8Array>>();
            note.resources.forEach((r) => images.set(`enex:${r.hash}`, async () => r.data));
            out.push({ id: crypto.randomUUID(), title: note.title, kind: 'page', blocks: note.blocks, include: true, as: 'page', source: f.name, images });
          }
        } else if (name.endsWith('.csv')) {
          const rows = parseCsv(await f.text());
          if (rows.length > 1) out.push({ id: crypto.randomUUID(), title: cleanTitle(f.name), kind: 'csv', rows, include: true, as: 'tasks', source: f.name, images: new Map() });
        } else if (/\.(md|markdown|txt)$/.test(name)) {
          const text = await f.text();
          let blocks = mdToBlocks(text);
          const title = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() || cleanTitle(f.name);
          if (blocks[0]?.type === 'h1' && blocks[0].text === title) blocks = blocks.slice(1);
          out.push({ id: crypto.randomUUID(), title, kind: 'page', blocks, include: true, as: 'page', source: f.name, images: new Map() });
        }
      }
      setItems(out);
      if (!out.length) toast.fail(new Error('Nothing importable found'));
    } catch (x) { toast.fail(x); }
    setBusy('');
  }

  async function createPage(title: string, parent: string | null, pos: number) {
    const { data, error } = await supabase.from('pages').insert({ title: title.slice(0, 200), icon: '📥', project_id: null, parent_id: parent, position: pos }).select('id').single();
    if (error) throw error; return data.id as string;
  }
  async function writeBlocks(pageId: string, it: Item, blocks: DraftBlock[]) {
    const rows: Record<string, unknown>[] = [];
    let pos = 1;
    for (const b of blocks) {
      if (b.type === 'image') {
        if (b.image && /^https?:/.test(b.image)) { rows.push({ page_id: pageId, type: 'link', content: { url: b.image, title: b.text || 'Image' }, position: pos++ }); continue; }
        const loader = b.image ? it.images.get(b.image) : undefined;
        if (!loader) continue;
        const bytes = await loader();
        const nm = b.image!.split('/').pop() || 'image';
        const { rec } = await uploadFile(new File([bytes.slice().buffer as ArrayBuffer], nm.startsWith('enex:') ? 'image.png' : nm, { type: mimeOf(nm) === 'application/octet-stream' ? 'image/png' : mimeOf(nm) }));
        rows.push({ page_id: pageId, type: 'image', content: { caption: b.text || undefined }, file_id: rec.id, position: pos++ });
        continue;
      }
      rows.push({ page_id: pageId, type: b.type, content: { text: b.text, ...(b.type === 'todo' ? { checked: !!b.checked } : {}) }, position: pos++ });
    }
    for (let i = 0; i < rows.length; i += 200) { const { error } = await supabase.from('page_blocks').insert(rows.slice(i, i + 200)); if (error) throw error; }
  }
  async function run() {
    const todo = items.filter((x) => x.include);
    let n = 0;
    try {
      for (const it of todo) {
        setBusy(`Importing ${++n}/${todo.length} · ${it.title}`);
        if (it.kind === 'page') { const id = await createPage(it.title, null, Date.now() / 1e6 + n); await writeBlocks(id, it, it.blocks ?? []); continue; }
        const [head, ...data] = it.rows!;
        const ti = Math.max(0, head.findIndex((h) => /^(name|title|ad|başlık|baslik|task|görev)$/i.test(h.trim())));
        if (it.as === 'tasks') {
          const di = head.findIndex((h) => /date|due|tarih|deadline/i.test(h));
          const si = head.findIndex((h) => /status|durum|done/i.test(h));
          const rows = data.filter((r) => r[ti]?.trim()).map((r) => {
            const raw = di >= 0 ? (r[di] ?? '').trim() : '';
            const iso = /^\d{4}-\d{2}-\d{2}/.exec(raw)?.[0] ?? (raw ? parseDateText(raw.replace(/,/g, ''))?.day : undefined);
            const st = si >= 0 ? (r[si] ?? '').toLowerCase() : '';
            const done = /done|tamam|complete|yes|true|✓/.test(st);
            return { title: r[ti].trim().slice(0, 200), due_date: iso ?? null, status: done ? 'done' : 'todo', completed_at: done ? new Date().toISOString() : null, description: head.map((h, k) => (k !== ti && r[k]?.trim() ? `${h}: ${r[k].trim()}` : '')).filter(Boolean).join('\n') || null };
          });
          for (let i = 0; i < rows.length; i += 200) { const { error } = await supabase.from('tasks').insert(rows.slice(i, i + 200)); if (error) throw error; }
        } else if (it.as === 'collection') {
          const parent = await createPage(it.title, null, Date.now() / 1e6 + n);
          let k = 0;
          for (const r of data) {
            if (!r[ti]?.trim()) continue;
            const child = await createPage(r[ti].trim(), parent, ++k);
            await writeBlocks(child, it, head.map((h, c) => (c !== ti && r[c]?.trim() ? { type: 'text' as const, text: `**${h}:** ${r[c].trim()}` } : null)).filter(Boolean) as DraftBlock[]);
          }
        } else {
          const id = await createPage(it.title, null, Date.now() / 1e6 + n);
          await writeBlocks(id, it, data.map((r) => ({ type: 'bullet' as const, text: head.map((h, c) => (r[c]?.trim() ? `${c === ti ? '' : h + ': '}${r[c].trim()}` : '')).filter(Boolean).join(' · ') })));
        }
      }
      ['pages', 'tasks', 'cal', 'files', 'blocks'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.ok(`Imported ${todo.length} item${todo.length === 1 ? '' : 's'} ✦`);
      setItems([]);
    } catch (x) { toast.fail(x); }
    setBusy('');
  }

  return (
    <section className="glass panel">
      <div className="panel-head"><h2>Import</h2><Import size={18} className="muted" /></div>
      <p className="small muted" style={{ marginTop: 0 }}>Notion export (.zip with Markdown & CSV), Evernote (.enex), Markdown / text (.md, .txt) and CSV. Everything is read on your device; you’ll see a preview before anything is saved.</p>
      <label className="btn btn-glass"><FileUp size={15} />Choose files<input type="file" multiple hidden accept=".zip,.enex,.md,.markdown,.txt,.csv" onChange={(e) => { void pick(e.target.files); e.target.value = ''; }} disabled={!!busy} /></label>
      {busy && <p className="small"><Loader2 size={13} className="spin" /> {busy}</p>}
      {items.length > 0 && !busy && (
        <div className="imp-list">
          {items.map((it) => (
            <div key={it.id} className="imp-row">
              <input type="checkbox" checked={it.include} onChange={(e) => set(it.id, { include: e.target.checked })} aria-label={`Include ${it.title}`} />
              <input className="input" value={it.title} onChange={(e) => set(it.id, { title: e.target.value })} aria-label="Title" />
              <span className="small muted imp-meta">{it.kind === 'page' ? `${it.blocks?.length ?? 0} blocks${it.images.size ? ` · ${it.images.size} images` : ''}` : `${(it.rows?.length ?? 1) - 1} rows`}</span>
              {it.kind === 'csv' && (
                <select className="select" style={{ width: 'auto' }} value={it.as} onChange={(e) => set(it.id, { as: e.target.value as As })} aria-label="Import as">
                  <option value="collection">Collection (page per row)</option><option value="tasks">Tasks</option><option value="page">One page (list)</option>
                </select>
              )}
            </div>
          ))}
          <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setItems([])}><X size={13} />Cancel</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={run} disabled={!items.some((x) => x.include)}><Check size={13} />Import {items.filter((x) => x.include).length}</button>
          </div>
        </div>
      )}
    </section>
  );
}
