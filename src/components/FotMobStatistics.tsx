import { useEffect, useMemo, useState } from "react";
import "./FotMobStatistics.css";

type Scope = "leagues" | "teams";
type Metric =
  | "xg" | "total-goals" | "ht-ft" | "match-result" | "half-time"
  | "goals-25" | "btts" | "first-second-btts" | "correct-score"
  | "half-time-score" | "under" | "over";
type SortMode = "percentage" | "matches";
type SeasonMode = "current" | "last2" | "last3" | "all";
type MetricValue = { value: number | null; label: string; detail: string };
type Stats = Record<string, MetricValue>;
type LeagueRow = { id: number; name: string; country: string | null; matches: number; season: string; metrics: Stats };
type TeamRow = { id: number; name: string; leagueId: number; leagueName: string; country: string | null; matches: number; metrics: Stats };
type Batch = { totalLeagues: number; scannedLeagues: number; scannedMatches: number; season: SeasonMode; leagues: LeagueRow[]; teams: TeamRow[] };

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
const unavailableMetrics: Partial<Record<Metric, string>> = {
  "ht-ft": "İlk yarı ve maç sonu kombinasyonu için her karşılaşmanın devre skoru gerekir. FotMob bunu sezon lig özetinde toplu vermiyor.",
  "half-time": "İlk yarı sonuçları maç detayındaki olay akışından hesaplanır; toplu sezon verisi henüz bağlanmadı.",
  "first-second-btts": "İlk ve ikinci yarıda karşılıklı gol hesabı maç bazlı devre olayları gerektirir.",
  "half-time-score": "İlk yarı skorları maç bazlı detay verisi gerektirir."
};
const supportedPercentMetrics: Metric[] = ["match-result", "goals-25", "btts", "correct-score", "under", "over"];

function formatValue(metric: Metric, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (supportedPercentMetrics.includes(metric)) return `${value.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  return value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function FotMobStatistics() {
  const [scope, setScope] = useState<Scope>("leagues");
  const [metric, setMetric] = useState<Metric>("btts");
  const [sort, setSort] = useState<SortMode>("percentage");
  const [season, setSeason] = useState<SeasonMode>("current");
  const [minimumMatches, setMinimumMatches] = useState(30);
  const [leagues, setLeagues] = useState<LeagueRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [totalLeagues, setTotalLeagues] = useState(0);
  const [scannedLeagues, setScannedLeagues] = useState(0);
  const [scannedMatches, setScannedMatches] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLeagues([]);
    setTeams([]);
    setScannedLeagues(0);
    setScannedMatches(0);
    setError(null);
    setLoading(true);
    const load = async () => {
      try {
        const pageSize = season === "all" ? 5 : 10;
        let total = 0;
        for (let offset = 0; active; offset += pageSize) {
          const response = await fetch(`/api/fotmob-statistics?offset=${offset}&limit=${pageSize}&season=${season}`, { signal: controller.signal });
          const payload = await response.json() as Batch & { error?: string };
          if (!response.ok) throw new Error(payload.error || "FotMob istatistikleri alınamadı.");
          if (!active) return;
          total = payload.totalLeagues || total;
          setTotalLeagues(total);
          setLeagues(previous => [...previous, ...(payload.leagues || [])]);
          setTeams(previous => [...previous, ...(payload.teams || [])]);
          setScannedLeagues(previous => previous + (payload.scannedLeagues || 0));
          setScannedMatches(previous => previous + (payload.scannedMatches || 0));
          if (offset + pageSize >= total) break;
        }
      } catch (reason) {
        if (active && !(reason instanceof DOMException && reason.name === "AbortError")) {
          setError(reason instanceof Error ? reason.message : "İstatistik taraması başarısız.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; controller.abort(); };
  }, [season]);

  const sourceRows = scope === "leagues" ? leagues : teams;
  const visibleRows = useMemo(() => sourceRows
    .filter(row => row.matches >= minimumMatches && row.metrics[metric]?.value !== null && row.metrics[metric]?.value !== undefined)
    .sort((a, b) => sort === "matches"
      ? b.matches - a.matches || (b.metrics[metric].value || 0) - (a.metrics[metric].value || 0)
      : (b.metrics[metric].value || 0) - (a.metrics[metric].value || 0) || b.matches - a.matches),
  [sourceRows, minimumMatches, metric, sort]);
  const currentMetricLabel = metricOptions.find(option => option.value === metric)?.label || "İstatistik";

  return <div className="stats-page">
    <header className="stats-page-header">
      <div><span className="eyebrow">ORANTAHMİN ANALİZ</span><h2>Lig ve Takım İstatistikleri</h2><p>FotMob sezon sonuçlarından hesaplanan lig ve takım performans sıralamaları.</p></div>
      <div className="stats-scan-count"><b>{loading ? `${scannedLeagues.toLocaleString("tr-TR")} / ${totalLeagues || "…"}` : error ? "—" : scannedLeagues.toLocaleString("tr-TR")}</b><span>Taranan lig</span></div>
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
          <option value="last2">Son 2 sezon</option>
          <option value="last3">Son 3 sezon</option>
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
      <div className="card-heading"><span>{scope === "leagues" ? "LİG SIRALAMASI" : "TAKIM SIRALAMASI"}</span><small>{currentMetricLabel} · {season === "current" ? "Bu sezon" : season === "last2" ? "Son 2 sezon" : season === "last3" ? "Son 3 sezon" : "Tüm sezonlar"}</small></div>
      {unavailableMetrics[metric] ? <div className="stats-empty"><strong>Bu istatistik için ek veri gerekiyor</strong><p>{unavailableMetrics[metric]}</p><small>Kaynakta doğrulanmayan devre sonuçları tahmin edilmez.</small></div>
        : <><div className="stats-scan-progress"><span>{scannedMatches.toLocaleString("tr-TR")} tamamlanmış maç tarandı</span><span>{loading ? "Tarama sürüyor…" : `${visibleRows.length.toLocaleString("tr-TR")} sonuç`}</span></div>
          {loading && <div className="stats-progress-track"><i style={{ width: `${totalLeagues ? Math.min(100, scannedLeagues / totalLeagues * 100) : 0}%` }} /></div>}
          {error ? <div className="stats-empty stats-error"><strong>Tarama kısmen durdu</strong><p>{error}</p><small>Şu ana kadar alınan sonuçlar korunuyor.</small></div>
            : visibleRows.length ? <div className="stats-table-scroll"><table className="stats-table">
              <thead><tr><th>#</th><th>{scope === "leagues" ? "Lig" : "Takım"}</th><th>{scope === "leagues" ? "Ülke" : "Lig"}</th><th>Maç</th><th>Öne çıkan sonuç</th><th>Değer</th><th>Detay</th></tr></thead>
              <tbody>{visibleRows.map((row, index) => {
                const metricValue = row.metrics[metric];
                return <tr key={scope === "leagues" ? `l-${row.id}` : `t-${(row as TeamRow).leagueId}-${row.id}`}>
                  <td>{index + 1}</td><td className="stats-entity-name">{row.name}</td><td>{scope === "leagues" ? row.country || "Uluslararası" : (row as TeamRow).leagueName}</td><td>{row.matches}</td><td><b>{metricValue.label}</b></td><td className="stats-value">{formatValue(metric, metricValue.value)}</td><td className="stats-detail">{metricValue.detail}</td>
                </tr>;
              })}</tbody>
            </table></div>
            : <div className="stats-empty"><strong>{loading ? "İstatistikler taranıyor" : "Filtreye uygun sonuç bulunamadı"}</strong><p>{loading ? "Seçili sezon aralığındaki FotMob ligleri sırayla okunuyor. Tarama tamamlandıkça sıralama burada oluşacak." : `${scannedLeagues.toLocaleString("tr-TR")} lig tarandı; en az ${minimumMatches} maç şartını karşılayan ve seçili ölçümde doğrulanmış veri içeren kayıt bulunamadı.`}</p></div>}
        </>}
    </section>
    <p className="stats-source-note">Kaynak: FotMob sezon fikstürleri ve takım istatistikleri. Katalogdaki lig sayısı taranan lig sayısı değildir; yalnızca tamamlanmış ve skoru doğrulanmış maçlar hesaba katılır.</p>
  </div>;
}
