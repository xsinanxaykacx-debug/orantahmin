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
const numberFormat = (value: number) => value.toLocaleString("tr-TR", { maximumFractionDigits: 1 });

export function FotMobStatistics() {
  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [leagueId, setLeagueId] = useState(71);
  const [season, setSeason] = useState("");
  const [seasonOptions, setSeasonOptions] = useState<string[]>([]);
  const [round, setRound] = useState("all");
  const [roundOptions, setRoundOptions] = useState<string[]>([]);
  const [data, setData] = useState<Breakdown | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setLoading(true);
    setError(null);
    setData(null);
    const params = new URLSearchParams({ leagueId: String(leagueId), round });
    if (season) params.set("season", season);
    fetch(`/api/fotmob-league-breakdown?${params.toString()}`, { signal: controller.signal })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Lig istatistikleri alınamadı.");
        return payload as Breakdown;
      })
      .then(payload => {
        setData(payload);
        setSeasonOptions(payload.seasons?.length ? payload.seasons : payload.season ? [payload.season] : []);
        setRoundOptions(payload.rounds || []);
        if (!season && payload.season) setSeason(payload.season);
      })
      .catch(reason => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : "İstatistikler alınamadı.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [leagueId, season, round]);

  const selectedLeague = leagues.find(item => item.id === leagueId);
  return <div className="stats-page">
    <header className="stats-page-header">
      <div>
        <span className="eyebrow">ORANTAHMİN ANALİZ</span>
        <h2>Lig İstatistikleri</h2>
        <p>FotMob maç sonuçlarından hesaplanan market dağılımları.</p>
      </div>
      <div className="stats-scan-count"><b>{data ? data.matches.toLocaleString("tr-TR") : "—"}</b><span>Tamamlanan maç</span></div>
    </header>

    <section className="stats-controls info-card stats-league-controls">
      <label className="stats-control-group stats-league-select">
        <span className="stats-control-label">Lig</span>
        <select value={leagueId} onChange={event => { setLeagueId(Number(event.target.value)); setSeason(""); setSeasonOptions([]); setRound("all"); setRoundOptions([]); }} disabled={catalogLoading}>
          {leagues.map(item => <option key={item.id} value={item.id}>{item.name} · {item.country}</option>)}
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

    <section className="stats-league-summary info-card">
      <div><span className="stats-league-name">{data?.league.name || selectedLeague?.name || "Lig seçiliyor…"}</span><span className="stats-league-season">{data?.season || season || "—"}</span></div>
      <div className="stats-league-meta"><b>{data?.matches ?? "—"} maç</b><span>Tamamlandı</span></div>
    </section>

    {error ? <section className="stats-empty stats-error info-card"><strong>İstatistikler yüklenemedi</strong><p>{error}</p></section>
      : loading || !data ? <section className="stats-empty info-card"><strong>Lig istatistikleri yükleniyor</strong><p>FotMob fikstürü ve maç detayları okunuyor. Devre istatistikleri doğrulandıkça marketler oluşturuluyor.</p></section>
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
