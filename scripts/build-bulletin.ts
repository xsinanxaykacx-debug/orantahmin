
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { transformMatches } from "./mackolik/transform.ts";

const INPUT = resolve(
  process.cwd(),
  "data/raw/mackolik_program_20261125_151442.json",
);

const OUTPUT = resolve(
  process.cwd(),
  "public/data/mackolik-bulletin.json",
);

async function main(): Promise<void> {
  console.log("Mackolik bülten dönüştürücüsü");
  console.log("----------------------------------------");

  const sourceText = await readFile(INPUT, "utf-8");
  const source: unknown = JSON.parse(sourceText);

  const result = transformMatches(source);

  const marketIdCount = result.matches.filter(
    (match) => match.fields.marketHandicapMs !== null,
  ).length;

  const warningCounts = result.warnings.reduce(
    (counts, warning) => {
      counts[warning.code] = (counts[warning.code] ?? 0) + 1;
      return counts;
    },
    {} as Record<string, number>,
  );

  const bulletin = {
    meta: {
      sourceFile: "mackolik_program_20261125_151442.json",
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
      handicapMarketIdMatchCount: marketIdCount,
      warningCounts,
      warnings: result.warnings,
    },
  };

  await mkdir(dirname(OUTPUT), { recursive: true });

  await writeFile(
    OUTPUT,
    JSON.stringify(bulletin, null, 2),
    "utf-8",
  );

  console.log(`Kaynak kayıt: ${bulletin.meta.sourceMatchCount}`);
  console.log(`Bültene alınan: ${bulletin.meta.includedMatchCount}`);
  console.log(`Reddedilen: ${bulletin.meta.rejectedMatchCount}`);
  console.log(`Uyarı: ${bulletin.meta.warningCount}`);
  console.log(`Handikap market ID dolu: ${marketIdCount}`);
  console.log("");
  console.log("UYARI DAĞILIMI");

  for (const [code, count] of Object.entries(warningCounts)) {
    console.log(`  ${code}: ${count}`);
  }

  console.log("");
  console.log(`Çıktı: ${OUTPUT}`);
}

main().catch((error: unknown) => {
  console.error("Dönüştürme başarısız:", error);
  process.exitCode = 1;
});
