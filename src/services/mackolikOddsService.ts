import type { BulletinDocument } from "../types/match";

const DATA_URL = "/data/mackolik-bulletin.json";

function isBulletin(value: unknown): value is BulletinDocument {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BulletinDocument>;
  return Boolean(
    candidate.meta &&
    Array.isArray(candidate.matches) &&
    candidate.diagnostics &&
    Array.isArray(candidate.diagnostics.warnings)
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

    const payload: unknown = await response.json();
    if (!isBulletin(payload)) {
      throw new Error("Bülten şeması beklenen mackolik-61-v1 formatında değil.");
    }

    return payload;
  }
};
