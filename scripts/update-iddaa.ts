import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { transformIddaaPayload } from "./iddaa/transform.ts";
import { createFotMobEventMap, fetchFotMobFixtures, getFotMobDates } from "./fotmob/matcher.ts";

const ROOT = process.cwd();
const RAW_DIR = resolve(ROOT,"data/raw");
const OUTPUT = resolve(ROOT,"public/data/football-bulletin.json");
const FOTMOB_OUTPUT = resolve(ROOT,"public/data/fotmob-event-map.json");
const FEED_URL = "https://sportsbookv2.iddaa.com/sportsbook/events?st=1&type=0&version=0";

const requestHeaders = {
  Accept:"application/json, text/plain, */*",
  "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
  Origin:"https://www.iddaa.com",
  Referer:"https://www.iddaa.com/"
};

async function fetchIddaa(): Promise<string> {
  let lastError: unknown;
  for (let attempt=1;attempt<=3;attempt++) {
    try {
      const response = await fetch(FEED_URL,{
        headers:requestHeaders,
        signal:AbortSignal.timeout(45000)
      });
      const raw = await response.text();
      if (response.ok) return raw;
      lastError = new Error(`iddaa HTTP ${response.status}: ${raw.slice(0,300)}`);
      if (![408,429,500,502,503,504].includes(response.status) || attempt===3) break;
    } catch(error) {
      lastError=error;
      if(attempt===3) break;
    }
    await new Promise(resolveDelay=>setTimeout(resolveDelay,attempt*2000));
  }
  throw lastError instanceof Error ? lastError : new Error("iddaa bülteni üç denemede alınamadı.");
}

async function fetchOptionalJson(url:string): Promise<any|null> {
  try {
    const response=await fetch(url,{headers:requestHeaders,signal:AbortSignal.timeout(20000)});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload=await response.json();
    if(payload?.isSuccess!==true) throw new Error("isSuccess=true dönmedi");
    return payload;
  } catch(error) {
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

async function main():Promise<void> {
  const raw=await fetchIddaa();
  if(!raw.trim()) throw new Error("iddaa boş yanıt döndürdü.");
  const payload:unknown=JSON.parse(raw);
  const [marketConfigPayload,competitionPayload]=await Promise.all([
    fetchOptionalJson("https://sportsbookv2.iddaa.com/sportsbook/get_market_config?st=1"),
    fetchOptionalJson("https://sportsbookv2.iddaa.com/sportsbook/competitions?st=1")
  ]);
  const marketConfig=(marketConfigPayload?.data?.m && typeof marketConfigPayload.data.m==="object")
    ? marketConfigPayload.data.m : {};
  const competitionMap=parseCompetitionMap(competitionPayload);
  const bulletin=transformIddaaPayload(payload,marketConfig,competitionMap);

  const markets=new Map<string,number>();
  let outcomes=0, matchesWithMarkets=0;
  for(const match of bulletin.matches) {
    const rows=(match.fields.iddaaMarkets || []) as Array<{code:string;outcomes:Array<{odd:number|null}>}>;
    if(rows.length) matchesWithMarkets++;
    match.fields.marketCount=rows.length;
    for(const market of rows) {
      markets.set(market.code,(markets.get(market.code)||0)+1);
      outcomes+=market.outcomes.filter(item=>item.odd!==null).length;
    }
    // Full market details are loaded on demand from /api/iddaa-markets.
    delete match.fields.iddaaMarkets;
  }

  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const stamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");
  const rawName=`iddaa_events_${today.replace(/-/g,"")}_${stamp}.json`;
  await mkdir(RAW_DIR,{recursive:true});
  await writeFile(resolve(RAW_DIR,rawName),raw,"utf-8");
  bulletin.meta.sourceFile=rawName;
  await mkdir(dirname(OUTPUT),{recursive:true});
  const temp=OUTPUT+".tmp";
  await writeFile(temp,JSON.stringify(bulletin,null,2),"utf-8");
  await rename(temp,OUTPUT);

  console.log(`iddaa: ${bulletin.meta.sourceMatchCount} kaynak kaydı | ${bulletin.matches.length} futbol maçı | ${matchesWithMarkets} marketli maç | ${markets.size} farklı market kodu | ${outcomes} fiyatlı sonuç`);
  console.log("MARKET_FREQUENCIES="+JSON.stringify(Object.fromEntries([...markets].sort((a,b)=>a[0].localeCompare(b[0])))));
  console.log(`COMPETITIONS_RESOLVED=${Object.keys(competitionMap).length} | MARKET_NAMES_RESOLVED=${Object.keys(marketConfig).length}`);
  console.log("SAMPLE_MATCHES="+JSON.stringify(bulletin.matches.slice(0,5).map(m=>({
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
    console.log(`FotMob: ${fixtures.length} maç | Eşleşen: ${eventMap.summary.matched} | Belirsiz: ${eventMap.summary.ambiguous} | Eşleşmeyen: ${eventMap.summary.unmatched}`);
  } catch(error) {
    console.warn("FotMob eşleştirmesi başarısız; önceki eşleşme dosyası korundu:",error instanceof Error?error.message:error);
  }
}
main().catch(error=>{console.error("iddaa günlük güncellemesi başarısız:",error);process.exitCode=1;});
