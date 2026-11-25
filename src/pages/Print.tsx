// Yazdırılabilir sayfalar (kabuk dışında): orijinallik sertifikası, sergi fiyat listesi, başvuru metni.
// Tarayıcıda "Yazdır → PDF olarak kaydet" ile PDF alınır.
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Printer } from 'lucide-react';
import { useProfile } from '../lib/data';
import { money, useArtworks } from '../lib/artworks';
import { ArtImage } from '../components/ArtImage';
import { kitName, useKit } from '../lib/kit';

const longDate = (d = new Date()) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' });

export function PrintFrame({ children, back }: { children: ReactNode; back?: string }) {
  const nav = useNavigate();
  return (
    <div className="print-root">
      <div className="print-bar no-print">
        <button type="button" className="btn btn-glass btn-sm" onClick={() => (back ? nav(back) : nav(-1))}><ChevronLeft size={14} />Back</button>
        <span className="small muted">Use “Save as PDF” in the print window to get a PDF.</span>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}><Printer size={14} />Print / PDF</button>
      </div>
      {children}
    </div>
  );
}

export function CertificatePage() {
  const { id } = useParams();
  const arts = useArtworks();
  const profile = useProfile();
  const a = arts.data?.find((x) => x.id === id);
  const artist = profile.data?.display_name || 'Su';
  if (arts.isLoading) return <div className="print-root"><p>Loading…</p></div>;
  if (!a) return <div className="print-root"><p>Artwork not found. <Link to="/artworks">Back</Link></p></div>;
  const no = `SMJ-${(a.year ?? new Date().getFullYear())}-${a.id.slice(0, 6).toUpperCase()}`;
  const rows: [string, string | number | null][] = [['Artist', artist], ['Title', a.title], ['Year', a.year], ['Technique', a.technique], ['Dimensions', a.dimensions], ['Edition', a.edition]];
  return (
    <PrintFrame back={`/artworks/${a.id}`}>
      <article className="sheet cert">
        <div className="cert-frame">
          <p className="cert-kicker">Su's Magical Journal · Studio</p>
          <h1 className="cert-title">Certificate of Authenticity</h1>
          <div className="cert-body">
            <div className="cert-img"><ArtImage a={a} fit="contain" /></div>
            <dl className="cert-dl">{rows.filter(([, v]) => v != null && v !== '').map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          </div>
          {a.description && <p className="cert-desc">{a.description}</p>}
          <p className="cert-stmt">I hereby certify that the artwork described above is an original work created by me, {artist}. This certificate accompanies the artwork and confirms its authenticity.</p>
          <div className="cert-foot">
            <div><span className="cert-line" /><small>Signature · {artist}</small></div>
            <div><b>{longDate()}</b><small>Date</small></div>
            <div><b className="mono">{no}</b><small>Certificate no.</small></div>
          </div>
        </div>
      </article>
    </PrintFrame>
  );
}

export function PriceListPage() {
  const [sp] = useSearchParams();
  const arts = useArtworks();
  const profile = useProfile();
  const ids = (sp.get('ids') ?? '').split(',').filter(Boolean);
  const list = (arts.data ?? []).filter((a) => !ids.length || ids.includes(a.id)).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  const [title, setTitle] = useState('Exhibition Price List');
  const [sub, setSub] = useState(`${profile.data?.display_name || 'Su'} · ${longDate()}`);
  const [showSold, setShowSold] = useState(true);
  return (
    <PrintFrame back="/artworks">
      <label className="no-print small print-opt"><input id="pl-sold" type="checkbox" checked={showSold} onChange={(e) => setShowSold(e.target.checked)} /> Show sold works (marked with a red dot)</label>
      <article className="sheet plist">
        <input id="pl-title" className="plist-title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Price list title" />
        <input id="pl-sub" className="plist-sub" value={sub} onChange={(e) => setSub(e.target.value)} aria-label="Subtitle" />
        <table>
          <thead><tr><th>No.</th><th /><th>Artwork</th><th>Details</th><th className="r">Price</th></tr></thead>
          <tbody>
            {list.filter((a) => showSold || a.status !== 'sold').map((a, i) => (
              <tr key={a.id}>
                <td className="mono">{String(i + 1).padStart(2, '0')}</td>
                <td><span className="plist-img"><ArtImage a={a} /></span></td>
                <td><b>{a.title}</b>{a.year ? <span>, {a.year}</span> : null}</td>
                <td>{[a.technique, a.dimensions, a.edition].filter(Boolean).join(' · ')}</td>
                <td className="r">{a.status === 'sold' ? <span className="sold-dot" title="Sold">● Sold</span> : a.price != null ? money(a.price, a.currency) : 'Price on request'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="plist-note">Prices include VAT where applicable. For enquiries please contact the artist.</p>
      </article>
    </PrintFrame>
  );
}

/** Başvuru kiti metni: sade, yazdırılabilir sayfa. */
export function KitPrintPage() {
  const { id } = useParams();
  const kit = useKit();
  const profile = useProfile();
  const k = kit.data?.find((x) => x.id === id);
  if (kit.isLoading) return <div className="print-root"><p>Loading…</p></div>;
  if (!k) return <div className="print-root"><p>Text not found. <Link to="/kit">Back</Link></p></div>;
  const heading = { bio: k.lang === 'tr' ? 'Biyografi' : 'Biography', cv: 'CV', statement: k.lang === 'tr' ? 'Sanatçı Beyanı' : 'Artist Statement' }[k.kind];
  return (
    <PrintFrame back="/kit">
      <article className="sheet kit-sheet" lang={k.lang}>
        <p className="cert-kicker">{profile.data?.display_name || 'Su'}</p>
        <h1 className="kit-h">{heading}</h1>
        <p className="kit-meta no-print">{kitName(k)}</p>
        <div className="kit-body">{k.body}</div>
      </article>
    </PrintFrame>
  );
}
