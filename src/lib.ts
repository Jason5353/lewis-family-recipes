import family from './data/family.js';
import snapshots from './data/snapshots.json';

export type Snapshot = (typeof snapshots)[number];
export { family, snapshots };

export function person(name: string) {
  const p = family.people.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return p ?? { name, initials: name.slice(0, 2), colour: '#56607A' };
}

// Stable pseudo-random pick so each page shows different snapshots but the same ones every build.
function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
const pool = snapshots.filter((s) => !s.file.includes('kitchen-roll-dog'));
export function pickSnapshots(seed: string, n: number): Snapshot[] {
  const start = hash(seed) % pool.length;
  const step = 7; // coprime with the pool size most of the time; dedupe below anyway
  const out: Snapshot[] = [];
  for (let i = 0; out.length < Math.min(n, pool.length) && i < pool.length * 2; i++) {
    const s = pool[(start + i * step) % pool.length];
    if (!out.includes(s)) out.push(s);
  }
  return out;
}
export const snapshot = (slug: string) => snapshots.find((s) => s.file.includes(slug))!;

export function mins(m?: number) {
  if (!m) return '';
  const h = Math.floor(m / 60), r = m % 60;
  return h ? `${h} hr${r ? ` ${r} min` : ''}` : `${r} min`;
}
export function catSlug(c: string) {
  return c.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
