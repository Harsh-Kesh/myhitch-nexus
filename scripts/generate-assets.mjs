import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const imagesDir = path.join(rootDir, "public", "images");

const dirs = [
  "thumbnails",
  "heroes",
  "banners",
  "avatars",
  "categories",
  "live",
  "brand",
];

for (const dir of dirs) {
  fs.mkdirSync(path.join(imagesDir, dir), { recursive: true });
}

function escapeXml(unsafe) {
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/* -------------------------------------------------------------------------- */
/*                            Thumbnail Generator                             */
/* -------------------------------------------------------------------------- */

function makeThumbnailSvg({
  id,
  title,
  subtitle,
  badge,
  themeColors, // [c1, c2, c3]
  iconType,
}) {
  const [c1, c2, c3] = themeColors;
  const gradientId = `grad_${id}`;
  const glowId = `glow_${id}`;
  const patternId = `pat_${id}`;

  let visualGraphic = "";
  if (iconType === "lighthouse") {
    visualGraphic = `
      <g transform="translate(480, 160)" opacity="0.9">
        <path d="M-60 220 L60 220 L40 60 L-40 60 Z" fill="#1e293b" />
        <path d="M-35 60 L35 60 L25 -10 L-25 -10 Z" fill="#f8fafc" />
        <rect x="-30" y="80" width="60" height="20" fill="#dc2626" />
        <rect x="-35" y="140" width="70" height="20" fill="#dc2626" />
        <circle cx="0" cy="-25" r="28" fill="#fef08a" opacity="0.9" />
        <polygon points="0,-25 -420,-120 -400,160" fill="url(#${glowId})" opacity="0.35" />
        <polygon points="0,-25 420,-90 440,190" fill="url(#${glowId})" opacity="0.35" />
        <path d="M-200 240 Q -100 200 0 240 T 200 240 T 400 240" fill="none" stroke="#38bdf8" stroke-width="4" opacity="0.4" />
      </g>
    `;
  } else if (iconType === "printing") {
    visualGraphic = `
      <g transform="translate(480, 200)" opacity="0.85">
        <rect x="-140" y="-80" width="280" height="180" rx="12" fill="#292524" stroke="#a8a29e" stroke-width="2" />
        <rect x="-110" y="-50" width="220" height="120" rx="6" fill="#1c1917" />
        <text x="-90" y="-10" font-family="serif" font-size="32" font-weight="bold" fill="#f59e0b" letter-spacing="4">NEXUS</text>
        <text x="-90" y="25" font-family="serif" font-size="16" fill="#d6d3d1">VOL. XXVI · 16MM</text>
        <line x1="-90" y1="45" x2="90" y2="45" stroke="#78716c" stroke-width="2" />
        <circle cx="90" cy="-10" r="16" fill="#ea580c" />
        <circle cx="90" cy="-10" r="8" fill="#1c1917" />
        <path d="M-180 80 L-140 -40 L140 -40 L180 80" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="6,6" opacity="0.5" />
      </g>
    `;
  } else if (iconType === "car_launch") {
    visualGraphic = `
      <g transform="translate(480, 220)">
        <ellipse cx="0" cy="80" rx="220" ry="24" fill="#000" opacity="0.5" />
        <path d="M-180 50 C -120 50 -100 10 -40 0 C 20 -10 100 0 160 30 C 190 45 200 55 200 65 L -180 65 Z" fill="#0f172a" stroke="#38bdf8" stroke-width="2" />
        <path d="M-70 5 C -30 -15 40 -15 80 5 C 60 25 10 30 -60 25 Z" fill="#0284c7" opacity="0.7" />
        <circle cx="-110" cy="65" r="28" fill="#1e293b" stroke="#0ea5e9" stroke-width="4" />
        <circle cx="120" cy="65" r="28" fill="#1e293b" stroke="#0ea5e9" stroke-width="4" />
        <path d="M160 40 L 320 20 L 320 80 L 160 55 Z" fill="url(#${glowId})" opacity="0.4" />
        <path d="M-300 -120 Q 0 -60 300 -140" fill="none" stroke="#22d3ee" stroke-width="18" filter="blur(20px)" opacity="0.4" />
      </g>
    `;
  } else if (iconType === "battery") {
    visualGraphic = `
      <g transform="translate(480, 200)">
        <rect x="-160" y="-70" width="320" height="150" rx="16" fill="#0f172a" stroke="#10b981" stroke-width="3" />
        <rect x="160" y="-30" width="20" height="70" rx="6" fill="#10b981" />
        <g transform="translate(-130, -50)">
          ${[0, 50, 100, 150, 200].map((x) => `<rect x="${x}" y="0" width="40" height="110" rx="6" fill="#047857" opacity="0.8" />`).join("")}
        </g>
        <path d="M-20 -20 L15 -20 L-5 20 L25 20 L-15 60 L-5 10 L-25 10 Z" fill="#fbbf24" transform="translate(0, -20)" />
      </g>
    `;
  } else if (iconType === "camera_craft") {
    visualGraphic = `
      <g transform="translate(480, 200)">
        <circle cx="0" cy="0" r="90" fill="#0f172a" stroke="#f59e0b" stroke-width="4" />
        <circle cx="0" cy="0" r="70" fill="#1e293b" stroke="#38bdf8" stroke-width="2" />
        <circle cx="0" cy="0" r="50" fill="#0284c7" opacity="0.3" />
        <circle cx="0" cy="0" r="30" fill="#0369a1" />
        <polygon points="0,-70 60,35 -60,35" fill="none" stroke="#f59e0b" stroke-width="2" opacity="0.7" />
        <polygon points="0,70 -60,-35 60,-35" fill="none" stroke="#38bdf8" stroke-width="2" opacity="0.7" />
        <line x1="-240" y1="0" x2="240" y2="0" stroke="#06b6d4" stroke-width="3" opacity="0.8" />
        <circle cx="-120" cy="0" r="16" fill="#06b6d4" opacity="0.3" />
        <circle cx="120" cy="0" r="24" fill="#38bdf8" opacity="0.2" />
      </g>
    `;
  } else if (iconType === "lighting") {
    visualGraphic = `
      <g transform="translate(480, 200)">
        <polygon points="-80,-100 80,-100 120,40 -120,40" fill="#1e293b" stroke="#fbbf24" stroke-width="3" />
        <polygon points="-120,40 120,40 220,180 -220,180" fill="url(#${glowId})" opacity="0.4" />
        <circle cx="0" cy="-30" r="30" fill="#fef08a" />
        <line x1="0" y1="40" x2="0" y2="160" stroke="#64748b" stroke-width="6" />
        <line x1="-40" y1="160" x2="40" y2="160" stroke="#64748b" stroke-width="6" />
      </g>
    `;
  } else if (iconType === "education_stats") {
    visualGraphic = `
      <g transform="translate(480, 220)">
        <path d="M-220 80 Q -100 80 -40 -60 Q 0 -140 40 -60 Q 100 80 220 80" fill="none" stroke="#10b981" stroke-width="5" />
        <path d="M-220 80 Q -100 80 -40 -60 Q 0 -140 40 -60 Q 100 80 220 80 L220 90 L-220 90 Z" fill="#10b981" opacity="0.15" />
        <line x1="0" y1="-140" x2="0" y2="90" stroke="#34d399" stroke-width="2" stroke-dasharray="4,4" />
        <circle cx="0" cy="-140" r="8" fill="#fbbf24" />
        <text x="-15" y="-155" fill="#fef08a" font-size="18" font-family="sans-serif" font-weight="bold">μ</text>
        <rect x="-180" y="-120" width="90" height="50" rx="8" fill="#064e3b" stroke="#34d399" stroke-width="1.5" />
        <text x="-165" y="-90" fill="#a7f3d0" font-size="14" font-family="monospace">p &lt; 0.001</text>
      </g>
    `;
  } else if (iconType === "investigation") {
    visualGraphic = `
      <g transform="translate(480, 200)">
        <circle cx="0" cy="0" r="100" fill="none" stroke="#ef4444" stroke-width="4" stroke-dasharray="8,8" />
        <circle cx="0" cy="0" r="60" fill="none" stroke="#f87171" stroke-width="2" />
        <circle cx="0" cy="0" r="12" fill="#ef4444" />
        <line x1="-160" y1="-80" x2="160" y2="80" stroke="#38bdf8" stroke-width="2" />
        <line x1="-140" y1="80" x2="140" y2="-80" stroke="#38bdf8" stroke-width="2" />
        <rect x="-120" y="70" width="240" height="40" rx="6" fill="#1e293b" stroke="#94a3b8" stroke-width="1.5" />
        <text x="0" y="95" fill="#f1f5f9" font-size="14" font-family="monospace" text-anchor="middle" letter-spacing="2">CLASSIFIED REPORT</text>
      </g>
    `;
  } else if (iconType === "music_session") {
    visualGraphic = `
      <g transform="translate(480, 200)">
        <rect x="-35" y="-100" width="70" height="120" rx="35" fill="#334155" stroke="#ec4899" stroke-width="3" />
        <line x1="-20" y1="-70" x2="20" y2="-70" stroke="#94a3b8" stroke-width="3" />
        <line x1="-25" y1="-40" x2="25" y2="-40" stroke="#94a3b8" stroke-width="3" />
        <line x1="-20" y1="-10" x2="20" y2="-10" stroke="#94a3b8" stroke-width="3" />
        <line x1="0" y1="20" x2="0" y2="120" stroke="#64748b" stroke-width="8" />
        <circle cx="-120" cy="0" r="50" fill="none" stroke="#f43f5e" stroke-width="2" opacity="0.5" />
        <circle cx="120" cy="0" r="50" fill="none" stroke="#8b5cf6" stroke-width="2" opacity="0.5" />
        <circle cx="-160" cy="0" r="80" fill="none" stroke="#f43f5e" stroke-width="1.5" opacity="0.3" />
        <circle cx="160" cy="0" r="80" fill="none" stroke="#8b5cf6" stroke-width="1.5" opacity="0.3" />
      </g>
    `;
  } else if (iconType === "woodworking") {
    visualGraphic = `
      <g transform="translate(480, 200)">
        <rect x="-160" y="20" width="320" height="40" rx="4" fill="#78350f" stroke="#d97706" stroke-width="2" />
        <rect x="-140" y="60" width="30" height="80" fill="#451a03" />
        <rect x="110" y="60" width="30" height="80" fill="#451a03" />
        <polygon points="-60,20 20,-40 60,-20 -20,20" fill="#d97706" stroke="#fbbf24" stroke-width="2" />
        <circle cx="40" cy="-30" r="10" fill="#92400e" />
        <path d="M-80 -20 Q -40 -60 0 -20 T 80 -20" fill="none" stroke="#fde68a" stroke-width="4" stroke-linecap="round" />
      </g>
    `;
  } else if (iconType === "travel") {
    visualGraphic = `
      <g transform="translate(480, 200)">
        <circle cx="0" cy="0" r="110" fill="#0f766e" opacity="0.3" />
        <path d="M-180 80 Q -80 -40 0 40 T 180 20 L180 120 L-180 120 Z" fill="#115e59" />
        <path d="M-100 80 Q 0 -60 100 80 Z" fill="#047857" opacity="0.8" />
        <circle cx="100" cy="-40" r="28" fill="#f59e0b" />
        <path d="M-160 -60 Q -80 -80 0 -60 Q 80 -40 160 -60" fill="none" stroke="#38bdf8" stroke-width="2" opacity="0.6" />
      </g>
    `;
  } else {
    // Cinematic default geometry with rich gradients
    visualGraphic = `
      <g transform="translate(480, 200)">
        <circle cx="0" cy="0" r="90" fill="none" stroke="${c2}" stroke-width="2" opacity="0.6" />
        <circle cx="0" cy="0" r="60" fill="none" stroke="${c3 || c1}" stroke-width="2" opacity="0.4" />
        <rect x="-70" y="-50" width="140" height="100" rx="12" fill="${c1}" opacity="0.35" stroke="${c2}" stroke-width="2" />
        <polygon points="-20,-25 30,0 -20,25" fill="#f8fafc" />
      </g>
    `;
  }

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" width="100%" height="100%">
  <defs>
    <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}" />
      <stop offset="50%" stop-color="${c2}" />
      <stop offset="100%" stop-color="${c3 || c1}" />
    </linearGradient>
    <radialGradient id="${glowId}" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
    </radialGradient>
    <pattern id="${patternId}" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 40 M 0 0 L 40 40" fill="none" stroke="#ffffff" stroke-width="0.5" opacity="0.07" />
    </pattern>
    <linearGradient id="scrim_${id}" x1="0" y1="0" x2="0" y2="100%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.2" />
      <stop offset="50%" stop-color="#000000" stop-opacity="0.4" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0.9" />
    </linearGradient>
  </defs>

  <!-- Background base -->
  <rect width="960" height="540" fill="url(#${gradientId})" />
  <rect width="960" height="540" fill="url(#${patternId})" />

  <!-- Ambient light blobs -->
  <circle cx="200" cy="150" r="280" fill="${c1}" filter="blur(80px)" opacity="0.6" />
  <circle cx="760" cy="380" r="320" fill="${c2}" filter="blur(90px)" opacity="0.5" />

  <!-- Visual Central Graphic -->
  ${visualGraphic}

  <!-- Dark gradient scrim for legibility -->
  <rect width="960" height="540" fill="url(#scrim_${id})" />

  <!-- Header Badge -->
  ${
    badge
      ? `
  <g transform="translate(48, 48)">
    <rect width="${badge.length * 9 + 28}" height="28" rx="6" fill="#000000" opacity="0.75" />
    <text x="14" y="19" fill="#38bdf8" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="700" letter-spacing="1">${escapeXml(badge.toUpperCase())}</text>
  </g>
  `
      : ""
  }

  <!-- Bottom title & description metadata -->
  <g transform="translate(48, 440)">
    <text x="0" y="0" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="30" font-weight="700" letter-spacing="-0.5">${escapeXml(title)}</text>
    ${
      subtitle
        ? `
    <text x="0" y="32" fill="#cbd5e1" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="400">${escapeXml(subtitle)}</text>
    `
        : ""
    }
  </g>
</svg>
`.trim();
}

/* -------------------------------------------------------------------------- */
/*                            Avatar Generator                                */
/* -------------------------------------------------------------------------- */

function makeAvatarSvg({ id, name, gradient, size = 200 }) {
  const [c1, c2] = gradient;
  const initial = (name || "N").slice(0, 2).toUpperCase();

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="100%" height="100%">
  <defs>
    <linearGradient id="av_grad_${id}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}" />
      <stop offset="100%" stop-color="${c2}" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size / 2}" fill="url(#av_grad_${id})" />
  <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 4}" fill="none" stroke="#ffffff" stroke-width="3" stroke-opacity="0.25" />
  
  <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="${size * 0.36}" font-weight="700" letter-spacing="1">
    ${escapeXml(initial)}
  </text>
</svg>
`.trim();
}

/* -------------------------------------------------------------------------- */
/*                            Banner Generator                                */
/* -------------------------------------------------------------------------- */

// Deliberately no name/tagline baked into the banner pixels — the channel page (both
// mock and real channels) already renders the real name/tagline as a DOM heading over
// this banner, and the negative margin that lets the avatar overlap the banner also
// pulled that heading up into the same region a baked-in caption occupied, so the two
// visibly collided (looked like duplicated, garbled text over the profile).
function makeBannerSvg({ id, gradient }) {
  const [c1, c2] = gradient;

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 400" width="100%" height="100%">
  <defs>
    <linearGradient id="ban_grad_${id}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}" />
      <stop offset="100%" stop-color="${c2}" />
    </linearGradient>
    <pattern id="ban_pat_${id}" width="60" height="60" patternUnits="userSpaceOnUse">
      <circle cx="30" cy="30" r="1.5" fill="#ffffff" opacity="0.15" />
    </pattern>
  </defs>

  <rect width="1600" height="400" fill="url(#ban_grad_${id})" />
  <rect width="1600" height="400" fill="url(#ban_pat_${id})" />

  <!-- Abstract light streaks -->
  <path d="M 0 400 Q 400 100 800 250 T 1600 50" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.12" />
  <path d="M 0 350 Q 500 200 1000 300 T 1600 100" fill="none" stroke="#38bdf8" stroke-width="2" opacity="0.2" />
</svg>
`.trim();
}

/* -------------------------------------------------------------------------- */
/*                           Category Card Generator                          */
/* -------------------------------------------------------------------------- */

function makeCategorySvg({ id, name, description, gradient }) {
  const [c1, c2] = gradient;

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="100%" height="100%">
  <defs>
    <linearGradient id="cat_grad_${id}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}" />
      <stop offset="100%" stop-color="${c2}" />
    </linearGradient>
  </defs>

  <rect width="600" height="400" fill="url(#cat_grad_${id})" />
  <circle cx="500" cy="100" r="180" fill="#ffffff" opacity="0.08" />
  <circle cx="100" cy="350" r="220" fill="#000000" opacity="0.25" />

  <g transform="translate(40, 260)">
    <text x="0" y="0" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="32" font-weight="700">${escapeXml(name)}</text>
    <text x="0" y="32" fill="#e2e8f0" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" opacity="0.85">${escapeXml(description || "")}</text>
  </g>
</svg>
`.trim();
}

/* -------------------------------------------------------------------------- */
/*                               CHANNEL DATA                                 */
/* -------------------------------------------------------------------------- */

const channelList = [
  {
    id: "ch_northlight",
    name: "Northlight Pictures",
    tagline: "Independent features from the north of England.",
    gradient: ["#8B5CF6", "#4C2889"],
  },
  {
    id: "ch_helio",
    name: "Helio Motors",
    tagline: "Electric vehicles, engineered in the open.",
    gradient: ["#22D3EE", "#0E7490"],
  },
  {
    id: "ch_mara",
    name: "Mara Solace",
    tagline: "Cinematography breakdowns and camera craft.",
    gradient: ["#5B8DEF", "#243F80"],
  },
  {
    id: "ch_meridian",
    name: "Meridian University",
    tagline: "Open lectures and accredited short courses.",
    gradient: ["#34C77B", "#12694A"],
  },
  {
    id: "ch_ledger",
    name: "The Ledger",
    tagline: "Investigations that take as long as they take.",
    gradient: ["#38A8E0", "#175E85"],
  },
  {
    id: "ch_council",
    name: "Harborough City Council",
    tagline: "Council meetings, notices and public information.",
    gradient: ["#5B8DEF", "#2A4E8F"],
  },
  {
    id: "ch_tideline",
    name: "Tideline Trust",
    tagline: "Coastal restoration, documented.",
    gradient: ["#2DD4BF", "#0F766E"],
  },
  {
    id: "ch_asha",
    name: "Asha Builds",
    tagline: "Workshop projects, start to finish.",
    gradient: ["#E5A83B", "#96661A"],
  },
  {
    id: "ch_verge",
    name: "Verge Travel",
    tagline: "Destination films for tourism boards.",
    gradient: ["#4ADE80", "#15803D"],
  },
  {
    id: "ch_orbit",
    name: "Orbit Sessions",
    tagline: "Live music, one take, no overdubs.",
    gradient: ["#EC6AA8", "#9D2C6B"],
  },
];

/* -------------------------------------------------------------------------- */
/*                               LIVE EVENTS                                  */
/* -------------------------------------------------------------------------- */

const liveList = [
  {
    id: "live_council_planning",
    title: "Planning committee — live",
    subtitle: "Harborough City Council · Three agenda items",
    badge: "Live Broadcast",
    themeColors: ["#1e3a8a", "#0284c7", "#38bdf8"],
    iconType: "investigation",
  },
  {
    id: "live_orbit_session",
    title: "Orbit Session 15 — Room Session",
    subtitle: "Orbit Sessions · Exclusive Member Stream",
    badge: "Live Concert",
    themeColors: ["#4a044e", "#86198f", "#d946ef"],
    iconType: "music_session",
  },
  {
    id: "live_helio_keynote",
    title: "Helio Autumn Keynote",
    subtitle: "Leipzig Global Premiere & Q&A",
    badge: "Live Keynote",
    themeColors: ["#082f49", "#0e7490", "#22d3ee"],
    iconType: "car_launch",
  },
  {
    id: "live_northlight_premiere",
    title: "Glasshouse — World Premiere",
    subtitle: "Ticketed Premiere followed by Cast Q&A",
    badge: "Premiere",
    themeColors: ["#022c22", "#065f46", "#34d399"],
    iconType: "lighthouse",
  },
  {
    id: "live_meridian_openday",
    title: "Open Day: Admissions Q&A",
    subtitle: "Meridian University Faculty Stream",
    badge: "Open Day",
    themeColors: ["#172554", "#1d4ed8", "#60a5fa"],
    iconType: "education_stats",
  },
  {
    id: "live_ledger_briefing",
    title: "Newsroom Briefing",
    subtitle: "The Water Investigation Post-Mortem",
    badge: "Briefing",
    themeColors: ["#082f49", "#0c4a6e", "#0284c7"],
    iconType: "investigation",
  },
  {
    id: "live_tideline_appeal",
    title: "Restoration Day Live",
    subtitle: "Six Hours Live from the Blackwater",
    badge: "Live Field",
    themeColors: ["#042f2e", "#0f766e", "#2dd4bf"],
    iconType: "travel",
  },
  {
    id: "live_asha_qa",
    title: "Workshop Q&A",
    subtitle: "Tools, Jigs and Project Questions",
    badge: "Q&A",
    themeColors: ["#451a03", "#78350f", "#d97706"],
    iconType: "woodworking",
  },
];

/* -------------------------------------------------------------------------- */
/*                                CATEGORIES                                  */
/* -------------------------------------------------------------------------- */

const categoryList = [
  {
    id: "cat_brand_film",
    name: "Brand Films",
    description: "Long-form commercial storytelling produced for and by brands.",
    gradient: ["#0f172a", "#0284c7"],
  },
  {
    id: "cat_product_launch",
    name: "Product Launches",
    description: "Launch films, keynote cuts and product explainers.",
    gradient: ["#1e1b4b", "#6366f1"],
  },
  {
    id: "cat_feature_film",
    name: "Feature Films",
    description: "Independent and studio features available to rent or buy.",
    gradient: ["#3b0764", "#a855f7"],
  },
  {
    id: "cat_short_film",
    name: "Short Films",
    description: "Festival shorts and proof-of-concept work.",
    gradient: ["#450a0a", "#ef4444"],
  },
  {
    id: "cat_series",
    name: "Series & Seasons",
    description: "Episodic content organised into seasons.",
    gradient: ["#042f2e", "#14b8a6"],
  },
  {
    id: "cat_music",
    name: "Music & Performance",
    description: "Sessions, videos and recorded performance.",
    gradient: ["#4a044e", "#ec4899"],
  },
  {
    id: "cat_courses",
    name: "Courses & Lectures",
    description: "Structured teaching from accredited providers.",
    gradient: ["#064e3b", "#10b981"],
  },
  {
    id: "cat_skills",
    name: "Skills & Training",
    description: "Vocational, workplace and certification training.",
    gradient: ["#451a03", "#f59e0b"],
  },
  {
    id: "cat_investigations",
    name: "Investigations",
    description: "Long-form investigative journalism and data audits.",
    gradient: ["#082f49", "#0284c7"],
  },
  {
    id: "cat_news_bulletins",
    name: "News & Bulletins",
    description: "Daily news digests, briefings and unedited records.",
    gradient: ["#172554", "#3b82f6"],
  },
  {
    id: "cat_public_notices",
    name: "Public Notices",
    description: "Civic meetings, consultations and public records.",
    gradient: ["#1e293b", "#64748b"],
  },
  {
    id: "cat_impact",
    name: "Impact & Charity",
    description: "Conservation projects, charity appeals and impact audits.",
    gradient: ["#022c22", "#22c55e"],
  },
  {
    id: "cat_destinations",
    name: "Destinations & Travel",
    description: "Cinematic destination guides and tourism board films.",
    gradient: ["#14532d", "#84cc16"],
  },
  {
    id: "cat_conferences",
    name: "Conferences & Events",
    description: "Keynotes, industry conferences and product events.",
    gradient: ["#1e3a8a", "#0284c7"],
  },
  {
    id: "cat_sport",
    name: "Sport & Fixtures",
    description: "Ticketed and subscriber-only live sport.",
    gradient: ["#042f2e", "#059669"],
  },
  {
    id: "cat_creators",
    name: "Creator Content",
    description: "Workshops, tutorials, behind-the-scenes and craft.",
    gradient: ["#431407", "#f97316"],
  },
];

/* -------------------------------------------------------------------------- */
/*                                USER PROFILES                               */
/* -------------------------------------------------------------------------- */

const userList = [
  {
    id: "usr_viewer",
    name: "Mara Solace",
    gradient: ["#5B8DEF", "#243F80"],
  },
  {
    id: "prof_main",
    name: "Mara",
    gradient: ["#5B8DEF", "#243F80"],
  },
  {
    id: "prof_partner",
    name: "Jonah",
    gradient: ["#38A8E0", "#175E85"],
  },
  {
    id: "prof_teen",
    name: "Immy",
    gradient: ["#9B7BF0", "#5B3BB0"],
  },
  {
    id: "prof_kids",
    name: "Kids",
    gradient: ["#34C77B", "#12694A"],
  },
];

/* -------------------------------------------------------------------------- */
/*                            Generate All Assets                             */
/* -------------------------------------------------------------------------- */

// Video thumbnails & heroes are no longer generated — real photography and
// poster artwork in public/images/{thumbnails,heroes,posters} cover them.

console.log("Generating channel avatars & banners...");
for (const ch of channelList) {
  const avatarSvg = makeAvatarSvg({
    id: ch.id,
    name: ch.name,
    gradient: ch.gradient,
  });
  fs.writeFileSync(path.join(imagesDir, "avatars", `${ch.id}.svg`), avatarSvg);

  const bannerSvg = makeBannerSvg(ch);
  fs.writeFileSync(path.join(imagesDir, "banners", `${ch.id}.svg`), bannerSvg);
}

console.log("Generating live stream posters...");
for (const l of liveList) {
  const svg = makeThumbnailSvg(l);
  fs.writeFileSync(path.join(imagesDir, "live", `${l.id}.svg`), svg);
}

console.log("Generating category cover cards...");
for (const cat of categoryList) {
  const svg = makeCategorySvg(cat);
  fs.writeFileSync(
    path.join(imagesDir, "categories", `${cat.id}.svg`),
    svg,
  );
}

console.log("Generating user avatars...");
for (const u of userList) {
  const avatarSvg = makeAvatarSvg({
    id: u.id,
    name: u.name,
    gradient: u.gradient,
  });
  fs.writeFileSync(path.join(imagesDir, "avatars", `${u.id}.svg`), avatarSvg);
}

console.log("Generating brand assets...");
const brandLogo = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 48" width="200" height="48">
  <defs>
    <linearGradient id="brand_grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#818cf8" />
    </linearGradient>
  </defs>
  <rect x="2" y="6" width="36" height="36" rx="8" fill="url(#brand_grad)" />
  <polygon points="14,14 28,24 14,34" fill="#0f172a" />
  <text x="48" y="32" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="900" fill="#ffffff" letter-spacing="1">NEXUS</text>
</svg>
`.trim();
fs.writeFileSync(path.join(imagesDir, "brand", "logo.svg"), brandLogo);

console.log("All image assets successfully generated!");
