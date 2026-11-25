// İçe aktarma ayrıştırıcıları (tarayıcıda, paket yok): ZIP (DecompressionStream), Notion Markdown + CSV, Evernote .enex, düz .md/.txt, CSV.
import type { BlockType } from './types';

export interface ZipEntry { name: string; data: () => Promise<Uint8Array> }
export async function readZip(buf: ArrayBuffer): Promise<ZipEntry[]> {
  const v = new DataView(buf), u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Not a valid ZIP file');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out: ZipEntry[] = [];
  const dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true);
    const nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    out.push({
      name,
      data: async () => {
        const ln = v.getUint16(local + 26, true), lx = v.getUint16(local + 28, true);
        const raw = u8.subarray(local + 30 + ln + lx, local + 30 + ln + lx + csize);
        if (method === 0) return raw;
        if (method !== 8) throw new Error(`Unsupported compression in ${name}`);
        const ds = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Uint8Array(await new Response(ds).arrayBuffer());
      },
    });
  }
  // Notion iç içe ZIP'leri (Export-xxxx.zip içinde .zip) açılır
  const nested = out.filter((e) => e.name.toLowerCase().endsWith('.zip'));
  for (const n of nested) { try { const inner = await readZip((await n.data()).slice().buffer); out.push(...inner); } catch { /* yok say */ } }
  return out.filter((e) => !e.name.toLowerCase().endsWith('.zip'));
}

export interface DraftBlock { type: BlockType; text: string; checked?: boolean; image?: string }
/** Markdown → bloklar (görseller yerel yol olarak döner; yükleme sonra yapılır). */
export function mdToBlocks(md: string): DraftBlock[] {
  const out: DraftBlock[] = [];
  let inCode = false, code: string[] = [];
  for (const raw of md.replace(/\r/g, '').split('\n')) {
    const l = raw.replace(/\s+$/, '');
    if (/^```/.test(l)) { if (inCode) { out.push({ type: 'callout', text: code.join('\n') }); code = []; } inCode = !inCode; continue; }
    if (inCode) { code.push(l); continue; }
    if (!l.trim()) continue;
    const s = l.trim();
    let m: RegExpExecArray | null;
    if ((m = /^!\[([^\]]*)\]\(([^)]+)\)/.exec(s))) { out.push({ type: 'image', text: m[1], image: decodeURIComponent(m[2].split(' ')[0]) }); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(s)) { out.push({ type: 'divider', text: '' }); continue; }
    if ((m = /^(#{1,6})\s+(.*)$/.exec(s))) { out.push({ type: (['h1', 'h1', 'h2', 'h3', 'h3', 'h3'] as BlockType[])[m[1].length - 1], text: m[2] }); continue; }
    if ((m = /^[-*+]\s+\[( |x)\]\s+(.*)$/i.exec(s))) { out.push({ type: 'todo', text: m[2], checked: m[1].toLowerCase() === 'x' }); continue; }
    if ((m = /^[-*+•]\s+(.*)$/.exec(s))) { out.push({ type: 'bullet', text: m[1] }); continue; }
    if ((m = /^\d+[.)]\s+(.*)$/.exec(s))) { out.push({ type: 'numbered', text: m[1] }); continue; }
    if ((m = /^>\s?(.*)$/.exec(s))) { out.push({ type: 'quote', text: m[1] }); continue; }
    if (/^\|.*\|$/.test(s)) { if (/^\|[\s:|-]+\|$/.test(s)) continue; out.push({ type: 'text', text: s.slice(1, -1).split('|').map((c) => c.trim()).join(' · ') }); continue; }
    out.push({ type: 'text', text: s.replace(/<br\s*\/?>/g, ' ') });
  }
  if (code.length) out.push({ type: 'callout', text: code.join('\n') });
  return out;
}
/** Notion dosya adlarındaki 32 haneli kimliği temizler. */
export const cleanTitle = (name: string) => name.split('/').pop()!.replace(/\.(md|txt|csv|markdown)$/i, '').replace(/\s+[0-9a-f]{32}$/i, '').replace(/_all$/i, '').trim() || 'Untitled';

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', q = false;
  const t = text.replace(/^\uFEFF/, '');
  const first = t.split('\n')[0] ?? '';
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ',';
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export interface EnexNote { title: string; blocks: DraftBlock[]; created?: string; resources: { hash: string; mime: string; name: string; data: Uint8Array }[] }
export async function parseEnex(xml: string): Promise<EnexNote[]> {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const notes: EnexNote[] = [];
  for (const n of Array.from(doc.getElementsByTagName('note'))) {
    const title = n.getElementsByTagName('title')[0]?.textContent?.trim() || 'Untitled';
    const content = n.getElementsByTagName('content')[0]?.textContent ?? '';
    const resources: EnexNote['resources'] = [];
    for (const r of Array.from(n.getElementsByTagName('resource'))) {
      const b64 = (r.getElementsByTagName('data')[0]?.textContent ?? '').replace(/\s+/g, '');
      const mime = r.getElementsByTagName('mime')[0]?.textContent ?? 'application/octet-stream';
      const name = r.getElementsByTagName('file-name')[0]?.textContent ?? `file.${mime.split('/')[1] ?? 'bin'}`;
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      resources.push({ hash: String(resources.length), mime, name, data: bin });
    }
    const html = new DOMParser().parseFromString(content, 'text/html');
    const blocks: DraftBlock[] = [];
    let media = 0;
    const walk = (el: Element) => {
      for (const c of Array.from(el.children)) {
        const tag = c.tagName.toLowerCase();
        if (tag === 'en-media') { blocks.push({ type: 'image', text: '', image: `enex:${media++}` }); continue; }
        if (/^h[1-3]$/.test(tag)) { blocks.push({ type: tag as BlockType, text: c.textContent?.trim() ?? '' }); continue; }
        if (tag === 'ul' || tag === 'ol') {
          for (const li of Array.from(c.children)) {
            const cb = li.querySelector('input[type=checkbox], en-todo');
            const checked = cb ? cb.getAttribute('checked') === 'true' || cb.hasAttribute('checked') : undefined;
            blocks.push({ type: cb ? 'todo' : tag === 'ol' ? 'numbered' : 'bullet', text: li.textContent?.trim() ?? '', checked });
          }
          continue;
        }
        if (tag === 'hr') { blocks.push({ type: 'divider', text: '' }); continue; }
        if (tag === 'blockquote') { blocks.push({ type: 'quote', text: c.textContent?.trim() ?? '' }); continue; }
        if (c.querySelector('en-media, ul, ol, h1, h2, h3, div, p')) { walk(c); continue; }
        const todo = c.querySelector('en-todo');
        const t = c.textContent?.trim() ?? '';
        if (t) blocks.push(todo ? { type: 'todo', text: t, checked: todo.getAttribute('checked') === 'true' } : { type: 'text', text: t });
      }
    };
    walk(html.querySelector('en-note') ?? html.body);
    notes.push({ title, blocks, resources, created: n.getElementsByTagName('created')[0]?.textContent ?? undefined });
  }
  return notes;
}
export function mimeOf(name: string) {
  const e = name.split('.').pop()?.toLowerCase() ?? '';
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', heic: 'image/heic', pdf: 'application/pdf' } as Record<string, string>)[e] ?? 'application/octet-stream';
}
