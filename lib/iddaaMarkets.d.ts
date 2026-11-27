export type IddaaOutcome = { no: number; name: string; odd: number | null };
export type IddaaMarket = {
  t: number;
  st: number;
  line: string | null;
  code: string;
  name: string;
  outcomes: IddaaOutcome[];
};
export function parseIddaaMarkets(
  event: Record<string, any>,
  marketConfig?: Record<string, { n?: string }>
): IddaaMarket[];
