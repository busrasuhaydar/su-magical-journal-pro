import { installSounds } from './crystal/sound';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { idbPersister } from './lib/offline';
import './styles/app.css';
import './styles/crystal.css';
import { useEffect, useRef } from 'react';
import { startCrystal } from './crystal/scene';
import { installPageTurn } from './crystal/pageTurn';
installPageTurn();
installSounds();
// krom simge gradyanları (CSS: stroke: url(#cr-ic) yedek renk)
document.body.insertAdjacentHTML('afterbegin', `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
  <linearGradient id="cr-ic" gradientUnits="userSpaceOnUse" x1="2" y1="2" x2="22" y2="22"><stop offset="0" stop-color="#FF7AC0"/><stop offset=".32" stop-color="#B0246F"/><stop offset=".5" stop-color="#E9479B"/><stop offset=".68" stop-color="#7A1650"/><stop offset="1" stop-color="#D03A8C"/></linearGradient>
  <linearGradient id="cr-ic-teal" gradientUnits="userSpaceOnUse" x1="2" y1="2" x2="22" y2="22"><stop offset="0" stop-color="#5FE8DF"/><stop offset=".35" stop-color="#0B7F86"/><stop offset=".55" stop-color="#2FD6C9"/><stop offset="1" stop-color="#086068"/></linearGradient>
</defs></svg>`);
import { queryClient, useRealtime, useSession } from './lib/data';
import { ToastProvider } from './components/ui';
import { EditorProvider } from './components/Editors';
import { Shell } from './components/Shell';
import Login from './pages/Login';
import Home from './pages/Home';
import CalendarPage from './pages/Calendar';
import DayPage from './pages/Day';
import TasksPage from './pages/Tasks';
import ProjectsPage from './pages/Projects';
import FilesPage from './pages/Files';
import SettingsPage from './pages/Settings';
import SocialPage from './pages/Social';
import ContactsPage from './pages/Contacts';
import IdeasPage from './pages/Ideas';
import { applySimple } from './lib/prefs';
import { startAutoIcons } from './lib/autoIcons';
applySimple();
startAutoIcons();
import NftCollectionsPage from './pages/NftCollections';
import ProjectWorkspace from './pages/project/Workspace';
import OpportunitiesPage from './pages/Opportunities';
import CommonGallery from './pages/Gallery';
import PagesPage from './pages/Pages';
import InboxPage from './pages/Inbox';
import { todayKey } from './lib/dates';

function CrystalCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => startCrystal(ref.current!), []);
  return <canvas className="cr-canvas" ref={ref} aria-hidden="true" />;
}

function App() {
  const session = useSession();
  useRealtime(!!session);
  if (session === undefined) return <div className="auth"><span className="cr-loading">Opening the journal…</span></div>;
  if (!session) return <Login />;
  return (
    <EditorProvider>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Home />} />
          <Route path="calendar" element={<Navigate to="/calendar/year" replace />} />
          <Route path="calendar/:view/:date?" element={<CalendarPage />} />
          <Route path="day" element={<Navigate to={`/day/${todayKey()}`} replace />} />
          <Route path="day/:date" element={<DayPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:slug/:tab?/:sub?" element={<ProjectWorkspace />} />
          <Route path="social" element={<SocialPage />} />
          <Route path="opportunities/:id?" element={<OpportunitiesPage />} />
          <Route path="contacts" element={<ContactsPage />} />
          <Route path="ideas" element={<IdeasPage />} />
          <Route path="collections" element={<NftCollectionsPage />} />
          <Route path="collections/:slug" element={<NftCollectionsPage />} />
          <Route path="pages/:id?" element={<PagesPage />} />
          <Route path="inbox" element={<InboxPage />} />
          <Route path="gallery" element={<CommonGallery />} />
          <Route path="files" element={<FilesPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </EditorProvider>
  );
}

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: idbPersister(), maxAge: 7 * 24 * 3600_000, buster: 'v1',
      dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' && !['signed', 'search', 'weather', 'backups'].includes(String(q.queryKey[0])) } }}>
      <ToastProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <CrystalCanvas />
          <App />
        </BrowserRouter>
      </ToastProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
);
