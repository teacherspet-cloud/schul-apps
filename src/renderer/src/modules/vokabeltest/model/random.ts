/** Reproduzierbarer Zufallsgenerator (mulberry32), damit Varianten nachvollziehbar bleiben. */
export type Rng = () => number

export function createRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31)
}

export function newId(rng?: Rng): string {
  const r = rng ?? Math.random
  return Math.floor(r() * 2 ** 32)
    .toString(36)
    .padStart(7, '0')
}
