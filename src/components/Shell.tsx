import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Sun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, LogOut } from 'lucide-react';
import { formatLong, minutesOf, hhmm, todayKey } from '../lib/dates';
import { useProfile } from '../lib/data';
import { currentCity } from '../lib/prefs';
import { supabase } from '../lib/supabase';
import { Bow, Decor, Intro, Ring } from '../crystal/Decor';
import { CreateSheet, DesktopNav, Dock, useRecent } from '../crystal/Nav';
import { EditBar, EditModeProvider, EditToggle } from '../lib/layout';
import { CAL, applyCalendar, applyDefs, applyLook } from '../lib/defs';
import { NAV } from '../crystal/Nav';
import { playPageTurn } from '../crystal/pageTurn';
import { PageCorners } from '../crystal/PageCorners';
import { useApplyBackground, useLookUrl } from '../crystal/look';
import { NotificationBell } from './NotificationBell';
import { QuickSearch } from './QuickSearch';
import { OfflineBadge } from './OfflineBadge';
import { QuickLinks } from './QuickLinks';

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15_000); return () => clearInterval(t); }, []);
  return now;
}

// Open-Meteo: anahtarsız, Bursa
const WMO: [number[], string, typeof Sun][] = [
  [[0, 1], 'Clear', Sun], [[2, 3], 'Partly cloudy', Cloud], [[45, 48], 'Foggy', CloudFog],
  [[51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82], 'Rainy', CloudRain],
  [[71, 73, 75, 77, 85, 86], 'Snowy', CloudSnow], [[95, 96, 99], 'Stormy', CloudLightning],
];
export function useWeather() {
  return useQuery({
    queryKey: ['weather', currentCity().name],
    staleTime: 30 * 60_000,
    retry: 0,
    queryFn: async () => {
      const c = currentCity();
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FIstanbul&forecast_days=1`);
      if (!r.ok) throw new Error('weather');
      const j = await r.json();
      const code = j.current.weather_code as number;
      const m = WMO.find(([codes]) => codes.includes(code)) ?? WMO[1];
      const temp = Math.round(j.current.temperature_2m as number);
      const rain = Math.round((j.daily.precipitation_probability_max?.[0] ?? 0) as number);
      const hi = Math.round(j.daily.temperature_2m_max[0] as number), lo = Math.round(j.daily.temperature_2m_min[0] as number);
      const wind = Math.round(j.current.wind_speed_10m as number);
      const tips: string[] = [];
      if (rain >= 50 || m[1] === 'Rainy') tips.push('Take an umbrella ☂');
      if (m[1] === 'Snowy') tips.push('Snow today, dress warm ❄');
      if (m[1] === 'Stormy') tips.push('Storm possible, be careful if you go out');
      if (temp <= 8) tips.push('Cold, a coat is a must');
      else if (temp <= 16) tips.push('Cool, a light jacket will do');
      else if (temp >= 29) tips.push('Hot, drink plenty of water');
      if (wind >= 30) tips.push('Strong wind');
      if (!tips.length) tips.push(m[1] === 'Clear' ? 'Nice weather, a short walk will do you good' : 'A good day to go out');
      return { city: c.name, temp, feels: Math.round(j.current.apparent_temperature as number), label: m[1], Icon: m[2], rain, hi, lo, wind, tip: tips.join(' · ') };
    },
  });
}

export function Clock() {
  const now = useNow();
  const w = useWeather();
  return (
    <div className="glass clock">
      <div>
        <div className="date">{formatLong(todayKey())}</div>
        <div className="time">{hhmm(minutesOf(now))}</div>
      </div>
      {w.data && (
        <div className="weather" title="Open-Meteo">
          <w.data.Icon size={20} color="var(--orange-500)" />
          <span><b>{w.data.temp}°C</b><br />{w.data.city} · {w.data.label}</span>
        </div>
      )}
    </div>
  );
}

/** Tıklamada pırıltı patlaması (yalnız transform/opacity; sade mod/hareketi azalt'ta kapalı). */
function useSparkle() {
  useEffect(() => {
    const off = () => document.documentElement.classList.contains('simple') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const colors = ['#FF4FA8', '#FFC94D', '#3FE0D6', '#fff', '#B58CFF'];
    const burst = (e: PointerEvent) => {
      if (off()) return;
      const t = e.target as HTMLElement | null;
      if (!t?.closest('.btn-primary, .check, .cr-dock a, .cr-dock button, .cr-nav a, .cr-act')) return;
      for (let i = 0; i < 8; i++) {
        const d = document.createElement('i');
        d.setAttribute('aria-hidden', 'true');
        d.className = 'cr-burst';
        d.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;background:${colors[i % colors.length]}`;
        document.body.appendChild(d);
        const a = (Math.PI * 2 * i) / 8 + Math.random() * 0.5, r = 24 + Math.random() * 26;
        const an = d.animate([{ transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 }, { transform: `translate(${Math.cos(a) * r}px,${Math.sin(a) * r}px) scale(.15) rotate(90deg)`, opacity: 0 }], { duration: 560, easing: 'cubic-bezier(.2,.8,.2,1)' });
        an.onfinish = () => d.remove();
      }
    };
    // kristal kartlarda ışık fareyi izler (yalnız CSS değişkeni; yeniden çizim ucuz)
    let last: HTMLElement | null = null;
    const glow = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('.glass') ?? null;
      if (last && last !== el) { last.style.removeProperty('--mx'); last.style.removeProperty('--my'); }
      last = el;
      if (!el) return;
      const b = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${Math.round(e.clientX - b.left)}px`);
      el.style.setProperty('--my', `${Math.round(e.clientY - b.top)}px`);
    };
    document.addEventListener('pointerdown', burst, { passive: true });
    document.addEventListener('pointermove', glow, { passive: true });
    return () => { document.removeEventListener('pointerdown', burst); document.removeEventListener('pointermove', glow); };
  }, []);
}

export function Shell() {
  return <EditModeProvider><ShellInner /></EditModeProvider>;
}
function ShellInner() {
  const profile = useProfile();
  applyDefs(profile.data?.ui_prefs?.defs);
  applyCalendar(profile.data?.ui_prefs?.calendar);
  const calNav = NAV.find((n) => n.match === '/calendar'); if (calNav) calNav.to = `/calendar/${CAL.view}`;
  const look = profile.data?.ui_prefs?.look;
  useEffect(() => { applyLook(look); }, [JSON.stringify(look ?? {})]); // eslint-disable-line react-hooks/exhaustive-deps
  const nav = useNavigate();
  const loc = useLocation();
  useSparkle();
  useApplyBackground();
  useRecent();
  useLayoutEffect(() => { playPageTurn(); }, [loc.pathname]);
  const [deskNew, setDeskNew] = useState(false);
  const medalAva = useLookUrl('avatar');
  return (
    <div className="cb-stage">
      <Intro />
      <div className="cb-book" data-glass="cover">
        <aside className="cb-left" data-glass="left">
          <Link to="/" className="cr-medal" aria-label="Home">
            <Bow className="cr-medal-bow" />
            {medalAva ? <img className="cr-medal-ava" src={medalAva} alt="" /> : <span className="cr-medal-t">Su's<br />Magical<br />Journal</span>}
          </Link>
          <div className="cr-hello"><b>Merhaba {profile.data?.display_name ?? 'Su'} ♡</b><span>Your dreams are always with you.</span></div>
          <DesktopNav />
          <QuickLinks />
          <div className="cr-left-foot">
            <button type="button" className="btn btn-primary" onClick={() => setDeskNew(true)}><Plus size={16} /><span className="lbl">Add to journal</span></button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => supabase.auth.signOut().then(() => nav('/'))}><LogOut size={14} /><span className="lbl">Sign out</span></button>
            <p className="cr-motto" aria-hidden="true">Dream,<br />Plan,<br />Create… <span>♡</span></p>
          </div>
        </aside>
        <div className="cb-spine" data-glass="spine" aria-hidden="true"><i><Ring /></i><i><Ring /></i><i><Ring /></i><i><Ring /></i><i><Ring /></i></div>
        <section className="cb-right" data-glass="page">
          <header className="cb-top">
            <Link to="/" className="cb-top-brand">Su's Magical Journal</Link>
            <div className="utilbar">
              <OfflineBadge />
              <EditToggle />
              <QuickSearch />
              <NotificationBell />
            </div>
          </header>
          <div className="cb-scroll">
            <EditBar />
            <main className="main"><Outlet /></main>
          </div>
          <PageCorners />
        </section>
      </div>
      <Decor />
      <Dock />
      {deskNew && <CreateSheet onClose={() => setDeskNew(false)} />}
    </div>
  );
}

export function PageHead({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="topbar">
      <h1>{title}</h1>
      <div className="row">{children}</div>
    </div>
  );
}
