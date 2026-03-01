/**
 * Inline SVG icon library for the Buy-vs-Rent calculator.
 * All icons are stroke-based, currentColor, fully themeable.
 */
import React from "react";

interface IconProps {
  size?: number;
  style?: React.CSSProperties;
  className?: string;
}

function Svg({
  size = 16,
  viewBox = "0 0 24 24",
  style,
  className,
  children,
}: {
  size?: number;
  viewBox?: string;
  style?: React.CSSProperties;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline-block", flexShrink: 0, verticalAlign: "middle", ...style }}
      className={className}
    >
      {children}
    </svg>
  );
}

/* ── Zone icons (used in large banners, typically 42–44px) ── */

/** House with chimney — "buy zone" */
export function IconBuyHouse({ size = 44, style, className }: IconProps) {
  return (
    <Svg size={size} style={style} className={className}>
      <path d="M3 10.5 12 3l9 7.5V21H3V10.5z" />
      <path d="M9 21v-8h6v8" />
      <path d="M17 6V3h2v5" />
    </Svg>
  );
}

/** Simple house outline — "rent zone" */
export function IconRentHouse({ size = 44, style, className }: IconProps) {
  return (
    <Svg size={size} style={style} className={className}>
      <path d="M3 10.5 12 3l9 7.5V21H3V10.5z" />
      <path d="M9 13h6M9 17h6" />
    </Svg>
  );
}

/** Binoculars — "watch zone" */
export function IconWatch({ size = 44, style, className }: IconProps) {
  return (
    <Svg size={size} style={style} className={className}>
      <circle cx="7.5" cy="15" r="4" />
      <circle cx="16.5" cy="15" r="4" />
      <path d="M11.5 15h1M3.5 8 7.5 11M20.5 8l-4 3" />
      <path d="M7.5 11h9" />
    </Svg>
  );
}

/* ── Small inline icons (section headers, ~16px) ── */

/** Bar chart — 📊 */
export function IconBarChart({ size = 16, style, className }: IconProps) {
  return (
    <Svg size={size} style={style} className={className}>
      <rect x="3" y="12" width="4" height="9" rx="1" />
      <rect x="10" y="7" width="4" height="14" rx="1" />
      <rect x="17" y="3" width="4" height="18" rx="1" />
    </Svg>
  );
}

/** Trending up — 📈 */
export function IconTrendingUp({ size = 16, style, className }: IconProps) {
  return (
    <Svg size={size} style={style} className={className}>
      <polyline points="3,17 9,11 13,15 21,7" />
      <polyline points="15,7 21,7 21,13" />
    </Svg>
  );
}

/** Briefcase — 💼 */
export function IconBriefcase({ size = 16, style, className }: IconProps) {
  return (
    <Svg size={size} style={style} className={className}>
      <rect x="2" y="8" width="20" height="14" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      <line x1="12" y1="13" x2="12" y2="13.01" strokeWidth="2.5" />
      <path d="M2 13h20" />
    </Svg>
  );
}

/** House (section header variant) — 🏡 */
export function IconHouse({ size = 16, style, className }: IconProps) {
  return (
    <Svg size={size} style={style} className={className}>
      <path d="M3 10.5 12 3l9 7.5V21H3V10.5z" />
      <path d="M9 21v-8h6v8" />
    </Svg>
  );
}

/** Apartment outline — 🏠 */
export function IconApartment({ size = 16, style, className }: IconProps) {
  return (
    <Svg size={size} style={style} className={className}>
      <path d="M3 10.5 12 3l9 7.5V21H3V10.5z" />
      <path d="M9 13h6M9 17h4" />
    </Svg>
  );
}

/** Lightning bolt — ⚡ */
export function IconLightning({ size = 16, style, className }: IconProps) {
  return (
    <Svg size={size} style={style} className={className}>
      <polyline points="13,2 4,14 12,14 11,22 20,10 12,10" />
    </Svg>
  );
}

/** Bell — 🔔 */
export function IconBell({ size = 16, style, className }: IconProps) {
  return (
    <Svg size={size} style={style} className={className}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Svg>
  );
}

/** Calendar — 📆 / 📅 */
export function IconCalendar({ size = 16, style, className }: IconProps) {
  return (
    <Svg size={size} style={style} className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </Svg>
  );
}

/** Coins / wallet — 💰 */
export function IconCoins({ size = 16, style, className }: IconProps) {
  return (
    <Svg size={size} style={style} className={className}>
      <circle cx="8" cy="15" r="5" />
      <path d="M10.85 8A6 6 0 0 1 19 14M3 15c0-4.41 4-8 9-8" strokeDasharray="2 2" />
      <path d="M8 12v6M6 15h4" />
    </Svg>
  );
}

/** Undo arrow — ↩ */
export function IconArrowUndo({ size = 16, style, className }: IconProps) {
  return (
    <Svg size={size} style={style} className={className}>
      <polyline points="9,14 4,9 9,4" />
      <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
    </Svg>
  );
}

/** City skyline — 🌆 */
export function IconCity({ size = 16, style, className }: IconProps) {
  return (
    <Svg size={size} style={style} className={className}>
      <rect x="2" y="11" width="5" height="10" />
      <rect x="7" y="7" width="5" height="14" />
      <rect x="12" y="9" width="5" height="12" />
      <rect x="17" y="5" width="5" height="16" />
      <line x1="2" y1="21" x2="22" y2="21" />
      <rect x="9" y="11" width="1.5" height="2" fill="currentColor" stroke="none" />
      <rect x="14" y="13" width="1.5" height="2" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Classical building / columns — 🏛 */
export function IconBuilding({ size = 16, style, className }: IconProps) {
  return (
    <Svg size={size} style={style} className={className}>
      <line x1="3" y1="21" x2="21" y2="21" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <polyline points="5,10 5,3 19,3 19,10" />
      <line x1="7" y1="21" x2="7" y2="10" />
      <line x1="11" y1="21" x2="11" y2="10" />
      <line x1="15" y1="21" x2="15" y2="10" />
      <line x1="19" y1="21" x2="19" y2="10" />
    </Svg>
  );
}

/** Calculator — 🧮 */
export function IconCalculator({ size = 16, style, className }: IconProps) {
  return (
    <Svg size={size} style={style} className={className}>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <line x1="8" y1="6" x2="16" y2="6" />
      <line x1="8" y1="10" x2="8.01" y2="10" strokeWidth="2.5" />
      <line x1="12" y1="10" x2="12.01" y2="10" strokeWidth="2.5" />
      <line x1="16" y1="10" x2="16.01" y2="10" strokeWidth="2.5" />
      <line x1="8" y1="14" x2="8.01" y2="14" strokeWidth="2.5" />
      <line x1="12" y1="14" x2="12.01" y2="14" strokeWidth="2.5" />
      <line x1="16" y1="14" x2="16.01" y2="14" strokeWidth="2.5" />
      <line x1="8" y1="18" x2="12" y2="18" />
      <line x1="16" y1="18" x2="16.01" y2="18" strokeWidth="2.5" />
    </Svg>
  );
}

/** Construction / crane — 🏗 */
export function IconConstruction({ size = 16, style, className }: IconProps) {
  return (
    <Svg size={size} style={style} className={className}>
      <rect x="2" y="14" width="8" height="8" />
      <line x1="6" y1="14" x2="6" y2="2" />
      <line x1="6" y1="2" x2="18" y2="2" />
      <line x1="18" y1="2" x2="18" y2="8" />
      <line x1="6" y1="6" x2="18" y2="2" />
    </Svg>
  );
}

/* ── Risk profile icons (~18px) ── */

/** Shield — 🛡 */
export function IconShield({ size = 18, style, className }: IconProps) {
  return (
    <Svg size={size} style={style} className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </Svg>
  );
}

/** Balance scales — ⚖️ */
export function IconScale({ size = 18, style, className }: IconProps) {
  return (
    <Svg size={size} style={style} className={className}>
      <line x1="12" y1="3" x2="12" y2="21" />
      <path d="M3 7l4.5 9H3l4.5-9zM17 7l4.5 9H17l4.5-9z" />
      <line x1="7.5" y1="7" x2="16.5" y2="7" />
      <line x1="12" y1="21" x2="8" y2="21" />
    </Svg>
  );
}

/** Rocket — 🚀 */
export function IconRocket({ size = 18, style, className }: IconProps) {
  return (
    <Svg size={size} style={style} className={className}>
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M15 12v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </Svg>
  );
}

/* ── Asset row icons (~20px) ── */

/** Bank building — 🏦 */
export function IconBank({ size = 20, style, className }: IconProps) {
  return (
    <Svg size={size} style={style} className={className}>
      <line x1="3" y1="22" x2="21" y2="22" />
      <line x1="3" y1="11" x2="21" y2="11" />
      <polyline points="5,11 5,22" />
      <polyline points="9,11 9,22" />
      <polyline points="13,11 13,22" />
      <polyline points="17,11 17,22" />
      <polyline points="21,11 21,22" />
      <polyline points="2,11 12,2 22,11" />
    </Svg>
  );
}

/**
 * CN / A-share icon — letter "A" in a square (replaces 🇨🇳).
 * Uses a text node for the "A" mark.
 */
export function IconCN({ size = 20, style, className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ display: "inline-block", flexShrink: 0, verticalAlign: "middle", ...style }}
      className={className}
    >
      <rect x="2" y="2" width="20" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <text x="12" y="17" textAnchor="middle" fontSize="12" fontWeight="700"
        fill="currentColor" stroke="none" fontFamily="system-ui, sans-serif">A</text>
    </svg>
  );
}

/**
 * HK / Hang Seng icon — letters "HK" in a square (replaces 🇭🇰).
 */
export function IconHK({ size = 20, style, className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ display: "inline-block", flexShrink: 0, verticalAlign: "middle", ...style }}
      className={className}
    >
      <rect x="2" y="2" width="20" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <text x="12" y="17" textAnchor="middle" fontSize="9" fontWeight="700"
        fill="currentColor" stroke="none" fontFamily="system-ui, sans-serif">HK</text>
    </svg>
  );
}

/**
 * US / dollar icon — "$" in a square (replaces 🇺🇸).
 */
export function IconUS({ size = 20, style, className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ display: "inline-block", flexShrink: 0, verticalAlign: "middle", ...style }}
      className={className}
    >
      <rect x="2" y="2" width="20" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <text x="12" y="17" textAnchor="middle" fontSize="13" fontWeight="700"
        fill="currentColor" stroke="none" fontFamily="system-ui, sans-serif">$</text>
    </svg>
  );
}

/** Bond / fixed-income chart — 📊 (asset row variant) */
export function IconBondFund({ size = 20, style, className }: IconProps) {
  return (
    <Svg size={size} style={style} className={className}>
      <rect x="3" y="12" width="4" height="9" rx="1" />
      <rect x="10" y="7" width="4" height="14" rx="1" />
      <rect x="17" y="3" width="4" height="18" rx="1" />
    </Svg>
  );
}

/** GJJ / housing fund house — 🏠 (asset row variant) */
export function IconGJJ({ size = 20, style, className }: IconProps) {
  return (
    <Svg size={size} style={style} className={className}>
      <path d="M3 10.5 12 3l9 7.5V21H3V10.5z" />
      <rect x="9" y="14" width="6" height="7" />
    </Svg>
  );
}
