import type { SVGProps } from 'react';

/** Lucide-style inline icons (1.75px stroke, round caps). */
function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    />
  );
}

export const HandIcon = () => (
  <Icon>
    <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
    <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
    <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
  </Icon>
);

export const BatIcon = () => (
  <Icon>
    <path d="M5.1 18.3 9.2 13.6Q10.3 11.2 12.1 9.3L15.6 5.6a2.4 2.4 0 0 1 3.4 3.4L15.3 12.5Q13.2 14.4 10.8 15.4L6.1 19.3" />
    <circle cx="4.3" cy="19.8" r="1.5" />
  </Icon>
);

export const FlameIcon = () => (
  <Icon>
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </Icon>
);

export const BlasterIcon = () => (
  <Icon>
    <path d="M4.5 8h11a1.5 1.5 0 0 1 1.5 1.5v2a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 11.5v-2A1.5 1.5 0 0 1 4.5 8z" />
    <path d="M17 9.25h3.5v2.5H17" />
    <path d="M5.5 13l-1.3 6.3a.8.8 0 0 0 .8 1h2.6a.8.8 0 0 0 .8-.65L9.5 13" />
    <path d="M9.6 13v1.4a1.6 1.6 0 0 0 1.6 1.6h1.3" />
    <path d="M7 8V6.5h5V8" />
  </Icon>
);

export const ResetIcon = () => (
  <Icon>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </Icon>
);

export const VolumeOnIcon = () => (
  <Icon width="18" height="18">
    <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
    <path d="M16 9a5 5 0 0 1 0 6" />
    <path d="M19.364 18.364a9 9 0 0 0 0-12.728" />
  </Icon>
);

export const VolumeOffIcon = () => (
  <Icon width="18" height="18">
    <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
    <line x1="22" x2="16" y1="9" y2="15" />
    <line x1="16" x2="22" y1="9" y2="15" />
  </Icon>
);

/** Tiny filled octopus used by the wordmark and loader. */
export const OctopusGlyph = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <path
      d="M32 6c-11 0-19 8-19 19 0 6 2 10 5 13-3 4-8 6-10 10 4 1 8-1 11-4-1 5-4 9-3 12 4-1 6-6 8-10 1 5 1 10 4 12 3-2 3-7 4-12 2 4 4 9 8 10 1-3-2-7-3-12 3 3 7 5 11 4-2-4-7-6-10-10 3-3 5-7 5-13 0-11-8-19-19-19z"
      fill="#F2A516"
    />
    <circle cx="25" cy="27" r="3" fill="#1E1812" />
    <circle cx="39" cy="27" r="3" fill="#1E1812" />
  </svg>
);
