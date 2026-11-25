import type { BulletinDocument, BulletinMatch } from "../types/match";

const DATA_URL = "/data/mackolik-bulletin.json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMatch(value: unknown): value is BulletinMatch {
  if (!isRecord(value) || !isRecord(value.fields) || !isRecord(value.source)) return false;
  return (
    (typeof value.matchId === "string" || typeof value.matchId === "number") &&
    typeof value.date === "string" &&
    typeof value.time === "string" &&
    typeof value.status === "number" &&
    (typeof value.homeName === "string" || value.homeName === null) &&
    (typeof value.awayName === "string" || value.awayName === null) &&
    Array.isArray(value.raw) &&
    Number.isInteger(value.source.groupIndex) &&
    Number.isInteger(value.source.matchIndex)
  );
}

function isBulletin(value: unknown): value is BulletinDocument {
  if (!isRecord(value) || !isRecord(value.meta) || !isRecord(value.diagnostics)) return false;
  const meta = value.meta;
  const diagnostics = value.diagnostics;
  return (
    typeof meta.sourceFile === "string" &&
    typeof meta.generatedAt === "string" &&
    typeof meta.schemaVersion === "string" &&
    typeof meta.sourceFieldCount === "number" &&
    typeof meta.sourceMatchCount === "number" &&
    typeof meta.includedMatchCount === "number" &&
    typeof meta.rejectedMatchCount === "number" &&
    typeof meta.warningCount === "number" &&
    Array.isArray(value.matches) &&
    value.matches.every(isMatch) &&
    Array.isArray(diagnostics.warnings)
  );
}

export const OddsService = {
  async getBulletin(): Promise<BulletinDocument> {
    const response = await fetch(DATA_URL, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(
        response.status === 404
          ? "Bülten dosyası bulunamadı: public/data/mackolik-bulletin.json"
          : `Bülten yüklenemedi: HTTP ${response.status}`
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("Bülten JSON biçiminde okunamadı.");
    }

    if (!isBulletin(payload)) {
      throw new Error("Bülten şeması beklenen mackolik-61-v1 formatında değil.");
    }

    return payload;
  }
};
