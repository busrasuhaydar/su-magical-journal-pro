import { REMINDER_OPTIONS } from '../lib/types';
import { BackupSettings } from './settings/Backups';
import { TrashSettings } from './settings/Trash';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarHeart, FolderHeart, Files, CalendarDays, Download, RotateCcw, ImagePlus, Trash2, UserRound } from 'lucide-react';
import { useLookUpload, useLookUrl } from '../crystal/look';
import { glassTap } from '../crystal/sound';
import { PageHead } from '../components/Shell';
import { Field, useToast } from '../components/ui';
import { useProfile, useSocialAccounts, useUpdateProfile } from '../lib/data';
import { callDispatcher, disablePush, enablePush, pushActive } from '../lib/notify';
import { CITIES, applySimple, getPref, setPref } from '../lib/prefs';
import { HOME_SECTIONS, useHomePrefs, type UiPrefs } from '../lib/ui';
import { supabase } from '../lib/supabase';
import { todayKey } from '../lib/dates';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export default function SettingsPage() {
  const profile = useProfile();
  const update = useUpdateProfile();
  const toast = useToast();
  const [name, setName] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState('');
  useEffect(() => { setName(profile.data?.display_name ?? ''); }, [profile.data?.display_name]);

  async function exportAll() {
    setExporting(true);
    try {
      const tables = ['profiles', 'projects', 'contacts', 'tasks', 'events', 'reminders', 'files', 'file_links', 'journal_days', 'journal_blocks'];
      const out: Record<string, unknown> = { app: "Su's Magical Journal", exported_at: new Date().toISOString(), version: 1 };
      for (const t of tables) {
        const { data, error } = await supabase.from(t).select('*').limit(10000);
        if (error) throw error;
        out[t] = data;
      }
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
      setExportUrl(URL.createObjectURL(blob));
      toast.ok('Export ready');
    } catch (x) { toast.fail(x); } finally { setExporting(false); }
  }

  return (
    <>
      <PageHead title="Settings" />
      <section className="glass panel">
        <div className="panel-head"><h2>Quick access</h2></div>
        <div className="row">
          <Link className="btn btn-glass" to={`/day/${todayKey()}`}><CalendarHeart size={15} />Daily Plan</Link>
          <Link className="btn btn-glass" to="/calendar/year"><CalendarDays size={15} />Yearly calendar</Link>
          <Link className="btn btn-glass" to="/projects"><FolderHeart size={15} />My Projects</Link>
          <Link className="btn btn-glass" to="/files"><Files size={15} />Files</Link>
        </div>
      </section>

      <section className="glass panel">
        <div className="panel-head"><h2>Profile</h2></div>
        <form className="row" style={{ alignItems: 'end' }} onSubmit={(e) => { e.preventDefault(); update.mutate({ display_name: name.trim() || null }, { onSuccess: () => toast.ok('Saved'), onError: (x) => toast.fail(x) }); }}>
          <div style={{ flex: '1 1 240px' }}><Field label="Display name"><input id="s-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field></div>
          <button className="btn btn-primary">Save</button>
        </form>
        <p className="small muted" style={{ marginBottom: 0 }}>Time zone: Europe/Istanbul · Date format: English</p>
      </section>

      <LookSettings />
      <HomeSettings />
      <PrefSettings />

      <NotificationSettings />
      <AccountSettings />
      <ReminderSettings />

      <BackupSettings />
      <TrashSettings />

      <section className="glass panel">
        <div className="panel-head"><h2>My Data</h2></div>
        <p className="small" style={{ marginTop: 0 }}>You can download all your records (tasks, events, projects, journal, file list) as a single JSON file. The files themselves stay in Supabase Storage.</p>
        <div className="row">
          <button type="button" className="btn btn-glass" onClick={exportAll} disabled={exporting}><Download size={15} />{exporting ? 'Preparing…' : 'Prepare export'}</button>
          {exportUrl && <a className="btn btn-primary" href={exportUrl} download={`su-magical-journal-${todayKey()}.json`}>Download JSON file</a>}
        </div>
      </section>
    </>
  );
}

function ReminderSettings() {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['reminder_settings'], queryFn: async () => { const { data } = await supabase.from('reminder_settings').select('*').maybeSingle(); return data as { deadline_offsets: number[]; other_offsets: number[] } | null; } });
  const [dl, setDl] = useState('');
  const [ot, setOt] = useState('');
  useEffect(() => { setDl((q.data?.deadline_offsets ?? [30, 14, 7, 3, 0]).join(', ')); setOt((q.data?.other_offsets ?? [1, 0]).join(', ')); }, [q.data]);
  const parse = (s: string) => [...new Set(s.split(/[,\s]+/).filter(Boolean).map(Number))].filter((n) => Number.isInteger(n) && n >= 0 && n <= 365).sort((a, b) => b - a);
  async function save() {
    const d = parse(dl), o = parse(ot);
    if (!d.length) return toast.fail(new Error('Enter at least one day for the application deadline (e.g. 30, 14, 7, 3, 0).'));
    const { error } = await supabase.from('reminder_settings').upsert({ deadline_offsets: d, other_offsets: o }, { onConflict: 'owner_id' });
    if (error) return toast.fail(error);
    qc.invalidateQueries({ queryKey: ['reminder_settings'] }); toast.ok('Reminder settings saved');
  }
  return (
    <section className="glass panel">
      <div className="panel-head"><h2>Application reminders</h2></div>
      <div className="grid-2">
        <Field label="Days before the deadline (comma-separated)"><input id="rs-dl" className="input" value={dl} onChange={(e) => setDl(e.target.value)} /></Field>
        <Field label="For results, delivery, installation, opening"><input id="rs-ot" className="input" value={ot} onChange={(e) => setOt(e.target.value)} /></Field>
      </div>
      <div className="row" style={{ marginTop: 10 }}><button type="button" className="btn btn-primary btn-sm" onClick={save}>Save</button><span className="small muted">0 = the day itself. Applies to newly added or changed dates.</span></div>
    </section>
  );
}

function NotificationSettings() {
  const toast = useToast();
  const qc = useQueryClient();
  const profile = useProfile();
  const update = useUpdateProfile();
  const [active, setActive] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [emailReady, setEmailReady] = useState<boolean | null>(null);
  useEffect(() => { pushActive().then(setActive); callDispatcher<{ email: boolean }>({ action: 'status' }).then((s) => setEmailReady(s.email)).catch(() => setEmailReady(null)); }, []);
  async function toggle() {
    setBusy(true);
    try {
      if (active) { await disablePush(); setActive(false); toast.ok('Notifications turned off on this device'); }
      else {
        const r = await enablePush();
        if (r === 'ok') { setActive(true); toast.ok('Notifications turned on on this device'); }
        else if (r === 'denied') toast.fail(new Error('The browser didn’t allow it. Enable notification permission in the site settings in the address bar.'));
        else toast.fail(new Error('This browser doesn’t support web notifications. On iPhone, first add the app to your Home Screen.'));
      }
    } catch (x) { toast.fail(x); } finally { setBusy(false); }
  }
  async function test() {
    try { const r = await callDispatcher<{ push_devices: number }>({ action: 'test' }); qc.invalidateQueries({ queryKey: ['notifications'] }); toast.ok(`Test notification sent · ${r.push_devices} device(s)`); } catch (x) { toast.fail(x); }
  }
  return (
    <section className="glass panel" style={{ display: 'grid', gap: 12 }}>
      <div className="panel-head" style={{ marginBottom: 0 }}><h2>Notifications</h2><button type="button" className="btn btn-glass btn-sm" onClick={test}>Send test notification</button></div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span><b>Browser notifications on this device</b><br /><span className="small muted">{active == null ? 'Checking…' : active ? 'On · reminders arrive even when the app is closed.' : 'Off'}</span></span>
        <button type="button" className={`btn ${active ? 'btn-glass' : 'btn-primary'}`} disabled={busy || active == null} onClick={toggle}>{active ? 'Close' : 'Turn on'}</button>
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span><b>Email notifications</b><br /><span className="small muted">{emailReady === false ? 'Email service isn’t connected (add RESEND_API_KEY to the Supabase secrets).' : 'Reminders are also sent to your account’s email address.'}</span></span>
        <label className="row small" style={{ gap: 6, cursor: emailReady === false ? 'not-allowed' : 'pointer' }}><input id="n-email" type="checkbox" disabled={emailReady === false} checked={!!profile.data?.email_notifications} onChange={(e) => update.mutate({ email_notifications: e.target.checked } as never)} />On</label>
      </div>
      <p className="small muted" style={{ margin: 0 }}>In-app notifications are always on; they appear on the bell at the top right. The scheduler runs every minute.</p>
    </section>
  );
}

const PLATFORMS: { key: 'instagram' | 'x' | 'youtube'; name: string; needs: string; help: string }[] = [
  { key: 'instagram', name: 'Instagram', needs: 'IG_APP_ID, IG_APP_SECRET', help: 'An app in Meta for Developers with the “Instagram API with Instagram Login” product. Your account must be Business or Creator. Publishing permission (instagram_business_content_publish) may require Meta app review.' },
  { key: 'x', name: 'X', needs: 'X_CLIENT_ID, X_CLIENT_SECRET', help: 'An app on developer.x.com with OAuth 2.0 enabled (Read and write). Write access may depend on X’s paid API plan.' },
  { key: 'youtube', name: 'YouTube', needs: 'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET', help: 'A Google Cloud project with YouTube Data API v3 enabled and an OAuth client. Videos uploaded from projects that haven’t passed Google’s audit stay private.' },
];
function AccountSettings() {
  const accounts = useSocialAccounts();
  const toast = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState<Record<string, boolean> | null>(null);
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState(() => location.hash === '#accounts' || new URLSearchParams(location.search).has('connected') || new URLSearchParams(location.search).has('error'));
  const callback = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oauth`;
  useEffect(() => {
    callDispatcher<Record<string, boolean>>({ action: 'status' }).then(setStatus).catch(() => setStatus(null));
    const p = new URLSearchParams(location.search);
    if (p.get('connected')) toast.ok(`${p.get('connected')} account connected`);
    if (p.get('error')) toast.fail(new Error(p.get('error')!));
    if (p.get('connected') || p.get('error')) history.replaceState(null, '', `${import.meta.env.BASE_URL}settings#accounts`);
  }, [toast]);
  async function connect(platform: string) {
    setBusy(platform);
    try {
      const { data, error } = await supabase.functions.invoke('oauth', { body: { platform, return_to: location.origin + import.meta.env.BASE_URL.replace(/\/$/, '') } });
      if (error) { let msg = error.message; try { const j = await (error as { context?: Response }).context?.json(); if (j?.error) msg = j.error + (j.missing ? ` Required: ${j.missing.join(', ')}.` : ''); } catch { /* yok say */ } throw new Error(msg); }
      location.assign(data.url);
    } catch (x) { toast.fail(x); setBusy(''); }
  }
  async function disconnect(id: string) {
    const { error } = await supabase.from('social_accounts').delete().eq('id', id);
    if (error) toast.fail(error); else { qc.invalidateQueries({ queryKey: ['social_accounts'] }); toast.ok('Disconnected'); }
  }
  return (
    <section className="glass panel" id="accounts" style={{ display: 'grid', gap: 12 }}>
      <button type="button" className="acc-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <h2>Social media accounts</h2>
        <span className="row" style={{ gap: 8 }}>
          {PLATFORMS.map((pl) => { const a = accounts.data?.find((x) => x.platform === pl.key); return <span key={pl.key} className="chip" style={{ color: a?.status === 'connected' ? 'var(--ok)' : undefined }}>{pl.name} · {a ? (a.status === 'connected' ? 'connected' : 'reconnect') : 'not connected'}</span>; })}
          <span className="acc-chev" style={{ transform: open ? 'rotate(180deg)' : undefined }}>⌄</span>
        </span>
      </button>
      {open && <>
      <p className="small muted" style={{ margin: 0 }}>Scheduled content is published automatically on connected accounts at the scheduled time. For platforms that aren’t connected you get a notification at that time and publish and mark it manually. Tokens are stored only on the server.</p>
      {PLATFORMS.map((pl) => {
        const acc = accounts.data?.find((a) => a.platform === pl.key);
        const configured = status?.[pl.key];
        return (
          <div key={pl.key} className="card acc-row">
            <div style={{ minWidth: 0 }}>
              <b>{pl.name}</b>{' '}
              {acc ? <span className="chip" style={{ color: acc.status === 'connected' ? 'var(--ok)' : 'var(--bad)' }}>{acc.status === 'connected' ? `Connected · ${acc.account_name ?? ''}` : 'Needs reconnecting'}</span>
                : configured === false ? <span className="chip">Developer app isn’t set up</span> : <span className="chip">Not connected</span>}
              {!acc && configured === false && <p className="small muted" style={{ margin: '6px 0 0' }}>{pl.help} Supabase → Edge Functions → Secrets’a <code>{pl.needs}</code>Redirect URL: <code style={{ userSelect: 'all' }}>{callback}</code></p>}
            </div>
            <div className="row">
              {acc && <button type="button" className="btn btn-ghost btn-sm" onClick={() => disconnect(acc.id)}>Disconnect</button>}
              <button type="button" className="btn btn-primary btn-sm" disabled={busy === pl.key || configured === false} onClick={() => connect(pl.key)}>{busy === pl.key ? 'Redirecting…' : acc ? 'Reconnect' : 'Connect'}</button>
            </div>
          </div>
        );
      })}
      <div className="card acc-row"><div><b>Website</b> <span className="chip">Manual publishing</span><p className="small muted" style={{ margin: '6px 0 0' }}>Automatic publishing can be added once you tell us your site’s platform (WordPress etc.).</p></div></div>
      </>}
    </section>
  );
}

function PrefSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const [city, setCity] = useState(() => getPref('city', 'bursa'));
  const [simple, setSimple] = useState(() => getPref('simple', '0') === '1');
  const [defRem, setDefRem] = useState(() => getPref('defaultReminder', ''));
  const [sound, setSound] = useState(() => getPref('sound', '1') !== '0');
  return (
    <section className="glass panel">
      <div className="panel-head"><h2>Appearance & preferences</h2><span className="small muted">This device only</span></div>
      <div className="grid-2">
        <Field label="Weather city">
          <select className="select" value={city} onChange={(e) => { setCity(e.target.value); setPref('city', e.target.value); qc.invalidateQueries({ queryKey: ['weather'] }); toast.ok('City updated'); }}>
            {Object.entries(CITIES).map(([k, c]) => <option key={k} value={k}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Appearance">
          <label className="row small" style={{ cursor: 'pointer', minHeight: 42 }}>
            <input type="checkbox" checked={simple} onChange={(e) => { setSimple(e.target.checked); setPref('simple', e.target.checked ? '1' : '0'); applySimple(); }} />
            Simple mode (turn off glass blur, faster)
          </label>
        </Field>
        <Field label="Sounds">
          <label className="row small" style={{ cursor: 'pointer', minHeight: 42 }}>
            <input type="checkbox" checked={sound} onChange={(e) => { setSound(e.target.checked); setPref('sound', e.target.checked ? '1' : '0'); if (e.target.checked) glassTap(1.2); }} />
            Crystal glass sound on touch, paper sound when turning pages
          </label>
        </Field>
        <Field label="Default reminder for new tasks">
          <select className="select" value={defRem} onChange={(e) => { setDefRem(e.target.value); setPref('defaultReminder', e.target.value); toast.ok('Default reminder updated'); }}>
            {REMINDER_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      <p className="small muted" style={{ marginBottom: 0 }}>Only Turkey and US holidays are shown in the calendar. Religious holidays for 2026 and 2027 are confirmed by the Diyanet calendar; 2028 holidays show as “unconfirmed” until Diyanet publishes them.</p>
    </section>
  );
}

/** Home: kart başlıklarını yeniden adlandır, kartları göster/gizle, Boston saati. Hesapla eşitlenir. */
function HomeSettings() {
  const hp = useHomePrefs();
  const update = useUpdateProfile();
  const toast = useToast();
  const [titles, setTitles] = useState<Record<string, string>>({});
  useEffect(() => { setTitles(hp.ui.titles ?? {}); }, [hp.ui.titles]);
  const save = (patch: Partial<UiPrefs>) => update.mutate({ ui_prefs: { ...hp.ui, ...patch } }, { onError: (e) => toast.fail(e) });
  const toggle = (k: string) => { const hide = new Set(hp.ui.hide ?? []); hide.has(k) ? hide.delete(k) : hide.add(k); save({ hide: [...hide] }); };
  return (
    <section className="glass panel">
      <div className="panel-head"><h2>Home</h2><button type="button" className="btn btn-glass btn-sm" onClick={() => { setTitles({}); save({ titles: {}, hide: [] }); }}><RotateCcw size={13} />Reset to default</button></div>
      <p className="small muted" style={{ marginTop: 0 }}>Rename the card titles however you like and hide the cards you don’t want. Changes are the same on phone and computer.</p>
      <div style={{ display: 'grid', gap: 8 }}>
        {HOME_SECTIONS.map(([k, def]) => (
          <div key={k} className="row" style={{ flexWrap: 'nowrap', gap: 10 }}>
            <input type="checkbox" aria-label={`Show ${def}`} checked={!(hp.ui.hide ?? []).includes(k)} onChange={() => toggle(k)} />
            <input className="input" value={titles[k] ?? ''} placeholder={def} onChange={(e) => setTitles((t) => ({ ...t, [k]: e.target.value }))}
              onBlur={() => { if ((hp.ui.titles?.[k] ?? '') !== (titles[k] ?? '')) save({ titles: { ...(hp.ui.titles ?? {}), [k]: (titles[k] ?? '').trim() } }); }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
          </div>
        ))}
        <label className="row small" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={hp.boston} onChange={(e) => save({ boston: e.target.checked })} />
          🇺🇸 Show a small US clock on the Home page
        </label>
      </div>
    </section>
  );
}

/** Profile photo (ana sayfa düğmesinde görünür) ve arkaplan görseli (her ekrana otomatik oturur). Hesapla eşitlenir. */
function LookSettings() {
  const upload = useLookUpload();
  const avatar = useLookUrl('avatar');
  const bg = useLookUrl('bg');
  const toast = useToast();
  const [busy, setBusy] = useState('');
  async function run(kind: 'avatar' | 'bg', f: File | null) {
    if (f && !f.type.startsWith('image/')) return toast.fail(new Error('Please choose an image'));
    setBusy(kind);
    try { await upload(kind, f); toast.ok(f ? (kind === 'avatar' ? 'Profile photo updated ✦' : 'Background updated ✦') : 'Reset to default'); }
    catch (x) { toast.fail(x); }
    setBusy('');
  }
  const pick = (kind: 'avatar' | 'bg') => (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0] ?? null; e.target.value = ''; if (f) run(kind, f); };
  return (
    <section className="glass panel">
      <div className="panel-head"><h2>Personalize</h2><span className="small muted">On all devices</span></div>
      <div className="look-grid">
        <div className="look-it">
          <div className="look-ava">{avatar ? <img src={avatar} alt="Profile photo" /> : <UserRound size={34} strokeWidth={1.5} />}</div>
          <div className="look-txt"><b>Profile photo</b><span className="small muted">Shown on the Home button.</span>
            <div className="row" style={{ gap: 6 }}>
              <label className="btn btn-primary btn-sm"><ImagePlus size={14} />{busy === 'avatar' ? 'Loading…' : 'Choose photo'}<input type="file" accept="image/*" hidden onChange={pick('avatar')} disabled={!!busy} /></label>
              {avatar && <button type="button" className="btn btn-glass btn-sm icon-only" aria-label="Remove profile photo" title="Remove" disabled={!!busy} onClick={() => run('avatar', null)}><Trash2 size={14} /></button>}
            </div>
          </div>
        </div>
        <div className="look-it">
          <div className="look-bg" style={bg ? { backgroundImage: `url("${bg}")` } : undefined} />
          <div className="look-txt"><b>Background image</b><span className="small muted">Automatically fits the screen on phone and computer.</span>
            <div className="row" style={{ gap: 6 }}>
              <label className="btn btn-primary btn-sm"><ImagePlus size={14} />{busy === 'bg' ? 'Loading…' : 'Choose image'}<input type="file" accept="image/*" hidden onChange={pick('bg')} disabled={!!busy} /></label>
              {bg && <button type="button" className="btn btn-glass btn-sm" disabled={!!busy} onClick={() => run('bg', null)}><RotateCcw size={14} />Back to the castle</button>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
