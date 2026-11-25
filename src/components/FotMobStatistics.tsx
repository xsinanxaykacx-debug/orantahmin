import { useEffect, useMemo, useState } from "react";
import "./FotMobStatistics.css";

type Scope = "leagues" | "teams";
type Metric =
  | "xg" | "total-goals" | "ht-ft" | "match-result" | "half-time"
  | "goals-25" | "btts" | "first-second-btts" | "correct-score"
  | "half-time-score" | "under" | "over";
type SortMode = "percentage" | "matches";
type SeasonMode = "current" | "all";

const metricOptions: Array<{ value: Metric; label: string }> = [
  { value: "xg", label: "xG sıralaması" },
  { value: "total-goals", label: "Toplam Gol" },
  { value: "ht-ft", label: "İY / MS" },
  { value: "match-result", label: "Maç Sonucu" },
  { value: "half-time", label: "İlk Yarı" },
  { value: "goals-25", label: "2,5 Alt / Üst" },
  { value: "btts", label: "Karşılıklı Gol" },
  { value: "first-second-btts", label: "1Y / 2Y KG" },
  { value: "correct-score", label: "Maç Skoru" },
  { value: "half-time-score", label: "İY Skoru" },
  { value: "under", label: "Alt" },
  { value: "over", label: "Üst" }
];

type LeagueCatalog = { leagueCount?: number; leagues?: Array<{ id: number; name: string; country: string | null; matchCount: number }> };

export function FotMobStatistics() {
  const [scope, setScope] = useState<Scope>("leagues");
  const [metric, setMetric] = useState<Metric>("btts");
  const [sort, setSort] = useState<SortMode>("percentage");
  const [season, setSeason] = useState<SeasonMode>("current");
  const [minimumMatches, setMinimumMatches] = useState(30);
  const [catalog, setCatalog] = useState<LeagueCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/fotmob-leagues", { signal: controller.signal })
      .then(async response => {
        const payload = await response.json() as LeagueCatalog & { error?: string };
        if (!response.ok) throw new Error(payload.error || "FotMob lig kataloğu alınamadı.");
        setCatalog(payload);
      })
      .catch(reason => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setError(reason instanceof Error ? reason.message : "Lig kataloğu alınamadı.");
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const leagueCount = useMemo(() => catalog?.leagues?.length ?? 0, [catalog]);

  return <div className="stats-page">
    <header className="stats-page-header">
      <div><span className="eyebrow">ORANTAHMİN ANALİZ</span><h2>Lig ve Takım İstatistikleri</h2><p>Sezon sonuçlarını aynı ölçütlerle lig veya takım bazında karşılaştır.</p></div>
      <div className="stats-scan-count"><b>{loading ? "…" : error ? "—" : leagueCount.toLocaleString("tr-TR")}</b><span>FotMob lig kataloğu</span></div>
    </header>

    <section className="stats-controls info-card">
      <div className="stats-control-group">
        <span className="stats-control-label">Kapsam</span>
        <div className="stats-segment">
          <button className={scope === "leagues" ? "active" : ""} onClick={() => setScope("leagues")}>Liglere göre</button>
          <button className={scope === "teams" ? "active" : ""} onClick={() => setScope("teams")}>Takımlara göre</button>
        </div>
      </div>
      <label className="stats-control-group">
        <span className="stats-control-label">İstatistiğe göre</span>
        <select value={metric} onChange={event => setMetric(event.target.value as Metric)}>
          {metricOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="stats-control-group">
        <span className="stats-control-label">Sezon</span>
        <select value={season} onChange={event => setSeason(event.target.value as SeasonMode)}>
          <option value="current">Bu sezon</option>
          <option value="all">Tüm sezonlar</option>
        </select>
      </label>
      <label className="stats-control-group">
        <span className="stats-control-label">Sıralama</span>
        <select value={sort} onChange={event => setSort(event.target.value as SortMode)}>
          <option value="percentage">Orana göre</option>
          <option value="matches">Maç sayısına göre</option>
        </select>
      </label>
      <label className="stats-control-group stats-minimum">
        <span className="stats-control-label">En az maç</span>
        <input type="number" min="1" max="1000" value={minimumMatches} onChange={event => setMinimumMatches(Math.max(1, Math.min(1000, Number(event.target.value) || 1)))} />
      </label>
    </section>

    <section className="stats-results info-card">
      <div className="card-heading"><span>{scope === "leagues" ? "LİG SIRALAMASI" : "TAKIM SIRALAMASI"}</span><small>{metricOptions.find(option => option.value === metric)?.label} · {season === "current" ? "Bu sezon" : "Tüm sezonlar"}</small></div>
      {loading ? <div className="stats-empty">FotMob lig kataloğu yükleniyor…</div>
        : error ? <div className="stats-empty stats-error">{error}</div>
        : <div className="stats-empty">
          <strong>İstatistik tarama motoru henüz bağlanmadı</strong>
          <p>{leagueCount.toLocaleString("tr-TR")} lig kataloğu bulundu. Yüzde ve maç adetleri gerçek sezon sonuçlarından hesaplanacak; kaynakta doğrulanmayan xG, ilk yarı veya oran verileri gösterilmeyecek.</p>
          <small>Seçili filtre: {minimumMatches} maç ve üzeri · {sort === "percentage" ? "Orana göre sıralama" : "Maç sayısına göre sıralama"}</small>
        </div>}
    </section>
    <p className="stats-source-note">Kaynak: FotMob. Katalog sayısı, taranmış sezon veya doğrulanmış istatistik sayısı değildir.</p>
  </div>;
}
