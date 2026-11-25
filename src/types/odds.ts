export interface Odds1X2 {
  "1": number | null;
  X: number | null;
  "2": number | null;
}

export interface OddsTwoWay {
  over: number | null;
  under: number | null;
}

export interface OddsYesNo {
  yes: number | null;
  no: number | null;
}

export interface OddsPeriod<T> {
  opening: T | null;
  closing: T | null;
}

export interface MatchOdds {
  ms: OddsPeriod<Odds1X2> | null;
  ou_2_5: OddsPeriod<OddsTwoWay> | null;
  kg: OddsPeriod<OddsYesNo> | null;
}