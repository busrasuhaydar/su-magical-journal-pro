// Ortak galeri: tüm projelerin, günlüğün ve paylaşımların görselleri tek yerde. File bir kez saklanır, istediğiniz projeye bağlanır.
import { DragList, DragRow, SortPicker, sortList, useListPrefs, useReorder } from '../lib/listSort';
import { useMemo, useRef, useState, type DragEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckSquare, FolderPlus, Trash2, Upload, X } from 'lucide-react';
import { PageHead } from '../components/Shell';
import { ConfirmButton, Empty, formatBytes, useToast } from '../components/ui';
import { addToGallery, softDeleteFiles, uploadFile, useFileLinks, useFiles, useProjects, useSignedUrl } from '../lib/data';
import { BulkBar, ProjectPickDialog, SelectTile, Thumb } from '../components/Media';
import { dayKeyOf, formatShort } from '../lib/dates';
import type { FileRec } from '../lib/types';
import { Card, Lightbox, nftKey } from '../components/NftLightbox';
import { useNfts } from '../lib/nft';

export default function CommonGallery() {
  const files = useFiles();
  const links = useFileLinks();
  const projects = useProjects();
  const qc = useQueryClient();
  const toast = useToast();
  const [proj, setProj] = useState('');
  const [kind, setKind] = useState('');
  const [open, setOpen] = useState<FileRec | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selMode, setSelMode] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const visual = (f: FileRec) => f.mime.startsWith('image/') || f.mime.startsWith('video/');
  const projOf = (id: string) => (links.data ?? []).filter((l) => l.file_id === id && l.entity_type === 'project').map((l) => l.entity_id);
  const usedIn = (id: string) => {
    const ls = (links.data ?? []).filter((l) => l.file_id === id);
    return { journal: ls.some((l) => l.entity_type === 'journal_day'), post: ls.some((l) => l.entity_type === 'social_post') };
  };
  const lp = useListPrefs('gallery', 'date');
  const reorder = useReorder('files', [['files']]);
  const list = useMemo(() => sortList((files.data ?? []).filter((f) => visual(f) && (!kind || kind === 'nft' || f.mime.startsWith(kind)) &&
    (!proj || (proj === 'none' ? projOf(f.id).length === 0 : projOf(f.id).includes(proj)))), lp.mode, { date: (f) => f.created_at, desc: true, name: (f) => f.title }), [files.data, links.data, proj, kind, lp.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => setSel((x) => (x.includes(id) ? x.filter((i) => i !== id) : [...x, id]));
  const endSel = () => { setSel([]); setSelMode(false); };
  const linkedProjects = useMemo(() => [...new Set(sel.flatMap((id) => projOf(id)))], [sel, links.data]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onFiles(fl: FileList | null) {
    if (!fl?.length) return; setBusy(true);
    try {
      for (const f of Array.from(fl)) { const { rec } = await uploadFile(f); if (proj && proj !== 'none') await addToGallery(rec.id, proj); }
      qc.invalidateQueries({ queryKey: ['files'] }); toast.ok('Added to gallery');
    } catch (x) { toast.fail(x); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHead title="Shared Gallery">
        <select id="cg-proj" className="select" style={{ width: 'auto' }} value={proj} onChange={(e) => setProj(e.target.value)}>
          <option value="">All images</option><option value="none">Not linked to a project</option>
          {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.icon ?? '✦'} {p.title}</option>)}
        </select>
        <SortPicker id="gsort" mode={lp.mode} onChange={lp.setMode} options={['manual', 'date', 'name']} />
        <div className="seg">{[['', 'All'], ['image/', 'Image'], ['video/', 'Video'], ['nft', 'NFT artworks']].map(([k, l]) => <button type="button" key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
        <button type="button" className={`btn ${selMode ? 'btn-primary' : 'btn-glass'}`} onClick={() => (selMode ? endSel() : setSelMode(true))}><CheckSquare size={15} />{selMode ? 'Done selecting' : 'Select'}</button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => input.current?.click()}><Upload size={15} />{busy ? 'Loading…' : 'Upload from device'}</button>
        <input ref={input} id="cg-in" type="file" multiple hidden accept="image/*,video/*" onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
      </PageHead>
      <p className="small muted" style={{ margin: 0 }}>All images from projects, the journal and posts are here. You can link an image to multiple projects; no copies are made.{proj && proj !== 'none' ? ' Images you upload are also added to the selected project.' : ''}</p>
      {kind === 'nft' && <NftPane />}
      <section className="glass panel" hidden={kind === 'nft'} onDragOver={(e: DragEvent) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)} onDrop={(e: DragEvent) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files); }}>
        {over && <div className="dropzone over" style={{ marginBottom: 12 }}>Drop to add to the gallery</div>}
        {!files.isLoading && list.length === 0 ? <Empty title="No images">Drag images here or press Upload.</Empty> : (
          <DragList ids={list.map((f) => f.id)} enabled={lp.mode === 'manual' && !selMode} onMove={(a, b) => reorder(list.map((f) => f.id), a, b)}>
          <div className="pgal">
            {list.map((f) => {
              if (selMode) return <SelectTile key={f.id} file={f} selected={sel.includes(f.id)} onToggle={() => toggle(f.id)} caption={f.title} />;
              const ps = projOf(f.id).map((id) => projects.data?.find((p) => p.id === id)).filter(Boolean);
              const u = usedIn(f.id);
              return (
                <DragRow key={f.id} id={f.id} enabled={lp.mode === 'manual'} className="card-drag">
                <figure className="pgal-item" onClick={() => setOpen(f)} style={{ touchAction: 'auto' }}>
                  <div className="pgal-img"><Thumb file={f} /></div>
                  <figcaption>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.title}</span>
                    <span className="small muted">{ps.length ? ps.map((p) => `${p!.icon ?? '✦'} ${p!.title}`).join(' · ') : 'No project'}{u.post ? ' · in a post' : ''}{u.journal ? ' · in journal' : ''}</span>
                  </figcaption>
                </figure>
                </DragRow>
              );
            })}
          </div>
          </DragList>
        )}
      </section>
      {selMode && <BulkBar selected={sel} total={list.length} fromProject={proj && proj !== 'none' ? proj : null} linkedProjects={linkedProjects} onAll={() => setSel(list.map((f) => f.id))} onClear={endSel} />}
      {open && <Viewer file={open} projectIds={projOf(open.id)} onClose={() => setOpen(null)} />}
    </>
  );
}

function Viewer({ file, projectIds, onClose }: { file: FileRec; projectIds: string[]; onClose: () => void }) {
  const u = useSignedUrl(file.storage_path);
  const projects = useProjects();
  const links = useFileLinks();
  const qc = useQueryClient();
  const toast = useToast();
  const [add, setAdd] = useState(false);
  return (
    <div className="scrim lightbox" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lb-body">
        <div className="lb-media">{u.data && (file.mime.startsWith('video/') ? <video src={u.data} controls autoPlay /> : <img src={u.data} alt={file.title} />)}</div>
        <aside className="lb-side">
          <div className="row" style={{ justifyContent: 'space-between' }}><b style={{ overflowWrap: 'anywhere' }}>{file.title}</b><button type="button" className="btn btn-ghost icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
          <span className="small muted">{formatBytes(file.size)} · {formatShort(dayKeyOf(file.created_at))}</span>
          <b className="small">Linked projects</b>
          <div className="row">
            {projectIds.map((id) => { const p = projects.data?.find((x) => x.id === id); const l = links.data?.find((x) => x.file_id === file.id && x.entity_id === id); return p && (
              <span key={id} className="chip">{p.icon ?? '✦'} {p.title}<button type="button" aria-label="Remove from project" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0 }}
                onClick={async () => { if (!l) return; const { error } = await (await import('../lib/supabase')).supabase.from('file_links').delete().eq('id', l.id); if (error) toast.fail(error); else qc.invalidateQueries({ queryKey: ['files'] }); }}>×</button></span>
            ); })}
            {!projectIds.length && <span className="small muted">None yet</span>}
          </div>
          <button type="button" className="btn btn-glass btn-sm" onClick={() => setAdd(true)}><FolderPlus size={14} />Add to project / new project</button>
          {u.data && <a className="btn btn-ghost btn-sm" href={u.data} target="_blank" rel="noopener noreferrer">Open in new tab</a>}
          <ConfirmButton label={<><Trash2 size={14} />Delete</>} className="btn btn-ghost btn-sm" confirmText="Delete media everywhere?"
            onConfirm={async () => { try { await softDeleteFiles([file.id]); qc.invalidateQueries({ queryKey: ['files'] }); onClose(); } catch (x) { toast.fail(x); } }} />
        </aside>
        {add && <ProjectPickDialog title="Add to project" exclude={projectIds} onClose={() => setAdd(false)}
          onPick={async (p) => { try { await addToGallery(file.id, p.id); qc.invalidateQueries({ queryKey: ['files'] }); toast.ok(`Added to ${p.title} gallery`); setAdd(false); } catch (x) { toast.fail(x); } }} />}
      </div>
    </div>
  );
}

/** NFT eserleri: orijinaller dış depolamada (IPFS/Arweave) durur; burada yalnız link olarak görünür, kopya/depolama yükü yoktur. */
function NftPane() {
  const nfts = useNfts();
  const [col, setCol] = useState('');
  const [q, setQ] = useState('');
  const [lb, setLb] = useState<number | null>(null);
  const list = useMemo(() => (nfts.data?.items ?? []).filter((n) => (!col || n.c === col) && (!q.trim() || `${n.name} ${n.description}`.toLocaleLowerCase('en').includes(q.trim().toLocaleLowerCase('en')))), [nfts.data, col, q]);
  return (
    <section className="glass panel">
      <div className="row" style={{ marginBottom: 12 }}>
        <select className="select" style={{ width: 'auto' }} value={col} onChange={(e) => setCol(e.target.value)}>
          <option value="">All collections</option>
          {nfts.data?.collections.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        <input className="input" style={{ width: 220 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search artworks…" />
        <span className="count">{list.length}</span>
        <span className="small muted">Click a collection; on an artwork you can save the original, tweet it, or write a note.</span>
      </div>
      {!col && !q.trim() ? (
        <div className="col-grid">
          {(nfts.data?.collections ?? []).map((c) => {
            const l = (nfts.data?.items ?? []).filter((n) => n.c === c.slug);
            const pv = [0, 1, 2, 3].map((k) => l[Math.floor((l.length / 4) * k)]).filter(Boolean);
            return (
              <button type="button" key={c.slug} className="col-card glass" style={{ textAlign: 'left', cursor: 'pointer', border: 0 }} onClick={() => setCol(c.slug)}>
                <div className={`mosaic m${pv.length}`}>{pv.map((p) => <img key={nftKey(p)} src={p.thumb ?? ''} alt="" loading="lazy" />)}</div>
                <div className="col-meta"><h3>{c.name}</h3><span className="small muted">{l.length}artworks</span></div>
              </button>
            );
          })}
        </div>
      ) : (
        <>
          {col && <div className="row" style={{ marginBottom: 12 }}><button type="button" className="btn btn-glass btn-sm" onClick={() => setCol('')}><ArrowLeft size={14} />All collections</button><h3>{nfts.data?.collections.find((c) => c.slug === col)?.name}</h3></div>}
          {list.length === 0 ? <Empty title="No artworks">Change your search.</Empty> : <div className="nft-grid">{list.map((n, i) => <Card key={nftKey(n)} n={n} onOpen={() => setLb(i)} />)}</div>}
        </>
      )}
      {lb != null && <Lightbox items={list} index={lb} setIndex={setLb} onClose={() => setLb(null)} />}
    </section>
  );
}
