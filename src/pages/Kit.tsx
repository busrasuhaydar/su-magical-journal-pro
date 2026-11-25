// Başvuru Kiti: biyografi, CV ve sanatçı beyanı; Türkçe/İngilizce; kısa/uzun sürüm. Otomatik kaydedilir, kopyalanır, PDF alınır.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, FileDown, Languages } from 'lucide-react';
import { PageHead } from '../components/Shell';
import { useToast } from '../components/ui';
import { supabase } from '../lib/supabase';
import { copyText, KIT_KIND_LABEL, KIT_LEN_LABEL, useKit, type KitItem, type KitKind, type KitLang, type KitLen } from '../lib/kit';

const KINDS: KitKind[] = ['bio', 'statement', 'cv'];
const LENS: KitLen[] = ['short', 'long'];
const HINT: Record<KitKind, Record<KitLen, string>> = {
  bio: { short: 'About 50–80 words, third person. For catalogs and social media.', long: '200–400 words: background, practice, key exhibitions.' },
  statement: { short: 'One paragraph: what you make and why.', long: 'Your themes, materials and process in depth.' },
  cv: { short: 'Selected exhibitions, education, awards.', long: 'Full CV: exhibitions, residencies, collections, press.' },
};

export default function KitPage() {
  const kit = useKit();
  const [lang, setLang] = useState<KitLang>('en');
  return (
    <>
      <PageHead title="Application Kit">
        <div className="seg" role="group" aria-label="Language">
          {(['en', 'tr'] as KitLang[]).map((l) => <button type="button" key={l} className={lang === l ? 'on' : ''} aria-pressed={lang === l} onClick={() => setLang(l)}><Languages size={14} />{l === 'en' ? 'English' : 'Türkçe'}</button>)}
        </div>
      </PageHead>
      <p className="small muted" style={{ marginTop: -6 }}>Write each text once; link it to an opportunity’s required documents with one click, copy it into forms, or print it as a PDF.</p>
      {kit.isLoading && <p className="muted">Loading…</p>}
      {!kit.isLoading && KINDS.map((kind) => (
        <section key={kind} className="glass panel">
          <div className="panel-head"><h2>{KIT_KIND_LABEL[kind]}</h2></div>
          <div className="kit-grid">
            {LENS.map((len) => <KitCard key={`${kind}-${lang}-${len}`} kind={kind} lang={lang} len={len} item={kit.data?.find((k) => k.kind === kind && k.lang === lang && k.length === len)} />)}
          </div>
        </section>
      ))}
    </>
  );
}

function KitCard({ kind, lang, len, item }: { kind: KitKind; lang: KitLang; len: KitLen; item?: KitItem }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState(item?.body ?? '');
  const [state, setState] = useState<'' | 'saving' | 'saved'>('');
  const t = useRef<number>();
  const id = useRef<string | undefined>(item?.id);
  const focused = useRef(false);
  useEffect(() => { id.current = item?.id; if (!focused.current) setV(item?.body ?? ''); }, [item?.id, item?.body]);
  async function save(body: string) {
    setState('saving');
    const res = id.current
      ? await supabase.from('application_kit').update({ body }).eq('id', id.current).select().single()
      : await supabase.from('application_kit').insert({ kind, lang, length: len, body }).select().single();
    if (res.error) { setState(''); return toast.fail(res.error); }
    id.current = res.data.id; setState('saved'); qc.invalidateQueries({ queryKey: ['kit'] });
  }
  const onChange = (s: string) => { setV(s); window.clearTimeout(t.current); t.current = window.setTimeout(() => void save(s), 600); };
  useEffect(() => () => window.clearTimeout(t.current), []);
  const words = v.trim() ? v.trim().split(/\s+/).length : 0;
  return (
    <div className="kit-card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b className="small">{KIT_LEN_LABEL[len]} · {lang.toUpperCase()}</b>
        <span className="small muted">{words} words · {v.length} chars{state === 'saving' ? ' · saving…' : state === 'saved' ? ' · saved' : ''}</span>
      </div>
      <textarea id={`kit-${kind}-${lang}-${len}`} className="textarea kit-text" value={v} placeholder={HINT[kind][len]} onChange={(e) => onChange(e.target.value)}
        onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; if (t.current) { window.clearTimeout(t.current); if (v !== (item?.body ?? '')) void save(v); } }} />
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn btn-glass btn-sm" disabled={!v.trim()} onClick={() => copyText(v).then(() => toast.ok('Copied ✦'), (x) => toast.fail(x))}><Copy size={13} />Copy</button>
        {id.current && v.trim() ? <Link className="btn btn-glass btn-sm" to={`/print/kit/${id.current}`}><FileDown size={13} />PDF</Link> : <button type="button" className="btn btn-glass btn-sm" disabled><FileDown size={13} />PDF</button>}
      </div>
    </div>
  );
}
