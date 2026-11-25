// Kişiselleştirme için seçilebilir simgeler (ad → lucide bileşeni). Adlar profiles.ui_prefs içinde saklanır.
import {
  Home, CalendarDays, CalendarHeart, CheckSquare, FolderHeart, Images, Frame, Gem, Inbox, NotebookTabs, Lightbulb, Landmark, BriefcaseBusiness,
  Megaphone, Users, Hash, Files, Settings, Star, Heart, Sparkles, Palette, Brush, Camera, Music, BookOpen, Coffee, Sun, Moon, Flower2, Leaf,
  Rocket, Target, Trophy, Gift, Bell, Bookmark, Feather, Flame, Globe, Map, Mail, PenTool, Scissors, Shapes, Smile, Zap, Crown, Clock, Quote,
  Hourglass, StickyNote, Tag, Layers, Folder, FileText, type LucideIcon,
} from 'lucide-react';

export const ICONS: Record<string, LucideIcon> = {
  Home, CalendarDays, CalendarHeart, CheckSquare, FolderHeart, Images, Frame, Gem, Inbox, NotebookTabs, Lightbulb, Landmark, BriefcaseBusiness,
  Megaphone, Users, Hash, Files, Settings, Star, Heart, Sparkles, Palette, Brush, Camera, Music, BookOpen, Coffee, Sun, Moon, Flower2, Leaf,
  Rocket, Target, Trophy, Gift, Bell, Bookmark, Feather, Flame, Globe, Map, Mail, PenTool, Scissors, Shapes, Smile, Zap, Crown, Clock, Quote,
  Hourglass, StickyNote, Tag, Layers, Folder, FileText,
};
export const iconOf = (name: string | null | undefined, fallback: LucideIcon): LucideIcon => (name && ICONS[name]) || fallback;
