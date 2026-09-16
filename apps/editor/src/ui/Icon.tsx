import type { JSX } from 'preact';

/** Simple stroke icons drawn for Mythic Forge (24×24 grid). */
const PATHS = {
  plus: <path d="M12 5v14M5 12h14" />,
  home: <path d="M4 11l8-7 8 7M6 10v10h12V10M10 20v-6h4v6" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  library: <path d="M4 4h4v16H4zM10 4h4v16h-4zM16.5 4.5l3.8 1 -3.9 15-3.8-1z" />,
  template: <path d="M4 4h16v6H4zM4 14h7v6H4zM15 14h5v6h-5z" />,
  book: <path d="M5 4h9a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4zM5 16a4 4 0 0 1 4-4h9" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l4 4" />
    </>
  ),
  cube: <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5" />,
  sphere: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12c0 2 3.6 3.5 8 3.5s8-1.5 8-3.5" />
    </>
  ),
  light: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" />,
  camera: (
    <>
      <path d="M3 8h12v10H3zM15 11l6-3v10l-6-3" />
    </>
  ),
  empty: <path d="M12 4l8 8-8 8-8-8z" />,
  model: <path d="M12 3l3 5h5l-3 5 3 5h-5l-3 3-3-3H4l3-5-3-5h5z" />,
  image: (
    <>
      <path d="M4 5h16v14H4z" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 17l5-5 4 4 3-3 4 4" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </>
  ),
  play: <path d="M7 4.5v15l12-7.5z" />,
  pause: <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />,
  stop: <path d="M6 6h12v12H6z" />,
  save: <path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6" />,
  undo: <path d="M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2" />,
  redo: <path d="M15 7l5 5-5 5M20 12H9a5 5 0 0 0 0 10h2" />,
  move: <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />,
  rotate: <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" />,
  scale: <path d="M4 20h7v-7H4zM14 10V4h6v6M20 4l-8 8" />,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  copy: <path d="M8 8h11v12H8zM5 16H4V4h11v1" />,
  eye: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': <path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6A17.4 17.4 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.9-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2" />,
  lock: <path d="M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3" />,
  unlock: <path d="M6 11h12v9H6zM8 11V8a4 4 0 0 1 7.5-2" />,
  'chevron-right': <path d="M9 6l6 6-6 6" />,
  'chevron-down': <path d="M6 9l6 6 6-6" />,
  'arrow-left': <path d="M19 12H5M11 6l-6 6 6 6" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  alert: <path d="M12 4l9 16H3zM12 10v4M12 17.5v.5" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </>
  ),
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5 4.5-5" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="19" cy="12" r="1.2" />
    </>
  ),
  layers: <path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5" />,
  sliders: <path d="M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4" />,
  battery: <path d="M3 8h15v8H3zM18 11h2v2h-2M6 11h5v2H6z" />,
  gauge: <path d="M4 16a8 8 0 1 1 16 0M12 16l4-5" />,
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  upload: <path d="M12 20V9M7 14l5-5 5 5M5 4h14" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />,
  pencil: <path d="M4 20l1-5L16 4l4 4L9 19zM14 6l4 4" />,
  archive: <path d="M3 5h18v4H3zM5 9v11h14V9M10 13h4" />,
  focus: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5M12 9v6M9 12h6" />,
  grid: <path d="M4 4h16v16H4zM4 10h16M4 15h16M10 4v16M15 4v16" />,
  cpu: <path d="M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" />,
  hammer: <path d="M14 4l6 6-3 3-6-6zM11 7l-8 8 3 3 8-8" />,
  terminal: <path d="M4 5h16v14H4zM7 9l3 3-3 3M12 15h5" />,
  package: <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM8 5.3l8 4.5M12 12v9M4 7.5l8 4.5 8-4.5" />,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5a3 3 0 0 1 0 6M18 14c2 .7 3 2.9 3 6" />
    </>
  ),
  flag: <path d="M5 21V4M5 4h12l-2 4 2 4H5" />,
  refresh: <path d="M20 11a8 8 0 0 0-14.6-4M4 5v4h4M4 13a8 8 0 0 0 14.6 4M20 19v-4h-4" />,
  wifi: <path d="M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0M12 19.5v.5" />,
  'wifi-off': <path d="M3 3l18 18M8.5 16a5 5 0 0 1 6 0M5 12.5a10 10 0 0 1 4-2.3M2 9a15 15 0 0 1 5.2-3.2M17.5 11a10 10 0 0 1 1 .9M12 5a15 15 0 0 1 10 4M12 19.5v.5" />,
  collider: <path d="M5 5h14v14H5zM5 5l3 3M19 5l-3 3M5 19l3-3M19 19l-3-3" />,
  behaviour: <path d="M12 3v4M12 17v4M4.2 7.5l3.5 2M16.3 14.5l3.5 2M4.2 16.5l3.5-2M16.3 9.5l3.5-2M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z" />,
  physics: (
    <>
      <circle cx="12" cy="7" r="3" />
      <path d="M12 10v6M8 20h8M12 16l-3 4M12 16l3 4" />
    </>
  ),
  material: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" stroke="none" />
    </>
  ),
  transform: <path d="M4 20l7-7M4 20v-5M4 20h5M20 4l-7 7M20 4v5M20 4h-5" />,
  keyboard: <path d="M3 7h18v10H3zM7 14h10M6.5 10.5h.5M10 10.5h.5M13.5 10.5h.5M17 10.5h.5" />,
  accessibility: (
    <>
      <circle cx="12" cy="4.5" r="1.5" />
      <path d="M5 8l7 1.5L19 8M12 9.5V14l-3 6M12 14l3 6" />
    </>
  ),
} satisfies Record<string, JSX.Element>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, label, class: className }: { name: IconName; size?: number; label?: string; class?: string }) {
  return (
    <svg
      class={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
