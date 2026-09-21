export const PETALS = 24;
export const PETAL_PATH = "M0 -138c13 14 13 30 0 46-13-16-13-32 0-46Z";
export const SUN_TRANSFORM = "translate(200 188) scale(0.84)";
export const CHEVRON_PATH = "M-26 -8 0 24l26-32";
export const ARCH_PATH = "M0 200a200 200 0 0 1 400 0V456a24 24 0 0 1-24 24H24a24 24 0 0 1-24-24Z";
export const SCENE_PATH = "M14 200a186 186 0 0 1 372 0V450a16 16 0 0 1-16 16H30a16 16 0 0 1-16-16Z";

export const HILLS = [
  { d: "M0 332c70-34 132-30 206 0s132 26 194-6v154H0Z", token: "hill-far", delay: 0.3, rise: 34 },
  { d: "M0 372c86-44 150-24 222 8s118 22 178-8v108H0Z", token: "hill-mid", delay: 0.42, rise: 30 },
  { d: "M0 418c92-40 168-18 236 6s110 10 164-14v70H0Z", token: "hill-near", delay: 0.54, rise: 26 },
  { d: "M0 452c110-30 200-6 290 8 42 6 82 2 110-8v28H0Z", token: "hill-front", delay: 0.66, rise: 22 },
] as const;

export type ValleyPalette = {
  arch: string;
  sun: string;
  line: string;
  "hill-far": string;
  "hill-mid": string;
  "hill-near": string;
  "hill-front": string;
};

export const LIGHT_PALETTE: ValleyPalette = {
  arch: "#e6e4d6",
  sun: "#b07a24",
  line: "#b9b5a3",
  "hill-far": "#cfd5bd",
  "hill-mid": "#a9b791",
  "hill-near": "#6f8a5c",
  "hill-front": "#3b5837",
};

export function valleySvg(palette: ValleyPalette, width: number, height: number): string {
  const petals = Array.from({ length: PETALS }, (_, i) => `<path d="${PETAL_PATH}" transform="rotate(${(360 / PETALS) * i})"/>`).join("");
  const hills = HILLS.map((h) => `<path d="${h.d}" fill="${palette[h.token]}"/>`).join("");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 480" width="${width}" height="${height}">`,
    `<defs><clipPath id="s"><path d="${SCENE_PATH}"/></clipPath></defs>`,
    `<path d="${ARCH_PATH}" fill="${palette.arch}"/>`,
    `<g clip-path="url(#s)">`,
    `<g transform="${SUN_TRANSFORM}" fill="none" stroke="${palette.sun}" stroke-width="2.8" stroke-linecap="round">${petals}`,
    `<circle r="78" fill="${palette.sun}" stroke="none"/>`,
    `<path d="${CHEVRON_PATH}" stroke="${palette.arch}" stroke-width="8" stroke-linejoin="round"/></g>`,
    hills,
    `</g>`,
    `<path d="${SCENE_PATH}" fill="none" stroke="${palette.line}" stroke-width="1.5"/>`,
    `</svg>`,
  ].join("");
}

export function logoMarkSvg(color: string, size: number): string {
  const petals = Array.from({ length: 12 }, (_, i) => `<path d="M16 1.6c2.8 2.6 2.8 5.6 0 7.8-2.8-2.2-2.8-5.2 0-7.8Z" transform="rotate(${30 * i} 16 16)"/>`).join("");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}">`,
    `<defs><mask id="m"><rect width="32" height="32" fill="#fff"/><path d="M12.2 14.2 16 18.6l3.8-4.4" fill="none" stroke="#000" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></mask></defs>`,
    `<g fill="${color}">${petals}<circle cx="16" cy="16" r="5.6" mask="url(#m)"/></g>`,
    `</svg>`,
  ].join("");
}
