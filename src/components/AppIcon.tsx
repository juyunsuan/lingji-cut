import type { SVGProps } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  ChevronRight,
  Eye,
  FolderOpen,
  Gauge,
  Italic,
  Layers,
  Maximize2,
  Minimize2,
  Monitor,
  Plus,
  Save,
  Scissors,
  Settings,
  Trash2,
  Type,
  Underline,
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
  'align-center': AlignCenter,
  'align-left': AlignLeft,
  'align-right': AlignRight,
  bold: Bold,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  eye: Eye,
  'folder-open': FolderOpen,
  gauge: Gauge,
  italic: Italic,
  layers: Layers,
  'maximize-2': Maximize2,
  'minimize-2': Minimize2,
  monitor: Monitor,
  plus: Plus,
  save: Save,
  scissors: Scissors,
  settings: Settings,
  'trash-2': Trash2,
  type: Type,
  underline: Underline,
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

function renderCustomIconPath(name: AppIconName) {
  switch (name) {
    case 'sparkles':
      return (
        <>
          <path
            {...filled}
            d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"
          />
          <path {...filled} d="M20 2v4m2-2h-4" />
          <circle {...filled} cx="4" cy="20" r="2" />
        </>
      );
    case 'brain':
      return (
        <>
          <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
          <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
        </>
      );
    case 'arrow-up-to-line':
      return (
        <>
          <path d="M5 3h14" />
          <path d="m18 13-6-6-6 6" />
          <path d="M12 7v14" />
        </>
      );
    case 'settings-2':
      return (
        <>
          <path {...filled} d="M14 17H5M19 7h-9" />
          <circle {...filled} cx="17" cy="17" r="3" />
          <circle {...filled} cx="7" cy="7" r="3" />
        </>
      );
    case 'refresh-cw':
      return (
        <>
          <path
            {...filled}
            d="M3 12a9 9 0 0 1 9-9a9.75 9.75 0 0 1 6.74 2.74L21 8"
          />
          <path
            {...filled}
            d="M21 3v5h-5m5 4a9 9 0 0 1-9 9a9.75 9.75 0 0 1-6.74-2.74L3 16"
          />
          <path {...filled} d="M8 16H3v5" />
        </>
      );
    case 'alert-circle':
      return (
        <>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4m0 4h.01" />
        </>
      );
    case 'send-horizontal':
      return (
        <path d="M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904zM6 12h16" />
      );
    case 'layout-template':
      return (
        <>
          <rect {...filled} width="18" height="7" x="3" y="3" rx="1" />
          <rect {...filled} width="9" height="7" x="3" y="14" rx="1" />
          <rect {...filled} width="5" height="7" x="16" y="14" rx="1" />
        </>
      );
    case 'image':
      return (
        <>
          <rect {...filled} width="18" height="18" x="3" y="3" rx="2" ry="2" />
          <circle {...filled} cx="9" cy="9" r="2" />
          <path {...filled} d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </>
      );
    case 'circle-check-big':
      return (
        <>
          <path {...filled} d="M21.801 10A10 10 0 1 1 17 3.335" />
          <path {...filled} d="m9 11 3 3L22 4" />
        </>
      );
    case 'circle':
      return <circle cx="12" cy="12" r="10" />;
    case 'file-text':
      return (
        <>
          <path
            {...filled}
            d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"
          />
          <path {...filled} d="M14 2v5a1 1 0 0 0 1 1h5M10 9H8m8 4H8m8 4H8" />
        </>
      );
    case 'chart-column':
      return <path d="M3 3v16a2 2 0 0 0 2 2h16m-3-4V9m-5 8V5M8 17v-3" />;
    case 'lightbulb':
      return <path d="M15 14c.2-1 .7-1.7 1.5-2.5c1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5c.7.7 1.3 1.5 1.5 2.5m0 4h6m-5 4h4" />;
    case 'book-open-text':
      return <path d="M12 7v14m4-9h2m-2-4h2M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4a4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3a3 3 0 0 0-3-3zm3-6h2M6 8h2" />;
    case 'quote':
      return <path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2a1 1 0 0 1 1 1v1a2 2 0 0 1-2 2a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1a6 6 0 0 0 6-6V5a2 2 0 0 0-2-2zM5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2a1 1 0 0 1 1 1v1a2 2 0 0 1-2 2a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1a6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z" />;
    case 'pencil-line':
      return <path d="M13 21h8M15 5l4 4m2.174-2.188a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />;
    case 'undo-2':
      return (
        <path
          {...filled}
          d="M8.5 6.5 3 12l5.5 5.5V14H15a4 4 0 1 0 0-8H8.5z"
        />
      );
    case 'redo-2':
      return (
        <path
          {...filled}
          d="M15.5 6.5 21 12l-5.5 5.5V14H9a4 4 0 1 1 0-8h6.5z"
        />
      );
    case 'upload':
      return (
        <>
          <path {...filled} d="M11 18V8.828L7.757 12.07 6.343 10.657 12 5l5.657 5.657-1.414 1.414L13 8.828V18z" />
          <path {...filled} d="M5 19h14v2H5z" />
        </>
      );
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
    case 'film':
      return (
        <path
          {...filled}
          fillRule="evenodd"
          d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 4h8v10H8V7Zm-2-2h2v2H6V5Zm0 4h2v2H6V9Zm0 4h2v2H6v-2Zm0 4h2v2H6v-2Zm10-12h2v2h-2V5Zm0 4h2v2h-2V9Zm0 4h2v2h-2v-2Zm0 4h2v2h-2v-2Z"
        />
      );
    case 'music':
      return (
        <path
          {...filled}
          d="M15 4v9.28A3 3 0 1 1 13 10.5V6.2l6-1.5v6.58A3 3 0 1 1 17 8.5V4z"
        />
      );
    default:
      return null;
  }
}
