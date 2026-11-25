// Eserler: envanter (galeri + liste), eser kartı, orijinallik sertifikası ve sergi fiyat listesi (yazdırılabilir).
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Award, ChevronLeft, Gem, Grid3x3, ImagePlus, List, Plus, Printer, Save, Search, Trash2, X } from 'lucide-react';
import { PageHead } from '../components/Shell';
import { ConfirmButton, Dialog, Empty, Field, useToast } from '../components/ui';
import { MediaPickerDialog } from '../components/Media';
import { ArtImage } from '../components/ArtImage';
import { FavButton } from '../components/FavButton';
import { TagList, TagPicker } from '../components/TagPicker';
import { useContacts, useProjects } from '../lib/data';
import { useTrackRecent } from '../lib/ui';
import { artKey, useNfts } from '../lib/nft';
import { supabase } from '../lib/supabase';
import { ART_STATUS_COLOR, ART_STATUS_LABEL, ART_STATUS_SHORT, CURRENCIES, money, useArtworks, type ArtStatus, type Artwork } from '../lib/artworks';

export default function ArtworksPage() {
  const { id } = useParams();
  return id ? <ArtworkDetail id={id} key={id} /> : <ArtworkList />;
}

function ArtworkList() {
  const arts = useArtworks();
  const projects = useProjects();
  const nav = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem('su:art-view') as 'grid' | 'list') || 'grid');
  const [q, setQ] = useState('');
  const [st, setSt] = useState('');
  const [proj, setProj] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(() => { try { localStorage.setItem('su:art-view', view); } catch { /* yok say */ } }, [view]);
  const list = useMemo(() => (arts.data ?? []).filter((a) => (!st || a.status === st) && (!proj || a.project_id === proj)
    && (!q || `${a.title} ${a.technique ?? ''} ${a.year ?? ''} ${a.location ?? ''}`.toLocaleLowerCase('en').includes(q.toLocaleLowerCase('en')))), [arts.data, q, st, proj]);
  const totals = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of list) if (a.price != null && a.status !== 'sold') m.set(a.currency, (m.get(a.currency) ?? 0) + Number(a.price));
    return [...m].map(([c, v]) => money(v, c)).join(' · ');
  }, [list]);
  async function create() {
    const { data, error } = await supabase.from('artworks').insert({ title: 'Untitled artwork', year: new Date().getFullYear() }).select().single();
    if (error) return toast.fail(error);
    qc.invalidateQueries({ queryKey: ['artworks'] }); nav(`/artworks/${data.id}`);
  }
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const priceList = () => { const ids = sel.size ? [...sel] : list.map((a) => a.id); nav(`/print/price-list?ids=${ids.join(',')}`); };

  return (
    <>
      <PageHead title="Artworks">
        <button type="button" className="btn btn-glass" onClick={priceList} disabled={!list.length}><Printer size={15} />Price list{sel.size ? ` (${sel.size})` : ''}</button>
        <button type="button" className="btn btn-primary" onClick={create}><Plus size={15} />New artwork</button>
      </PageHead>
      <div className="glass panel" style={{ padding: 14 }}>
        <div className="row">
          <label className="art-search"><Search size={15} /><input id="art-q" className="input" placeholder="Search artworks…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <select id="art-st" className="select" style={{ width: 'auto' }} value={st} onChange={(e) => setSt(e.target.value)} aria-label="Status"><option value="">All statuses</option>{Object.entries(ART_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select id="art-pj" className="select" style={{ width: 'auto' }} value={proj} onChange={(e) => setProj(e.target.value)} aria-label="Project"><option value="">All projects</option>{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
          <div className="seg" role="group" aria-label="View">
            <button type="button" className={view === 'grid' ? 'on' : ''} aria-pressed={view === 'grid'} onClick={() => setView('grid')}><Grid3x3 size={14} />Gallery</button>
            <button type="button" className={view === 'list' ? 'on' : ''} aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={14} />List</button>
          </div>
        </div>
        <div className="small muted" style={{ marginTop: 8 }}>{list.length} artworks{totals ? ` · available: ${totals}` : ''}{sel.size ? ` · ${sel.size} selected for the price list` : ''}</div>
      </div>
      {arts.isLoading && <p className="muted">Loading…</p>}
      {!arts.isLoading && list.length === 0 && <section className="glass panel"><Empty title="No artworks yet">Add a work from your studio, or open an NFT in My Collections and press “Inventory”.</Empty></section>}
      {view === 'grid' ? (
        <div className="art-grid">
          {list.map((a) => (
            <article key={a.id} className={`glass art-card${sel.has(a.id) ? ' sel' : ''}`}>
              <Link to={`/artworks/${a.id}`} className="art-img"><ArtImage a={a} /></Link>
              <div className="art-meta">
                <Link to={`/artworks/${a.id}`} className="art-t">{a.title}</Link>
                <span className="small muted">{[a.year, a.technique].filter(Boolean).join(' · ') || '—'}</span>
                <TagList type="artwork" id={a.id} />
                <div className="row" style={{ gap: 6, justifyContent: 'space-between' }}>
                  <span className="art-st" style={{ '--c': ART_STATUS_COLOR[a.status] } as React.CSSProperties}>{ART_STATUS_SHORT[a.status]}</span>
                  <b className="small">{money(a.price, a.currency)}</b>
                </div>
              </div>
              <input id={`as-${a.id}`} className="art-check" type="checkbox" checked={sel.has(a.id)} onChange={() => toggle(a.id)} aria-label={`Select ${a.title} for the price list`} />
            </article>
          ))}
        </div>
      ) : list.length > 0 && (
        <section className="glass panel" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="art-table">
            <thead><tr><th aria-label="Select" /><th /><th>Title</th><th>Year</th><th>Technique</th><th>Size</th><th>Edition</th><th>Status</th><th>Location</th><th style={{ textAlign: 'right' }}>Price</th></tr></thead>
            <tbody>{list.map((a) => (
              <tr key={a.id} onClick={() => nav(`/artworks/${a.id}`)}>
                <td onClick={(e) => e.stopPropagation()}><input id={`al-${a.id}`} type="checkbox" checked={sel.has(a.id)} onChange={() => toggle(a.id)} aria-label={`Select ${a.title}`} /></td>
                <td><span className="art-mini"><ArtImage a={a} /></span></td>
                <td><b>{a.title}</b></td><td>{a.year ?? '—'}</td><td>{a.technique ?? '—'}</td><td>{a.dimensions ?? '—'}</td><td>{a.edition ?? '—'}</td>
                <td><span className="art-st" style={{ '--c': ART_STATUS_COLOR[a.status] } as React.CSSProperties}>{ART_STATUS_SHORT[a.status]}</span></td>
                <td>{a.location ?? '—'}</td><td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{money(a.price, a.currency)}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}
    </>
  );
}

function ArtworkDetail({ id }: { id: string }) {
  const arts = useArtworks();
  const contacts = useContacts();
  const projects = useProjects();
  const nfts = useNfts();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const a = arts.data?.find((x) => x.id === id);
  const [f, setF] = useState<Partial<Artwork>>({});
  const [pick, setPick] = useState<'' | 'image' | 'nft'>('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (a) setF(a); }, [a?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  useTrackRecent(a ? { kind: 'artwork', id: a.id, label: a.title, icon: '🖼️', href: `/artworks/${a.id}` } : null);
  if (arts.isLoading) return <p className="muted">Loading…</p>;
  if (!a) return <section className="glass panel"><Empty title="Artwork not found"><Link to="/artworks">Back to artworks</Link></Empty></section>;
  const set = (patch: Partial<Artwork>) => setF((x) => ({ ...x, ...patch }));
  const dirty = (Object.keys(f) as (keyof Artwork)[]).some((k) => k !== 'price_history' && JSON.stringify(f[k] ?? null) !== JSON.stringify(a[k] ?? null));
  async function save(extra: Partial<Artwork> = {}) {
    setBusy(true);
    const row = { ...f, ...extra };
    const patch = { title: (row.title ?? '').trim() || 'Untitled artwork', year: row.year || null, technique: row.technique || null, dimensions: row.dimensions || null, edition: row.edition || null,
      price: row.price === null || row.price === undefined || String(row.price) === '' ? null : Number(row.price), currency: row.currency || 'USD', status: row.status, location: row.location || null,
      buyer_contact_id: row.buyer_contact_id || null, project_id: row.project_id || null, file_id: row.file_id ?? null, nft_key: row.nft_key ?? null, nft_image: row.nft_image ?? null,
      description: row.description || null, notes: row.notes || null, sold_at: row.sold_at || null };
    const { error } = await supabase.from('artworks').update(patch).eq('id', a!.id);
    setBusy(false);
    if (error) return toast.fail(error);
    qc.invalidateQueries({ queryKey: ['artworks'] }); toast.ok('Artwork saved ✦');
  }
  const nft = f.nft_key ? nfts.data?.items.find((n) => artKey(n) === f.nft_key) : undefined;
  const history = [...(a.price_history ?? [])].reverse();

  return (
    <>
      <PageHead title={<><Link to="/artworks" className="btn btn-ghost icon-btn" aria-label="Back to artworks"><ChevronLeft size={18} /></Link>{a.title}</>}>
        <FavButton item={{ kind: 'artwork', id: a.id, label: a.title, icon: '🖼️', href: `/artworks/${a.id}` }} />
        <Link className="btn btn-glass" to={`/print/certificate/${a.id}`}><Award size={15} />Certificate</Link>
        <button type="button" className="btn btn-primary" onClick={() => save()} disabled={busy || !dirty}><Save size={15} />{busy ? 'Saving…' : 'Save'}</button>
      </PageHead>
      <div className="art-detail">
        <section className="glass panel art-hero">
          <div className="art-hero-img"><ArtImage a={{ ...a, ...f } as Artwork} fit="contain" /></div>
          <div className="row" style={{ marginTop: 10, gap: 6 }}>
            <button type="button" className="btn btn-glass btn-sm" onClick={() => setPick('image')}><ImagePlus size={13} />Image from gallery</button>
            <button type="button" className="btn btn-glass btn-sm" onClick={() => setPick('nft')}><Gem size={13} />Link NFT</button>
            {(f.file_id || f.nft_image) && <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ file_id: null, ...(f.nft_key ? {} : { nft_image: null }) })}><X size={13} />Remove image</button>}
          </div>
          {nft && <p className="small" style={{ marginBottom: 0 }}><Gem size={12} /> NFT: <Link to={`/collections/${nft.c}?artwork=${nft.contract.slice(0, 10).toLowerCase()}-${nft.tokenId}`}>{nft.name}</Link> · <a href={nft.opensea} target="_blank" rel="noreferrer">OpenSea</a> <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ nft_key: null })}><X size={12} />Unlink</button></p>}
        </section>
        <section className="glass panel art-form">
          <Field label="Title"><input id="aw-title" className="input" value={f.title ?? ''} onChange={(e) => set({ title: e.target.value })} /></Field>
          <div className="field"><span>Tags</span><TagPicker type="artwork" id={a.id} /></div>
          <div className="grid-2">
            <Field label="Year"><input id="aw-year" className="input" type="number" inputMode="numeric" value={f.year ?? ''} onChange={(e) => set({ year: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label="Technique"><input id="aw-tech" className="input" value={f.technique ?? ''} onChange={(e) => set({ technique: e.target.value })} placeholder="Oil on canvas, digital, bronze…" /></Field>
            <Field label="Dimensions"><input id="aw-dim" className="input" value={f.dimensions ?? ''} onChange={(e) => set({ dimensions: e.target.value })} placeholder="100 × 80 cm" /></Field>
            <Field label="Edition"><input id="aw-ed" className="input" value={f.edition ?? ''} onChange={(e) => set({ edition: e.target.value })} placeholder="Unique · 1/5 + 2 AP" /></Field>
          </div>
          <div className="grid-2">
            <Field label="Price"><div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
              <input id="aw-price" className="input" type="number" min={0} step="any" inputMode="decimal" value={f.price ?? ''} onChange={(e) => set({ price: e.target.value === '' ? null : Number(e.target.value) })} />
              <select id="aw-cur" className="select" style={{ width: 90 }} value={f.currency ?? 'USD'} onChange={(e) => set({ currency: e.target.value })} aria-label="Currency">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
            </div></Field>
            <Field label="Status"><select id="aw-st" className="select" value={f.status ?? 'studio'} onChange={(e) => set({ status: e.target.value as ArtStatus })}>{Object.entries(ART_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Location"><input id="aw-loc" className="input" value={f.location ?? ''} onChange={(e) => set({ location: e.target.value })} placeholder="Studio shelf B · Gallery X, Istanbul" /></Field>
            <Field label="Project"><select id="aw-pj" className="select" value={f.project_id ?? ''} onChange={(e) => set({ project_id: e.target.value || null })}><option value="">—</option>{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.icon ?? '✦'} {p.title}</option>)}</select></Field>
            {f.status === 'sold' && <>
              <Field label="Buyer"><select id="aw-buyer" className="select" value={f.buyer_contact_id ?? ''} onChange={(e) => set({ buyer_contact_id: e.target.value || null })}><option value="">—</option>{contacts.data?.map((c) => <option key={c.id} value={c.id}>{c.name}{c.organization ? ` · ${c.organization}` : ''}</option>)}</select></Field>
              <Field label="Sold on"><input id="aw-sold" className="input" type="date" value={f.sold_at ?? ''} onChange={(e) => set({ sold_at: e.target.value || null })} /></Field>
            </>}
          </div>
          <Field label="Description (used on the certificate)"><textarea id="aw-desc" className="textarea" value={f.description ?? ''} onChange={(e) => set({ description: e.target.value })} /></Field>
          <Field label="Private notes"><textarea id="aw-notes" className="textarea" value={f.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} /></Field>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <ConfirmButton className="btn btn-ghost btn-sm" label={<><Trash2 size={13} />Move to trash</>} confirmText="Move this artwork to trash?" onConfirm={async () => { const { error } = await supabase.from('artworks').update({ deleted_at: new Date().toISOString() }).eq('id', a.id); if (error) toast.fail(error); else { qc.invalidateQueries({ queryKey: ['artworks'] }); nav('/artworks'); } }} />
            <button type="button" className="btn btn-primary" onClick={() => save()} disabled={busy || !dirty}><Save size={15} />Save</button>
          </div>
        </section>
        <section className="glass panel">
          <div className="panel-head"><h2>Price history</h2></div>
          {history.length === 0 ? <p className="small muted">The price is recorded here every time it changes.</p> : (
            <div className="ph-list">{history.map((h, i) => <div key={i} className="ph-row"><span className="small muted">{new Date(h.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span><b>{money(h.price, h.currency)}</b></div>)}</div>
          )}
        </section>
      </div>
      {pick === 'image' && <MediaPickerDialog mode="gallery" visualOnly multiple={false} onClose={() => setPick('')} onPick={(fs) => { setPick(''); if (fs[0]) void save({ file_id: fs[0].id }); }} />}
      {pick === 'nft' && <NftPick onClose={() => setPick('')} onPick={(n) => { setPick(''); void save({ nft_key: artKey(n), nft_image: n.thumb ?? n.original, title: f.title && f.title !== 'Untitled artwork' ? f.title : n.name, description: f.description || n.description || null, technique: f.technique || 'Digital (NFT)' }); }} />}
    </>
  );
}

function NftPick({ onPick, onClose }: { onPick: (n: import('../lib/nft').Nft) => void; onClose: () => void }) {
  const nfts = useNfts();
  const [q, setQ] = useState('');
  const list = (nfts.data?.items ?? []).filter((n) => n.name.toLocaleLowerCase('en').includes(q.toLocaleLowerCase('en'))).slice(0, 60);
  return (
    <Dialog title="Link an NFT artwork" onClose={onClose} wide>
      <input id="np-q" className="input" placeholder="Search NFT artworks…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="pgal" style={{ marginTop: 12 }}>
        {list.map((n) => <figure key={artKey(n)} className="pgal-item" onClick={() => onPick(n)}><div className="pgal-img">{n.thumb && <img src={n.thumb} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</div><figcaption>{n.name}</figcaption></figure>)}
      </div>
    </Dialog>
  );
}

/** NFT görüntüleyicide "Envanter": eser kaydı varsa açar, yoksa NFT'den oluşturur. */
export async function openOrCreateFromNft(n: import('../lib/nft').Nft): Promise<string> {
  const key = artKey(n);
  const { data: ex } = await supabase.from('artworks').select('id').eq('nft_key', key).is('deleted_at', null).limit(1);
  if (ex?.length) return ex[0].id as string;
  const { data, error } = await supabase.from('artworks').insert({ title: n.name, nft_key: key, nft_image: n.thumb ?? n.original, description: n.description || null, technique: 'Digital (NFT)', edition: 'Unique (1/1)' }).select('id').single();
  if (error) throw error;
  return data.id as string;
}
