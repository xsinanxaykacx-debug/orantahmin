
import {
  FIELD,
  FIELD_COUNT,
  ODDS_FIELDS,
  HANDICAP_LINE_FIELDS,
  MARKET_ID_FIELDS,
  FIELD_NAMES,
} from "./schema.ts";

import {
  normalizeGeneric,
  normalizeOdds,
  normalizeHandicapLine,
  normalizeMarketId,
} from "./normalize.ts";

export interface TransformWarning {
  code: string;
  message: string;
  matchId?: string | null;
  sourceGroup?: number;
  sourceIndex?: number;
}

export interface TransformedMatch {
  matchId: string | null;
  homeName: string | null;
  awayName: string | null;
  date: string | null;
  time: string | null;
  status: unknown;
  fields: Record<string, unknown>;
  raw: unknown[];
  source: {
    groupIndex: number;
    matchIndex: number;
  };
}

export interface TransformResult {
  matches: TransformedMatch[];
  warnings: TransformWarning[];
  rejected: number;
  sourceCount: number;
}

function rawText(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const text = String(value).trim();

  return text === "" || text === "-" ? null : text;
}

function getFieldName(index: number): string {
  return FIELD_NAMES[index] ?? `field${index}`;
}

function cloneRaw(value: unknown[]): unknown[] {
  return JSON.parse(JSON.stringify(value)) as unknown[];
}

const oddsFieldSet = new Set<number>(ODDS_FIELDS);
const handicapLineFieldSet = new Set<number>(HANDICAP_LINE_FIELDS);
const marketIdFieldSet = new Set<number>(MARKET_ID_FIELDS);

function normalizeField(index: number, value: unknown): unknown {
  if (oddsFieldSet.has(index)) {
    return normalizeOdds(value);
  }

  if (handicapLineFieldSet.has(index)) {
    return normalizeHandicapLine(value);
  }

  if (marketIdFieldSet.has(index)) {
    return normalizeMarketId(value);
  }

  if (index === FIELD.MATCH_DETAIL) {
    return value && typeof value === "object"
      ? JSON.parse(JSON.stringify(value))
      : {};
  }

  return normalizeGeneric(value);
}

export function transformMatches(source: unknown): TransformResult {
  const matches: TransformedMatch[] = [];
  const warnings: TransformWarning[] = [];

  let rejected = 0;
  let sourceCount = 0;

  if (
    !source ||
    typeof source !== "object" ||
    !Array.isArray((source as { m?: unknown }).m)
  ) {
    throw new Error('Kaynak JSON içinde "m" grup dizisi bulunamadı.');
  }

  const groups = (source as { m: unknown[] }).m;

  groups.forEach((group, groupIndex) => {
    if (
      !group ||
      typeof group !== "object" ||
      !Array.isArray((group as { m?: unknown }).m)
    ) {
      warnings.push({
        code: "INVALID_GROUP",
        message: `Grup ${groupIndex}: "m" maç dizisi bulunamadı.`,
        sourceGroup: groupIndex,
      });

      return;
    }

    const rows = (group as { m: unknown[] }).m;

    rows.forEach((row, matchIndex) => {
      sourceCount++;

      if (!Array.isArray(row) || row.length !== FIELD_COUNT) {
        rejected++;

        warnings.push({
          code: "INVALID_FIELD_COUNT",
          message:
            `Grup ${groupIndex}, kayıt ${matchIndex}: ` +
            `61 alan bekleniyordu; ` +
            `${Array.isArray(row) ? row.length : "dizi değil"} bulundu.`,
          sourceGroup: groupIndex,
          sourceIndex: matchIndex,
          matchId: Array.isArray(row) ? rawText(row[0]) : null,
        });

        return;
      }

      const raw = cloneRaw(row);
      const fields: Record<string, unknown> = {};

      for (let index = 0; index < FIELD_COUNT; index++) {
        fields[getFieldName(index)] = normalizeField(
          index,
          row[index],
        );
      }

      const matchId = rawText(row[FIELD.MATCH_ID]);
      const homeName = rawText(row[FIELD.HOME_NAME]);
      const awayName = rawText(row[FIELD.AWAY_NAME]);

      if (!matchId) {
        warnings.push({
          code: "MISSING_MATCH_ID",
          message: "Maç ID alanı boş.",
          sourceGroup: groupIndex,
          sourceIndex: matchIndex,
        });
      }

      if (!homeName || !awayName) {
        warnings.push({
          code: "MISSING_TEAM_NAME",
          message: "Ev sahibi veya deplasman adı boş.",
          matchId,
          sourceGroup: groupIndex,
          sourceIndex: matchIndex,
        });
      }

      const handicapMarketId = normalizeMarketId(
        row[FIELD.MARKET_HANDICAP_MS],
      );

      const handicapLinesMissing =
        normalizeHandicapLine(row[FIELD.HANDICAP_HOME]) === null &&
        normalizeHandicapLine(row[FIELD.HANDICAP_AWAY]) === null;

      const handicapOddsMissing =
        normalizeOdds(row[FIELD.HANDICAP_MS_1]) === null &&
        normalizeOdds(row[FIELD.HANDICAP_MS_X]) === null &&
        normalizeOdds(row[FIELD.HANDICAP_MS_2]) === null;

      if (
        handicapMarketId !== null &&
        handicapLinesMissing &&
        handicapOddsMissing
      ) {
        warnings.push({
          code: "HANDICAP_MARKET_WITHOUT_VALID_LINES_OR_ODDS",
          message:
            "Handikap market ID mevcut; çizgiler ve üç handikap oranı boş.",
          matchId,
          sourceGroup: groupIndex,
          sourceIndex: matchIndex,
        });
      }

      matches.push({
        matchId,
        homeName,
        awayName,
        date: rawText(row[FIELD.DATE]),
        time: rawText(row[FIELD.TIME]),
        status: normalizeGeneric(row[FIELD.STATUS]),
        fields,
        raw,
        source: {
          groupIndex,
          matchIndex,
        },
      });
    });
  });

  return {
    matches,
    warnings,
    rejected,
    sourceCount,
  };
}
