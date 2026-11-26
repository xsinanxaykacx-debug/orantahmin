import { writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import JSON5 from "json5";
import { transformMatches } from "./mackolik/transform.ts";

const ROOT = process.cwd();
const RAW_DIR = resolve(ROOT, "data/raw");
const OUTPUT = resolve(ROOT, "public/data/mackolik-bulletin.json");

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

  if (!response.ok) {
    throw new Error(`Maçkolik HTTP hatası: ${response.status}`);
  }

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
}

main().catch((error: unknown) => {
  console.error("Maçkolik güncellemesi başarısız:", error);
  process.exitCode = 1;
});
