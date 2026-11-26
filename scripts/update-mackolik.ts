import { writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import JSON5 from "json5";
import { transformMatches } from "./mackolik/transform.ts";
import {
  createFotMobEventMap,
  fetchFotMobFixtures,
  getFotMobDates,
} from "./fotmob/matcher.ts";

const ROOT = process.cwd();
const RAW_DIR = resolve(ROOT, "data/raw");
const OUTPUT = resolve(ROOT, "public/data/mackolik-bulletin.json");
const FOTMOB_OUTPUT = resolve(ROOT, "public/data/fotmob-event-map.json");

function getIstanbulDate(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date());

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("day")}.${get("month")}.${get("year")}`;
}

async function fetchMackolikWithRetry(url: URL): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Referer: "https://arsiv.mackolik.com/Genis-Iddaa-Programi",
          "X-Requested-With": "XMLHttpRequest",
          "User-Agent":
            "Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Mobile Safari/537.36",
          Accept: "*/*",
          "sec-ch-ua-platform": '"Android"',
          "sec-ch-ua":
            '"Chromium";v="158", "Not.A/Brand";v="24", "Google Chrome";v="158"',
          "sec-ch-ua-mobile": "?1",
        },
        signal: AbortSignal.timeout(30000),
      });

      if (response.ok) return response;
      lastError = new Error("Maçkolik HTTP hatası: " + response.status);

      const retryable = [403, 408, 429, 500, 502, 503, 504].includes(response.status);
      if (!retryable || attempt === 3) break;
    } catch (error) {
      lastError = error;
      if (attempt === 3) break;
    }

    const delayMs = attempt * 2000;
    console.warn(
      "Maçkolik isteği başarısız (deneme " + attempt + "/3); " +
        delayMs + " ms sonra yeniden denenecek.",
    );
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Maçkolik isteği üç denemede de başarısız oldu.");
}

async function main(): Promise<void> {
  const day = getIstanbulDate();
  const url = new URL(
    "https://arsiv.mackolik.com/AjaxHandlers/ProgramDataHandler.ashx",
  );

  url.search = new URLSearchParams({
    type: "6",
    sortValue: "DATE",
    day,
    sort: "-1",
    sortDir: "-1",
    groupId: "-1",
    np: "1",
    sport: "1",
  }).toString();

  console.log(`Maçkolik verisi çekiliyor: ${day}`);

  const response = await fetchMackolikWithRetry(url);

  const rawText = await response.text();
  if (!rawText.trim()) throw new Error("Maçkolik boş yanıt döndürdü.");

  const source: unknown = JSON5.parse(rawText);
  if (
    !source ||
    typeof source !== "object" ||
    !Array.isArray((source as { m?: unknown }).m)
  ) {
    throw new Error("Maçkolik yanıtında maç grupları bulunamadı.");
  }

  const groups = (source as { m: unknown[] }).m;
  const rows = groups.flatMap((group) => {
    if (
      !group ||
      typeof group !== "object" ||
      !Array.isArray((group as { m?: unknown }).m)
    ) {
      throw new Error("Geçersiz maç grubu bulundu.");
    }
    return (group as { m: unknown[] }).m;
  });

  if (rows.length === 0) throw new Error("Maçkolik sıfır maç döndürdü; mevcut bülten korunuyor.");

  const invalidRows = rows.filter(
    (row) => !Array.isArray(row) || row.length !== 61,
  );
  if (invalidRows.length > 0) {
    throw new Error(`${invalidRows.length} kayıt 61 alanlı şemaya uymuyor; mevcut bülten korunuyor.`);
  }

  const result = transformMatches(source);
  if (result.matches.length === 0) {
    throw new Error("Dönüştürülebilir maç bulunamadı; mevcut bülten korunuyor.");
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const dateStamp = day.replace(/\./g, "");
  const baseName = `mackolik_program_${dateStamp}_${stamp}`;

  await mkdir(RAW_DIR, { recursive: true });
  await writeFile(resolve(RAW_DIR, `${baseName}.raw`), rawText, "utf-8");
  await writeFile(
    resolve(RAW_DIR, `${baseName}.json`),
    JSON.stringify(source, null, 2),
    "utf-8",
  );

  const warningCounts = result.warnings.reduce((counts, warning) => {
    counts[warning.code] = (counts[warning.code] ?? 0) + 1;
    return counts;
  }, {} as Record<string, number>);

  const bulletin = {
    meta: {
      sourceFile: `${baseName}.json`,
      generatedAt: new Date().toISOString(),
      schemaVersion: "mackolik-61-v1",
      sourceFieldCount: 61,
      sourceMatchCount: result.sourceCount,
      includedMatchCount: result.matches.length,
      rejectedMatchCount: result.rejected,
      warningCount: result.warnings.length,
    },
    matches: result.matches,
    diagnostics: {
      handicapMarketIdMatchCount: result.matches.filter(
        (match) => match.fields.marketHandicapMs !== null,
      ).length,
      warningCounts,
      warnings: result.warnings,
    },
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  const tempOutput = `${OUTPUT}.tmp`;
  await writeFile(tempOutput, JSON.stringify(bulletin, null, 2), "utf-8");
  await rename(tempOutput, OUTPUT);

  console.log(`Kaynak: ${result.sourceCount} | Bülten: ${result.matches.length} | Reddedilen: ${result.rejected}`);

  // FotMob is independent: an outage must not prevent the Mackolik bulletin refresh.
  try {
    const dates = getFotMobDates(result.matches);
    const fixtures = await fetchFotMobFixtures(dates);
    const eventMap = createFotMobEventMap(result.matches, fixtures);
    await mkdir(dirname(FOTMOB_OUTPUT), { recursive: true });
    const tempMap = `${FOTMOB_OUTPUT}.tmp`;
    await writeFile(tempMap, JSON.stringify(eventMap, null, 2), "utf-8");
    await rename(tempMap, FOTMOB_OUTPUT);

    console.log(
      `FotMob: ${fixtures.length} maç | Eşleşen: ${eventMap.summary.matched} | Belirsiz: ${eventMap.summary.ambiguous} | Eşleşmeyen: ${eventMap.summary.unmatched}`,
    );
  } catch (error) {
    console.warn(
      "FotMob eşleştirmesi başarısız; önceki fotmob-event-map.json korundu:",
      error instanceof Error ? error.message : error,
    );
  }
}

main().catch((error: unknown) => {
  console.error("Maçkolik güncellemesi başarısız:", error);
  process.exitCode = 1;
});
