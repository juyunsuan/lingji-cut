import type { SVGProps } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowUpToLine,
  Bold,
  BookOpenText,
  Brain,
  ChartColumnIncreasing,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleAlert,
  CircleCheckBig,
  Clipboard,
  Copy,
  Eye,
  FileText,
  Film,
  FolderOpen,
  Gauge,
  Image,
  Italic,
  LayoutTemplate,
  Layers,
  Lightbulb,
  Maximize2,
  Minimize2,
  Monitor,
  Music,
  PencilLine,
  Plus,
  Quote,
  Redo2,
  RefreshCw,
  Save,
  Scissors,
  SendHorizontal,
  Settings,
  Settings2,
  Sparkles,
  Trash2,
  Type,
  Underline,
  Undo2,
  Upload,
  Volume2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

export type AppIconName =
  | 'alert-circle'
  | 'align-center'
  | 'align-left'
  | 'align-right'
  | 'arrow-up-to-line'
  | 'book-open-text'
  | 'bold'
  | 'brain'
  | 'chart-column'
  | 'chevron-down'
  | 'chevron-right'
  | 'circle'
  | 'circle-check-big'
  | 'clipboard'
  | 'copy'
  | 'eye'
  | 'file-text'
  | 'film'
  | 'folder-open'
  | 'gauge'
  | 'image'
  | 'italic'
  | 'layout-template'
  | 'layers'
  | 'lightbulb'
  | 'maximize-2'
  | 'minimize-2'
  | 'monitor'
  | 'music'
  | 'pause'
  | 'pencil-line'
  | 'play'
  | 'plus'
  | 'quote'
  | 'redo-2'
  | 'refresh-cw'
  | 'save'
  | 'scissors'
  | 'send-horizontal'
  | 'settings'
  | 'settings-2'
  | 'skip-back'
  | 'skip-forward'
  | 'sparkles'
  | 'trash-2'
  | 'type'
  | 'underline'
  | 'undo-2'
  | 'upload'
  | 'volume-2'
  | 'x'
  | 'zoom-in'
  | 'zoom-out';

interface AppIconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  name: AppIconName;
  size?: number;
}

const lucideIconMap: Partial<Record<AppIconName, LucideIcon>> = {
  'alert-circle': CircleAlert,
  'align-center': AlignCenter,
  'align-left': AlignLeft,
  'align-right': AlignRight,
  'arrow-up-to-line': ArrowUpToLine,
  'book-open-text': BookOpenText,
  bold: Bold,
  brain: Brain,
  'chart-column': ChartColumnIncreasing,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  circle: Circle,
  'circle-check-big': CircleCheckBig,
  clipboard: Clipboard,
  copy: Copy,
  eye: Eye,
  'file-text': FileText,
  film: Film,
  'folder-open': FolderOpen,
  gauge: Gauge,
  image: Image,
  italic: Italic,
  'layout-template': LayoutTemplate,
  layers: Layers,
  lightbulb: Lightbulb,
  'maximize-2': Maximize2,
  'minimize-2': Minimize2,
  monitor: Monitor,
  music: Music,
  'pencil-line': PencilLine,
  plus: Plus,
  quote: Quote,
  'redo-2': Redo2,
  'refresh-cw': RefreshCw,
  save: Save,
  scissors: Scissors,
  'send-horizontal': SendHorizontal,
  settings: Settings,
  'settings-2': Settings2,
  sparkles: Sparkles,
  'trash-2': Trash2,
  type: Type,
  underline: Underline,
  'undo-2': Undo2,
  upload: Upload,
  'volume-2': Volume2,
  x: X,
  'zoom-in': ZoomIn,
  'zoom-out': ZoomOut,
};

const filled = {
  fill: 'currentColor',
  stroke: 'none',
} as const;

export function AppIcon({ name, size = 16, ...props }: AppIconProps) {
  const customIcon = renderCustomIconPath(name);

  if (customIcon) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        aria-hidden="true"
        {...props}
      >
        {customIcon}
      </svg>
    );
  }

  const LucideIcon = lucideIconMap[name];
  if (!LucideIcon) {
    return null;
  }

  return <LucideIcon size={size} strokeWidth={1.9} aria-hidden="true" {...props} />;
}

/**
 * 仅保留播放控件的自定义填充 SVG —— 设计稿中这些图标也是自定义 path。
 * 其余所有图标统一走 Lucide 标准描边风格。
 */
function renderCustomIconPath(name: AppIconName) {
  switch (name) {
    case 'play':
      return <path {...filled} d="M8 5v14l11-7z" />;
    case 'pause':
      return (
        <>
          <rect {...filled} x="6" y="4" width="4" height="16" rx="1" />
          <rect {...filled} x="14" y="4" width="4" height="16" rx="1" />
        </>
      );
    case 'skip-forward':
      return (
        <>
          <path {...filled} d="M4 5v14l11-7z" />
          <rect {...filled} x="18" y="5" width="3" height="14" rx="0.8" />
        </>
      );
    case 'skip-back':
      return (
        <>
          <rect {...filled} x="3" y="5" width="3" height="14" rx="0.8" />
          <path {...filled} d="M20 5v14l-11-7z" />
        </>
      );
    default:
      return null;
  }
}
