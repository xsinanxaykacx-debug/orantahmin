import { memo, useEffect, useMemo, useState } from "react";
import { OddsService } from "./services/mackolikOddsService";
import type { BulletinDocument, BulletinMatch, MatchDetailTab, MatchFields } from "./types/match";
import { dedupeByMatchId, isValidOdds, uniqueOdds } from "./utils/bulletinUtils";
import "./index.css";
import { FotMobLineupPanel } from "./components/FotMobLineupPanel";
import { FotMobTeamFormPanel } from "./components/FotMobTeamFormPanel";
import { FotMobLeagueHub, type LeagueSummary } from "./components/FotMobLeagueHub";
import { settleMarketOutcome, type MatchResult } from "./utils/marketSettlement";

type DisplayMatch = BulletinMatch & { sourceRecords: BulletinMatch[] };
type StatusFilter = "all" | "live" | "finished";
type MarketSelection = { label: string; field: keyof MatchFields };
type MarketDefinition = { key: string; title: string; selections: MarketSelection[] };
type NavItem = { id: "matches" | "leagues" | "settings"; label: string; icon: string };

const navItems: NavItem[] = [
  { id: "matches", label: "Maç Merkezi", icon: "▦" },
  { id: "leagues", label: "Ligler", icon: "▤" },
  { id: "settings", label: "Ayarlar", icon: "⚙" }
];
const detailTabs: { id: MatchDetailTab; label: string }[] = [
  { id: "overview", label: "Genel Bakış" },
  { id: "odds", label: "Oran Analizi" },
  { id: "squad", label: "Kadro" },
  { id: "ai", label: "AI Tahmin" }
];
const markets: MarketDefinition[] = [
  { key: "ms", title: "Maç Sonucu", selections: [{ label: "1", field: "ms1" }, { label: "X", field: "msX" }, { label: "2", field: "ms2" }] },
  { key: "double-chance", title: "Çifte Şans", selections: [{ label: "1X", field: "doubleChance1X" }, { label: "12", field: "doubleChance12" }, { label: "X2", field: "doubleChanceX2" }] },
  { key: "goals-25", title: "2,5 Gol", selections: [{ label: "Alt", field: "goals25Under" }, { label: "Üst", field: "goals25Over" }] },
  { key: "half-time", title: "İlk Yarı Sonucu", selections: [{ label: "1", field: "halfTimeResult1" }, { label: "X", field: "halfTimeResultX" }, { label: "2", field: "halfTimeResult2" }] },
  { key: "total-goals", title: "Toplam Gol", selections: [{ label: "0–1", field: "totalGoals01" }, { label: "2–3", field: "totalGoals23" }, { label: "4–6", field: "totalGoals46" }, { label: "7+", field: "totalGoals7Plus" }] },
  { key: "btts", title: "Karşılıklı Gol", selections: [{ label: "Var", field: "bttsYes" }, { label: "Yok", field: "bttsNo" }] },
  { key: "goals-15", title: "1,5 Gol", selections: [{ label: "Alt", field: "goals15Under" }, { label: "Üst", field: "goals15Over" }] },
  { key: "goals-35", title: "3,5 Gol", selections: [{ label: "Alt", field: "goals35Under" }, { label: "Üst", field: "goals35Over" }] },
  { key: "half-time-goals-15", title: "İY 1,5 Gol", selections: [{ label: "Alt", field: "halfTimeGoals15Under" }, { label: "Üst", field: "halfTimeGoals15Over" }] }
];

function TeamCrest({ id, name, large = false }: { id?: number | null; name: string; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const className = large ? "detail-crest" : "team-crest";
  return <span className={className}>
    {id && !failed ? <img src={`https://images.fotmob.com/image_resources/logo/teamlogo/${id}.png`} alt="" loading="lazy" onError={() => setFailed(true)} /> : name.trim().slice(0, 1).toLocaleUpperCase("tr-TR") || "?"}
  </span>;
}
function safeTeamName(value: string | null | undefined): string {
  return value?.trim() || "Takım bilgisi yok";
}
function safeOdds(value: unknown): string {
  return isValidOdds(value) ? value.toFixed(2).replace(".", ",") : "—";
}
function dateTimeKey(match: DisplayMatch): string {
  const [day = "", month = "", year = ""] = (match.date || "").split(".");
  return `${year}-${month}-${day}T${match.time || "00:00"}`;
}
function formatDate(value: string): string {
  if (!value) return "Tarih bilgisi yok";
  const [day, month, year] = value.split(".");
  return day && month && year ? `${day} ${month} ${year}` : value;
}
function getOdds(match: DisplayMatch, field: keyof MatchFields): number[] {
  return uniqueOdds(match.sourceRecords.map((record) => record.fields?.[field]));
}
 type FotMobMatchState = { started: boolean; finished: boolean; homeScore?: number | null; awayScore?: number | null; minute?: string | null; status?: string | null };
function isLiveMatch(status: number, fotmob?: FotMobMatchState): boolean {
  // FotMob can return a fixture without reliable started/finished flags.
  // Only let a positive FotMob state override the Mackolik status.
  if (fotmob?.finished) return false;
  if (fotmob?.started) return true;
  return status > 0 && status < 4;
}
function isFinishedMatch(status: number, fotmob?: FotMobMatchState): boolean {
  // A confirmed live state must not be classified as finished.
  if (fotmob?.finished) return true;
  if (fotmob?.started) return false;
  return status >= 4;
}
function statusLabel(status: number, fotmob?: FotMobMatchState): string {
  if (isFinishedMatch(status, fotmob)) return "Tamamlandı";
  if (isLiveMatch(status, fotmob)) return "Canlı";
  return "Başlamadı";
}
function matchKey(match: DisplayMatch): string {
  return String(match.matchId);
}

const MatchRow = memo(function MatchRow({
  match, active, onSelect, homeLogo, awayLogo, fotmobStatus
}: { match: DisplayMatch; active: boolean; onSelect: (id: string) => void; homeLogo?: number | null; awayLogo?: number | null; fotmobStatus?: FotMobMatchState }) {
  const homeOdds = getOdds(match, "ms1");
  const drawOdds = getOdds(match, "msX");
  const awayOdds = getOdds(match, "ms2");
  const homeScore = fotmobStatus?.homeScore ?? match.fields.scoreHome;
  const awayScore = fotmobStatus?.awayScore ?? match.fields.scoreAway;
  const hasScore = homeScore !== null && homeScore !== undefined && awayScore !== null && awayScore !== undefined && String(homeScore) !== "" && String(awayScore) !== "";
  const hasMissingName = !match.homeName?.trim() || !match.awayName?.trim();
  return (
    <button type="button" className={`match-row ${active ? "selected" : ""}`} onClick={() => onSelect(matchKey(match))}>
      <div className="match-row-top">
        <span>{match.time || "Saat yok"}</span>
        <span className={`match-state ${isLiveMatch(match.status, fotmobStatus) ? "live" : ""}`}>{isLiveMatch(match.status, fotmobStatus) && fotmobStatus?.minute ? fotmobStatus.minute : statusLabel(match.status, fotmobStatus)}</span>
      </div>
      <div className="match-row-content">
        <div className="teams-stack">
          <div className="team-line"><TeamCrest id={homeLogo} name={match.homeName || ""} /><strong>{safeTeamName(match.homeName)}</strong></div>
          <div className="team-line"><TeamCrest id={awayLogo} name={match.awayName || ""} /><strong>{safeTeamName(match.awayName)}</strong></div>
        </div>
        <span className="match-row-score">{hasScore ? `${homeScore} – ${awayScore}` : "—"}</span>
        <div className="row-odds">
          <span className="odds-caption">1 · X · 2</span>
          <div><b>{homeOdds.map(safeOdds).join("/") || "—"}</b><b>{drawOdds.map(safeOdds).join("/") || "—"}</b><b>{awayOdds.map(safeOdds).join("/") || "—"}</b></div>
          <small>Kaynak oranı</small>
        </div>
      </div>
      {hasMissingName && <span className="missing-inline">Eksik takım verisi</span>}
    </button>
  );
});

function MarketCard({ market, match }: { market: MarketDefinition; match: DisplayMatch }) {
  const available = market.selections.some((selection) => getOdds(match, selection.field).length > 0);
  return (
    <section className={`market-card ${available ? "" : "is-empty"}`}>
      <div className="market-card-title">{market.title}<span>{available ? "Kaynak oranı" : "Veri yok"}</span></div>
      <div className="market-values">
        {market.selections.map(({ label, field }) => (
          <div className="market-value" key={field}><span>{label}</span><strong>{getOdds(match, field).map(safeOdds).join(" / ") || "—"}</strong></div>
        ))}
      </div>
    </section>
  );
}

function EmptyData({ title, description }: { title: string; description: string }) {
  return <div className="data-empty"><span className="empty-symbol">⌁</span><strong>{title}</strong><p>{description}</p></div>;
}

function Overview({ match, fotmobStatus }: { match: DisplayMatch; fotmobStatus?: FotMobMatchState }) {
  const homeScore = fotmobStatus?.homeScore ?? match.fields.scoreHome;
  const awayScore = fotmobStatus?.awayScore ?? match.fields.scoreAway;
  const hasScore = homeScore !== null && homeScore !== undefined && awayScore !== null && awayScore !== undefined &&
    String(homeScore) !== "" && String(awayScore) !== "";
  return (
    <div className="detail-content">
      <div className="overview-cards">
        <article className="info-card">
          <div className="card-heading"><span>MAÇ BİLGİSİ</span><small>Kaynakta bulunan alanlar</small></div>
          <div className="info-grid">
            <div><span>Lig kodu</span><strong>{match.fields.leagueCode || "—"}</strong></div>
            <div><span>Başlangıç</span><strong>{match.time || "—"}</strong></div>
            <div><span>Durum</span><strong>{statusLabel(match.status, fotmobStatus)}</strong></div>
            <div><span>Skor</span><strong>{hasScore ? `${homeScore} – ${awayScore}` : "—"}</strong></div>
            <div><span>Hakem</span><strong>Veri yok</strong></div>
            <div><span>Hava durumu</span><strong>Veri yok</strong></div>
          </div>
        </article>
        <FotMobTeamFormPanel matchId={match.matchId} />
      </div>
      <section className="info-card">
        <div className="card-heading"><span>MEVCUT ORANLAR</span><small>Orijinal market alanlarından</small></div>
        <div className="market-grid-detail">{markets.map((market) => <MarketCard key={market.key} market={market} match={match} />)}</div>
      </section>
    </div>
  );
}

type MackolikMarket = {
  name: string;
  code: string;
  outcomes: Array<{ name: string; odd: number | null; rawOdd: string }>;
};
type MackolikMarketsResponse = {
  available?: boolean;
  markets?: MackolikMarket[];
  marketCount?: number;
  reason?: string;
  error?: string;
  fetchedAt?: string;
};

function MackolikMarketCard({ market, result }: { market: MackolikMarket; result: MatchResult | null }) {
  const available = market.outcomes.some(outcome => outcome.odd !== null);
  return (
    <section className={`market-card ${available ? "" : "is-empty"}`}>
      <div className="market-card-title">{market.name}<span>{available ? `Mackolik · ${market.code}` : "Oran yok"}</span></div>
      <div className="market-values">
        {market.outcomes.map((outcome, index) => (
          {(() => {
            const settlement = outcome.odd !== null ? settleMarketOutcome(market.name, outcome.name, result) : "unknown";
            return <div className={`market-value ${settlement === "won" ? "is-winner" : settlement === "lost" ? "is-loser" : ""}`} key={`${market.code}-${index}`}>
              <span>{outcome.name}</span>
              <strong>{outcome.odd !== null ? outcome.odd.toFixed(2).replace(".", ",") : "—"}</strong>
              {settlement !== "unknown" && <em className="settlement-label">{settlement === "won" ? "Kazandı" : "Kaybetti"}</em>}
            </div>;
          })()}
        ))}
      </div>
    </section>
  );
}

function OddsAnalysis({ match, fotmobStatus }: { match: DisplayMatch; fotmobStatus?: FotMobMatchState }) {
  const finished = isFinishedMatch(match.status, fotmobStatus);
  const homeScore = fotmobStatus?.homeScore ?? match.fields.scoreHome;
  const awayScore = fotmobStatus?.awayScore ?? match.fields.scoreAway;
  const parsedHome = homeScore === null || homeScore === undefined || String(homeScore).trim() === "" ? NaN : Number(homeScore);
  const parsedAway = awayScore === null || awayScore === undefined || String(awayScore).trim() === "" ? NaN : Number(awayScore);
  const result: MatchResult | null = finished && Number.isFinite(parsedHome) && Number.isFinite(parsedAway)
    ? { home: parsedHome, away: parsedAway, finished: true }
    : null;
  const [sourceMarkets, setSourceMarkets] = useState<MackolikMarket[]>([]);
  const [loadingMarkets, setLoadingMarkets] = useState(true);
  const [marketError, setMarketError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingMarkets(true);
    setMarketError(null);
    setSourceMarkets([]);

    fetch(`/api/mackolik-markets?matchId=${encodeURIComponent(String(match.matchId))}`, {
      cache: "no-store",
      signal: controller.signal
    })
      .then(async response => {
        const payload = await response.json() as MackolikMarketsResponse;
        if (!response.ok) throw new Error(payload.error || "Mackolik marketleri alınamadı.");
        if (!payload.available || !Array.isArray(payload.markets) || payload.markets.length === 0) {
          throw new Error(payload.reason || "Bu maç için ek market verisi bulunamadı.");
        }
        setSourceMarkets(payload.markets);
      })
      .catch(reason => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setMarketError(reason instanceof Error ? reason.message : "Mackolik marketleri alınamadı.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingMarkets(false);
      });

    return () => controller.abort();
  }, [match.matchId]);

  return (
    <div className="detail-content">
      <div className="section-intro">
        <div><span className="eyebrow">PİYASA VERİSİ</span><h3>Oran analizi</h3></div>
        <p>Biten maçlarda doğrulanabilen kazanan marketler yeşil, kaybedenler kırmızı gösterilir. İlk yarı ve özel istatistik marketleri ilgili sonuç verisi yoksa renklendirilmez.</p>
      </div>
      {loadingMarkets ? (
        <EmptyData title="Mackolik marketleri yükleniyor" description="Maçın oran detayları kaynaktan okunuyor." />
      ) : sourceMarkets.length > 0 ? (
        <div className="market-grid-detail">
          {sourceMarkets.map(market => <MackolikMarketCard key={market.code} market={market} result={result} />)}
        </div>
      ) : (
        <>
          {marketError && <div className="data-empty"><strong>Ek market verisi alınamadı</strong><p>{marketError} Mevcut bülten oranları gösteriliyor.</p></div>}
          <div className="market-grid-detail">{markets.map(market => <MarketCard key={market.key} market={market} match={match} />)}</div>
        </>
      )}
    </div>
  );
}

function DetailPlaceholder() {
  return <div className="placeholder-wrap"><EmptyData title="AI tahmini oluşturulmadı" description="Bu sürüm tahmin üretmez. Kaynak dışı olasılık veya sonuç uydurulmaz." /></div>;
}

function MatchDetail({ match, tab, onTabChange, homeLogo, awayLogo, fotmobStatus }: {
  match: DisplayMatch; tab: MatchDetailTab; onTabChange: (tab: MatchDetailTab) => void; homeLogo?: number | null; awayLogo?: number | null; fotmobStatus?: FotMobMatchState;
}) {
  const homeScore = fotmobStatus?.homeScore ?? match.fields.scoreHome;
  const awayScore = fotmobStatus?.awayScore ?? match.fields.scoreAway;
  const hasScore = homeScore !== null && homeScore !== undefined && awayScore !== null && awayScore !== undefined &&
    String(homeScore) !== "" && String(awayScore) !== "";
  return (
    <div className="detail-pane-inner">
      <header className="detail-header">
        <div className="detail-meta"><span>{formatDate(match.date)} · {match.time || "Saat yok"}</span><b>{match.fields.leagueCode || "Lig kodu bulunmuyor"}</b></div>
        <div className="versus-header">
          <div className="detail-team"><TeamCrest id={homeLogo} name={match.homeName || ""} large /><strong>{safeTeamName(match.homeName)}</strong><small>Ev sahibi</small></div>
          <div className="match-center"><span>{hasScore ? "MAÇ SKORU" : "BAŞLANGICA KALAN"}</span><strong>{hasScore ? `${homeScore} : ${awayScore}` : "— : —"}</strong><small>{fotmobStatus?.minute && isLiveMatch(match.status, fotmobStatus) ? fotmobStatus.minute : statusLabel(match.status, fotmobStatus)}</small></div>
          <div className="detail-team"><TeamCrest id={awayLogo} name={match.awayName || ""} large /><strong>{safeTeamName(match.awayName)}</strong><small>Deplasman</small></div>
        </div>
      </header>
      <nav className="detail-tabs" aria-label="Maç detay sekmeleri">
        {detailTabs.map((item) => <button type="button" key={item.id} className={tab === item.id ? "active" : ""} onClick={() => onTabChange(item.id)}>{item.label}</button>)}
      </nav>
      {tab === "overview" ? <Overview match={match} fotmobStatus={fotmobStatus} /> : tab === "odds" ? <OddsAnalysis match={match} fotmobStatus={fotmobStatus} /> : tab === "squad" ? <FotMobLineupPanel matchId={match.matchId} /> : <DetailPlaceholder />}
    </div>
  );
}

function App() {
  const [bulletin, setBulletin] = useState<BulletinDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<NavItem["id"]>("matches");
  const [leagueDirectory, setLeagueDirectory] = useState<LeagueSummary[]>([]);
  const [leagueDirectoryLoading, setLeagueDirectoryLoading] = useState(false);
  const [leagueDirectoryError, setLeagueDirectoryError] = useState<string | null>(null);
  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MatchDetailTab>("overview");
  const [liveScores, setLiveScores] = useState<Map<string, FotMobMatchState>>(new Map());

  useEffect(() => {
    let active = true;
    OddsService.getBulletin().then((result) => {
      if (active) setBulletin(result);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Bülten yüklenemedi.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (leagueDirectory.length > 0) return;
    let active = true;
    setLeagueDirectoryLoading(true);
    setLeagueDirectoryError(null);
    fetch("/api/fotmob-leagues")
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Lig listesi alınamadı.");
        return payload as { leagues?: LeagueSummary[] };
      })
      .then(payload => {
        if (!active) return;
        const leagues = payload.leagues || [];
        setLeagueDirectory(leagues);
        setSelectedLeagueId(current => current && leagues.some(league => league.id === current) ? current : leagues.find(league => league.matchCount > 0)?.id ?? leagues[0]?.id ?? null);
      })
      .catch(reason => { if (active) setLeagueDirectoryError(reason instanceof Error ? reason.message : "Lig listesi alınamadı."); })
      .finally(() => { if (active) setLeagueDirectoryLoading(false); });
    return () => { active = false; };
  }, [activeNav, leagueDirectory.length]);

  useEffect(() => {
    const today = new Intl.DateTimeFormat("tr-TR", {
      timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric"
    }).format(new Date());
    const ids = [...new Set(leagueDirectory.flatMap(league => (league.matches || [])
      .filter(match => !match.finished && (match.started || match.date === today))
      .map(match => Number(match.fotmobMatchId))
      .filter(id => Number.isSafeInteger(id) && id > 0)))];
    if (!ids.length) return;
    let stopped = false;
    let controller: AbortController | null = null;
    let interval: number | null = null;
    const pendingIds = new Set(ids);
    const refresh = async () => {
      if (stopped || document.visibilityState === "hidden" || pendingIds.size === 0) return;
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch(`/api/fotmob-live?ids=${[...pendingIds].join(",")}`, {
          cache: "no-store", signal: controller.signal
        });
        if (!response.ok) throw new Error("Canlı skorlar güncellenemedi.");
        const payload = await response.json() as { matches?: Array<{ fotmobMatchId: number; homeScore: number | null; awayScore: number | null; started: boolean; finished: boolean; status: string | null; minute: string | null }> };
        if (stopped) return;
        for (const item of payload.matches || []) if (item.finished) pendingIds.delete(item.fotmobMatchId);
        setLiveScores(previous => {
          const next = new Map(previous);
          const idMap = new Map<number, string>();
          for (const league of leagueDirectory) for (const match of league.matches || []) {
            idMap.set(match.fotmobMatchId, String(match.mackolikMatchId));
          }
          for (const item of payload.matches || []) {
            const matchId = idMap.get(item.fotmobMatchId);
            if (matchId) next.set(matchId, item);
          }
          return next;
        });
        if (pendingIds.size === 0 && interval !== null) window.clearInterval(interval);
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) console.warn("FotMob canlı skor yenileme:", reason);
      }
    };
    const onVisibilityChange = () => { if (document.visibilityState === "visible") void refresh(); };
    const onPageHide = () => {
      stopped = true;
      controller?.abort();
      if (interval !== null) window.clearInterval(interval);
    };
    void refresh();
    interval = window.setInterval(() => { void refresh(); }, 60_000);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      stopped = true;
      controller?.abort();
      if (interval !== null) window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [leagueDirectory]);

  const matches = useMemo<DisplayMatch[]>(() => dedupeByMatchId(bulletin?.matches ?? []), [bulletin]);
  const teamLogosByMatch = useMemo(() => {
    const map = new Map<string, { home: number | null; away: number | null; homeName: string | null; awayName: string | null } & FotMobMatchState>();
    for (const league of leagueDirectory) for (const match of league.matches || []) {
      map.set(String(match.mackolikMatchId), {
        home: match.homeTeamId || null,
        away: match.awayTeamId || null,
        homeName: match.home?.trim() || null,
        awayName: match.away?.trim() || null,
        started: Boolean(match.started),
        finished: Boolean(match.finished),
        homeScore: match.homeScore ?? null,
        awayScore: match.awayScore ?? null,
        status: match.status ?? null
      });
    }
    for (const [matchId, score] of liveScores) {
      const existing = map.get(matchId);
      if (existing) map.set(matchId, { ...existing, ...score });
    }
    return map;
  }, [leagueDirectory, liveScores]);
  const displayMatches = useMemo(() => matches.map(match => {
    const fotmob = teamLogosByMatch.get(String(match.matchId));
    return { ...match, homeName: fotmob?.homeName || match.homeName, awayName: fotmob?.awayName || match.awayName };
  }), [matches, teamLogosByMatch]);

  const filteredMatches = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    return displayMatches.filter((match) => {
      const fotmobStatus = teamLogosByMatch.get(String(match.matchId));
      const live = isLiveMatch(match.status, fotmobStatus);
      if (statusFilter === "live" && !live) return false;
      const finished = isFinishedMatch(match.status, fotmobStatus);
      if (statusFilter === "finished" && !finished) return false;
      if (!query) return true;
      return [match.homeName, match.awayName, match.fields.leagueCode, String(match.matchId)]
        .some((value) => String(value ?? "").toLocaleLowerCase("tr-TR").includes(query));
    }).sort((a, b) => statusFilter === "finished"
      ? dateTimeKey(b).localeCompare(dateTimeKey(a))
      : dateTimeKey(a).localeCompare(dateTimeKey(b)));
  }, [displayMatches, statusFilter, search, teamLogosByMatch]);

  const leagueGroups = useMemo(() => {
    const groups = new Map<string, DisplayMatch[]>();
    for (const match of filteredMatches) {
      const league = match.fields.leagueCode?.trim() || "Lig kodu bulunmuyor";
      const group = groups.get(league);
      if (group) group.push(match);
      else groups.set(league, [match]);
    }
    return [...groups.entries()];
  }, [filteredMatches]);

  const selectedMatchLogos = selectedId ? teamLogosByMatch.get(selectedId) : undefined;
  const selectedMatchFotMobStatus = selectedMatchLogos;
  const selectedMatch = useMemo(
    () => displayMatches.find((match) => String(match.matchId) === selectedId) ?? null,
    [displayMatches, selectedId]
  );
  const filteredLeagues = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    return leagueDirectory.filter(league => !query || [league.name, league.country].some(value => String(value || "").toLocaleLowerCase("tr-TR").includes(query)));
  }, [leagueDirectory, search]);
  const selectedLeague = useMemo(
    () => leagueDirectory.find(league => league.id === selectedLeagueId) ?? null,
    [leagueDirectory, selectedLeagueId]
  );

  const liveCount = useMemo(() => matches.filter((match) => {
    const fotmobStatus = teamLogosByMatch.get(String(match.matchId));
    return isLiveMatch(match.status, fotmobStatus);
  }).length, [matches, teamLogosByMatch]);
  const finishedCount = useMemo(() => matches.filter((match) => {
    const fotmobStatus = teamLogosByMatch.get(String(match.matchId));
    return isFinishedMatch(match.status, fotmobStatus);
  }).length, [matches, teamLogosByMatch]);
  const visibleCount = filteredMatches.length;

  useEffect(() => {
    if (selectedId && !matches.some((match) => String(match.matchId) === selectedId)) setSelectedId(null);
  }, [matches, selectedId]);

  function selectMatch(id: string) {
    setSelectedId(id);
    setActiveTab("overview");
    setActiveNav("matches");
  }

  function selectLeague(id: number) {
    setSelectedLeagueId(id);
    setActiveNav("leagues");
  }

  return (
    <div className="dashboard-shell">
      <aside className="icon-rail">
        <div className="rail-brand">O</div>
        <div className="rail-nav">
          {navItems.map((item) => <button type="button" key={item.id} title={item.label} aria-label={item.label} className={activeNav === item.id ? "active" : ""} onClick={() => setActiveNav(item.id)}><span>{item.icon}</span></button>)}
        </div>
        
      </aside>

      <aside className="match-list-pane">
        <div className="list-header">
          <div className="brand-line"><div><span className="eyebrow">ORANTAHMİN</span><h1>{activeNav === "matches" ? "Maç Merkezi" : activeNav === "leagues" ? "Ligler" : "Ayarlar"}</h1></div><span className="count-pill">{activeNav === "leagues" ? leagueDirectory.length : matches.length}</span></div>
          {activeNav === "matches" && <div className="status-filters">
            <button className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")}>Tümü <b>{matches.length}</b></button>
            <button className={statusFilter === "live" ? "active" : ""} onClick={() => setStatusFilter("live")}>Canlı <b>{liveCount}</b></button>
            <button className={statusFilter === "finished" ? "active" : ""} onClick={() => setStatusFilter("finished")}>Biten <b>{finishedCount}</b></button>
          </div>}
          <label className="match-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={activeNav === "leagues" ? "Lig veya ülke ara..." : "Takım, lig veya maç ara..."} /><kbd>/</kbd></label>
          <div className="list-caption"><span>{activeNav === "leagues" ? "FotMob lig kataloğu" : statusFilter === "finished" ? `${visibleCount} biten maç` : `${visibleCount} karşılaşma`}</span><span>{activeNav === "leagues" ? `${leagueDirectory.filter(league => league.matchCount > 0).length} eşleşen · ${leagueDirectory.reduce((sum, league) => sum + league.matchCount, 0)} maç` : matches.length + " benzersiz maç"}</span></div>
        </div>

        {activeNav === "leagues" ? <div className="league-directory-scroll">
          {leagueDirectoryLoading ? <div className="league-directory-empty">FotMob lig kataloğu yükleniyor…</div>
            : leagueDirectoryError ? <div className="league-directory-empty">{leagueDirectoryError}</div>
            : filteredLeagues.length === 0 ? <div className="league-directory-empty">Aramayla eşleşen lig bulunamadı.</div>
            : filteredLeagues.map(league => <button type="button" key={league.id} className={selectedLeagueId === league.id ? "league-directory-item active" : "league-directory-item"} onClick={() => selectLeague(league.id)}>
              <span className="league-directory-logo">{league.name.slice(0, 1).toLocaleUpperCase("tr-TR")}<img src={league.logo} alt="" onError={event => { event.currentTarget.style.display = "none"; }} /></span>
              <span className="league-directory-name"><b>{league.name}</b><small>{league.country || "Uluslararası"}</small></span>
              <span className="league-directory-count">{league.matchCount}</span>
            </button>)}
        </div> : activeNav === "matches" ? <div className="match-list-scroll">
          {loading ? <div className="list-message">Bülten yükleniyor…</div>
            : error ? <div className="list-message error-text">{error}</div>
            : filteredMatches.length === 0 ? <div className="list-message">{statusFilter === "finished" ? "Tamamlanmış maç bulunamadı." : statusFilter === "live" ? "Şu anda canlı maç bulunamadı." : "Eşleşen maç bulunamadı."}</div>
            : leagueGroups.map(([league, group]) => (
              <section className="league-group" key={league}>
                <div className="league-heading"><span className="league-dot" />{league}<b>{group.length}</b></div>
                {group.map((match) => <MatchRow key={String(match.matchId)} match={match} active={String(match.matchId) === selectedId} onSelect={selectMatch} homeLogo={teamLogosByMatch.get(String(match.matchId))?.home} awayLogo={teamLogosByMatch.get(String(match.matchId))?.away} fotmobStatus={teamLogosByMatch.get(String(match.matchId))} />)}
              </section>
            ))}
        </div> : <div className="league-directory-empty">Ayarlar</div>}
      </aside>

      <main className="detail-pane">
        {loading ? <EmptyData title="Bülten yükleniyor" description="Yerel maç verileri okunuyor." />
          : error ? <EmptyData title="Veri yüklenemedi" description={error} />
          : activeNav === "leagues" ? leagueDirectoryLoading ? <EmptyData title="Ligler yükleniyor" description="FotMob lig kataloğu ve günlük maç eşleşmeleri yükleniyor." /> : leagueDirectoryError ? <EmptyData title="Lig verisi alınamadı" description={leagueDirectoryError} /> : selectedLeague ? <FotMobLeagueHub league={selectedLeague} /> : <EmptyData title="Lig bulunamadı" description="FotMob lig kataloğunda seçilebilir lig bulunamadı." />
          : activeNav === "settings" ? <EmptyData title="Görünüm ayarları" description="Tema ve görünüm ayarları bu sürümde sabit." />
          : selectedMatch ? <MatchDetail match={selectedMatch} tab={activeTab} onTabChange={setActiveTab} homeLogo={selectedMatchLogos?.home} awayLogo={selectedMatchLogos?.away} fotmobStatus={selectedMatchFotMobStatus} />
          : <div className="detail-empty"><div className="empty-graphic"><span>↖</span></div><h2>Bir maç seçin</h2><p>Detayını görmek için listeden bir maç seç.</p></div>}
      </main>
    </div>
  );
}

export default App;
