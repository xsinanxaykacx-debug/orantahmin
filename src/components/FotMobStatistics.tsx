import { useEffect, useState } from "react";
import "./FotMobStatistics.css";

type LeagueOption = { id: number; name: string; country: string };
type MarketItem = { label: string; count: number; percent: number };
type Market = { title: string; matches: number; items: MarketItem[] };
type Breakdown = {
  league: { id: number; name: string; country: string };
  season: string;
  seasons: string[];
  selectedRound: string;
  rounds: string[];
  totalFixtures: number;
  matches: number;
  verifiedHalfTimeMatches: number;
  markets: Market[];
};
type TeamMetric = { value: number | null; label: string; detail: string };
type TeamRow = {
  id: number;
  name: string;
  leagueId: number;
  leagueName: string;
  country: string;
  matches: number;
  metrics: Record<string, TeamMetric | undefined>;
};
type TeamPayload = { season: string; teams: TeamRow[]; scannedMatches: number };
type TeamCacheEntry = { savedAt: number; data: TeamPayload };

function readTeamCache(key: string): TeamCacheEntry | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as TeamCacheEntry;
    if (!entry?.data || !Array.isArray(entry.data.teams) || typeof entry.savedAt !== "number") return null;
    if (Date.now() - entry.savedAt > CACHE_MAX_AGE_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return entry;
  } catch { return null; }
}

function writeTeamCache(key: string, data: TeamPayload) {
  try { localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data })); }
  catch { /* cache unavailable */ }
}

function getTeamResults(detail?: string) {
  const match = detail?.match(/Galibiyet:\s*([\d.]+)%\s*·\s*Beraberlik:\s*([\d.]+)%\s*·\s*Mağlubiyet:\s*([\d.]+)%/);
  return match
    ? { win: Number(match[1]), draw: Number(match[2]), loss: Number(match[3]) }
    : { win: null, draw: null, loss: null };
}

const teamNumber = (value?: number | null) =>
  value == null ? "—" : numberFormat(value);

const teamPercent = (value?: number | null) =>
  value == null ? "—" : `%${numberFormat(value)}`;
const numberFormat = (value: number) => value.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
const CACHE_FRESH_MS = 30 * 60 * 1000;
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type BreakdownCacheEntry = { savedAt: number; data: Breakdown };

function readBreakdownCache(key: string): BreakdownCacheEntry | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const entry = JSON.parse(raw) as BreakdownCacheEntry;
    if (!entry?.data || !Array.isArray(entry.data.markets) || typeof entry.savedAt !== "number") {
      return null;
    }

    if (Date.now() - entry.savedAt > CACHE_MAX_AGE_MS) {
      localStorage.removeItem(key);
      return null;
    }

    return entry;
  } catch {
    return null;
  }
}

function writeBreakdownCache(key: string, data: Breakdown) {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // Önbellek kullanılamazsa normal API yüklemesi devam eder.
  }
}

export function FotMobStatistics({ view }: { view: "league" | "team" }) {
  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [leagueId, setLeagueId] = useState(71);
  const [season, setSeason] = useState("");
  const [seasonOptions, setSeasonOptions] = useState<string[]>([]);
  const [round, setRound] = useState("all");
  const [data, setData] = useState<Breakdown | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const [teamData, setTeamData] = useState<TeamPayload | null>(null);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  type TeamSortKey = "name" | "matches" | "xg" | "goals" | "win" | "draw" | "loss" | "over25" | "btts";
  const [teamSort, setTeamSort] = useState<{ key: TeamSortKey; direction: "asc" | "desc" }>({
    key: "matches",
    direction: "desc"
  });

  const changeTeamSort = (key: TeamSortKey) => {
    setTeamSort(current => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  };

  const getTeamSortValue = (team: TeamRow, key: TeamSortKey): string | number | null => {
    const results = getTeamResults(team.metrics["match-result"]?.detail);
    switch (key) {
      case "name": return team.name;
      case "matches": return team.matches;
      case "xg": return team.metrics.xg?.value ?? null;
      case "goals": return team.metrics["total-goals"]?.value ?? null;
      case "win": return results.win;
      case "draw": return results.draw;
      case "loss": return results.loss;
      case "over25": return team.metrics["goals-25"]?.value ?? null;
      case "btts": return team.metrics.btts?.value ?? null;
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/fotmob-league-breakdown?catalog=1", { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error("FotMob lig kataloğu alınamadı.");
        return response.json();
      })
      .then(payload => {
        setLeagues(Array.isArray(payload.leagues) ? payload.leagues : []);
        if (!payload.leagues?.some((item: LeagueOption) => item.id === 71) && payload.leagues?.[0]) {
          setLeagueId(payload.leagues[0].id);
        }
      })
      .catch(reason => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : "Lig kataloğu alınamadı.");
      })
      .finally(() => setCatalogLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const requestedSeason = season;
    const requestKey = `orantahmin:fotmob:${leagueId}:${requestedSeason || "latest"}:${round}`;
    const cached = readBreakdownCache(requestKey);

    setError(null);

    if (cached) {
      setData(cached.data);
      setSeasonOptions(cached.data.seasons?.length ? cached.data.seasons : [cached.data.season]);
    } else {
      setData(null);
    }

    const cacheIsFresh = cached && Date.now() - cached.savedAt < CACHE_FRESH_MS;

    if (cacheIsFresh) {
      setLoading(false);
      return () => controller.abort();
    }

    setLoading(true);

    const params = new URLSearchParams({ leagueId: String(leagueId), round });
    if (requestedSeason) params.set("season", requestedSeason);

    fetch(`/api/fotmob-league-breakdown?${params.toString()}`, { signal: controller.signal })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Lig istatistikleri alınamadı.");
        return payload as Breakdown;
      })
      .then(payload => {
        setData(payload);
        setSeasonOptions(payload.seasons?.length ? payload.seasons : payload.season ? [payload.season] : []);

        writeBreakdownCache(requestKey, payload);

        const seasonKey = `orantahmin:fotmob:${leagueId}:${payload.season}:${round}`;
        writeBreakdownCache(seasonKey, payload);
      })
      .catch(reason => {
        if (!(reason instanceof DOMException && reason.name === "AbortError") && !cached) {
          setError(reason instanceof Error ? reason.message : "İstatistikler alınamadı.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [leagueId, season, round]);

  useEffect(() => {
    const selectedTeamSeason = season || data?.season || "";
    if (view !== "team" || !selectedTeamSeason) return;

    const controller = new AbortController();
    const cacheKey = `orantahmin:fotmob:teams:v2:${leagueId}:${selectedTeamSeason}`;
    const cacheEntry = readTeamCache(cacheKey);
    const cached = cacheEntry?.data.season === selectedTeamSeason ? cacheEntry : null;
    if (cacheEntry && !cached) localStorage.removeItem(cacheKey);

    setTeamError(null);
    if (cached) setTeamData(cached.data);
    else setTeamData(null);

    if (cached && Date.now() - cached.savedAt < CACHE_FRESH_MS) {
      setTeamLoading(false);
      return () => controller.abort();
    }

    setTeamLoading(true);
    const params = new URLSearchParams({
      leagueId: String(leagueId),
      season: selectedTeamSeason,
      limit: "20"
    });

    fetch(`/api/fotmob-statistics?${params.toString()}`, { signal: controller.signal })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Takım istatistikleri alınamadı.");
        const teamPayload = payload as TeamPayload;
        if (teamPayload.season !== selectedTeamSeason) {
          throw new Error(`Sezon uyuşmazlığı: İstenen ${selectedTeamSeason}, gelen ${teamPayload.season}`);
        }
        return teamPayload;
      })
      .then(payload => {
        if (controller.signal.aborted) return;
        setTeamData(payload);
        writeTeamCache(cacheKey, payload);
      })
      .catch(reason => {
        if (!(reason instanceof DOMException && reason.name === "AbortError") && !cached) {
          setTeamError(reason instanceof Error ? reason.message : "Takım verileri alınamadı.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setTeamLoading(false);
      });

    return () => controller.abort();
  }, [view, leagueId, season, data?.season]);
  const selectedLeague = leagues.find(item => item.id === leagueId);
  const sortedTeamRows = teamData ? [...teamData.teams].sort((a, b) => {
    const aValue = getTeamSortValue(a, teamSort.key);
    const bValue = getTeamSortValue(b, teamSort.key);

    if (teamSort.key === "name") {
      const comparison = String(aValue ?? "").localeCompare(String(bValue ?? ""), "tr");
      return teamSort.direction === "asc" ? comparison : -comparison;
    }

    if (aValue == null && bValue == null) return a.name.localeCompare(b.name, "tr");
    if (aValue == null) return 1;
    if (bValue == null) return -1;

    const comparison = Number(aValue) - Number(bValue);
    return comparison === 0
      ? a.name.localeCompare(b.name, "tr")
      : teamSort.direction === "asc" ? comparison : -comparison;
  }) : [];

  const sortHeader = (label: string, key: TeamSortKey) => (
    <button
      type="button"
      onClick={() => changeTeamSort(key)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: 0,
        border: 0,
        background: "transparent",
        color: "inherit",
        font: "inherit",
        cursor: "pointer"
      }}
      title={`${label} sütununa göre sırala`}
    >
      {label}{teamSort.key === key ? (teamSort.direction === "asc" ? " ▲" : " ▼") : ""}
    </button>
  );
  return <div className={`stats-page ${view === "team" ? "stats-page-team" : ""}`}>
    <header className="stats-page-header">
      <div>
        <span className="eyebrow">ORANTAHMİN ANALİZ</span>
        <h2>{view === "league" ? "Lig İstatistikleri" : "Takım İstatistikleri"}</h2>
        <p>{view === "league" ? "FotMob maç sonuçlarından hesaplanan market dağılımları." : "Seçilen ligdeki takımların sezon performansları."}</p>
      </div>
      <div className="stats-scan-count"><b>{view === "team" ? (teamData ? teamData.teams.length.toLocaleString("tr-TR") : "—") : (data ? data.matches.toLocaleString("tr-TR") : "—")}</b><span>{view === "team" ? "Takım" : "Tamamlanan maç"}</span></div>
    </header>

    <section className="stats-controls info-card stats-league-controls">
      <label className="stats-control-group stats-league-select">
        <span className="stats-control-label">Lig</span>
        <select value={leagueId} onChange={event => { setLeagueId(Number(event.target.value)); setSeason(""); setSeasonOptions([]); setRound("all");  }} disabled={catalogLoading}>
          {leagues.map(item => <option key={item.id} value={item.id}>{item.name}    {item.country}</option>)}
        </select>
      </label>
      <label className="stats-control-group">
        <span className="stats-control-label">Sezon</span>
        <select value={season || data?.season || ""} onChange={event => { setSeason(event.target.value); setRound("all"); }} disabled={!data && loading}>
          {seasonOptions.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label className="stats-control-group">
        <span className="stats-control-label">Hafta</span>
        <select value={round} onChange={event => setRound(event.target.value)}>
          <option value="all">Tüm Haftalar</option>
          {(data?.rounds || []).map(item => <option key={item} value={item}>{/^\d+$/.test(item) ? `${item}. Hafta` : item}</option>)}
        </select>
      </label>
    </section>

    <section className="stats-team-panel info-card">
      <div className="stats-team-toolbar">
        <div>
          <strong>Takım performans tablosu</strong>
          <span>{teamData ? `${teamData.teams.length} takım · ${teamData.scannedMatches} maç` : "FotMob takım verileri"}</span>
        </div>
        <label>
          <span>Sezon</span>
          <select value={season || data?.season || ""} onChange={event => setSeason(event.target.value)} disabled={!seasonOptions.length}>
            {seasonOptions.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>
      {teamError ? <div className="stats-team-message">Takım verileri alınamadı: {teamError}</div>
        : teamLoading && !teamData ? <div className="stats-team-message">Takım istatistikleri yükleniyor…</div>
        : teamData && teamData.teams.length ? <div className="stats-table-scroll">
          <table className="stats-table stats-team-table">
            <thead>
              <tr>
                <th>{sortHeader("Takım", "name")}</th>
                <th>{sortHeader("Maç", "matches")}</th>
                <th>{sortHeader("xG", "xg")}</th>
                <th>{sortHeader("Gol/maç", "goals")}</th>
                <th>{sortHeader("Galibiyet", "win")}</th>
                <th>{sortHeader("Beraberlik", "draw")}</th>
                <th>{sortHeader("Mağlubiyet", "loss")}</th>
                <th>{sortHeader("Üst 2,5", "over25")}</th>
                <th>{sortHeader("KG Var", "btts")}</th>
              </tr>
            </thead>
            <tbody>
              {sortedTeamRows.map(team => {
                const results = getTeamResults(team.metrics["match-result"]?.detail);
                return <tr key={team.id}>
                  <td className="stats-entity-name">{team.name}</td>
                  <td className="stats-value">{team.matches}</td>
                  <td className="stats-value">{teamNumber(team.metrics.xg?.value)}</td>
                  <td className="stats-value">{teamNumber(team.metrics["total-goals"]?.value)}</td>
                  <td className="stats-value">{teamPercent(results.win)}</td>
                  <td className="stats-value">{teamPercent(results.draw)}</td>
                  <td className="stats-value">{teamPercent(results.loss)}</td>
                  <td className="stats-value">{teamPercent(team.metrics["goals-25"]?.value)}</td>
                  <td className="stats-value">{teamPercent(team.metrics.btts?.value)}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div> : <div className="stats-team-message">Bu sezon için takım verisi bulunamadı.</div>}
      <p className="stats-source-note">Kaynak: FotMob lig fikstürü ve takım xG verileri. Takım yüzdeleri, ilgili takımın tamamlanmış maçlarından hesaplanır.</p>
    </section>    <section className="stats-league-summary info-card">
      <div><span className="stats-league-name">{data?.league.name || selectedLeague?.name || "Lig seçiliyor…"}</span><span className="stats-league-season">{data?.season || season || "—"}</span></div>
      <div className="stats-league-meta"><b>{data?.matches ?? "—"} maç</b><span>Tamamlandı</span></div>
    </section>

    {error ? <section className="stats-empty stats-error info-card"><strong>İstatistikler yüklenemedi</strong><p>{error}</p></section>
      : !data ? <section className="stats-empty info-card"><strong>Lig istatistikleri yükleniyor</strong><p>FotMob fikstürü ve maç detayları okunuyor. Devre istatistikleri doğrulandıkça marketler oluşturuluyor.</p></section>
      : <div className="stats-market-grid">
        {data.markets.map(market => <section className="stats-market-card info-card" key={market.title}>
          <header><h3>{market.title}</h3><span>{market.matches} maç</span></header>
          {market.items.length ? <div className="stats-market-items">
            {market.items.map(item => <div className="stats-market-item" key={item.label}>
              <div className="stats-market-item-top"><b>{item.label}</b><strong>%{numberFormat(item.percent)}</strong></div>
              <div className="stats-market-bar"><i style={{ width: `${Math.max(0, Math.min(100, item.percent))}%` }} /></div>
              <span>{item.count} maç</span>
            </div>)}
          </div> : <div className="stats-market-empty">Bu market için doğrulanmış veri bulunamadı.</div>}
        </section>)}
      </div>}
    {data && <p className="stats-source-note">Kaynak: FotMob lig fikstürü ve maç detayları. Maç sonucu marketleri {data.matches} tamamlanmış maçtan; devre marketleri ise ilk yarı olayları doğrulanabilen {data.verifiedHalfTimeMatches} maçtan hesaplandı. Devre verisi bulunmayan maçlar bu marketlerin paydasına eklenmez.</p>}
  </div>;
}




