// Ay / yıl sonu özeti: kurallı istatistik (biten görevler, yeni eserler, satışlar, başvurular, en çok çalışılan proje, ruh hali dağılımı)
// ve kristal temalı 9:16 paylaşılabilir görsel (canvas → PNG) + paylaş.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, Share2 } from 'lucide-react';
import { PageHead } from '../components/Shell';
import { useToast } from '../components/ui';
import { supabase } from '../lib/supabase';
import { useProfile, useProjects } from '../lib/data';
import { MONTHS, daysInMonth, todayKey } from '../lib/dates';
import { money } from '../lib/artworks';
import { MOOD_LABEL } from './Day';

const MOOD_EMOJI: Record<string, string> = { radiant: '🤩', happy: '😊', calm: '😌', tired: '😴', sad: '😢', anxious: '😟', angry: '😤', inspired: '✨' };
interface Stats { done: number; artworks: number; sales: { n: number; total: string }; apps: { n: number; accepted: number }; project: { title: string; n: number } | null; moods: [string, number][]; pages: number; posts: number }

function range(period: string) {
  if (/^\d{4}$/.test(period)) return { from: `${period}-01-01`, to: `${period}-12-31`, label: period, year: true };
  const [y, m] = period.split('-').map(Number);
  return { from: `${period}-01`, to: `${period}-${String(daysInMonth(y, m - 1)).padStart(2, '0')}`, label: `${MONTHS[m - 1]} ${y}`, year: false };
}
function shift(period: string, d: number) {
  if (/^\d{4}$/.test(period)) return String(Number(period) + d);
  const [y, m] = period.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + d, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}

function useStats(from: string, to: string) {
  const projects = useProjects();
  return useQuery({
    queryKey: ['summary', from, to, projects.data?.length],
    queryFn: async (): Promise<Stats> => {
      const s = `${from}T00:00:00+03:00`, e = `${to}T23:59:59+03:00`;
      const [tasks, arts, sold, opps, days, pages, posts] = await Promise.all([
        supabase.from('tasks').select('project_id').is('deleted_at', null).eq('status', 'done').gte('completed_at', s).lte('completed_at', e).limit(5000),
        supabase.from('artworks').select('id', { count: 'exact', head: true }).is('deleted_at', null).gte('created_at', s).lte('created_at', e),
        supabase.from('artworks').select('price,currency').is('deleted_at', null).eq('status', 'sold').gte('sold_at', from).lte('sold_at', to),
        supabase.from('opportunities').select('status,updated_at').is('deleted_at', null).in('status', ['submitted', 'awaiting', 'accepted', 'rejected', 'exhibiting', 'completed']).gte('updated_at', s).lte('updated_at', e),
        supabase.from('journal_days').select('mood').gte('day', from).lte('day', to).not('mood', 'is', null),
        supabase.from('pages').select('id', { count: 'exact', head: true }).is('deleted_at', null).gte('created_at', s).lte('created_at', e),
        supabase.from('social_posts').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'published').gte('published_at', s).lte('published_at', e),
      ]);
      const byProj = new Map<string, number>();
      (tasks.data ?? []).forEach((t) => t.project_id && byProj.set(t.project_id, (byProj.get(t.project_id) ?? 0) + 1));
      const top = [...byProj].sort((a, b) => b[1] - a[1])[0];
      const totals = new Map<string, number>();
      (sold.data ?? []).forEach((a) => a.price != null && totals.set(a.currency, (totals.get(a.currency) ?? 0) + Number(a.price)));
      const moods = new Map<string, number>();
      (days.data ?? []).forEach((d) => moods.set(d.mood as string, (moods.get(d.mood as string) ?? 0) + 1));
      return {
        done: tasks.data?.length ?? 0, artworks: arts.count ?? 0,
        sales: { n: sold.data?.length ?? 0, total: [...totals].map(([c, v]) => money(v, c)).join(' + ') },
        apps: { n: opps.data?.length ?? 0, accepted: (opps.data ?? []).filter((o) => ['accepted', 'exhibiting', 'completed'].includes(o.status)).length },
        project: top ? { title: projects.data?.find((p) => p.id === top[0])?.title ?? 'Project', n: top[1] } : null,
        moods: [...moods].sort((a, b) => b[1] - a[1]), pages: pages.count ?? 0, posts: posts.count ?? 0,
      };
    },
  });
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function paint(c: HTMLCanvasElement, s: Stats, label: string, name: string, year: boolean) {
  const W = 1080, H = 1920; c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#FFE3F1'); g.addColorStop(0.45, '#EFE4FF'); g.addColorStop(1, '#D9F7F3');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const glow = (x: number, y: number, r: number, col: string) => { const q = ctx.createRadialGradient(x, y, 0, x, y, r); q.addColorStop(0, col); q.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = q; ctx.fillRect(x - r, y - r, r * 2, r * 2); };
  glow(180, 260, 420, 'rgba(255,95,176,.35)'); glow(900, 900, 480, 'rgba(156,114,240,.28)'); glow(300, 1650, 460, 'rgba(34,207,198,.28)');
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  for (let i = 0; i < 70; i++) { const x = (i * 337) % W, y = (i * 571) % H, r = (i % 4) + 1.5; ctx.globalAlpha = 0.35 + (i % 5) / 10; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#C21F78'; ctx.font = '600 40px Georgia, serif'; ctx.fillText(`${name}'s ${year ? 'year' : 'month'} ✦`, W / 2, 190);
  ctx.fillStyle = '#3B1F4E'; ctx.font = '700 104px Georgia, serif'; ctx.fillText(label, W / 2, 310);
  const cards: [string, string, string][] = [
    ['✓', String(s.done), 'tasks completed'], ['🎨', String(s.artworks), 'new artworks'],
    ['💎', String(s.sales.n), s.sales.total ? `sales · ${s.sales.total}` : 'sales'], ['🏛', String(s.apps.n), `applications${s.apps.accepted ? ` · ${s.apps.accepted} accepted` : ''}`],
    ['📝', String(s.pages), 'new pages'], ['📣', String(s.posts), 'posts published'],
  ];
  const cw = 450, ch = 250, gx = 60, top = 400;
  cards.forEach(([ic, n, t], i) => {
    const x = (W - cw * 2 - gx) / 2 + (i % 2) * (cw + gx), y = top + Math.floor(i / 2) * (ch + 40);
    ctx.save(); ctx.shadowColor = 'rgba(194,31,120,.18)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12;
    rr(ctx, x, y, cw, ch, 44); ctx.fillStyle = 'rgba(255,255,255,.78)'; ctx.fill(); ctx.restore();
    rr(ctx, x, y, cw, ch, 44); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.font = '56px system-ui, sans-serif'; ctx.fillText(ic, x + cw / 2, y + 78);
    ctx.fillStyle = '#C21F78'; ctx.font = '800 84px system-ui, sans-serif'; ctx.fillText(n, x + cw / 2, y + 170);
    ctx.fillStyle = '#5B3E6E'; ctx.font = '500 30px system-ui, sans-serif'; ctx.fillText(t.length > 30 ? t.slice(0, 29) + '…' : t, x + cw / 2, y + 220);
  });
  let y = top + 3 * (ch + 40) + 40;
  if (s.project) {
    rr(ctx, 60, y, W - 120, 150, 44); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fill();
    ctx.fillStyle = '#7A3FD0'; ctx.font = '600 30px system-ui, sans-serif'; ctx.fillText('Most worked-on project', W / 2, y + 55);
    ctx.fillStyle = '#3B1F4E'; ctx.font = '700 48px Georgia, serif'; ctx.fillText(`${s.project.title.slice(0, 26)} · ${s.project.n}`, W / 2, y + 115);
    y += 190;
  }
  if (s.moods.length) {
    ctx.fillStyle = '#7A3FD0'; ctx.font = '600 30px system-ui, sans-serif'; ctx.fillText('Mood', W / 2, y + 20);
    const total = s.moods.reduce((a, [, n]) => a + n, 0);
    const shown = s.moods.slice(0, 5); const step = (W - 160) / shown.length;
    shown.forEach(([m, n], i) => {
      const x = 80 + step * i + step / 2;
      ctx.font = '72px system-ui, sans-serif'; ctx.fillText(MOOD_EMOJI[m] ?? '•', x, y + 115);
      ctx.fillStyle = '#5B3E6E'; ctx.font = '600 28px system-ui, sans-serif'; ctx.fillText(`${Math.round((n / total) * 100)}%`, x, y + 160); ctx.fillStyle = '#7A3FD0';
    });
  }
  ctx.fillStyle = '#C21F78'; ctx.font = 'italic 34px Georgia, serif'; ctx.fillText("Su's Magical Journal · Dream, Plan, Create ♡", W / 2, H - 90);
}

export default function SummaryPage() {
  const { period: p } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const name = useProfile().data?.display_name ?? 'Su';
  const period = p && /^\d{4}(-\d{2})?$/.test(p) ? p : todayKey().slice(0, 7);
  const r = range(period);
  const st = useStats(r.from, r.to);
  const cv = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState('');
  useEffect(() => { if (st.data && cv.current) { paint(cv.current, st.data, r.label, name, r.year); setUrl(cv.current.toDataURL('image/png')); } }, [st.data, r.label, name, r.year]);
  const file = useMemo(() => `journal-${period}.png`, [period]);
  async function share() {
    const c = cv.current; if (!c) return;
    const blob: Blob | null = await new Promise((res) => c.toBlob(res, 'image/png'));
    if (!blob) return;
    const f = new File([blob], file, { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], title: `${r.label} in my journal` });
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file; a.click(); toast.ok('Image downloaded'); }
    } catch { /* paylaşım iptal */ }
  }
  const s = st.data;
  return (
    <>
      <PageHead title={`${r.year ? 'Year' : 'Month'} in review`}>
        <div className="row" style={{ gap: 4 }}>
          <button type="button" className="btn btn-glass icon-btn" aria-label="Previous" onClick={() => nav(`/summary/${shift(period, -1)}`)}><ChevronLeft size={18} /></button>
          <span className="chip">{r.label}</span>
          <button type="button" className="btn btn-glass icon-btn" aria-label="Next" onClick={() => nav(`/summary/${shift(period, 1)}`)}><ChevronRight size={18} /></button>
        </div>
        <div className="seg"><button type="button" className={!r.year ? 'on' : ''} onClick={() => nav(`/summary/${period.slice(0, 4)}-${r.year ? '12' : period.slice(5, 7)}`)}>Month</button><button type="button" className={r.year ? 'on' : ''} onClick={() => nav(`/summary/${period.slice(0, 4)}`)}>Year</button></div>
      </PageHead>
      <div className="sum-grid">
        <section className="glass panel">
          {!s ? <p className="muted">Counting…</p> : (
            <div className="sum-stats">
              <div><b>{s.done}</b><span>tasks completed</span></div>
              <div><b>{s.artworks}</b><span>new artworks</span></div>
              <div><b>{s.sales.n}</b><span>sales{s.sales.total ? ` · ${s.sales.total}` : ''}</span></div>
              <div><b>{s.apps.n}</b><span>applications · {s.apps.accepted} accepted</span></div>
              <div><b>{s.pages}</b><span>new pages</span></div>
              <div><b>{s.posts}</b><span>posts published</span></div>
              <div className="sum-wide"><span>Most worked-on project</span><b className="sum-proj">{s.project ? `${s.project.title} · ${s.project.n} tasks` : '—'}</b></div>
              <div className="sum-wide"><span>Mood</span><b className="sum-moods">{s.moods.length ? s.moods.map(([m, n]) => `${MOOD_EMOJI[m] ?? ''} ${MOOD_LABEL[m] ?? m} ${n}`).join(' · ') : 'No moods logged'}</b></div>
            </div>
          )}
        </section>
        <section className="glass panel sum-card">
          <canvas ref={cv} hidden />
          {url ? <img src={url} alt={`${r.label} summary image`} className="sum-img" /> : <div className="sum-img sum-ph" />}
          <div className="row" style={{ gap: 6, justifyContent: 'center' }}>
            <button type="button" className="btn btn-primary" onClick={share} disabled={!url}><Share2 size={15} />Share</button>
            {url && <a className="btn btn-glass" href={url} download={file}><Download size={15} />Download</a>}
          </div>
        </section>
      </div>
    </>
  );
}
