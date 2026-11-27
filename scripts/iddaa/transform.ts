import { FIELD, FIELD_COUNT } from "./schema.ts";

export type IddaaOutcome = { no: number; name: string; odd: number | null };
export type IddaaMarket = {
  t: number; st: number; line: string | null; code: string; name: string;
  outcomes: IddaaOutcome[];
};
type RawEvent = Record<string, any>;

const MARKET_NAMES: Record<string, string> = {
  "1:1":"Maç Sonucu","2:92":"Çifte Şans","2:88":"İlk Yarı Sonucu","2:36":"İkinci Yarı Sonucu",
  "2:77":"İlk Yarı Çifte Şans","2:89":"Karşılıklı Gol","2:720":"İlk Yarı Karşılıklı Gol",
  "2:101":"Alt / Üst","2:60":"İlk Yarı Alt / Üst","2:603":"Ev Sahibi Gol Alt / Üst",
  "2:604":"Deplasman Gol Alt / Üst","2:100":"Handikaplı Maç Sonucu","2:90":"İlk Yarı / Maç Sonucu",
  "2:91":"Tek / Çift","2:4":"Toplam Gol Aralığı","2:6":"Daha Çok Gol Olacak Yarı",
  "2:7":"Maç Sonucu ve Alt / Üst","2:698":"Maç Sonucu ve Karşılıklı Gol",
  "2:700":"Alt / Üst ve Karşılıklı Gol","2:48":"Korner Alt / Üst","2:67":"Toplam Korner Aralığı",
  "2:822":"Ev Sahibi Korner Alt / Üst","2:823":"Deplasman Korner Alt / Üst",
  "2:52":"Kim Daha Çok Korner Kullanır","2:863":"Korner Handikap",
  "2:658":"Toplam Kart Alt / Üst","2:865":"İlk Yarı Kart Alt / Üst",
  "2:824":"Kim Daha Çok Kart Görür","2:17":"Kırmızı Kart Olur Mu"
};

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}
function label(value: unknown): string {
  return String(value ?? "").trim();
}
function normalize(value: string): string {
  return value.toLocaleLowerCase("tr-TR").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
function findOutcome(market: IddaaMarket | undefined, aliases: string[], fallbackNo?: number): number | null {
  if (!market) return null;
  const found = market.outcomes.find(o => aliases.includes(normalize(o.name)));
  const selected = found || (fallbackNo === undefined ? undefined : market.outcomes.find(o => o.no === fallbackNo));
  return selected?.odd ?? null;
}
function marketFor(event: RawEvent, t: number, st: number, line?: string): IddaaMarket | undefined {
  return (event.m || []).map((m: any) => {
    const code = `${m.t}:${m.st}`;
    const rawLine = m.sov == null ? null : String(m.sov);
    const outcomes = (m.o || []).map((o: any) => ({
      no: Number(o.no), name: label(o.n), odd: asNumber(o.odd)
    }));
    return { t:Number(m.t), st:Number(m.st), line:rawLine, code:`${code}:${rawLine ?? ""}`,
      name:MARKET_NAMES[code] || `Market ${code}`, outcomes };
  }).find((m: IddaaMarket) => m.t === t && m.st === st &&
    (line === undefined || normalize(m.line || "") === normalize(line)));
}
function lineMatches(market: IddaaMarket | undefined, line: string): boolean {
  if (!market) return false;
  const a = normalize(market.line || "").replace(",", ".");
  const b = normalize(line).replace(",", ".");
  return a === b || Number(a) === Number(b);
}
function oddsByLine(event: RawEvent, t: number, st: number, line: string, aliases: string[], no?: number): number | null {
  const markets = (event.m || []).filter((m: any) => Number(m.t) === t && Number(m.st) === st);
  const found = markets.find((m: any) => {
    const a = String(m.sov ?? "").replace(",", ".");
    return a === line || Number(a) === Number(line);
  });
  if (!found) return null;
  const normalized: IddaaMarket = {
    t, st, line: String(found.sov ?? ""), code:`${t}:${st}:${found.sov ?? ""}`,
    name: MARKET_NAMES[`${t}:${st}`] || `Market ${t}:${st}`,
    outcomes: (found.o || []).map((o: any) => ({no:Number(o.no),name:label(o.n),odd:asNumber(o.odd)}))
  };
  return findOutcome(normalized, aliases, no);
}
function marketId(m: IddaaMarket | undefined): string | null { return m?.code ?? null; }

function dateParts(epochSeconds: number) {
  const date = new Date(epochSeconds * 1000);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone:"Europe/Istanbul",day:"2-digit",month:"2-digit",year:"numeric",
    hour:"2-digit",minute:"2-digit",hourCycle:"h23"
  }).formatToParts(date);
  const get = (type:string) => parts.find(p=>p.type===type)?.value || "";
  return { date:`${get("day")}.${get("month")}.${get("year")}`, time:`${get("hour")}:${get("minute")}` };
}

export function mergeIddaaEventDetail(event: RawEvent, detailPayload: any): RawEvent {
  const detail = detailPayload?.data;
  if (detailPayload?.isSuccess !== true || !detail || !Array.isArray(detail.m)) {
    throw new Error(`iddaa maç detayı ${event.i} için tam market listesi döndürmedi.`);
  }
  return { ...event, ...detail, i:event.i, hn:event.hn, an:event.an, d:event.d, ci:event.ci, sid:event.sid, m:detail.m };
}

export function parseIddaaMarkets(event: RawEvent, marketConfig: Record<string, { n?: string }> = {}): IddaaMarket[] {
  return (event.m || []).map((m:any) => {
    const code = `${Number(m.t)}:${Number(m.st)}`;
    const line = m.sov == null ? null : String(m.sov);
    return {
      t:Number(m.t), st:Number(m.st), line, code:`${code}:${line ?? ""}`,
      name:(marketConfig[`${Number(m.t)}_${Number(m.st)}`]?.n || MARKET_NAMES[code] || `Market ${code}`)
        .replaceAll("{0}", line || "")
        .replaceAll("{h}", line || ""),
      outcomes:(m.o || []).map((o:any)=>({no:Number(o.no),name:label(o.n),odd:asNumber(o.odd)}))
    };
  }).filter((m:IddaaMarket)=>m.outcomes.length>0);
}

export function transformIddaaEvent(event: RawEvent, index: number, marketConfig: Record<string, { n?: string }> = {}, competitionMap: Record<string, string> = {}) {
  const id = String(event.i);
  const home = label(event.hn);
  const away = label(event.an);
  const epoch = Number(event.d);
  if (!id || !home || !away || !Number.isFinite(epoch) || epoch <= 0) return null;
  const {date,time} = dateParts(epoch);
  if (!Array.isArray(event.m) || event.m.length === 0) return null;
  const markets = parseIddaaMarkets(event, marketConfig);
  const ms = marketFor(event,1,1);
  const dc = marketFor(event,2,92);
  const ht = marketFor(event,2,88);
  const btts = marketFor(event,2,89);
  const total = marketFor(event,2,4);
  const row: unknown[] = Array(FIELD_COUNT).fill(null);
  const put = (field:number,value:unknown) => { row[field] = value; };
  put(FIELD.MATCH_ID,id); put(FIELD.HOME_NAME,home); put(FIELD.AWAY_NAME,away);
  put(FIELD.STATUS,0); put(FIELD.TIME,time); put(FIELD.DATE,date); put(FIELD.MBS,event.mbc ?? null);
  put(FIELD.LEAGUE_CODE,event.ci == null ? null : (competitionMap[String(event.ci)] || String(event.ci)));
  put(FIELD.GROUP_ID,event.ci == null ? null : String(event.ci)); put(FIELD.SUBGROUP_ID,event.ci == null ? null : "0");
  put(FIELD.EVENT_ID,id);
  put(FIELD.MS_1,findOutcome(ms,["1","ev sahibi"],1));
  put(FIELD.MS_X,findOutcome(ms,["x","0","beraberlik"],2));
  put(FIELD.MS_2,findOutcome(ms,["2","deplasman"],3));
  put(FIELD.DOUBLE_CHANCE_1X,findOutcome(dc,["1x"],1));
  put(FIELD.DOUBLE_CHANCE_12,findOutcome(dc,["12"],2));
  put(FIELD.DOUBLE_CHANCE_X2,findOutcome(dc,["x2"],3));
  put(FIELD.GOALS_25_UNDER,oddsByLine(event,2,101,"2.5",["alt","under"],1));
  put(FIELD.GOALS_25_OVER,oddsByLine(event,2,101,"2.5",["üst","ust","over"],2));
  put(FIELD.HT_RESULT_1,findOutcome(ht,["1","ev sahibi"],1));
  put(FIELD.HT_RESULT_X,findOutcome(ht,["x","0","beraberlik"],2));
  put(FIELD.HT_RESULT_2,findOutcome(ht,["2","deplasman"],3));
  put(FIELD.BTTS_YES,findOutcome(btts,["var","yes"],1));
  put(FIELD.BTTS_NO,findOutcome(btts,["yok","no"],2));
  put(FIELD.TOTAL_GOALS_01,findOutcome(total,["0-1","0 1","0-1 gol"],1));
  put(FIELD.TOTAL_GOALS_23,findOutcome(total,["2-3","2 3","2-3 gol"],2));
  put(FIELD.TOTAL_GOALS_46,findOutcome(total,["4-6","4 6","4-6 gol"],3));
  put(FIELD.TOTAL_GOALS_7PLUS,findOutcome(total,["7+","7 ve üzeri","7 ve uzeri"],4));
  put(FIELD.HANDICAP_MS_1,findOutcome(marketFor(event,2,100),["1"],1));
  put(FIELD.HANDICAP_MS_X,findOutcome(marketFor(event,2,100),["x","0"],2));
  put(FIELD.HANDICAP_MS_2,findOutcome(marketFor(event,2,100),["2"],3));
  put(FIELD.HT_GOALS_15_UNDER,oddsByLine(event,2,60,"1.5",["alt","under"],1));
  put(FIELD.HT_GOALS_15_OVER,oddsByLine(event,2,60,"1.5",["üst","ust","over"],2));
  put(FIELD.GOALS_15_UNDER,oddsByLine(event,2,101,"1.5",["alt","under"],1));
  put(FIELD.GOALS_15_OVER,oddsByLine(event,2,101,"1.5",["üst","ust","over"],2));
  put(FIELD.GOALS_35_UNDER,oddsByLine(event,2,101,"3.5",["alt","under"],1));
  put(FIELD.GOALS_35_OVER,oddsByLine(event,2,101,"3.5",["üst","ust","over"],2));
  put(FIELD.MARKET_MS,marketId(ms)); put(FIELD.MARKET_DOUBLE_CHANCE,marketId(dc));
  put(FIELD.MARKET_GOALS_25,marketId(marketFor(event,2,101,"2.5")));
  put(FIELD.MARKET_HT_RESULT,marketId(ht)); put(FIELD.MARKET_TOTAL_GOALS,marketId(total));
  put(FIELD.MARKET_BTTS,marketId(btts)); put(FIELD.MARKET_HANDICAP_MS,marketId(marketFor(event,2,100)));
  put(FIELD.MARKET_GOALS_15,marketId(marketFor(event,2,101,"1.5")));
  put(FIELD.MARKET_GOALS_35,marketId(marketFor(event,2,101,"3.5")));
  put(FIELD.MARKET_HT_GOALS_15,marketId(marketFor(event,2,60,"1.5")));

  const fields: Record<string,unknown> = {};
  const fieldNames = [
    "matchId","homeName","homeId","awayName","awayId","status","time","date","scoreHome","scoreAway",
    "betId","halfTimeScoreHome","halfTimeScoreAway","mbs","handicapHome","handicapAway","ms1","msX","ms2",
    "doubleChance1X","doubleChance12","doubleChanceX2","goals25Under","goals25Over","predictionId","matchDetail",
    "leagueCode","groupId","subgroupId","totalGoals01","totalGoals23","totalGoals46","totalGoals7Plus",
    "halfTimeResult1","halfTimeResultX","halfTimeResult2","handicapMs1","handicapMsX","handicapMs2",
    "bttsYes","bttsNo","duelloId","halfTimeGoals15Under","halfTimeGoals15Over","goals15Under","goals15Over",
    "goals35Under","goals35Over","altgeleme","seasonId","eventId","marketMs","marketDoubleChance","marketGoals25",
    "marketHalfTimeResult","marketTotalGoals","marketBtts","marketHandicapMs","marketGoals15","marketGoals35",
    "marketHalfTimeGoals15"
  ];
  fieldNames.forEach((name,i)=>{ if(row[i] !== null && row[i] !== undefined) fields[name]=row[i]; });
  fields.iddaaMarkets = markets;
  fields.competitionId = event.ci ?? null;
  fields.competitionName = event.ci == null ? null : (competitionMap[String(event.ci)] || null);
  fields.isLive = Boolean(event.k0dd);
  return {
    matchId:id,homeName:home,awayName:away,date,time,status:0,fields,raw:[],
    source:{groupIndex:0,matchIndex:index}
  };
}

export function transformIddaaPayload(payload: any, marketConfig: Record<string, { n?: string }> = {}, competitionMap: Record<string, string> = {}) {
  if (payload?.isSuccess !== true) throw new Error("iddaa futbol bülteni isSuccess=true döndürmedi.");
  const root = Array.isArray(payload.data) ? payload.data[0] : payload.data;
  const events = Array.isArray(root?.events) ? root.events : [];
  if (!events.length) throw new Error("iddaa futbol bülteni boş veya events dizisi bulunamadı.");
  const matches = events.filter((event:any)=>Number(event.sid)===1)
    .map((event:any,index:number)=>transformIddaaEvent(event,index,marketConfig,competitionMap))
    .filter((match:any)=>match !== null);
  if (!matches.length) throw new Error("iddaa futbol bülteninde dönüştürülebilir maç bulunamadı.");
  return {
    meta:{
      sourceFile:"iddaa-events.json",generatedAt:new Date().toISOString(),
      schemaVersion:"orantahmin-iddaa-dynamic-v2",sourceProvider:"iddaa",
      sourceFieldCount:0,sourceMatchCount:events.length,includedMatchCount:matches.length,
      rejectedMatchCount:events.length-matches.length,warningCount:0
    },
    matches,
    diagnostics:{
      handicapMarketIdMatchCount:matches.filter((m:any)=>m.fields.marketHandicapMs !== null).length,
      warningCounts:{},warnings:[]
    }
  };
}
