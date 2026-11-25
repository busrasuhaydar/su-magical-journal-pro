// Sayfayı Markdown'a çevirir (görseller ve dosyalar bağlantı olarak; 7 günlük imzalı adres).
import { supabase } from './supabase';
import type { FileRec, PageBlock } from './types';

const clean = (t: string) => t
  .replace(/\[\[page:[0-9a-f-]{36}\|([^\]]*)\]\]/g, '[[$1]]')
  .replace(/\{c:[^|}]+\|([^}]+)\}/g, '$1').replace(/\{h:[^|}]+\|([^}]+)\}/g, '==$1==').replace(/\{d:([^|}]+)\|([^}]+)\}/g, '📅 $2 ($1)')
  .replace(/__([^_\n]+)__/g, '<u>$1</u>');
async function link(f?: FileRec) {
  if (!f) return '';
  const { data } = await supabase.storage.from('files').createSignedUrl(f.storage_path, 7 * 86400);
  return data?.signedUrl ?? '';
}
export async function pageToMarkdown(title: string, icon: string | null, blocks: PageBlock[], files: FileRec[], pageTitle: (id: string) => string | undefined): Promise<string> {
  const out: string[] = [`# ${icon ? icon + ' ' : ''}${title}`, ''];
  let n = 0;
  for (const b of [...blocks].sort((a, c) => a.position - c.position)) {
    const t = clean(b.content.text ?? '');
    const pad = '  '.repeat(b.content.indent ?? 0);
    n = b.type === 'numbered' ? n + 1 : 0;
    const f = files.find((x) => x.id === b.file_id);
    switch (b.type) {
      case 'h1': out.push(`## ${t}`, ''); break;
      case 'h2': out.push(`### ${t}`, ''); break;
      case 'h3': out.push(`#### ${t}`, ''); break;
      case 'bullet': out.push(`${pad}- ${t}`); break;
      case 'numbered': out.push(`${pad}${n}. ${t}`); break;
      case 'todo': out.push(`${pad}- [${b.content.checked ? 'x' : ' '}] ${t}`); break;
      case 'quote': out.push(`> ${t}`, ''); break;
      case 'callout': out.push(`> ✦ ${t}`, ''); break;
      case 'divider': out.push('---', ''); break;
      case 'image': case 'drawing': if (f) out.push(`![${b.content.caption || f.title}](${await link(f)})`, ''); break;
      case 'file': if (f) out.push(`[📎 ${f.title}](${await link(f)})`, ''); break;
      case 'link': case 'embed': if (b.content.url) out.push(`[${b.content.title || b.content.url}](${b.content.url})`, ''); break;
      case 'page': if (b.ref_page_id) out.push(`→ [[${pageTitle(b.ref_page_id) ?? b.content.title ?? 'Page'}]]`, ''); break;
      case 'button': out.push(`[${b.content.label ?? 'Button'}]`, ''); break;
      case 'task': out.push(`- [ ] (task)`); break;
      default: out.push(pad + t, '');
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
export function download(name: string, text: string, type = 'text/markdown') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
