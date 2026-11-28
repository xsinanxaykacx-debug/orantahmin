import { normalizeIddaaLiveResults } from "../scripts/iddaa/live-status.js";

type Req = { method?: string; query: Record<string, string | string[] | undefined> };
type Res = { setHeader(name: string, value: string): void; status(code: number): Res; json(body: unknown): Res };

function queryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function handler(req: Req, res: Res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=15");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  if (queryValue(req.query.probe) === "1") {
    const base = "https://sportsbookv2.iddaa.com/sportsbook";
    const urls = [
      `${base}/events?st=1&type=0&version=0`,
      `${base}/events?st=1&type=1&version=0`,
      `${base}/events?st=1&type=2&version=0`,
      `${base}/events?st=1&type=3&version=0`,
      `${base}/live-events?st=1`,
      `${base}/live?st=1`,
      `${base}/events/live?st=1`,
      "https://www.iddaa.com/program/canli/futbol"
    ];
    const results = await Promise.all(urls.map(async url => {
      try {
        const response = await fetch(url, {
          headers: {
            Accept: "application/json, text/html, */*",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
            Origin: "https://www.iddaa.com",
            Referer: "https://www.iddaa.com/"
          },
          signal: AbortSignal.timeout(12000)
        });
        const body = await response.text();
        let payload: any = null;
        try { payload = JSON.parse(body); } catch {}
        const events = payload?.data?.events || payload?.data?.eventList || payload?.events || [];
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
          bodyLength: body.length, isSuccess: payload?.isSuccess,
          topKeys: payload ? Object.keys(payload) : [],
          dataKeys: payload?.data ? Object.keys(payload.data) : [],
          totalEvents: list.length, bySid, byState, byIl,
          sample: list.slice(0, 3).map((event: any) => ({
            i: event.i, hn: event.hn, an: event.an, d: event.d, sid: event.sid,
            s: event.s, il: event.il, ci: event.ci, markets: event.m?.length
          })),
          stateOneSample: list.filter((event: any) => Number(event?.s) === 1).slice(0, 8).map((event: any) => ({
            ...event, m: Array.isArray(event.m) ? event.m.slice(0, 2) : event.m
          })),
          scoreMapKeys: payload?.data?.sc && typeof payload.data.sc === "object" ? Object.keys(payload.data.sc).length : 0,
          scoreMapSample: payload?.data?.sc && typeof payload.data.sc === "object" ? Object.entries(payload.data.sc).slice(0, 8) : [],
          htmlHints: !payload ? {
            hasNextData: body.includes("__NEXT_DATA__"),
            hasLiveSample: /Ipswich Town|Elche|Torino/.test(body),
            scriptUrls: [...body.matchAll(/<script[^>]+src=["']([^"']+)/g)].slice(0, 12).map(match => match[1]),
            snippets: ["__NEXT_DATA__", "Ipswich Town", "sportsbookv2", "live-results"].map(key => {
              const index = body.indexOf(key);
              return index >= 0 ? { key, text: body.slice(Math.max(0, index - 200), index + 600) } : null;
            }).filter(Boolean)
          } : undefined
        };
      } catch (error) {
        return { url, error: error instanceof Error ? error.message : String(error) };
      }
    }));
    return res.status(200).json({ probeAt: new Date().toISOString(), results });
  }

  const date = queryValue(req.query.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ source: "iddaa.com", error: "Geçerli tarih gerekli (YYYY-MM-DD)." });
  }

  try {
    const url = `https://statisticsv2.iddaa.com/live-results?sportId=1&date=${encodeURIComponent(date)}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
        Origin: "https://www.iddaa.com",
        Referer: "https://www.iddaa.com/"
      },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`iddaa canlı sonuç HTTP ${response.status}`);
    const payload = await response.json();
    const matches = normalizeIddaaLiveResults(payload);
    return res.status(200).json({
      source: "iddaa.com",
      date,
      matches,
      liveCount: matches.filter(match => match.status === 1).length,
      finishedCount: matches.filter(match => match.status === 4).length,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(502).json({
      source: "iddaa.com",
      date,
      error: error instanceof Error ? error.message : "İddaa canlı maç durumları alınamadı."
    });
  }
}
