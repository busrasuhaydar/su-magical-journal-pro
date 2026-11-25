// Metin içi biçim: **kalın**, *italik*, __altı çizili__, ~~üstü çizili~~, ==vurgu==, {c:renk|metin}, {h:renk|metin}, {d:tarih|etiket}, `kod`, [bağlantı](url), çıplak URL ve [[page:id|Başlık]] sayfa bağlantıları.
import type { ReactNode } from 'react';

const RE = /(\{[chd]:[^|}\n]{1,40}\|[^}\n]+\}|__[^_\n]+__|~~[^~\n]+~~|==[^=\n]+==|\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[\[page:[0-9a-f-]{36}\|[^\]]*\]\]|\[[^\]\n]+\]\((?:https?:\/\/|\/)[^)\s]+\)|https?:\/\/[^\s<>()]+)/g;
export const HAS_MARKUP = /\*|`|\[|https?:\/\/|__|~~|==|\{[chd]:/;
export const PAGE_TOKEN = /\[\[page:([0-9a-f-]{36})\|([^\]]*)\]\]/g;

export function renderInline(text: string, onPage?: (id: string) => void, titleOf?: (id: string) => string | undefined): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0, k = 0;
  for (const m of text.matchAll(RE)) {
    const s = m[0], i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    last = i + s.length;
    const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
    if (s.startsWith('{')) {
      const [, t, arg, body] = /^\{([chd]):([^|}]+)\|([^}]+)\}$/.exec(s)!;
      if (t === 'c') out.push(<span key={k++} style={{ color: arg }}>{body}</span>);
      else if (t === 'h') out.push(<mark key={k++} style={{ background: arg }}>{body}</mark>);
      else out.push(<span key={k++} className="date-chip" title={arg}>📅 {body}</span>);
    } else if (s.startsWith('__')) out.push(<u key={k++}>{s.slice(2, -2)}</u>);
    else if (s.startsWith('~~')) out.push(<s key={k++}>{s.slice(2, -2)}</s>);
    else if (s.startsWith('==')) out.push(<mark key={k++}>{s.slice(2, -2)}</mark>);
    else if (s.startsWith('**')) out.push(<strong key={k++}>{s.slice(2, -2)}</strong>);
    else if (s.startsWith('`')) out.push(<code key={k++}>{s.slice(1, -1)}</code>);
    else if (s.startsWith('[[page:')) {
      const [, id, title] = /\[\[page:([0-9a-f-]{36})\|([^\]]*)\]\]/.exec(s)!;
      out.push(<button type="button" key={k++} className="pg-mention" onClick={(e) => { stop(e); onPage?.(id); }}>{titleOf?.(id) ?? (title || 'Page')}</button>);
    } else if (s.startsWith('[')) {
      const [, label, href] = /\[([^\]]+)\]\(([^)]+)\)/.exec(s)!;
      out.push(<a key={k++} href={href} target="_blank" rel="noopener noreferrer" onClick={stop}>{label}</a>);
    } else if (s.startsWith('*')) out.push(<em key={k++}>{s.slice(1, -1)}</em>);
    else out.push(<a key={k++} href={s} target="_blank" rel="noopener noreferrer" onClick={stop}>{s.replace(/^https?:\/\//, '').slice(0, 60)}</a>);
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
