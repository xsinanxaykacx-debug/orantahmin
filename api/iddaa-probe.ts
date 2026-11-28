type Req = { method?: string };
type Res = { setHeader(name: string, value: string): void; status(code: number): Res; json(body: unknown): Res };

const BASE = "https://sportsbookv2.iddaa.com/sportsbook";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36";

async function inspect(url: string) {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json, text/html, */*", "User-Agent": UA, Origin: "https://www.iddaa.com", Referer: "https://www.iddaa.com/" },
      signal: AbortSignal.timeout(12000)
    });
    const text = await response.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch {}
    const events = parsed?.data?.events || parsed?.data?.eventList || parsed?.events || [];
    const list = Array.isArray(events) ? events : [];
    const bySid: Record<string, number> = {};
    const byState: Record<string, number> = {};
    const byIl: Record<string, number> = {};
    for (const event of list) {
      const sid = String(event?.sid ?? "missing");
      const state = String(event?.s ?? "missing");
      const il = String(event?.il ?? "missing");
      bySid[sid] = (bySid[sid] || 0) + 1;
      byState[state] = (byState[state] || 0) + 1;
      byIl[il] = (byIl[il] || 0) + 1;
    }
    return {
      url, httpStatus: response.status, contentType: response.headers.get("content-type"),
      bodyLength: text.length, isSuccess: parsed?.isSuccess,
      topKeys: parsed && typeof parsed === "object" ? Object.keys(parsed) : [],
      dataKeys: parsed?.data && typeof parsed.data === "object" ? Object.keys(parsed.data) : [],
      totalEvents: list.length, bySid, byState, byIl,
      sample: list.slice(0, 3).map((event: any) => ({
        i: event.i, hn: event.hn, an: event.an, d: event.d, sid: event.sid,
        s: event.s, il: event.il, ci: event.ci, markets: event.m?.length
      })),
      htmlHints: !parsed ? {
        hasNextData: text.includes("__NEXT_DATA__"),
        hasLiveSample: /Ipswich Town|Elche|Torino/.test(text),
        nextScripts: [...text.matchAll(/<script[^>]+src=["']([^"']+)/g)].slice(0, 15).map(match => match[1]),
        snippets: ["__NEXT_DATA__", "Ipswich Town", "sportsbookv2", "live-results"].map(key => {
          const index = text.indexOf(key);
          return index >= 0 ? { key, text: text.slice(Math.max(0, index - 250), index + 700) } : null;
        }).filter(Boolean)
      } : undefined
    };
  } catch (error) {
    return { url, error: error instanceof Error ? error.message : String(error) };
  }
}

export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const urls = [
    `${BASE}/events?st=1&type=0&version=0`,
    `${BASE}/events?st=1&type=1&version=0`,
    `${BASE}/events?st=1&type=2&version=0`,
    `${BASE}/events?st=1&type=3&version=0`,
    `${BASE}/live-events?st=1`,
    `${BASE}/live?st=1`,
    `${BASE}/events/live?st=1`,
    "https://www.iddaa.com/program/canli/futbol"
  ];
  const results = await Promise.all(urls.map(inspect));
  return res.status(200).json({ inspectedAt: new Date().toISOString(), results });
}
