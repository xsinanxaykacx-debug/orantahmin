import { memo, useEffect, useMemo, useState } from "react";
import { OddsService } from "./services/iddaaOddsService";
import type { BulletinDocument, BulletinMatch, MatchDetailTab, MatchFields } from "./types/match";
import { dedupeByMatchId, isValidOdds, uniqueOdds } from "./utils/bulletinUtils";
import "./index.css";
import { IddaaLineupPanel } from "./components/IddaaLineupPanel";
import { IddaaLeagueHub } from "./components/IddaaLeagueHub";
import { settleMarketOutcome, type MatchResult } from "./utils/marketSettlement";
import { IDDAA_LEAGUES } from "./lib/iddaaLeagues";

type MatchLiveState = { status: number; homeScore: string | null; awayScore: string | null; minute: string | null };
type DisplayMatch = BulletinMatch & { sourceRecords: BulletinMatch[]; liveMinute?: string | null };
type StatusFilter = "all" | "live" | "finished";
type MarketSelection = { label: string; field: keyof MatchFields };
type MarketDefinition = { key: string; title: string; selections: MarketSelection[] };
type NavItem = { id: "matches" | "leagues" | "statistics" | "settings"; label: string; icon: string };

const navItems: NavItem[] = [
  { id: "matches", label: "Maç Merkezi", icon: "▦" },
  { id: "leagues", label: "Ligler", icon: "▤" },
  { id: "statistics", label: "İstatistikler", icon: "▤" },
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

function TeamCrest({ name, large = false }: { name: string; large?: boolean }) {
  const className = large ? "detail-crest" : "team-crest";
  return <span className={className}>{name.trim().slice(0, 1).toLocaleUpperCase("tr-TR") || "?"}</span>;
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
function matchDateKey(match: DisplayMatch): string {
  const [day = "", month = "", year = ""] = (match.date || "").split(".");
  return day && month && year ? `${year}-${month}-${day}` : "";
}
function todayIstanbulKey(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const get = (type: string) => parts.find(part => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function dateOptionLabel(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00+03:00`);
  const label = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul", day: "numeric", month: "long"
  }).format(date);
  return dateKey === todayIstanbulKey() ? `Bugün · ${label}` : label;
}
function formatDate(value: string): string {
  if (!value) return "Tarih bilgisi yok";
  const [day, month, year] = value.split(".");
  return day && month && year ? `${day} ${month} ${year}` : value;
}
function getOdds(match: DisplayMatch, field: keyof MatchFields): number[] {
  return uniqueOdds(match.sourceRecords.map((record) => record.fields?.[field]));
}
function isLiveMatch(status: number): boolean { return status > 0 && status < 4; }
function isFinishedMatch(status: number): boolean { return status >= 4; }
function statusLabel(status: number): string {
  if (isFinishedMatch(status)) return "Tamamlandı";
  if (isLiveMatch(status)) return "Canlı";
  return "Başlamadı";
}
function readIddaaFirstHalfScore(_match: DisplayMatch): { home: number; away: number } | null {
  return null;
}
function matchKey(match: DisplayMatch): string {
  return String(match.matchId);
}
function normalizeFixtureTeam(value: string | null | undefined): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
function fixtureIdentity(match: DisplayMatch): string {
  return `${matchDateKey(match)}|${normalizeFixtureTeam(match.homeName)}|${normalizeFixtureTeam(match.awayName)}`;
}

const MatchRow = memo(function MatchRow({
  match, active, onSelect
}: { match: DisplayMatch; active: boolean; onSelect: (id: string) => void }) {
  const homeOdds = getOdds(match, "ms1");
  const drawOdds = getOdds(match, "msX");
  const awayOdds = getOdds(match, "ms2");
  const homeScore = match.fields.scoreHome;
  const awayScore = match.fields.scoreAway;
  const hasScore = homeScore !== null && homeScore !== undefined && awayScore !== null && awayScore !== undefined && String(homeScore) !== "" && String(awayScore) !== "";
  const hasMissingName = !match.homeName?.trim() || !match.awayName?.trim();
  return (
    <button type="button" className={`match-row ${active ? "selected" : ""}`} onClick={() => onSelect(matchKey(match))}>
      <div className="match-row-top">
        <span>{isLiveMatch(match.status) ? (match.liveMinute || "CANLI") : isFinishedMatch(match.status) ? "MS" : (match.time || "Saat yok")}</span>
        <span className={`match-state ${isLiveMatch(match.status) ? "live" : ""}`}>{isLiveMatch(match.status) ? "Canlı" : isFinishedMatch(match.status) ? "Bitti" : ""}</span>
      </div>
      <div className="match-row-content">
        <div className="teams-stack">
          <div className="team-line"><TeamCrest name={match.homeName || ""} /><strong>{safeTeamName(match.homeName)}</strong></div>
          <div className="team-line"><TeamCrest name={match.awayName || ""} /><strong>{safeTeamName(match.awayName)}</strong></div>
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

function MarketCard({ market, match, result = null }: { market: MarketDefinition; match: DisplayMatch; result?: MatchResult | null }) {
  const available = market.selections.some((selection) => getOdds(match, selection.field).length > 0);
  return (
    <section className={`market-card ${available ? "" : "is-empty"}`}>
      <div className="market-card-title">{market.title}<span>{available ? "Kaynak oranı" : "Veri yok"}</span></div>
      <div className="market-values">
        {market.selections.map(({ label, field }) => {
          const selectionOdds = getOdds(match, field);
          const settlement = settleMarketOutcome(market.title, label, result);
          return <div className={`market-value ${settlement === "won" ? "is-winner" : settlement === "lost" ? "is-loser" : result ? "is-unknown" : ""}`} key={field}>
            <span>{label}</span>
            <strong>{selectionOdds.map(safeOdds).join(" / ") || "—"}</strong>
            {result && <em className="settlement-label">{selectionOdds.length === 0 ? "Oran yok" : settlement === "won" ? "Kazandı" : settlement === "lost" ? "Kaybetti" : "Sonuç verisi yok"}</em>}
          </div>;
        })}
      </div>
    </section>
  );
}

function EmptyData({ title, description }: { title: string; description: string }) {
  return <div className="data-empty"><span className="empty-symbol">⌁</span><strong>{title}</strong><p>{description}</p></div>;
}

function Overview({ match }: { match: DisplayMatch }) {
  const homeScore = match.fields.scoreHome;
  const awayScore = match.fields.scoreAway;
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
            <div><span>Durum</span><strong>{statusLabel(match.status)}</strong></div>
            <div><span>Skor</span><strong>{hasScore ? `${homeScore} – ${awayScore}` : "—"}</strong></div>
            <div><span>Hakem</span><strong>Veri yok</strong></div>
            <div><span>Hava durumu</span><strong>Veri yok</strong></div>
          </div>
        </article>
        <div className="info-card"><div className="card-heading"><span>TAKIM FORMU</span><small>İddaa lig verisi</small></div><p>Takım formu, seçilen ligin İddaa istatistik merkezinden görüntülenir.</p></div>
      </div>
      <section className="info-card">
        <div className="card-heading"><span>MEVCUT ORANLAR</span><small>Orijinal market alanlarından</small></div>
        <div className="market-grid-detail">{markets.map((market) => <MarketCard key={market.key} market={market} match={match} />)}</div>
      </section>
    </div>
  );
}

type IddaaMarket = {
  name: string;
  code: string;
  outcomes: Array<{ name: string; odd: number | null }>;
};

function IddaaMarketCard({ market, result }: { market: IddaaMarket; result: MatchResult | null }) {
  const available = market.outcomes.some(outcome => outcome.odd !== null);
  return (
    <section className={`market-card ${available ? "" : "is-empty"}`}>
      <div className="market-card-title">{market.name}<span>{available ? "iddaa.com" : "Oran yok"}</span></div>
      <div className="market-values">
        {market.outcomes.map((outcome, index) => {
          const settlement = outcome.odd !== null ? settleMarketOutcome(market.name, outcome.name, result) : "unknown";
          return <div className={`market-value ${settlement === "won" ? "is-winner" : settlement === "lost" ? "is-loser" : result ? "is-unknown" : ""}`} key={`${market.code}-${index}`}>
            <span>{outcome.name}</span>
            <strong>{outcome.odd !== null ? outcome.odd.toFixed(2).replace(".", ",") : "—"}</strong>
            {result && <em className="settlement-label">{outcome.odd === null ? "Oran yok" : settlement === "won" ? "Kazandı" : settlement === "lost" ? "Kaybetti" : "Sonuç verisi yok"}</em>}
          </div>;
        })}
      </div>
    </section>
  );
}

function OddsAnalysis({ match }: { match: DisplayMatch }) {
  const finished = isFinishedMatch(match.status);
  const homeScore = match.fields.scoreHome;
  const awayScore = match.fields.scoreAway;
  const parsedHome = homeScore === null || homeScore === undefined || String(homeScore).trim() === "" ? NaN : Number(homeScore);
  const parsedAway = awayScore === null || awayScore === undefined || String(awayScore).trim() === "" ? NaN : Number(awayScore);
  const firstHalfScore = readIddaaFirstHalfScore(match);
  const result: MatchResult | null = finished && Number.isFinite(parsedHome) && Number.isFinite(parsedAway)
    ? { home: parsedHome, away: parsedAway, finished: true, firstHalf: firstHalfScore }
    : null;

  const [sourceMarkets, setSourceMarkets] = useState<IddaaMarket[]>([]);
  const [loadingMarkets, setLoadingMarkets] = useState(true);
  const [marketError, setMarketError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingMarkets(true);
    setMarketError(null);
    setSourceMarkets([]);
    fetch(`/api/iddaa-markets?eventId=${encodeURIComponent(String(match.matchId))}`, {
      cache: "no-store", signal: controller.signal
    })
      .then(async response => {
        const payload = await response.json() as {
          available?: boolean; markets?: IddaaMarket[]; reason?: string; error?: string
        };
        if (!response.ok) throw new Error(payload.error || "iddaa.com marketleri alınamadı.");
        if (!payload.available || !Array.isArray(payload.markets) || payload.markets.length === 0) {
          throw new Error(payload.reason || "Bu maç için oran marketi bulunamadı.");
        }
        setSourceMarkets(payload.markets);
      })
      .catch(reason => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setMarketError(reason instanceof Error ? reason.message : "iddaa.com marketleri alınamadı.");
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
        <div><span className="eyebrow">PİYASA VERİSİ</span><h3>Oran analizi{firstHalfScore && <small className="first-half-inline">İYS: {firstHalfScore.home} - {firstHalfScore.away}</small>}</h3></div>
        <p>iddaa.com bültenindeki oran marketleri listelenir.</p>
      </div>
      {loadingMarkets ? (
        <EmptyData title="iddaa.com marketleri yükleniyor" description="Maçın oran detayları kaynaktan okunuyor." />
      ) : sourceMarkets.length > 0 ? (
        <div className="market-grid-detail">
          {sourceMarkets.map(market => <IddaaMarketCard key={market.code} market={market} result={result} />)}
        </div>
      ) : (
        <div className="data-empty">
          <strong>iddaa.com market verisi bulunamadı</strong>
          <p>{marketError || "Bu maç için bültende okunabilir oran verisi bulunamadı."}</p>
        </div>)}
    </div>
  );
}

function DetailPlaceholder() {
  return <div className="placeholder-wrap"><EmptyData title="AI tahmini oluşturulmadı" description="Bu sürüm tahmin üretmez. Kaynak dışı olasılık veya sonuç uydurulmaz." /></div>;
}

function MatchDetail({ match, tab, onTabChange }: {
  match: DisplayMatch; tab: MatchDetailTab; onTabChange: (tab: MatchDetailTab) => void;
}) {
  const homeScore = match.fields.scoreHome;
  const awayScore = match.fields.scoreAway;
  const hasScore = homeScore !== null && homeScore !== undefined && awayScore !== null && awayScore !== undefined &&
    String(homeScore) !== "" && String(awayScore) !== "";
  return (
    <div className="detail-pane-inner">
      <header className="detail-header">
        <div className="detail-meta"><span>{formatDate(match.date)} · {match.time || "Saat yok"}</span><b>{match.fields.leagueCode || "Lig kodu bulunmuyor"}</b></div>
        <div className="versus-header">
          <div className="detail-team"><TeamCrest name={match.homeName || ""} large /><strong>{safeTeamName(match.homeName)}</strong><small>Ev sahibi</small></div>
          <div className="match-center"><span>{hasScore ? "MAÇ SKORU" : "BAŞLANGICA KALAN"}</span><strong>{hasScore ? `${homeScore} : ${awayScore}` : "— : —"}</strong><small>{statusLabel(match.status)}</small></div>
          <div className="detail-team"><TeamCrest name={match.awayName || ""} large /><strong>{safeTeamName(match.awayName)}</strong><small>Deplasman</small></div>
        </div>
      </header>
      <nav className="detail-tabs" aria-label="Maç detay sekmeleri">
        {detailTabs.map((item) => <button type="button" key={item.id} className={tab === item.id ? "active" : ""} onClick={() => onTabChange(item.id)}>{item.label}</button>)}
      </nav>
      {tab === "overview" ? <Overview match={match} /> : tab === "odds" ? <OddsAnalysis match={match} /> : tab === "squad" ? <IddaaLineupPanel matchId={match.matchId} /> : <DetailPlaceholder />}
    </div>
  );
}

function App() {
  const [bulletin, setBulletin] = useState<BulletinDocument | null>(null);
  const [fotmobLiveStates, setFotmobLiveStates] = useState<Record<string, MatchLiveState>>({});
  const [iddaaLiveMatches, setIddaaLiveMatches] = useState<DisplayMatch[]>([]);
  const [fotmobFinishedMatches, setFotmobFinishedMatches] = useState<DisplayMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<NavItem["id"]>("matches");
  const [statisticsView, setStatisticsView] = useState<"league" | "team">("league");
  const leagueDirectory = IDDAA_LEAGUES;
  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(52);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedDate, setSelectedDate] = useState("all");
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);
  const [leagueFilterOpen, setLeagueFilterOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MatchDetailTab>("overview");

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
    let active = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    let mapPromise: Promise<any[]> | null = null;

    const loadEventMap = () => {
      if (!mapPromise) {
        mapPromise = fetch("/data/fotmob-event-map.json", { cache: "no-store" })
          .then(response => response.ok ? response.json() : null)
          .then(payload => Array.isArray(payload?.matches) ? payload.matches : [])
          .catch(() => []);
      }
      return mapPromise;
    };

    const refreshLiveStatuses = async () => {
      try {
        const liveResponse = await fetch("/api/iddaa-live", { cache: "no-store" });
        if (liveResponse.ok) {
          const livePayload = await liveResponse.json();
          if (active && Array.isArray(livePayload?.matches)) {
            setIddaaLiveMatches(dedupeByMatchId(livePayload.matches));
          }
        }

        const mapRows = await loadEventMap();
        const iddaaByFotMob = new Map<string, string>();
        for (const row of mapRows) {
          if (row?.state === "matched" && row?.fotmobMatchId && row?.iddaaEventId) {
            iddaaByFotMob.set(String(row.fotmobMatchId), String(row.iddaaEventId));
          }
        }
        const ids = [...iddaaByFotMob.keys()];
        if (!ids.length) return;
        const response = await fetch(`/api/fotmob-live?ids=${ids.join(",")}&includeAll=1`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        if (!active) return;
        if (Array.isArray(payload?.finishedMatches)) {
          setFotmobFinishedMatches(dedupeByMatchId(payload.finishedMatches));
        }
        const next: Record<string, MatchLiveState> = {};
        for (const fixture of payload?.matches || []) {
          const iddaaId = iddaaByFotMob.get(String(fixture.fotmobMatchId));
          if (!iddaaId) continue;
          next[iddaaId] = {
            status: fixture.finished ? 4 : fixture.started ? 1 : 0,
            homeScore: fixture.homeScore == null ? null : String(fixture.homeScore),
            awayScore: fixture.awayScore == null ? null : String(fixture.awayScore),
            minute: fixture.minute == null ? null : String(fixture.minute)
          };
        }
        setFotmobLiveStates(next);
      } catch {
        // Keep the last successful Iddaa and FotMob snapshots when either source is temporarily unavailable.
      }
    };

    void refreshLiveStatuses();
    timer = setInterval(refreshLiveStatuses, 30_000);
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, []);

  const matches = useMemo<DisplayMatch[]>(() => {
    const baseMatches = dedupeByMatchId(bulletin?.matches ?? []);
    const liveById = new Map(iddaaLiveMatches.map(match => [String(match.matchId), match]));
    const finishedByFixture = new Map(
      fotmobFinishedMatches.map(match => [fixtureIdentity(match), match])
    );
    const baseIds = new Set(baseMatches.map(match => String(match.matchId)));
    const merged = baseMatches.map(match => {
      const id = String(match.matchId);
      const iddaaLive = liveById.get(id);
      const fotmobLive = fotmobLiveStates[id];
      const fotmobFinished = finishedByFixture.get(fixtureIdentity(match));
      if (!iddaaLive && !fotmobLive && !fotmobFinished) return match;
      return {
        ...match,
        status: iddaaLive ? 1 : fotmobLive?.status ?? (fotmobFinished ? 4 : match.status),
        liveMinute: iddaaLive?.liveMinute ?? fotmobLive?.minute ?? null,
        fields: {
          ...match.fields,
          scoreHome: iddaaLive?.fields.scoreHome ?? fotmobLive?.homeScore ?? fotmobFinished?.fields.scoreHome ?? match.fields.scoreHome,
          scoreAway: iddaaLive?.fields.scoreAway ?? fotmobLive?.awayScore ?? fotmobFinished?.fields.scoreAway ?? match.fields.scoreAway
        },
        sourceRecords: iddaaLive
          ? [...match.sourceRecords, ...iddaaLive.sourceRecords]
          : match.sourceRecords
      };
    });
    const liveOnly = iddaaLiveMatches.filter(match => !baseIds.has(String(match.matchId)));
    return [...merged, ...liveOnly];
  }, [bulletin, fotmobLiveStates, fotmobFinishedMatches, iddaaLiveMatches]);
  const displayMatches = matches;

  const allMatchesForFilters = displayMatches;
  const dateOptions = useMemo(
    () => [...new Set(displayMatches.map(matchDateKey).filter(Boolean))].sort(),
    [displayMatches]
  );
  const availableLeagues = useMemo(() => {
    const counts = new Map<string, number>();
    for (const match of allMatchesForFilters) {
      const league = match.fields.leagueCode?.trim() || "Lig kodu bulunmuyor";
      counts.set(league, (counts.get(league) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], "tr"));
  }, [allMatchesForFilters]);

  const applyMatchFilters = (rows: DisplayMatch[]) => rows.filter(match => {
    if (selectedDate !== "all" && matchDateKey(match) !== selectedDate) return false;
    const league = match.fields.leagueCode?.trim() || "Lig kodu bulunmuyor";
    if (selectedLeagues.length && !selectedLeagues.includes(league)) return false;
    return true;
  });
  const scopedMatches = useMemo(() => applyMatchFilters(displayMatches), [displayMatches, selectedDate, selectedLeagues]);
  const scopedLiveMatches = useMemo(
    () => applyMatchFilters(displayMatches.filter(match => isLiveMatch(match.status))),
    [displayMatches, selectedDate, selectedLeagues]
  );
  const scopedFinishedMatches = useMemo(
    () => applyMatchFilters(displayMatches.filter(match => isFinishedMatch(match.status))),
    [displayMatches, selectedDate, selectedLeagues]
  );

  const filteredMatches = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    const source = statusFilter === "live"
      ? scopedLiveMatches
      : statusFilter === "finished"
        ? scopedFinishedMatches
        : scopedMatches;
    return source.filter((match) => {
      if (!query) return true;
      return [match.homeName, match.awayName, match.fields.leagueCode, String(match.matchId)]
        .some((value) => String(value ?? "").toLocaleLowerCase("tr-TR").includes(query));
    }).sort((a, b) => statusFilter === "finished"
      ? dateTimeKey(b).localeCompare(dateTimeKey(a))
      : dateTimeKey(a).localeCompare(dateTimeKey(b)));
  }, [scopedMatches, scopedLiveMatches, scopedFinishedMatches, statusFilter, search]);

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

  const selectedMatch = useMemo(
    () => displayMatches.find((match) => String(match.matchId) === selectedId)
      ?? iddaaLiveMatches.find((match) => String(match.matchId) === selectedId)
      ?? fotmobFinishedMatches.find((match) => String(match.matchId) === selectedId) ?? null,
    [displayMatches, iddaaLiveMatches, fotmobFinishedMatches, selectedId]
  );
  const filteredLeagues = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    return leagueDirectory.filter(league => !query || [league.name, league.country].some(value => String(value || "").toLocaleLowerCase("tr-TR").includes(query)));
  }, [leagueDirectory, search]);
  const selectedLeague = useMemo(
    () => leagueDirectory.find(league => league.id === selectedLeagueId) ?? null,
    [leagueDirectory, selectedLeagueId]
  );

  const liveCount = scopedLiveMatches.length;
  const finishedCount = scopedFinishedMatches.length;
  const visibleCount = filteredMatches.length;

  useEffect(() => {
    if (selectedId && ![...matches, ...iddaaLiveMatches, ...fotmobFinishedMatches].some((match) => String(match.matchId) === selectedId)) setSelectedId(null);
  }, [matches, iddaaLiveMatches, fotmobFinishedMatches, selectedId]);

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
          {navItems.map((item) => <button type="button" key={item.id} title={item.label} aria-label={item.label} className={activeNav === item.id ? "active" : ""} onClick={() => setActiveNav(item.id)}>{item.id === "matches" ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="4" width="20" height="16" rx="1" />
                <path d="M12 4v16" />
                <circle cx="12" cy="12" r="2.5" />
                <path d="M2 8h3.5v8H2M22 8h-3.5v8H22" />
              </svg>
            ) : item.id === "leagues" ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                <path d="M4 22h16" />
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
              </svg>
            ) : item.id === "statistics" ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="8" y="1.5" width="8" height="3" rx="1" />
                <path d="M16 3h3a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
                <path d="M8 10h8M8 14h8M8 18h5" />
              </svg>
            ) : <span>{item.icon}</span>}</button>)}
        </div>
        
      </aside>

      <aside className="match-list-pane">
        <div className="list-header">
          <div className="brand-line"><div><span className="eyebrow">ORANTAHMİN</span><h1>{activeNav === "matches" ? "Maç Merkezi" : activeNav === "leagues" ? "Ligler" : activeNav === "statistics" ? "İstatistikler" : "Ayarlar"}</h1></div><span className="count-pill">{activeNav === "leagues" ? leagueDirectory.length : activeNav === "statistics" ? "Σ" : matches.length}</span></div>
          {activeNav === "matches" && <>
            <div className="status-filters">
              <button className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")}>Tümü <b>{scopedMatches.length}</b></button>
              <button className={statusFilter === "live" ? "active" : ""} onClick={() => setStatusFilter("live")}>Canlı <b>{liveCount}</b></button>
              <button className={statusFilter === "finished" ? "active" : ""} onClick={() => setStatusFilter("finished")}>Biten <b>{finishedCount}</b></button>
            </div>
            <div className="match-filters">
              <label className="match-filter-date"><span>TARİH</span>
                <select value={selectedDate} onChange={event => setSelectedDate(event.target.value)}>
                  <option value="all">Tüm tarihler ({matches.length})</option>
                  {dateOptions.map(date => <option key={date} value={date}>{dateOptionLabel(date)} ({allMatchesForFilters.filter(match => matchDateKey(match) === date).length})</option>)}
                </select>
              </label>
              <div className="league-filter-wrap">
                <span className="filter-label">LİG SEÇİMİ</span>
                <button type="button" className={selectedLeagues.length ? "league-filter-button active" : "league-filter-button"} onClick={() => setLeagueFilterOpen(open => !open)}>
                  {selectedLeagues.length ? `${selectedLeagues.length} lig seçildi` : "Tüm ligler"} <span>⌄</span>
                </button>
                {leagueFilterOpen && <div className="league-filter-panel">
                  <div className="league-filter-panel-head"><strong>Lig seç</strong><button type="button" onClick={() => setSelectedLeagues([])}>Temizle</button></div>
                  {availableLeagues.map(([league, count]) => <button type="button" key={league} className={selectedLeagues.includes(league) ? "league-filter-option selected" : "league-filter-option"} onClick={() => setSelectedLeagues(current => current.includes(league) ? current.filter(item => item !== league) : [...current, league])}>
                    <span>{league}</span><b>{count}</b><i>{selectedLeagues.includes(league) ? "✓" : ""}</i>
                  </button>)}
                </div>}
              </div>
            </div>
          </>}
          {activeNav !== "statistics" && <label className="match-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={activeNav === "leagues" ? "Lig veya ülke ara..." : "Takım, lig veya maç ara..."} /><kbd>/</kbd></label>}
          <div className={`list-caption ${activeNav === "leagues" ? "league-list-caption" : ""}`}><span>{activeNav === "leagues" ? "Lig kataloğu" : activeNav === "statistics" ? "Sezon analiz merkezi" : statusFilter === "finished" ? `${visibleCount} biten maç` : `${visibleCount} karşılaşma`}</span><span>{activeNav === "leagues" ? `${leagueDirectory.length} doğrulanmış İddaa ligi` : activeNav === "statistics" ? "Lig ve takım performansı" : statusFilter === "live" ? liveCount + " canlı maç" : statusFilter === "finished" ? finishedCount + " tamamlanan maç" : matches.length + " bülten maçı"}</span></div>
        </div>

        {activeNav === "statistics" ? <div className="statistics-nav-options">
          <button type="button" className={statisticsView === "league" ? "active" : ""} onClick={() => setStatisticsView("league")}>
            <span className="statistics-nav-symbol">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
                <path d="M7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4" />
              </svg>
            </span>
            <span><b>LİG SEÇ</b><small>Lig istatistikleri</small></span>
            <span className="statistics-nav-arrow">›</span>
          </button>
          <button type="button" className={statisticsView === "team" ? "active" : ""} onClick={() => setStatisticsView("team")}>
            <span className="statistics-nav-symbol">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            <span><b>TAKIM SEÇ</b><small>Takım performansları</small></span>
            <span className="statistics-nav-arrow">›</span>
          </button>
        </div> : activeNav === "leagues" ? <div className="league-directory-scroll">
          {filteredLeagues.length === 0 ? <div className="league-directory-empty">Aramayla eşleşen lig bulunamadı.</div>
            : filteredLeagues.map(league => <button type="button" key={league.id} className={selectedLeagueId === league.id ? "league-directory-item active" : "league-directory-item"} onClick={() => selectLeague(league.id)}>
              <span className="league-directory-logo" aria-hidden="true">
                <span>{league.name.slice(0, 1)}</span>
                <img src={`https://media.api-sports.io/football/leagues/${league.logoId}.png`} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} />
              </span>
              <span className="league-directory-name"><b>{league.name}</b><small>{league.country || "Uluslararası"}</small></span>
              <span className="league-directory-arrow" aria-hidden="true">›</span>
            </button>)}
        </div> : activeNav === "matches" ? <div className="match-list-scroll">
          {loading ? <div className="list-message">Bülten yükleniyor…</div>
            : error ? <div className="list-message error-text">{error}</div>
            : filteredMatches.length === 0 ? <div className="list-message">{statusFilter === "finished" ? "Tamamlanmış maç bulunamadı." : statusFilter === "live" ? "Şu anda canlı maç bulunamadı." : "Eşleşen maç bulunamadı."}</div>
            : leagueGroups.map(([league, group]) => (
              <section className="league-group" key={league}>
                <div className="league-heading"><span className="league-dot" />{league}<b>{group.length}</b></div>
                {group.map((match) => <MatchRow key={String(match.matchId)} match={match} active={String(match.matchId) === selectedId} onSelect={selectMatch}  />)}
              </section>
            ))}
        </div> : <div className="league-directory-empty">Ayarlar</div>}
      </aside>

      <main className="detail-pane">
        {loading ? <EmptyData title="Bülten yükleniyor" description="Yerel maç verileri okunuyor." />
          : error ? <EmptyData title="Veri yüklenemedi" description={error} />
          : activeNav === "leagues" ? selectedLeague ? <IddaaLeagueHub league={selectedLeague} /> : <EmptyData title="Lig bulunamadı" description="İddaa kataloğunda seçilebilir lig bulunamadı." />
          : activeNav === "statistics" ? <IddaaLeagueHub league={selectedLeague || IDDAA_LEAGUES[0]} /> : activeNav === "settings" ? <EmptyData title="Görünüm ayarları" description="Tema ve görünüm ayarları bu sürümde sabit." />
          : selectedMatch ? <MatchDetail match={selectedMatch} tab={activeTab} onTabChange={setActiveTab} />
          : <div className="detail-empty"><div className="empty-graphic"><span>↖</span></div><h2>Bir maç seçin</h2><p>Detayını görmek için listeden bir maç seç.</p></div>}
      </main>
    </div>
  );
}

export default App;

