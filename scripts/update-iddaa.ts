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

async function main():Promise<void> {
  const feed=await getJson(FEED_URL,45000);
  const root=Array.isArray(feed.data)?feed.data[0]:feed.data;
  if(!Array.isArray(root?.events) || !root.events.length) throw new Error("iddaa maç listesi boş.");

  const targetDate=getIstanbulDateKey();
  const footballEvents=root.events.filter((event:any)=>Number(event.sid)===1);
  const sourceFootballCount=footballEvents.length;
  const rawStateCounts:Record<string,number>={}, rawIlCounts:Record<string,number>={};
  for(const event of footballEvents) {
    const state=String(event.s ?? "missing"), il=String(event.il ?? "missing");
    rawStateCounts[state]=(rawStateCounts[state]||0)+1;
    rawIlCounts[il]=(rawIlCounts[il]||0)+1;
  }
  console.log("IDDAA_RAW_EVENT_FLAGS="+JSON.stringify({total:footballEvents.length,states:rawStateCounts,inPlayFlags:rawIlCounts}));

  const probeSpecs=[
    {name:"type1",url:`${SB}/events?st=1&type=1&version=0`},
    {name:"type2",url:`${SB}/events?st=1&type=2&version=0`},
    {name:"type3",url:`${SB}/events?st=1&type=3&version=0`},
    {name:"live-events",url:`${SB}/live-events?st=1`},
    {name:"live",url:`${SB}/live?st=1`},
    {name:"events-live",url:`${SB}/events/live?st=1`}
  ];
  const probePayloads=await Promise.all(probeSpecs.map(spec=>fetchOptionalJson(spec.url)));
  const type1Data=Array.isArray(probePayloads[0]?.data)?probePayloads[0].data[0]:probePayloads[0]?.data;
  const type1Events=Array.isArray(type1Data?.events)?type1Data.events.filter((event:any)=>Number(event.sid)===1):[];
  const baseIds=new Set(footballEvents.map((event:any)=>String(event.i)));
  const type1Ids=new Set(type1Events.map((event:any)=>String(event.i)));
  const type1Overlap=[...type1Ids].filter(id=>baseIds.has(id));
  const type1LiveEvents=type1Events.filter((event:any)=>Number(event.s)===1);
  const type1LiveOverlap=type1LiveEvents.filter((event:any)=>baseIds.has(String(event.i)));
  const type1LiveAdditional=type1LiveEvents.filter((event:any)=>!baseIds.has(String(event.i)));
  const nowEpoch=Math.floor(Date.now()/1000);
  const basePast=footballEvents.filter((event:any)=>Number(event.d)<nowEpoch);
  const baseFuture=footballEvents.filter((event:any)=>Number(event.d)>=nowEpoch);
  const statsPayload=await fetchOptionalJson(`https://statisticsv2.iddaa.com/live-results?sportId=1&date=${targetDate}`);
  const statsScores=statsPayload?.data?.sc&&typeof statsPayload.data.sc==="object"?statsPayload.data.sc:{};
  const statsStatusCounts:Record<string,number>={}, statsBaseOverlap:Record<string,number>={};
  for(const [id,row] of Object.entries(statsScores) as Array<[string,any]>) {
    const state=String(row?.s??"missing");
    statsStatusCounts[state]=(statsStatusCounts[state]||0)+1;
    if(baseIds.has(id)) statsBaseOverlap[state]=(statsBaseOverlap[state]||0)+1;
  }
  console.log("IDDAA_MATCH_WINDOW_AND_RESULTS="+JSON.stringify({
    now:new Date().toISOString(),
    baseTotal:footballEvents.length,
    basePast:basePast.length,
    baseFuture:baseFuture.length,
    type1Live:type1LiveEvents.length,
    futurePlusLive:baseFuture.length+type1LiveEvents.length,
    statisticsCount:Object.keys(statsScores).length,
    statisticsStates:statsStatusCounts,
    statisticsOverlapWithBase:statsBaseOverlap,
    pastBaseSamples:basePast.slice(0,15).map((event:any)=>({id:event.i,home:event.hn,away:event.an,kickoff:new Date(Number(event.d)*1000).toISOString()}))
  }));
  console.log("IDDAA_TYPE1_OVERLAP="+JSON.stringify({
    type1Football:type1Events.length,
    type1LiveStateOne:type1LiveEvents.length,
    baseFootball:footballEvents.length,
    overlap:type1Overlap.length,
    additional:[...type1Ids].filter(id=>!baseIds.has(id)).length,
    liveOverlap:type1LiveOverlap.length,
    liveAdditional:type1LiveAdditional.length,
    liveAdditionalSamples:type1LiveAdditional.slice(0,20).map((event:any)=>({id:event.i,home:event.hn,away:event.an,date:new Date(Number(event.d)*1000).toISOString()})),
    sampleLive:type1Events.filter((event:any)=>Number(event.s)===1).slice(0,8).map((event:any)=>({
      id:event.i,home:event.hn,away:event.an,date:new Date(Number(event.d)*1000).toISOString(),
      state:event.s,il:event.il,keys:Object.keys(event),marketCount:event.m?.length,
      scoreKeys:Object.keys(event).filter(key=>/score|minute|status|result|home|away|time|phase/i.test(key))
    })),
    scoreMapKeys:type1Data?.sc&&typeof type1Data.sc==="object"?Object.keys(type1Data.sc).length:0,
    scoreMapSample:type1Data?.sc&&typeof type1Data.sc==="object"?Object.entries(type1Data.sc).slice(0,8):[]
  }));
  const endpointProbe=probeSpecs.map((spec,index)=>{
    const payload=probePayloads[index];
    const data=Array.isArray(payload?.data)?payload.data[0]:payload?.data;
    const events=Array.isArray(data?.events)?data.events:Array.isArray(data)?data:[];
    const bySid:Record<string,number>={}, byState:Record<string,number>={}, byIl:Record<string,number>={};
    for(const event of events) {
      const sid=String(event?.sid??"missing"), state=String(event?.s??"missing"), il=String(event?.il??"missing");
      bySid[sid]=(bySid[sid]||0)+1; byState[state]=(byState[state]||0)+1; byIl[il]=(byIl[il]||0)+1;
    }
    return {name:spec.name,ok:payload?.isSuccess===true,total:events.length,bySid,byState,byIl,
      sample:events.slice(0,2).map((event:any)=>({i:event.i,hn:event.hn,an:event.an,sid:event.sid,s:event.s,il:event.il,d:event.d}))};
  });
  console.log("IDDAA_ENDPOINT_PROBES="+JSON.stringify(endpointProbe));
  if(!sourceFootballCount) {
    throw new Error("İddaa bülteninde futbol maçı bulunamadı; mevcut bülten korunuyor.");
  }

  console.log(`iddaa tam bülten: ${targetDate} Europe/Istanbul | Kaynak futbol maçı: ${sourceFootballCount} | Tarih filtresi uygulanmadı.`);
  const [marketConfigPayload,competitionPayload]=await Promise.all([
    fetchOptionalJson(`${SB}/get_market_config?st=1`),
    fetchOptionalJson(`${SB}/competitions?st=1`)
  ]);
  const marketConfig=(marketConfigPayload?.data?.m && typeof marketConfigPayload.data.m==="object")
    ? marketConfigPayload.data.m : {};
  const competitionMap=parseCompetitionMap(competitionPayload);

  console.log(`iddaa: ${sourceFootballCount} futbol maçı dönüştürülüyor. Tam marketler maç seçildiğinde api/iddaa?resource=markets üzerinden alınacak.`);
  const bulletin=transformIddaaPayload(feed,marketConfig,competitionMap);

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
  const raw=JSON.stringify(feed);
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
