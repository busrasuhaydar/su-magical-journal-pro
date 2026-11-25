export type Priority = 'urgent' | 'high' | 'medium' | 'low';
export type TaskStatus = 'todo' | 'doing' | 'done' | 'postponed' | 'cancelled';
export type ProjectStatus = 'idea' | 'planning' | 'active' | 'paused' | 'completed' | 'archived';
export type EventKind = 'meeting' | 'exhibition' | 'fair' | 'creative' | 'personal' | 'break' | 'other';
export type BlockKind = 'note' | 'image' | 'video' | 'audio' | 'pdf' | 'document' | 'link';

export interface Profile {
  id: string; display_name: string | null; timezone: string;
  hidden_holiday_countries: string[]; show_observances: boolean; email_notifications?: boolean; ui_prefs?: import('./ui').UiPrefs;
}
export interface Project {
  id: string; title: string; slug: string; status: ProjectStatus; priority: Priority;
  start_date: string | null; target_date: string | null; color: string; description: string | null;
  progress_override: number | null; updated_at: string; created_at: string; cover_file_id: string | null; icon: string | null;
}
export interface ProjectProgress { project_id: string; total_tasks: number; done_tasks: number; progress: number; is_manual: boolean; overdue_tasks: number }
export interface Task {
  id: string; project_id: string | null; contact_id: string | null; title: string; description: string | null;
  due_date: string | null; starts_at: string | null; ends_at: string | null; priority: Priority;
  category: string | null; status: TaskStatus; rrule: string | null; postpone_count: number;
  completed_at: string | null; created_at: string; updated_at: string; parent_task_id: string | null; opportunity_id: string | null; recurrence_parent?: string | null;
}
export interface CalEvent {
  id: string; project_id: string | null; kind: EventKind; title: string; description: string | null;
  location: string | null; starts_at: string; ends_at: string; all_day: boolean;
}
export interface Holiday {
  id: string; country: string; day: string; name: string; local_name: string;
  kind: 'public' | 'half_day' | 'observance'; certainty: 'confirmed' | 'uncertain' | 'conflicting'; note: string | null; source: string;
}
export interface FileRec { id: string; storage_path: string; title: string; mime: string; size: number; sha256: string; created_at: string }
export interface JournalDay { id: string; day: string; goal: string | null; mood: string | null }
export interface JournalBlock {
  id: string; day_id: string; kind: BlockKind; title: string | null; body: string | null; url: string | null;
  file_id: string | null; position: number; size: 's' | 'm' | 'l'; created_at: string;
}
export interface CalendarEntry { kind: 'task' | 'event' | 'post' | 'followup' | 'opportunity' | 'milestone'; id: string; project_id: string | null; title: string; starts_at: string; ends_at: string; all_day: boolean; status: string | null; subtype: string }

export const PRIORITY_LABEL: Record<Priority, string> = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' };
export const PRIORITY_ORDER: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
export const STATUS_LABEL: Record<TaskStatus, string> = { todo: 'To do', doing: 'In progress', done: 'Completed', postponed: 'Postponed', cancelled: 'Cancelled' };
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = { idea: 'Idea', planning: 'Planning', active: 'Active', paused: 'On hold', completed: 'Completed', archived: 'Archived' };
export const EVENT_KIND_LABEL: Record<EventKind, string> = { meeting: 'Meeting', exhibition: 'Exhibition', fair: 'Art fair', creative: 'Art production', personal: 'Personal time', break: 'Break', other: 'Other' };
export const RRULE_LABEL: Record<string, string> = { '': 'No repeat', 'FREQ=DAILY': 'Every day', 'FREQ=DAILY;INTERVAL=2': 'Every other day', 'FREQ=DAILY;INTERVAL=3': 'Every 3 days', 'FREQ=WEEKLY': 'Every week', 'FREQ=WEEKLY;INTERVAL=2': 'Every 2 weeks', 'FREQ=MONTHLY': 'Every month', 'FREQ=MONTHLY;INTERVAL=3': 'Every 3 months', 'FREQ=MONTHLY;INTERVAL=6': 'Every 6 months', 'FREQ=YEARLY': 'Every year' };
export const REMINDER_OPTIONS: [string, string][] = [['', 'No reminder'], ['0', 'On time'], ['5', '5 minutes before'], ['15', '15 minutes before'], ['30', '30 minutes before'], ['60', '1 hour before'], ['180', '3 hours before'], ['1440', '1 day before'], ['4320', '3 days before'], ['10080', '1 week before']];
export const TASK_CATEGORIES = ['Art production', 'Project', 'Meeting', 'Application', 'Social media', 'Personal', 'Admin', 'Health'];
export const OPEN_STATUSES: TaskStatus[] = ['todo', 'doing', 'postponed'];

// ── Faz 2 ──────────────────────────────────────────────
export type ContactCategory = 'collector' | 'gallery' | 'curator' | 'artist' | 'collaborator' | 'organization' | 'press' | 'other';
export type InteractionKind = 'meeting' | 'email' | 'call' | 'message' | 'note';
export type PostStatus = 'idea' | 'draft' | 'preparing' | 'awaiting_approval' | 'scheduled' | 'publishing' | 'published' | 'failed';
export type Platform = 'instagram' | 'x' | 'youtube' | 'website';
export type IdeaCategory = 'art' | 'nft' | 'sculpture' | 'digital' | 'content' | 'personal' | 'goal';
export type MemoryKind = 'idea' | 'goal' | 'decision' | 'feature_added' | 'feature_removed' | 'technical' | 'problem' | 'solution' | 'reference' | 'stage' | 'state' | 'next_step';

export interface Contact {
  id: string; name: string; organization: string | null; email: string | null; category: ContactCategory; phone: string | null;
  website: string | null; socials: Record<string, string>; notes: string | null; last_contact_at: string | null;
  follow_up_date: string | null; expected_response: string | null; created_at: string;
}
export interface Interaction { id: string; contact_id: string; project_id: string | null; event_id: string | null; kind: InteractionKind; occurred_at: string; summary: string; notes: string | null }
export interface ProjectContact { id: string; project_id: string; contact_id: string; role: string | null }
export interface Stage { id: string; project_id: string; title: string; status: TaskStatus; due_date: string | null; position: number; kind: 'stage' | 'milestone'; description: string | null }
export interface PostTarget { id: string; post_id: string; platform: Platform; status: PostStatus; published_url: string | null; error: string | null; published_at: string | null }
export interface SocialPost {
  id: string; project_id: string | null; content_type: string; title: string; caption_tr: string | null; caption_en: string | null;
  hashtags: string[]; links: string[]; status: PostStatus; scheduled_at: string | null; published_at: string | null; notes: string | null;
  created_at: string; updated_at: string; post_targets?: PostTarget[];
}
export interface Idea { id: string; title: string; body: string | null; category: IdeaCategory; status: 'new' | 'developing' | 'converted' | 'archived'; converted_project_id: string | null; project_id: string | null; created_at: string }
export interface Note { id: string; project_id: string | null; task_id: string | null; kind: 'note' | 'reference'; title: string; body: string | null; url: string | null; created_at: string; updated_at: string }
export interface MemoryEntry { id: string; project_id: string; kind: MemoryKind; body: string; decided_on: string; supersedes: string | null; source: string; created_at: string }
export interface ChangeLogRow { id: number; table_name: string; row_id: string; op: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; at: string }

export const CONTACT_CATEGORY_LABEL: Record<ContactCategory, string> = { collector: 'Collector', gallery: 'Gallery', curator: 'Curator', artist: 'Artist', collaborator: 'Collaboration', organization: 'Organization', press: 'Press & media', other: 'Other' };
export const INTERACTION_LABEL: Record<InteractionKind, string> = { meeting: 'Meeting', email: 'Email', call: 'Phone', message: 'Message', note: 'Note' };
export const POST_STATUS_LABEL: Record<PostStatus, string> = { idea: 'Idea', draft: 'Draft', preparing: 'Preparing', awaiting_approval: 'Awaiting approval', scheduled: 'Scheduled', publishing: 'Publishing', published: 'Published', failed: 'Failed' };
export const PLATFORM_LABEL: Record<Platform, string> = { instagram: 'Instagram', x: 'X', youtube: 'YouTube', website: 'Website' };
export const CONTENT_TYPE_LABEL: Record<string, string> = { post: 'Post', carousel: 'Carousel', reel: 'Reels', story: 'Story', video: 'Video', short: 'Shorts', thread: 'Thread', article: 'Article', promo: 'Promo' };
export const IDEA_CATEGORY_LABEL: Record<IdeaCategory, string> = { art: 'Art idea', nft: 'NFT idea', sculpture: 'Sculpture idea', digital: 'Digital project', content: 'Content idea', personal: 'Personal', goal: 'Future goal' };
export const MEMORY_KIND_LABEL: Record<MemoryKind, string> = { idea: 'Original idea', goal: 'Goal', decision: 'Decision', feature_added: 'Added feature', feature_removed: 'Removed feature', technical: 'Technical detail', problem: 'Problem encountered', solution: 'Attempted solution', reference: 'Reference', stage: 'Development stage', state: 'Latest working state', next_step: 'Next step' };
export const POST_STATUS_COLOR: Record<PostStatus, string> = { idea: '#CDB9F3', draft: '#C4A8B8', preparing: '#FFC4A3', awaiting_approval: '#F28A5C', scheduled: '#1FA9A6', publishing: '#8FDCE8', published: '#2E9E6E', failed: '#D2455A' };

// ── Gelişmiş projeler + Faz 3 ──────────────────────────
export interface FileLink { id: string; file_id: string; entity_type: string; entity_id: string; caption: string | null; note: string | null; position: number; created_at: string }
export interface Page { id: string; project_id: string | null; parent_id: string | null; title: string; icon: string | null; position: number; updated_at: string; artwork_key?: string | null; journal_day?: string | null; cover_file_id?: string | null }
export type BlockType = 'text' | 'h1' | 'h2' | 'h3' | 'bullet' | 'numbered' | 'todo' | 'quote' | 'callout' | 'divider' | 'image' | 'file' | 'link' | 'task' | 'page';
export interface PageBlock { id: string; page_id: string; type: BlockType; content: { text?: string; checked?: boolean; url?: string; title?: string; caption?: string }; file_id: string | null; task_id: string | null; ref_page_id: string | null; position: number }
export interface EntityLink { id: string; from_type: string; from_id: string; to_type: string; to_id: string; created_at: string }
export type OppStatus = 'to_review' | 'potential' | 'preparing' | 'submitted' | 'awaiting' | 'accepted' | 'rejected' | 'exhibiting' | 'completed' | 'withdrawn';
export type OppKind = 'exhibition' | 'fair' | 'open_call' | 'competition' | 'residency' | 'gallery' | 'program' | 'event' | 'grant';
export type OppDateKind = 'app_open' | 'deadline' | 'announcement' | 'delivery' | 'install' | 'opening' | 'closing';
export interface RequiredDoc { label: string; done: boolean; file_id?: string | null; kit_id?: string | null }
export interface Opportunity {
  id: string; title: string; kind: OppKind; organization: string | null; gallery: string | null; city: string | null; country: string | null;
  fee_amount: number | null; fee_currency: string | null; fee_note: string | null; requirements: string | null; artwork_requirements: string | null;
  required_docs: RequiredDoc[]; application_url: string | null; contact: { name?: string; email?: string; phone?: string }; notes: string | null;
  status: OppStatus; source_text: string | null; source_url: string | null; source_file_id: string | null; extraction: Record<string, unknown> | null; created_at: string; updated_at: string;
}
export interface OppDate { id: string; opportunity_id: string; kind: OppDateKind; day: string; time_text: string | null; certainty: 'confirmed' | 'uncertain' | 'conflicting'; evidence: string | null }

export const OPP_STATUS_LABEL: Record<OppStatus, string> = { to_review: 'To review', potential: 'Potential opportunity', preparing: 'Preparing application', submitted: 'Application submitted', awaiting: 'Awaiting result', accepted: 'Accepted', rejected: 'Rejected', exhibiting: 'On display', completed: 'Completed', withdrawn: 'Withdrawn' };
export const OPP_STATUS_COLOR: Record<OppStatus, string> = { to_review: '#C4A8B8', potential: '#CDB9F3', preparing: '#FFC4A3', submitted: '#8FDCE8', awaiting: '#F28A5C', accepted: '#2E9E6E', rejected: '#D2455A', exhibiting: '#9B6FE0', completed: '#1FA9A6', withdrawn: '#8C6C80' };
export const CONFIRMED_OPP: OppStatus[] = ['accepted', 'exhibiting', 'completed'];
export const OPP_KIND_LABEL: Record<OppKind, string> = { exhibition: 'Exhibition', fair: 'Art fair', open_call: 'Open call', competition: 'Competition', residency: 'Residency', gallery: 'Gallery application', program: 'Artist program', event: 'Art event', grant: 'Grant / funding' };
export const OPP_DATE_LABEL: Record<OppDateKind, string> = { app_open: 'Application opens', deadline: 'Application deadline', announcement: 'Result announcement', delivery: 'Artwork delivery', install: 'Installation', opening: 'Exhibition opening', closing: 'Exhibition closing' };
export const PROJECT_ICONS = ['✦', '🏰', '🌸', '🦋', '🎨', '🗿', '👻', '💎', '🌙', '🪞', '🎀', '📚', '🎬', '🧪', '🌊', '🔮'];
