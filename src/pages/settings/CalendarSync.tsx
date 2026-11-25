// Ayarlar · Takvim eşitleme: (a) ICS abonelik bağlantısı (Google/Apple), (b) dış takvim ICS bağlantıları (saatte bir, salt okunur).
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock as CalendarSync, Copy, Plus, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Field, useToast } from '../../components/ui';

interface Feed { id: string; token: string }
interface ExtCal { id: string; name: string; url: string; color: string; last_synced_at: string | null; error: string | null; event_count: number }
const FN = `${import.meta.env.VITE_SUPABASE_URL ?? 'https://tjouaydmwmokbuomyyub.supabase.co'}/functions/v1/calendar-sync`;

export function CalendarSyncSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const feed = useQuery({ queryKey: ['extcal', 'feed'], queryFn: async () => { const { data, error } = await supabase.from('calendar_feeds').select('id,token').is('deleted_at', null).maybeSingle(); if (error) throw error; return data as Feed | null; } });
  const cals = useQuery({ queryKey: ['extcal', 'list'], queryFn: async () => { const { data, error } = await supabase.from('external_calendars').select('*').is('deleted_at', null).order('created_at'); if (error) throw error; return data as ExtCal[]; } });
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [color, setColor] = useState('#5AA9E6');
  const [syncing, setSyncing] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['extcal'] });
  const link = feed.data ? `${FN}?token=${feed.data.token}` : '';
  async function makeFeed(rotate = false) {
    if (rotate && feed.data) await supabase.from('calendar_feeds').update({ deleted_at: new Date().toISOString() }).eq('id', feed.data.id);
    const { error } = await supabase.from('calendar_feeds').insert({});
    if (error) return toast.fail(error);
    refresh(); toast.ok(rotate ? 'New private link created; the old one stops working' : 'Subscription link ready ✦');
  }
  async function syncNow() {
    setSyncing(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const r = await fetch(FN, { method: 'POST', headers: { Authorization: `Bearer ${s.session?.access_token ?? ''}`, 'Content-Type': 'application/json' }, body: '{}' });
      if (!r.ok) throw new Error(`Sync failed (${r.status})`);
      refresh(); qc.invalidateQueries({ queryKey: ['cal'] }); toast.ok('Calendars synced ✦');
    } catch (x) { toast.fail(x); }
    setSyncing(false);
  }
  async function add() {
    let u = url.trim(); if (!u) return;
    if (!/^(https?|webcal):\/\//i.test(u)) u = 'https://' + u;
    const { error } = await supabase.from('external_calendars').insert({ name: name.trim() || 'Calendar', url: u, color });
    if (error) return toast.fail(error);
    setName(''); setUrl(''); refresh(); void syncNow();
  }
  async function del(id: string) { const { error } = await supabase.from('external_calendars').update({ deleted_at: new Date().toISOString() }).eq('id', id); if (error) toast.fail(error); refresh(); qc.invalidateQueries({ queryKey: ['cal'] }); }
  return (
    <section className="glass panel">
      <div className="panel-head"><h2>Calendar sync</h2><CalendarSync size={18} className="muted" /></div>
      <b className="small">Subscribe from Google / Apple Calendar</b>
      <p className="small muted" style={{ marginTop: 4 }}>Your tasks and events as a private, read-only calendar. In Google Calendar: Other calendars → From URL. On iPhone: Settings → Calendar → Accounts → Add subscribed calendar.</p>
      {link ? (
        <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
          <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Subscription link" />
          <button type="button" className="btn btn-glass btn-sm icon-only" aria-label="Copy link" title="Copy" onClick={() => navigator.clipboard.writeText(link).then(() => toast.ok('Copied'))}><Copy size={14} /></button>
          <button type="button" className="btn btn-ghost btn-sm icon-only" aria-label="Create a new private link" title="New link (old stops working)" onClick={() => makeFeed(true)}><RotateCcw size={14} /></button>
        </div>
      ) : <button type="button" className="btn btn-glass btn-sm" onClick={() => makeFeed()}><Plus size={14} />Create subscription link</button>}
      <b className="small" style={{ display: 'block', marginTop: 14 }}>Show external calendars</b>
      <p className="small muted" style={{ marginTop: 4 }}>Paste a calendar’s public or secret ICS address (Google: Settings → calendar → “Secret address in iCal format”). Imported every hour, read-only, in its own color.</p>
      <div className="def-list">
        {(cals.data ?? []).map((c) => (
          <div key={c.id} className="def-row">
            <i className="dot" style={{ background: c.color, width: 12, height: 12 }} />
            <span style={{ flex: 1, minWidth: 0 }}><b className="small">{c.name}</b><span className="small muted" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.error ? `⚠ ${c.error}` : c.last_synced_at ? `${c.event_count} events · synced ${new Date(c.last_synced_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}` : 'Waiting for first sync'}</span></span>
            <button type="button" className="btn btn-ghost btn-sm icon-only" aria-label={`Remove ${c.name}`} onClick={() => del(c.id)}><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
      <div className="grid-3" style={{ marginTop: 8 }}>
        <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Work" /></Field>
        <Field label="ICS address"><input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… .ics" /></Field>
        <Field label="Color"><input type="color" className="def-color" value={color} onChange={(e) => setColor(e.target.value)} /></Field>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={add} disabled={!url.trim()}><Plus size={14} />Add calendar</button>
        {(cals.data?.length ?? 0) > 0 && <button type="button" className="btn btn-glass btn-sm" onClick={syncNow} disabled={syncing}><RefreshCw size={14} />{syncing ? 'Syncing…' : 'Sync now'}</button>}
      </div>
    </section>
  );
}
