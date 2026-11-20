const paths = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  box: "m12 3 9 5v8l-9 5-9-5V8l9-5z M3 8l9 5 9-5 M12 13v8 M7.5 5.5l9 5",
  chat: "M20 16V5H4v13l4-2h12z M8 9h8 M8 12h5",
  shield:
    "M12 2 4.5 5v5.5c0 5 3.2 8.8 7.5 11.5 4.3-2.7 7.5-6.5 7.5-11.5V5L12 2z M8.5 11.5l2.3 2.3 4.7-5",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2V3z M9 8h6 M9 12h6",
  settings: "M4 7h16 M4 17h16 M8 4v6 M16 14v6",
  plus: "M12 5v14 M5 12h14",
  arrow: "M4 12h15 M13 6l6 6-6 6",
  switch: "M4 7h15l-4-4 M20 17H5l4 4",
  exit: "M13 6l6 6-6 6 M19 12H8 M10 4H5v16h5",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  check: "m5 12 4 4L19 6",
  wallet: "M3 6h16v13H3z M3 6l13-3 1 3 M14 11h7v4h-7z",
  trend: "m3 17 6-6 4 4 7-8 M15 7h5v5",
  shop: "M3 9l2-5h14l2 5-2 3-3-1-4 1-4-1-3 1-2-3z M5 12v8h14v-8 M10 20v-5h4v5",
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}

export function Brand() {
  return (
    <span className="brand">
      <span className="brand-icon" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>
        FER<span className="brand-ai"> AI</span>
      </span>
    </span>
  );
}
