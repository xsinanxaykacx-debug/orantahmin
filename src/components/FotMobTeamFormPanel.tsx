import { useEffect, useState } from "react";
import "./FotMobTeamFormPanel.css";

type FormMatch = { result: "W" | "D" | "L"; score: string | null; scored: number | null; conceded: number | null; opponent: string | null; date: string | null };
type TeamStats = { sampleSize: number; scoredMatches: number; goalsForAvg: number | null; goalsAgainstAvg: number | null; over25Pct: number | null; bttsPct: number | null };
type TeamForm = { name: string; form: FormMatch[]; stats: TeamStats };
type FormResponse = { source: string; available: boolean; home?: TeamForm; away?: TeamForm; reason?: string; error?: string };

function stat(value: number | null, suffix = ""): string {
  return value === null ? "—" : `${value.toLocaleString("tr-TR")}${suffix}`;
}
function parseScore(value: unknown): { scored: number; conceded: number } | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const match = String(value).match(/(\d+)\s*[-–:]\s*(\d+)/);
  return match ? { scored: Number(match[1]), conceded: Number(match[2]) } : null;
}
function normalizeOverviewForm(teamData: any): FormMatch[] {
  const items = teamData?.overview?.form || teamData?.overview?.teamForm;
  if (!Array.isArray(items)) return [];
  return items.map((item: any) => {
    const score = parseScore(item?.score);
    if (!score) return null;
    const rawResult = String(item?.resultString ?? item?.result ?? "").toUpperCase();
    const result: FormMatch["result"] = ["W", "WIN", "1"].includes(rawResult)
      ? "W" : ["D", "DRAW", "0", "X"].includes(rawResult)
        ? "D" : ["L", "LOSS", "-1", "2"].includes(rawResult)
          ? "L" : score.scored > score.conceded ? "W" : score.scored < score.conceded ? "L" : "D";
    const dateValue = item?.date?.utcTime || item?.date || null;
    return {
      result,
      score: String(score.scored) + " - " + String(score.conceded),
      scored: score.scored,
      conceded: score.conceded,
      opponent: typeof item?.opponent === "string" ? item.opponent : item?.opponent?.name || null,
      date: typeof dateValue === "string" ? dateValue : null
    };
  }).filter((item: FormMatch | null): item is FormMatch => item !== null);
}
function mergeRecentForms(primary: FormMatch[], fallback: FormMatch[]): FormMatch[] {
  const merged = [...primary];
  const seen = new Set(merged.map(item => (item.opponent || "").toLocaleLowerCase("tr-TR") + "|" + item.score));
  for (const item of fallback) {
    const key = (item.opponent || "").toLocaleLowerCase("tr-TR") + "|" + item.score;
    if (seen.has(key)) continue;
    merged.push(item);
    seen.add(key);
    if (merged.length === 5) break;
  }
  return merged.slice(0, 5);
}
function FormSquares({ form }: { form: FormMatch[] }) {
  if (!form.length) return <span className="form-no-data">Veri yok</span>;
  return <div className="form-squares">{form.slice(0, 5).map((item, index) => (
    <i key={`${item.date || ""}-${index}`} className={`form-${item.result.toLowerCase()}`} title={`${item.opponent || "Rakip"} · ${item.score || item.result}`}>
      {item.result}
    </i>
  ))}</div>;
}
function TeamStatColumn({ team }: { team: TeamForm }) {
  const stats = [
    { label: "Attığı gol", value: team.stats.goalsForAvg, display: stat(team.stats.goalsForAvg), max: 5, color: "goals-for" },
    { label: "Yediği gol", value: team.stats.goalsAgainstAvg, display: stat(team.stats.goalsAgainstAvg), max: 5, color: "goals-against" },
    { label: "2,5 üst", value: team.stats.over25Pct, display: stat(team.stats.over25Pct, "%"), max: 100, color: "over" },
    { label: "Karşılıklı gol", value: team.stats.bttsPct, display: stat(team.stats.bttsPct, "%"), max: 100, color: "btts" }
  ];
  return <div className="team-stat-column">
    <strong>{team.name}</strong>
    <small>Son {team.stats.sampleSize} maç · skor verisi: {team.stats.scoredMatches}</small>
    <div className="team-stat-bars">{stats.map(item => {
      const width = item.value === null ? 0 : Math.max(0, Math.min(100, (item.value / item.max) * 100));
      return <div className="team-stat-bar" key={item.label}>
        <div className="team-stat-bar-label"><span>{item.label}</span><b>{item.display}</b></div>
        <div className="team-stat-track"><i className={item.color} style={{ width: `${width}%` }} /></div>
      </div>;
    })}</div>
  </div>;
}

export function FotMobTeamFormPanel({ matchId }: { matchId: string | number }) {
  const [data, setData] = useState<FormResponse | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setData(null);
    (async () => {
      try {
        const mapResponse = await fetch("/data/fotmob-event-map.json", { cache: "no-store" });
        if (!mapResponse.ok) throw new Error("FotMob eşleştirme dosyası okunamadı.");
        const eventMap = await mapResponse.json() as { matches: Array<{ mackolikMatchId: string; state: string; fotmobMatchId: number | null }> };
        const mapping = eventMap.matches.find(item => item.mackolikMatchId === String(matchId));
        if (!mapping || mapping.state !== "matched" || !mapping.fotmobMatchId) {
          if (active) setData({ source: "FotMob", available: false, reason: "Bu maç FotMob'da güvenilir biçimde eşleştirilmedi." });
          return;
        }
        const response = await fetch(`/api/fotmob-team-form?matchId=${encodeURIComponent(String(mapping.fotmobMatchId))}`, { cache: "no-store" });
        const payload = await response.json() as FormResponse;
        if (!response.ok) throw new Error(payload.error || `Geçmiş maç verisi alınamadı (HTTP ${response.status}).`);
        if (active && payload?.available && payload.home && payload.away) {
          payload.home.form = mergeRecentForms(payload.home.form || [], normalizeOverviewForm(payload.home));
          payload.away.form = mergeRecentForms(payload.away.form || [], normalizeOverviewForm(payload.away));
          setData(payload);
        } else if (active) {
          setData(payload);
        }
      } catch (error) {
        if (active) setData({ source: "FotMob", available: false, error: error instanceof Error ? error.message : "Veri alınamadı." });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [matchId]);

  if (loading) return <div className="data-empty"><strong>Takım formu yükleniyor</strong><p>FotMob geçmiş maçları getiriliyor…</p></div>;
  if (!data?.available || !data.home || !data.away) return <div className="data-empty"><strong>Geçmiş maç verisi bulunamadı</strong><p>{data?.error || data?.reason || "Bu karşılaşma için doğrulanmış takım formu mevcut değil."}</p></div>;

  return <div className="fotmob-form-panel">
    <section className="info-card form-card">
      <div className="card-heading"><span>SON 5 MAÇ FORMU</span><small>FotMob · tamamlanmış maçlar</small></div>
      <div className="form-columns">
        <div><strong>{data.home.name}</strong><FormSquares form={data.home.form}/></div>
        <div><strong>{data.away.name}</strong><FormSquares form={data.away.form}/></div>
      </div>
    </section>
    <section className="info-card stat-card">
      <div className="card-heading"><span>TAKIM İSTATİSTİKLERİ</span><small>Geçmiş maç verisine göre</small></div>
      <div className="team-stats-grid">
        <TeamStatColumn team={data.home}/>
        <TeamStatColumn team={data.away}/>
      </div>
      <p className="data-footnote">Gol ortalamaları maç başınadır. Yüzdeler, skoru bulunan maçlar içindeki 2,5 üst ve karşılıklı gol oranıdır; örneklem sayısı takımın altında gösterilir.</p>
    </section>
  </div>;
}
