const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a",
  А: "A",
  е: "e",
  Е: "E",
  о: "o",
  О: "O",
  р: "p",
  Р: "P",
  с: "c",
  С: "C",
  х: "x",
  Х: "X",
  у: "y",
  У: "Y",
  і: "i",
  І: "I",
  к: "k",
  К: "K",
  м: "m",
  М: "M",
  т: "t",
  Т: "T",
  В: "B",
  Н: "H",
};

const DIGIT_CONFUSABLES: Record<string, string> = {
  "0": "o",
  "1": "l",
  I: "l",
};

export function hasCyrillic(value: string): boolean {
  return /[А-Яа-яЁё]/.test(value);
}

export function normalizeConfusables(value: string): string {
  return value
    .split("")
    .map((char) => CYRILLIC_TO_LATIN[char] ?? DIGIT_CONFUSABLES[char] ?? char)
    .join("")
    .toLowerCase();
}

export function normalizeForSimilarity(value: string): string {
  return normalizeConfusables(value)
    .replace(/[-\s.]+/g, "")
    .replace(/_/g, "");
}

export function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i += 1) {
    matrix[i][0] = i;
  }

  for (let j = 0; j <= b.length; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

export function looksSimilar(value: string, target: string): boolean {
  if (!value || !target || value === target) {
    return false;
  }

  const normalizedValue = normalizeForSimilarity(value);
  const normalizedTarget = normalizeForSimilarity(target);

  if (normalizedValue === normalizedTarget) {
    return true;
  }

  const distance = levenshtein(normalizedValue, normalizedTarget);
  const maxLength = Math.max(normalizedValue.length, normalizedTarget.length);
  const threshold = maxLength <= 8 ? 1 : 2;

  return distance <= threshold;
}
