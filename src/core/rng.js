export function normalizeSeed(seed) {
  if (seed === null || seed === undefined) {
    return "0";
  }
  return String(seed);
}

function xmur3(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function murmurOutput() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a) {
  return function random() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed) {
  const normalized = normalizeSeed(seed);
  const seedFn = xmur3(normalized);
  const random = mulberry32(seedFn());

  return {
    seed: normalized,
    float() {
      return random();
    },
    int(min, max) {
      const low = Math.ceil(min);
      const high = Math.floor(max);
      return Math.floor(random() * (high - low + 1)) + low;
    },
    pick(items) {
      if (!items.length) {
        return undefined;
      }
      return items[this.int(0, items.length - 1)];
    },
    chance(probability) {
      return random() < probability;
    },
    shuffle(items) {
      const output = [...items];
      for (let i = output.length - 1; i > 0; i -= 1) {
        const j = this.int(0, i);
        const temp = output[i];
        output[i] = output[j];
        output[j] = temp;
      }
      return output;
    },
    weighted(items) {
      const total = items.reduce((sum, item) => sum + item.weight, 0);
      if (total <= 0) {
        return items[0]?.value;
      }
      let cursor = random() * total;
      for (const item of items) {
        cursor -= item.weight;
        if (cursor <= 0) {
          return item.value;
        }
      }
      return items[items.length - 1]?.value;
    },
  };
}

export function deriveSeed(baseSeed, salt) {
  return `${normalizeSeed(baseSeed)}::${salt}`;
}
