type Req = { method?: string; query: Record<string, string | string[] | undefined> };
type Res = { setHeader(name: string, value: string): void; status(code: number): Res; json(body: unknown): Res };
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36";
export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const raw = req.query.leagueId;
  const leagueId = Array.isArray(raw) ? raw[0] : raw;
  if (!leagueId || !/^\d{1,8}$/.test(leagueId)) return res.status(400).json({ error: "Geçersiz lig kimliği." });
  try {
    const upstream = await fetch(`https://www.fotmob.com/api/data/leagues?id=${encodeURIComponent(leagueId)}`, {
      headers: { Accept: "application/json", "User-Agent": UA, Referer: "https://www.fotmob.com/" },
      signal: AbortSignal.timeout(18000)
    });
    const contentType = upstream.headers.get("content-type") || "";
    if (!upstream.ok || !contentType.includes("json")) return res.status(502).json({ error: `FotMob lig verisi alınamadı (HTTP ${upstream.status}).` });
    const data = await upstream.json();
    const tableGroups = Array.isArray(data?.table) ? data.table.map((group: any) => ({
      name: group?.data?.tableName || group?.data?.leagueName || group?.data?.ccode || data?.details?.name || "Puan durumu",
      rows: group?.data?.table?.all || group?.table?.all || []
    })).filter((group: any) => group.rows.length) : [];
    return res.status(200).json({
      source: "FotMob",
      leagueId: Number(leagueId),
      details: data?.details || null,
      seasons: data?.seasons || data?.allAvailableSeasons || [],
      tableGroups,
      fixtures: data?.fixtures || null,
      overview: data?.overview || null,
      stats: data?.stats || null
    });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "Lig verisi alınamadı." });
  }
}
