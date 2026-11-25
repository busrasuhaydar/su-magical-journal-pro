// Sayfa yazdırma görünümü (kabuk dışında): kristal temalı ama okunaklı; "Yazdır → PDF olarak kaydet".
import { useParams } from 'react-router-dom';
import { useAllPages, useFiles, usePageBlocks, useTasks } from '../lib/data';
import { renderInline } from '../components/editor/inline';
import { Thumb } from '../components/Media';
import { embedSrc } from '../components/editor/blockParts';
import { PrintFrame } from './Print';
import type { PageBlock } from '../lib/types';

export default function PagePrint() {
  const { id = '' } = useParams();
  const pages = useAllPages();
  const blocks = usePageBlocks(id);
  const files = useFiles();
  const tasks = useTasks();
  const pg = pages.data?.find((p) => p.id === id);
  const titleOf = (x: string) => pages.data?.find((p) => p.id === x)?.title;
  const list = [...(blocks.data ?? [])].sort((a, b) => a.position - b.position);
  let n = 0;
  const one = (b: PageBlock) => {
    n = b.type === 'numbered' ? n + 1 : 0;
    const t = renderInline(b.content.text ?? '', undefined, titleOf);
    const st = { marginLeft: (b.content.indent ?? 0) * 22, color: b.content.color, background: b.content.bg, padding: b.content.bg ? '4px 10px' : undefined, borderRadius: 8 };
    const f = files.data?.find((x) => x.id === b.file_id);
    switch (b.type) {
      case 'h1': return <h2 key={b.id} style={st}>{t}</h2>;
      case 'h2': return <h3 key={b.id} style={st}>{t}</h3>;
      case 'h3': return <h4 key={b.id} style={st}>{t}</h4>;
      case 'bullet': return <p key={b.id} className="pp-li" style={st}>• {t}</p>;
      case 'numbered': return <p key={b.id} className="pp-li" style={st}>{n}. {t}</p>;
      case 'todo': return <p key={b.id} className="pp-li" style={st}>{b.content.checked ? '☑' : '☐'} {t}</p>;
      case 'quote': return <blockquote key={b.id} style={st}>{t}</blockquote>;
      case 'callout': return <div key={b.id} className="pp-callout" style={st}>✦ {t}</div>;
      case 'divider': return <hr key={b.id} />;
      case 'image': case 'drawing': return f ? <figure key={b.id} className="pp-img"><Thumb file={f} fit="contain" />{b.content.caption && <figcaption>{b.content.caption}</figcaption>}</figure> : null;
      case 'file': return f ? <p key={b.id}>📎 {f.title}</p> : null;
      case 'link': return <p key={b.id}>🔗 {b.content.title} — <span className="pp-url">{b.content.url}</span></p>;
      case 'embed': return <p key={b.id}>▶ <span className="pp-url">{b.content.url}</span>{b.content.url && !embedSrc(b.content.url) ? '' : ''}</p>;
      case 'task': { const tk = tasks.data?.find((x) => x.id === b.task_id); return tk ? <p key={b.id} className="pp-li">{tk.status === 'done' ? '☑' : '☐'} {tk.title}</p> : null; }
      case 'page': return <p key={b.id}>→ {titleOf(b.ref_page_id ?? '') ?? b.content.title}</p>;
      case 'button': return null;
      default: return <p key={b.id} style={st}>{t}</p>;
    }
  };
  const segs: PageBlock[][] = [];
  for (const b of list) { const last = segs[segs.length - 1]; if (b.content.row && last && last[0].content.row === b.content.row) last.push(b); else segs.push([b]); }
  return (
    <PrintFrame>
      <article className="print-page pp">
        <header className="pp-head"><span className="pp-icon">{pg?.icon ?? '📄'}</span><h1>{pg?.title ?? 'Page'}</h1></header>
        {segs.map((seg) => {
          if (!seg[0].content.row) return seg.map(one);
          const cols = [...new Set(seg.map((b) => b.content.col ?? 0))].sort((a, b) => a - b);
          return <div key={seg[0].id} className="pp-cols" style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}>{cols.map((c) => <div key={c}>{seg.filter((b) => (b.content.col ?? 0) === c).map(one)}</div>)}</div>;
        })}
        <footer className="pp-foot">Su's Magical Journal ✦</footer>
      </article>
    </PrintFrame>
  );
}
