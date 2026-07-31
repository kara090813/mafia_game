import { useMemo } from 'react';

const COLORS = [
  '#e84545', // 빨강
  '#3b82f6', // 파랑
  '#22c55e', // 초록
  '#f59e0b', // 노랑
  '#a855f7', // 보라
  '#ec4899', // 핑크
  '#06b6d4', // 시안
  '#f97316', // 주황
  '#84cc16', // 라임
  '#6366f1', // 인디고
  '#14b8a6', // 틸
  '#e11d48', // 로즈
];

// 블롭 실루엣 (100x100 viewBox 기준, 아래쪽이 평평한 형태)
const BODIES = [
  // 둥근 기본형
  'M50 8 C75 8 92 22 92 42 L92 72 C92 88 75 96 50 96 C25 96 8 88 8 72 L8 42 C8 22 25 8 50 8Z',
  // 넓은 어깨형
  'M50 10 C78 10 95 25 95 40 L95 70 C95 87 78 95 50 95 C22 95 5 87 5 70 L5 40 C5 25 22 10 50 10Z',
  // 삼각 뾰족형
  'M50 6 C70 6 88 20 90 38 L92 72 C92 88 74 96 50 96 C26 96 8 88 8 72 L10 38 C12 20 30 6 50 6Z',
  // 물방울형
  'M50 5 C72 5 86 18 88 36 L90 68 C90 86 73 97 50 97 C27 97 10 86 10 68 L12 36 C14 18 28 5 50 5Z',
  // 통통형
  'M50 12 C80 12 96 28 96 48 L94 72 C92 88 76 95 50 95 C24 95 8 88 6 72 L4 48 C4 28 20 12 50 12Z',
  // 긴 형태
  'M50 4 C68 4 82 16 85 34 L87 70 C87 88 72 97 50 97 C28 97 13 88 13 70 L15 34 C18 16 32 4 50 4Z',
];

// 눈 모양 (각각 왼쪽 눈, 오른쪽 눈)
const EYES = [
  // 동그란 눈
  { left: { cx: 36, cy: 44, rx: 7, ry: 8 }, right: { cx: 64, cy: 44, rx: 7, ry: 8 }, pupil: 4 },
  // 큰 동그란 눈
  { left: { cx: 34, cy: 42, rx: 9, ry: 10 }, right: { cx: 66, cy: 42, rx: 9, ry: 10 }, pupil: 4.5 },
  // 타원 눈
  { left: { cx: 35, cy: 44, rx: 8, ry: 6 }, right: { cx: 65, cy: 44, rx: 8, ry: 6 }, pupil: 3.5 },
  // 반달 눈 (웃는)
  { left: { cx: 36, cy: 44, rx: 7, ry: 7 }, right: { cx: 64, cy: 44, rx: 7, ry: 7 }, pupil: 0, squint: true },
  // 점 눈
  { left: { cx: 37, cy: 44, rx: 5, ry: 5 }, right: { cx: 63, cy: 44, rx: 5, ry: 5 }, pupil: 0, dot: true },
];

interface AvatarProps {
  name: string;
  size?: number;
  dead?: boolean;
}

export function Avatar({ name, size = 32, dead }: AvatarProps) {
  const h = hash(name);
  const color = COLORS[h % COLORS.length];
  const bodyIdx = (h >> 4) % BODIES.length;
  const eyeIdx = (h >> 8) % EYES.length;

  const svg = useMemo(() => {
    const body = BODIES[bodyIdx];
    const eye = EYES[eyeIdx];
    const highlight = lighten(color, 0.25);
    const shadow = darken(color, 0.15);

    let eyesSvg = '';

    if (dead) {
      // X 눈
      const xl = eye.left.cx, yl = eye.left.cy;
      const xr = eye.right.cx, yr = eye.right.cy;
      const s = 7;
      eyesSvg = `
        <line x1="${xl-s}" y1="${yl-s}" x2="${xl+s}" y2="${yl+s}" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
        <line x1="${xl+s}" y1="${yl-s}" x2="${xl-s}" y2="${yl+s}" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
        <line x1="${xr-s}" y1="${yr-s}" x2="${xr+s}" y2="${yr+s}" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
        <line x1="${xr+s}" y1="${yr-s}" x2="${xr-s}" y2="${yr+s}" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
      `;
    } else if (eye.squint) {
      // 반달 웃는 눈
      const l = eye.left, r = eye.right;
      eyesSvg = `
        <path d="M${l.cx-l.rx} ${l.cy} Q${l.cx} ${l.cy-l.ry*1.5} ${l.cx+l.rx} ${l.cy}" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M${r.cx-r.rx} ${r.cy} Q${r.cx} ${r.cy-r.ry*1.5} ${r.cx+r.rx} ${r.cy}" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
      `;
    } else if (eye.dot) {
      // 점 눈
      eyesSvg = `
        <circle cx="${eye.left.cx}" cy="${eye.left.cy}" r="${eye.left.rx}" fill="#fff"/>
        <circle cx="${eye.right.cx}" cy="${eye.right.cy}" r="${eye.right.rx}" fill="#fff"/>
      `;
    } else {
      // 일반 눈 (흰자 + 동공)
      const l = eye.left, r = eye.right;
      eyesSvg = `
        <ellipse cx="${l.cx}" cy="${l.cy}" rx="${l.rx}" ry="${l.ry}" fill="#fff"/>
        <ellipse cx="${r.cx}" cy="${r.cy}" rx="${r.rx}" ry="${r.ry}" fill="#fff"/>
        <circle cx="${l.cx+1}" cy="${l.cy+1}" r="${eye.pupil}" fill="#222"/>
        <circle cx="${r.cx+1}" cy="${r.cy+1}" r="${eye.pupil}" fill="#222"/>
      `;
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <defs>
        <linearGradient id="g${h}" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stop-color="${highlight}"/>
          <stop offset="100%" stop-color="${shadow}"/>
        </linearGradient>
      </defs>
      <path d="${body}" fill="url(#g${h})"/>
      <ellipse cx="38" cy="76" rx="12" ry="3" fill="${shadow}" opacity="0.3"/>
      <ellipse cx="62" cy="76" rx="12" ry="3" fill="${shadow}" opacity="0.3"/>
      ${eyesSvg}
    </svg>`;
  }, [h, bodyIdx, eyeIdx, color, dead]);

  const dataUri = `data:image/svg+xml,${encodeURIComponent(svg)}`;

  return (
    <img
      src={dataUri}
      alt={name}
      width={size}
      height={size}
      style={{
        flexShrink: 0,
        opacity: dead ? 0.45 : 1,
        filter: dead ? 'grayscale(0.8)' : undefined,
      }}
    />
  );
}

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}

function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}
