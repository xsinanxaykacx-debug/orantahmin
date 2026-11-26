import { parseIddaaMarkets } from "../scripts/iddaa/transform.ts";

type Req = { method?: string; query: Record<string, string | string[] | undefined> };
type Res = { setHeader(name: string,value: string):void; status(code:number):Res; json(body:unknown):Res };

const HEADERS = {
  Accept:"application/json, text/plain, */*",
  "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
  Origin:"https://www.iddaa.com",
  Referer:"https://www.iddaa.com/"
};
const SB = "https://sportsbookv2.iddaa.com/sportsbook";

function value(input:string|string[]|undefined):string {
  return Array.isArray(input) ? input[0] || "" : input || "";
}
async function getJson(url:string):Promise<any> {
  const response=await fetch(url,{headers:HEADERS,signal:AbortSignal.timeout(30000)});
  if(!response.ok) throw new Error(`iddaa HTTP ${response.status}`);
  const payload=await response.json();
  if(payload?.isSuccess!==true) throw new Error("iddaa başarısız yanıt döndürdü.");
  return payload;
}

export default async function handler(req:Req,res:Res) {
  res.setHeader("Cache-Control","s-maxage=120, stale-while-revalidate=180");
  res.setHeader("Access-Control-Allow-Origin","*");
  if(req.method!=="GET") return res.status(405).json({error:"Method not allowed"});
  const eventId=value(req.query.eventId).trim();
  if(!/^\d+$/.test(eventId)) return res.status(400).json({source:"iddaa.com",error:"Geçerli eventId gerekli."});
  try {
    const [detail,configPayload]=await Promise.all([
      getJson(`${SB}/event/${encodeURIComponent(eventId)}`),
      getJson(`${SB}/get_market_config?st=1`)
    ]);
    const event=detail?.data;
    if(!event || !Array.isArray(event.m)) throw new Error("iddaa maç detayında tam market dizisi bulunamadı.");
    const marketConfig=configPayload?.data?.m && typeof configPayload.data.m==="object" ? configPayload.data.m : {};
    const markets=parseIddaaMarkets(event,marketConfig);
    const outcomeCount=markets.reduce((sum,market)=>sum+market.outcomes.length,0);
    return res.status(200).json({
      source:"iddaa.com",eventId,available:markets.length>0,
      completeness:"event-detail",fetchedAt:new Date().toISOString(),
      marketCount:markets.length,outcomeCount,markets
    });
  } catch(error) {
    return res.status(502).json({
      source:"iddaa.com",eventId,error:error instanceof Error?error.message:"iddaa marketleri okunamadı."
    });
  }
}
