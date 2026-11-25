
export type NormalizedValue = string | number | boolean | null | object;

export function normalizeText(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const text = String(value).trim();

  return text === "" || text === "-" ? null : text;
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const text = String(value).trim();

  if (text === "" || text === "-") return null;

  const number = Number(text.replace(",", "."));

  return Number.isFinite(number) ? number : null;
}

// Oranlarda sıfır geçerli değildir.
export function normalizeNumber(value: unknown): number | null {
  const number = parseNumber(value);

  return number === null || number === 0 ? null : number;
}

export function normalizeOdds(value: unknown): number | null {
  return normalizeNumber(value);
}

// Handikap çizgisinde sıfır geçerlidir.
export function normalizeHandicapLine(value: unknown): number | null {
  return parseNumber(value);
}

export function normalizeMarketId(value: unknown): string | null {
  return normalizeText(value);
}

export function normalizeGeneric(value: unknown): NormalizedValue {
  if (value === null || value === undefined) return null;

  if (typeof value === "object") {
    return value as object;
  }

  if (typeof value === "string") {
    return normalizeText(value);
  }

  return value as string | number | boolean;
}
