// Ek blok türleri (çizim, buton) ve metin içi tetikleyiciler için genişleme noktası.
import type { BlockType, PageBlock } from '../../lib/types';
import type { Type } from 'lucide-react';

export const EXTRA_BLOCKS: [BlockType, string, typeof Type, string][] = [];
export function extraSlash(_t: BlockType): Partial<PageBlock['content']> | null { return null; }
export function ExtraBlock(_p: { b: PageBlock; onChange: (patch: Partial<PageBlock>) => void; pageId: string; projectId: string | null }) { return null; }
