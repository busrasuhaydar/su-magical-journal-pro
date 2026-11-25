// Serbest düzen: her ekrandaki her kutu taşınabilir / istenen boyuta getirilebilir / gizlenebilir; her yazı (buton, başlık, menü…) yeniden adlandırılıp gizlenebilir.
// Tüm ayarlar profiles.ui_prefs'te (boxes, renames, hidden_ui) ve hesapla eşitlenir. Mobilde (≤760px) boyut/taşıma uygulanmaz (çakışma olmasın), ad ve gizleme geçerlidir.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Eye, EyeOff, GripVertical, Pencil, RotateCcw } from 'lucide-react';
import { useProfile } from './data';
import { usePrefsWriter, type UiPrefs } from './ui';
import { RenameDialog, useEditMode } from './layout';

export interface Box { x?: number; y?: number; w?: number; h?: number; hide?: boolean }
export interface CanvasItem { id: string; kind: 'note' | 'link' | 'label'; x: number; y: number; w: number; h: number; text?: string; color?: string; href?: string; icon?: string }

export function routeKey(p: string) {
  const s = p.split('/').filter(Boolean);
  if (!s.length) return '/';
  if (s[0] === 'projects') return `/projects/${s[2] ?? (s[1] ? 'overview' : '')}`;
  if (s[0] === 'calendar') return `/calendar/${s[1] ?? 'month'}`;
  return `/${s[0]}`;
}
const wide = () => window.innerWidth > 760;
const snap = (n: number) => Math.round(n / 8) * 8;

// ── Yazı yeniden adlandırma (özgün metin → yeni metin) ──
const ORIG = new WeakMap<Text, string>();
const APPLIED = new WeakMap<Text, string>();
const TEXT_SEL = 'button, a, h1, h2, label, summary, .lbl, .tx, .btn';
const USER_DATA = '.task-row, .proj-card, .art-card, .opp-card, .page-card, .nft-card, .col-card, .block-row, .card, .qlinks, .pcard, .cr-proj, .cmenu, .fx-ui, textarea, input, select';
const own = (el: Element) => Array.from(el.childNodes).filter((n): n is Text => n.nodeType === 3 && !!n.nodeValue?.trim());
export function origOf(n: Text) { const t = (n.nodeValue ?? '').trim(); return ORIG.get(n) && (t === ORIG.get(n) || t === APPLIED.get(n)) ? ORIG.get(n)! : t; }
export function renamableAt(target: EventTarget | null): { el: HTMLElement; node: Text; orig: string; interactive: HTMLElement | null } | null {
  const t = (target as HTMLElement | null)?.closest?.(TEXT_SEL) as HTMLElement | null;
  if (!t || t.closest(USER_DATA)) return null;
  const node = own(t)[0] ?? own(t.querySelector('span, b') ?? t)[0];
  if (!node) return null;
  return { el: t, node, orig: origOf(node), interactive: t.closest('button, a, .btn') as HTMLElement | null };
}

function applyText(node: Text, renames: Record<string, string>) {
  const cur = node.nodeValue ?? '', t = cur.trim();
  if (!t) return null;
  let orig = ORIG.get(node);
  if (orig === undefined || !(t === orig || t === APPLIED.get(node))) { orig = t; ORIG.set(node, t); APPLIED.delete(node); }
  const want = renames[orig];
  if (want && want !== t) { node.nodeValue = cur.replace(t, want); APPLIED.set(node, want); }
  else if (!want && t !== orig) { node.nodeValue = cur.replace(t, orig); APPLIED.delete(node); }
  return orig;
}

// ── Kutular ──
export function listBoxes(): { el: HTMLElement; key: string }[] {
  const seen = new Map<string, number>();
  const out: { el: HTMLElement; key: string }[] = [];
  document.querySelectorAll<HTMLElement>('.main .glass.panel, .main .hero').forEach((el, i) => {
    if (el.parentElement?.closest('.glass.panel, .hero') || el.closest('.cb-clone')) return;
    const h = el.querySelector('h2, h1');
    const tn = h ? own(h)[0] : null;
    const title = (tn ? origOf(tn) : h?.textContent?.trim()) || `box${i}`;
    const n = seen.get(title) ?? 0; seen.set(title, n + 1);
    out.push({ el, key: n ? `${title}#${n}` : title });
  });
  return out;
}
export function paintBox(el: HTMLElement, b: Box | undefined, wideNow = wide()) {
  const useW = wideNow && !!b?.w, useH = wideNow && !!b?.h, useM = wideNow && (!!b?.x || !!b?.y);
  el.classList.toggle('fx-w', useW); el.classList.toggle('fx-h', useH); el.classList.toggle('fx-m', useM);
  el.classList.toggle('fx-hide', !!b?.hide);
  if (useW) el.style.setProperty('--fx-w', `${b!.w}px`); else el.style.removeProperty('--fx-w');
  if (useH) el.style.setProperty('--fx-h', `${b!.h}px`); else el.style.removeProperty('--fx-h');
  if (useM) { el.style.setProperty('--fx-x', `${b!.x ?? 0}px`); el.style.setProperty('--fx-y', `${b!.y ?? 0}px`); } else { el.style.removeProperty('--fx-x'); el.style.removeProperty('--fx-y'); }
}

/** Kabukta bir kez: kayıtlı ad, gizleme ve kutu ayarlarını DOM'a uygular (React'a dokunmadan; değişiklikleri izler). */
export function useFreeformEngine() {
  const ui: UiPrefs = useProfile().data?.ui_prefs ?? {};
  const loc = useLocation();
  const rk = routeKey(loc.pathname);
  const ref = useRef({ ui, rk });
  ref.current = { ui, rk };
  const sig = JSON.stringify([ui.renames, ui.hidden_ui, ui.boxes?.[rk]]);
  const run = useCallback(() => {
    const { ui: u, rk: r } = ref.current;
    const renames = u.renames ?? {}, hidden = new Set(u.hidden_ui ?? []);
    document.querySelectorAll<HTMLElement>(TEXT_SEL).forEach((el) => {
      if (el.closest('.cmenu, .fx-ui, textarea, input, select')) return;
      const user = !!el.closest(USER_DATA);
      for (const n of own(el)) {
        const orig = user ? null : applyText(n, renames);
        if (orig && el.closest('.main')) { const it = el.closest('button, a, .btn') as HTMLElement | null; if (it) it.classList.toggle('fx-hide', hidden.has(`${r}|${orig}`)); }
      }
    });
    const boxes = u.boxes?.[r] ?? {};
    listBoxes().forEach(({ el, key }) => paintBox(el, boxes[key]));
  }, []);
  useEffect(() => {
    let raf = 0;
    const sched = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { run(); obs.takeRecords(); }); };
    const root = document.querySelector('.cb-stage') ?? document.body;
    const obs = new MutationObserver(sched);
    obs.observe(root, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', sched);
    sched();
    return () => { obs.disconnect(); window.removeEventListener('resize', sched); cancelAnimationFrame(raf); };
  }, [run, sig, rk]);
}

export function useFreeActions() {
  const write = usePrefsWriter();
  const loc = useLocation();
  const rk = routeKey(loc.pathname);
  return {
    rk,
    setBox: (key: string, b: Box | null) => write((u) => { const all = { ...(u.boxes ?? {}) }; const m = { ...(all[rk] ?? {}) }; if (b) m[key] = b; else delete m[key]; all[rk] = m; return { ...u, boxes: all }; }),
    rename: (orig: string, next: string) => write((u) => { const r = { ...(u.renames ?? {}) }; if (next.trim() && next.trim() !== orig) r[orig] = next.trim(); else delete r[orig]; return { ...u, renames: r }; }),
    toggleHide: (orig: string) => write((u) => { const k = `${rk}|${orig}`, h = u.hidden_ui ?? []; return { ...u, hidden_ui: h.includes(k) ? h.filter((x) => x !== k) : [...h, k] }; }),
    resetScreen: () => write((u) => { const all = { ...(u.boxes ?? {}) }; delete all[rk]; return { ...u, boxes: all, hidden_ui: (u.hidden_ui ?? []).filter((x) => !x.startsWith(`${rk}|`)) }; }),
  };
}

/** Düzenleme modunda her kutunun üstünde: taşı, gizle, adlandır, sıfırla ve sağ/alt/köşe boyut tutamaçları. */
export function BoxOverlay() {
  const { on } = useEditMode();
  const loc = useLocation();
  const ui: UiPrefs = useProfile().data?.ui_prefs ?? {};
  const act = useFreeActions();
  const boxesRef = useRef<Record<string, Box>>({});
  boxesRef.current = ui.boxes?.[routeKey(loc.pathname)] ?? {};
  const [rects, setRects] = useState<{ key: string; el: HTMLElement; r: DOMRect; title: string }[]>([]);
  const [ren, setRen] = useState<{ orig: string } | null>(null);
  useEffect(() => {
    if (!on) { setRects([]); return; }
    let raf = 0, last = '';
    const bound = () => document.querySelector('.cb-scroll')?.getBoundingClientRect();
    const loop = () => {
      const bb = bound();
      const next = listBoxes().map(({ el, key }) => {
        const r = el.getBoundingClientRect();
        const h = el.querySelector('h2, h1'); const tn = h ? own(h)[0] : null;
        return { key, el, r, title: tn ? origOf(tn) : '' };
      }).filter((x) => bb && x.r.bottom > bb.top + 20 && x.r.top < bb.bottom - 20 && x.r.height > 20);
      const sig = next.map((x) => `${x.key}${Math.round(x.r.left)},${Math.round(x.r.top)},${Math.round(x.r.width)},${Math.round(x.r.height)}`).join('|');
      if (sig !== last) { last = sig; setRects(next); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [on, loc.pathname]);
  if (!on || !wide()) return null;
  const start = (e: React.PointerEvent, key: string, el: HTMLElement, mode: 'move' | 'w' | 'h' | 'wh') => {
    e.preventDefault(); e.stopPropagation();
    const r = el.getBoundingClientRect(), b0 = { ...(boxesRef.current[key] ?? {}) };
    const sx = e.clientX, sy = e.clientY, cur: Box = { ...b0 };
    document.body.classList.add('fx-dragging');
    const mv = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (mode === 'move') { cur.x = snap((b0.x ?? 0) + dx); cur.y = snap((b0.y ?? 0) + dy); }
      else { if (mode.includes('w')) cur.w = Math.max(140, snap(r.width + dx)); if (mode.includes('h')) cur.h = Math.max(60, snap(r.height + dy)); }
      paintBox(el, cur);
    };
    const up = () => { window.removeEventListener('pointermove', mv); document.body.classList.remove('fx-dragging'); act.setBox(key, cur); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up, { once: true });
  };
  return (
    <div className="fx-ui" aria-hidden={false}>
      {rects.map(({ key, el, r, title }) => {
        const b = boxesRef.current[key] ?? {};
        return (
          <div key={key} className={`fx-box${b.hide ? ' off' : ''}`} style={{ left: r.left, top: r.top, width: r.width, height: r.height }}>
            <div className="fx-bar">
              <button type="button" className="fx-b fx-grip" aria-label={`Move ${title || key}`} title="Drag to move anywhere" onPointerDown={(e) => start(e, key, el, 'move')}><GripVertical size={14} /></button>
              <button type="button" className="fx-b" aria-label={b.hide ? 'Show box' : 'Hide box'} title={b.hide ? 'Show' : 'Hide'} onClick={() => act.setBox(key, { ...b, hide: !b.hide })}>{b.hide ? <EyeOff size={14} /> : <Eye size={14} />}</button>
              {title && <button type="button" className="fx-b" aria-label="Rename title" title="Rename" onClick={() => setRen({ orig: title })}><Pencil size={13} /></button>}
              {(b.w || b.h || b.x || b.y) && <button type="button" className="fx-b" aria-label="Reset box" title="Reset size & position" onClick={() => act.setBox(key, b.hide ? { hide: true } : null)}><RotateCcw size={13} /></button>}
              <span className="fx-dim">{Math.round(r.width)}×{Math.round(r.height)}</span>
            </div>
            <span className="fx-h fx-hr" onPointerDown={(e) => start(e, key, el, 'w')} />
            <span className="fx-h fx-hb" onPointerDown={(e) => start(e, key, el, 'h')} />
            <span className="fx-h fx-hc" onPointerDown={(e) => start(e, key, el, 'wh')} />
          </div>
        );
      })}
      {ren && <RenameDialog name={(ui.renames ?? {})[ren.orig] ?? ren.orig} onClose={() => setRen(null)} onSave={(n) => act.rename(ren.orig, n)} />}
    </div>
  );
}
