// Editör parçaları: kristal blok araç çubuğu, biçim balonu, "+" menüsü (son kullanılanlar + hazır düzenler), bağlantı yapıştırma seçimi, gömme.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDown, ArrowUp, AtSign, Bold, Columns2, Columns3, Copy, FileText, Highlighter, IndentDecrease, IndentIncrease, Italic, LayoutGrid, Link2,
  Palette, PanelsTopLeft, Repeat2, Rows3, Strikethrough, Trash2, Underline, Undo2, Image as ImageIcon, Code2,
} from 'lucide-react';
import type { BlockType } from '../../lib/types';

export const TEXT_COLORS = ['', '#C21F78', '#9C3FD0', '#1C5FC9', '#0E8A84', '#2E8A4E', '#D2560E', '#8C6C80'];
export const BG_COLORS = ['', '#FFE3F1', '#EFE4FF', '#DFF0FF', '#D9F7F3', '#E3F8E6', '#FFF2C9', '#FFE4DA'];
export const HL_COLORS = ['#FFF2A8', '#FFD3EA', '#CDEBFF', '#D7F8E0', '#EAD9FF'];

const hold = (e: { preventDefault: () => void }) => e.preventDefault();

function Pop({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: Event) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const t = setTimeout(() => { document.addEventListener('mousedown', h); document.addEventListener('touchstart', h); });
    return () => { clearTimeout(t); document.removeEventListener('mousedown', h); document.removeEventListener('touchstart', h); };
  }, [onClose]);
  return <div className="bt-pop" ref={ref} onMouseDown={hold}>{children}</div>;
}

export interface ToolActions {
  transform: (t: BlockType) => void; color: (c: string) => void; bg: (c: string) => void; indent: (d: 1 | -1) => void;
  move: (d: 1 | -1) => void; columns: () => void; duplicate: () => void; remove: () => void; undo: () => void;
}
/** Kristal blok araç çubuğu (bloğa dokununca, bloğun hemen altında; mobilde klavyenin üstünde kalır). */
export function BlockTools({ a, menu, canText }: { a: ToolActions; menu: [BlockType, string, typeof Bold, string][]; canText: boolean }) {
  const [pop, setPop] = useState<'' | 'type' | 'color'>('');
  const B = ({ label, onClick, children, on }: { label: string; onClick: () => void; children: ReactNode; on?: boolean }) => (
    <button type="button" className={`bt-btn${on ? ' on' : ''}`} aria-label={label} title={label} onMouseDown={hold} onClick={onClick}>{children}</button>
  );
  return (
    <div className="bt-bar" role="toolbar" aria-label="Block tools" onMouseDown={hold}>
      <B label="Turn into" onClick={() => setPop(pop === 'type' ? '' : 'type')} on={pop === 'type'}><Repeat2 size={15} /></B>
      <B label="Color" onClick={() => setPop(pop === 'color' ? '' : 'color')} on={pop === 'color'}><Palette size={15} /></B>
      <B label="Indent" onClick={() => a.indent(1)}><IndentIncrease size={15} /></B>
      <B label="Outdent" onClick={() => a.indent(-1)}><IndentDecrease size={15} /></B>
      <B label="Move up" onClick={() => a.move(-1)}><ArrowUp size={15} /></B>
      <B label="Move down" onClick={() => a.move(1)}><ArrowDown size={15} /></B>
      <B label="Split into columns" onClick={a.columns}><Columns2 size={15} /></B>
      <B label="Duplicate" onClick={a.duplicate}><Copy size={15} /></B>
      <B label="Delete" onClick={a.remove}><Trash2 size={15} /></B>
      <B label="Undo" onClick={a.undo}><Undo2 size={15} /></B>
      {pop === 'type' && (
        <Pop onClose={() => setPop('')}>
          <div className="bt-types">
            {menu.filter(([t]) => canText || !['text', 'h1', 'h2', 'h3', 'bullet', 'numbered', 'todo', 'quote', 'callout'].includes(t)).map(([t, l, I]) => (
              <button key={t} type="button" onMouseDown={hold} onClick={() => { setPop(''); a.transform(t); }}><I size={15} />{l}</button>
            ))}
          </div>
        </Pop>
      )}
      {pop === 'color' && (
        <Pop onClose={() => setPop('')}>
          <span className="bm-cap">Text</span>
          <div className="bt-sw">{TEXT_COLORS.map((c) => <button key={c || 'd'} type="button" aria-label={c ? `Text ${c}` : 'Default text color'} style={{ color: c || 'var(--ink-900)' }} onMouseDown={hold} onClick={() => a.color(c)}>A</button>)}</div>
          <span className="bm-cap">Background</span>
          <div className="bt-sw">{BG_COLORS.map((c) => <button key={c || 'd'} type="button" aria-label={c ? `Background ${c}` : 'No background'} style={{ background: c || '#fff' }} onMouseDown={hold} onClick={() => a.bg(c)}>{c ? '' : '∅'}</button>)}</div>
        </Pop>
      )}
    </div>
  );
}

export type Fmt = 'b' | 'i' | 'u' | 's' | 'link' | 'mention' | 'page' | { color: string } | { hl: string };
/** Metin seçilince biçim balonu. */
export function FormatBubble({ onFmt }: { onFmt: (f: Fmt) => void }) {
  const [pop, setPop] = useState<'' | 'color' | 'hl'>('');
  const B = ({ label, f, children }: { label: string; f?: Fmt; children: ReactNode }) => (
    <button type="button" className="fb-btn" aria-label={label} title={label} onMouseDown={hold} onClick={() => f && onFmt(f)}>{children}</button>
  );
  return (
    <div className="fb-bubble" role="toolbar" aria-label="Format" onMouseDown={hold}>
      <B label="Bold" f="b"><Bold size={14} /></B>
      <B label="Italic" f="i"><Italic size={14} /></B>
      <B label="Underline" f="u"><Underline size={14} /></B>
      <B label="Strikethrough" f="s"><Strikethrough size={14} /></B>
      <button type="button" className="fb-btn" aria-label="Text color" title="Text color" onMouseDown={hold} onClick={() => setPop(pop === 'color' ? '' : 'color')}><Palette size={14} /></button>
      <button type="button" className="fb-btn" aria-label="Highlight" title="Highlight" onMouseDown={hold} onClick={() => setPop(pop === 'hl' ? '' : 'hl')}><Highlighter size={14} /></button>
      <B label="Link" f="link"><Link2 size={14} /></B>
      <B label="Mention" f="mention"><AtSign size={14} /></B>
      <B label="Link to page [[ ]]" f="page"><FileText size={14} /></B>
      {pop && (
        <div className="fb-sw">
          {(pop === 'color' ? TEXT_COLORS.filter(Boolean) : HL_COLORS).map((c) => (
            <button key={c} type="button" aria-label={c} style={pop === 'color' ? { color: c } : { background: c }} onMouseDown={hold} onClick={() => { setPop(''); onFmt(pop === 'color' ? { color: c } : { hl: c }); }}>{pop === 'color' ? 'A' : ''}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export type Preset = 'cols2' | 'cols3' | 'imgtext' | 'gallery' | 'cards';
export const PRESETS: [Preset, string, typeof Bold][] = [
  ['cols2', '2 columns', Columns2], ['cols3', '3 columns', Columns3], ['imgtext', 'Image + text', PanelsTopLeft], ['gallery', 'Gallery grid', LayoutGrid], ['cards', 'Card row', Rows3],
];
/** "+" menüsü: en üstte son kullanılan 5 blok, sonra hazır düzenler ve tüm bloklar. */
export function PlusMenu({ menu, recent, onPick, onPreset, onClose }: { menu: [BlockType, string, typeof Bold, string][]; recent: BlockType[]; onPick: (t: BlockType) => void; onPreset: (p: Preset) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: Event) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const t = setTimeout(() => { document.addEventListener('mousedown', h); document.addEventListener('touchstart', h); });
    return () => { clearTimeout(t); document.removeEventListener('mousedown', h); document.removeEventListener('touchstart', h); };
  }, [onClose]);
  const rec = recent.map((t) => menu.find((m) => m[0] === t)).filter(Boolean).slice(0, 5) as typeof menu;
  return (
    <div className="block-menu plus-menu" ref={ref} role="menu">
      {rec.length > 0 && <><span className="bm-cap">Recent</span>{rec.map(([t, l, I]) => <button type="button" key={'r' + t} role="menuitem" onClick={() => onPick(t)}><I size={15} />{l}</button>)}</>}
      <span className="bm-cap">Layouts</span>
      <div className="pm-presets">{PRESETS.map(([p, l, I]) => <button type="button" key={p} role="menuitem" onClick={() => onPreset(p)}><I size={18} /><span>{l}</span></button>)}</div>
      <span className="bm-cap">Blocks</span>
      {menu.map(([t, l, I]) => <button type="button" key={t} role="menuitem" onClick={() => onPick(t)}><I size={15} />{l}</button>)}
    </div>
  );
}

/** Bağlantı yapıştırınca: bağlantı / kart / gömme. */
export function PasteChoice({ url, onPick }: { url: string; onPick: (k: 'link' | 'card' | 'embed' | null) => void }) {
  const host = (() => { try { return new URL(url).hostname; } catch { return url; } })();
  return (
    <div className="paste-choice" role="dialog" aria-label="Paste link as">
      <span className="small muted">{host}</span>
      <button type="button" className="btn btn-glass btn-sm" onMouseDown={hold} onClick={() => onPick('link')}><Link2 size={13} />Link</button>
      <button type="button" className="btn btn-glass btn-sm" onMouseDown={hold} onClick={() => onPick('card')}><ImageIcon size={13} />Card</button>
      <button type="button" className="btn btn-glass btn-sm" onMouseDown={hold} onClick={() => onPick('embed')}><Code2 size={13} />Embed</button>
    </div>
  );
}

/** Gömülebilir adres (YouTube, Vimeo, Spotify, SoundCloud, Google Maps, Figma, CodePen…). */
export function embedSrc(url: string): string | null {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, '');
    if (h === 'youtube.com' || h === 'm.youtube.com') { const v = u.searchParams.get('v') ?? u.pathname.split('/shorts/')[1]; return v ? `https://www.youtube-nocookie.com/embed/${v}` : null; }
    if (h === 'youtu.be') return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
    if (h === 'vimeo.com') return `https://player.vimeo.com/video/${u.pathname.split('/').filter(Boolean)[0]}`;
    if (h === 'open.spotify.com') return `https://open.spotify.com/embed${u.pathname}`;
    if (h === 'soundcloud.com') return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}`;
    if (h === 'figma.com') return `https://www.figma.com/embed?embed_host=journal&url=${encodeURIComponent(url)}`;
    if (h === 'codepen.io') return url.replace('/pen/', '/embed/');
    if (h.startsWith('google.') && u.pathname.startsWith('/maps')) return `https://maps.google.com/maps?q=${encodeURIComponent(u.searchParams.get('q') ?? u.pathname.split('/place/')[1] ?? '')}&output=embed`;
    if (h === 'docs.google.com') return url.replace(/\/edit.*$/, '/preview');
    return null;
  } catch { return null; }
}
export function EmbedBlock({ url }: { url?: string }) {
  if (!url) return <p className="small muted">No link.</p>;
  const src = embedSrc(url);
  if (!src) return <a className="card link-card" href={url} target="_blank" rel="noopener noreferrer"><Link2 size={16} /><div><b>{new URL(url).hostname}</b><div className="small muted">This site can’t be embedded · open link</div></div></a>;
  return <div className="embed-block"><iframe src={src} title="Embedded content" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" /></div>;
}

/** Yapıştırılan çok satırlı metni bloklara böler. */
export function splitLines(t: string): { type: BlockType; text: string; checked?: boolean }[] {
  return t.replace(/\r/g, '').split('\n').filter((l) => l.trim()).map((l) => {
    const s = l.trim();
    let m: RegExpExecArray | null;
    if ((m = /^#{3}\s+(.*)$/.exec(s))) return { type: 'h3', text: m[1] };
    if ((m = /^#{2}\s+(.*)$/.exec(s))) return { type: 'h2', text: m[1] };
    if ((m = /^#\s+(.*)$/.exec(s))) return { type: 'h1', text: m[1] };
    if ((m = /^[-*•]\s*\[( |x)\]\s+(.*)$/i.exec(s))) return { type: 'todo', text: m[2], checked: m[1].toLowerCase() === 'x' };
    if ((m = /^\[( |x)\]\s+(.*)$/i.exec(s))) return { type: 'todo', text: m[2], checked: m[1].toLowerCase() === 'x' };
    if ((m = /^[-*•–]\s+(.*)$/.exec(s))) return { type: 'bullet', text: m[1] };
    if ((m = /^\d+[.)]\s+(.*)$/.exec(s))) return { type: 'numbered', text: m[1] };
    if ((m = /^>\s+(.*)$/.exec(s))) return { type: 'quote', text: m[1] };
    return { type: 'text', text: s };
  });
}
