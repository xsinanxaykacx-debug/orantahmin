import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { transformIddaaPayload } from "./iddaa/transform.ts";
import { getIstanbulDateKey } from "./iddaa/date-filter.ts";
import { createFotMobEventMap, fetchFotMobFixtures, getFotMobDates } from "./fotmob/matcher.ts";

const ROOT = process.cwd();
const RAW_DIR = resolve(ROOT,"data/raw");
const OUTPUT = resolve(ROOT,"public/data/football-bulletin.json");
const FOTMOB_OUTPUT = resolve(ROOT,"public/data/fotmob-event-map.json");
const SB = "https://sportsbookv2.iddaa.com/sportsbook";
const FEED_URL = `${SB}/events?st=1&type=0&version=0`;

const requestHeaders = {
  Accept:"application/json, text/plain, */*",
  "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
  Origin:"https://www.iddaa.com",
  Referer:"https://www.iddaa.com/"
};

async function getJson(url:string, timeout=30000):Promise<any> {
  let lastError:unknown;
  for(let attempt=1;attempt<=3;attempt++) {
    try {
      const response=await fetch(url,{headers:requestHeaders,signal:AbortSignal.timeout(timeout)});
      if(!response.ok) throw new Error(`iddaa HTTP ${response.status} (${url})`);
      const payload=await response.json();
      if(payload?.isSuccess!==true) throw new Error(`iddaa başarısız yanıt döndürdü (${url})`);
      return payload;
    } catch(error) {
      lastError=error;
      if(attempt<3) await new Promise(resolveDelay=>setTimeout(resolveDelay,attempt*1200));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("iddaa isteği başarısız.");
}

async function fetchOptionalJson(url:string): Promise<any|null> {
  try { return await getJson(url,20000); }
  catch(error) {
    console.warn("iddaa yardımcı veri alınamadı:",url,error instanceof Error?error.message:error);
    return null;
  }
}

function parseCompetitionMap(payload:any):Record<string,string> {
  const rows=Array.isArray(payload?.data)?payload.data:
    Array.isArray(payload?.data?.competitions)?payload.data.competitions:[];
  const result:Record<string,string>={};
  for(const row of rows) {
    if(row?.i==null || !row?.n) continue;
    if(row.si!=null && String(row.si)!=="1") continue;
    result[String(row.i)]=String(row.n);
  }
  return result;
}

function extractEventRows(payload:any):any[] {
  const data=payload?.data;
  const roots=Array.isArray(data)?data:[data];
  const nested=roots.flatMap((root:any)=>Array.isArray(root?.events)?root.events:[]);
  if(nested.length) return nested;
  return roots.filter((row:any)=>row && typeof row==="object" && row.i!=null && row.sid!=null);
}

function extractScoreRows(payload:any):Record<string,any> {
  const data=payload?.data;
  const roots=[payload,...(Array.isArray(data)?data:[data])];
  const result:Record<string,any>={};
  for(const root of roots) {
    if(root?.sc && typeof root.sc==="object") Object.assign(result,root.sc);
  }
  return result;
}

function mergeEventFeeds(feeds:any[]):any[] {
  const merged=new Map<string,any>();
  for(const feed of feeds) {
    const scores=extractScoreRows(feed);
    for(const event of extractEventRows(feed)) {
      if(event?.i==null) continue;
      const id=String(event.i);
      const previous=merged.get(id);
      if(!previous) {
        merged.set(id,{...event,...(scores[id]?{liveScore:scores[id]}:{})});
        continue;
      }
      const previousMarkets=Array.isArray(previous.m)?previous.m:[];
      const incomingMarkets=Array.isArray(event.m)?event.m:[];
      const preferred=incomingMarkets.length>=previousMarkets.length?event:previous;
      const next={...previous,...event};
      next.m=preferred.m;
      if(Number(previous.s)===1 || Number(event.s)===1) next.s=1;
      if(!(Number(event.d)>0) && Number(previous.d)>0) next.d=previous.d;
      const score=scores[id] || previous.liveScore;
      if(score) next.liveScore=score;
      merged.set(id,next);
    }
  }
  return [...merged.values()];
}

async function main():Promise<void> {
  const [feed,liveFeed,extendedFeed]=await Promise.all([
    getJson(FEED_URL,45000),
    getJson(`${SB}/events?st=1&type=1&version=0`,45000),
    getJson(`${SB}/events?st=1&type=2&version=0`,45000)
  ]);
  const feeds=[feed,liveFeed,extendedFeed];
  const events=mergeEventFeeds(feeds);
  if(!events.length) throw new Error("İddaa maç listesi boş.");

  const targetDate=getIstanbulDateKey();
  const sourceFootballCount=events.filter((event:any)=>Number(event.sid)===1).length;
  if(!sourceFootballCount) throw new Error("İddaa bülteninde futbol maçı bulunamadı; mevcut bülten korunuyor.");
  console.log(`iddaa birleşik bülten: ${targetDate} Europe/Istanbul | type=0: ${extractEventRows(feed).filter((event:any)=>Number(event.sid)===1).length} | type=1: ${extractEventRows(liveFeed).filter((event:any)=>Number(event.sid)===1).length} | type=2: ${extractEventRows(extendedFeed).filter((event:any)=>Number(event.sid)===1).length} | Tekil futbol maçı: ${sourceFootballCount}.`);

  const [marketConfigPayload,competitionPayload]=await Promise.all([
    fetchOptionalJson(`${SB}/get_market_config?st=1`),
    fetchOptionalJson(`${SB}/competitions?st=1`)
  ]);
  const marketConfig=(marketConfigPayload?.data?.m && typeof marketConfigPayload.data.m==="object")
    ? marketConfigPayload.data.m : {};
  const competitionMap=parseCompetitionMap(competitionPayload);

  console.log(`iddaa: ${sourceFootballCount} futbol maçı dönüştürülüyor. Tam marketler maç seçildiğinde api/iddaa?resource=markets üzerinden alınacak.`);
  const bulletin=transformIddaaPayload({isSuccess:true,data:{events}},marketConfig,competitionMap);

  const markets=new Map<string,number>();
  let outcomes=0, matchesWithMarkets=0, maxMarkets=0;
  for(const match of bulletin.matches) {
    const rows=(match.fields.iddaaMarkets || []) as Array<{code:string;outcomes:Array<{odd:number|null}>}>;
    if(rows.length) matchesWithMarkets++;
    match.fields.marketCount=rows.length;
    maxMarkets=Math.max(maxMarkets,rows.length);
    for(const market of rows) {
      markets.set(market.code,(markets.get(market.code)||0)+1);
      outcomes+=market.outcomes.filter(item=>item.odd!==null).length;
    }
  }

  const stamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");
  const rawName=`iddaa_events_full_${targetDate.replace(/-/g,"")}_${stamp}.json`;
  const raw=JSON.stringify({fetchedAt:new Date().toISOString(),feeds:{type0:feed,type1:liveFeed,type2:extendedFeed},mergedEventCount:events.length});
  await mkdir(RAW_DIR,{recursive:true});
  await writeFile(resolve(RAW_DIR,rawName),raw,"utf-8");
  bulletin.meta.sourceFile=rawName;
  await mkdir(dirname(OUTPUT),{recursive:true});
  const temp=OUTPUT+".tmp";
  await writeFile(temp,JSON.stringify(bulletin,null,2),"utf-8");
  await rename(temp,OUTPUT);

  console.log(`iddaa TAM BÜLTEN: ${bulletin.meta.sourceMatchCount} kaynak kaydı | ${bulletin.matches.length} futbol maçı | ${matchesWithMarkets} market verili maç | ${markets.size} market kodu | ${outcomes} fiyatlı sonuç | maç başına en yüksek market: ${maxMarkets}`);
  console.log("MARKET_FREQUENCIES="+JSON.stringify(Object.fromEntries([...markets].sort((a,b)=>a[0].localeCompare(b[0])))));
  console.log(`COMPETITIONS_RESOLVED=${Object.keys(competitionMap).length} | MARKET_NAMES_RESOLVED=${Object.keys(marketConfig).length}`);
  console.log("SAMPLE_MATCHES="+JSON.stringify(bulletin.matches.slice(0,10).map(m=>({
    id:m.matchId,home:m.homeName,away:m.awayName,league:m.fields.leagueCode,
    date:m.date,time:m.time,marketCount:m.fields.marketCount
  }))));

  try {
    const dates=getFotMobDates(bulletin.matches);
    const fixtures=await fetchFotMobFixtures(dates);
    const eventMap=createFotMobEventMap(bulletin.matches,fixtures);
    await mkdir(dirname(FOTMOB_OUTPUT),{recursive:true});
    const tempMap=FOTMOB_OUTPUT+".tmp";
    await writeFile(tempMap,JSON.stringify(eventMap,null,2),"utf-8");
    await rename(tempMap,FOTMOB_OUTPUT);
    console.log(`FotMob: ${dates.length} günlük tarih | ${fixtures.length} maç | Eşleşen: ${eventMap.summary.matched} | Belirsiz: ${eventMap.summary.ambiguous} | Eşleşmeyen: ${eventMap.summary.unmatched}`);
  } catch(error) {
    console.warn("FotMob eşleştirmesi başarısız; önceki eşleşme dosyası korundu:",error instanceof Error?error.message:error);
  }
}
main().catch(error=>{console.error("iddaa günlük güncellemesi başarısız:",error);process.exitCode=1;});
