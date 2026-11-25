import { memo, useEffect, useMemo, useState } from "react";
import { OddsService } from "./services/mackolikOddsService";
import type { BulletinDocument, BulletinMatch, MatchDetailTab, MatchFields } from "./types/match";
import { dedupeByMatchId, isValidOdds, uniqueOdds } from "./utils/bulletinUtils";
import "./index.css";
import { FotMobLineupPanel } from "./components/FotMobLineupPanel";
import { FotMobTeamFormPanel } from "./components/FotMobTeamFormPanel";
import { FotMobLeagueHub, type LeagueSummary } from "./components/FotMobLeagueHub";

type DisplayMatch = BulletinMatch & { sourceRecords: BulletinMatch[] };
type StatusFilter = "all" | "live" | "closing";
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
function statusLabel(status: number): string {
  if (status > 0 && status < 4) return "Canlı";
  if (status >= 4) return "Tamamlandı";
  return "Başlamadı";
}
function matchKey(match: DisplayMatch): string {
  return String(match.matchId);
}

const MatchRow = memo(function MatchRow({
  match, active, onSelect, homeLogo, awayLogo
}: { match: DisplayMatch; active: boolean; onSelect: (id: string) => void; homeLogo?: number | null; awayLogo?: number | null }) {
  const homeOdds = getOdds(match, "ms1");
  const drawOdds = getOdds(match, "msX");
  const awayOdds = getOdds(match, "ms2");
  const hasMissingName = !match.homeName?.trim() || !match.awayName?.trim();
  return (
    <button type="button" className={`match-row ${active ? "selected" : ""}`} onClick={() => onSelect(matchKey(match))}>
      <div className="match-row-top">
        <span>{match.time || "Saat yok"}</span>
        <span className={`match-state ${match.status > 0 && match.status < 4 ? "live" : ""}`}>{statusLabel(match.status)}</span>
      </div>
      <div className="match-row-content">
        <div className="teams-stack">
          <div className="team-line"><TeamCrest id={homeLogo} name={match.homeName || ""} /><strong>{safeTeamName(match.homeName)}</strong></div>
          <div className="team-line"><TeamCrest id={awayLogo} name={match.awayName || ""} /><strong>{safeTeamName(match.awayName)}</strong></div>
        </div>
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

function Overview({ match }: { match: DisplayMatch }) {
  const hasScore = match.status > 0 && match.fields.scoreHome !== null && match.fields.scoreHome !== undefined &&
    match.fields.scoreAway !== null && match.fields.scoreAway !== undefined &&
    String(match.fields.scoreHome) !== "" && String(match.fields.scoreAway) !== "";
  return (
    <div className="detail-content">
      <div className="overview-cards">
        <article className="info-card">
          <div className="card-heading"><span>MAÇ BİLGİSİ</span><small>Kaynakta bulunan alanlar</small></div>
          <div className="info-grid">
            <div><span>Lig kodu</span><strong>{match.fields.leagueCode || "—"}</strong></div>
            <div><span>Başlangıç</span><strong>{match.time || "—"}</strong></div>
            <div><span>Durum</span><strong>{statusLabel(match.status)}</strong></div>
            <div><span>Skor</span><strong>{hasScore ? `${match.fields.scoreHome} – ${match.fields.scoreAway}` : "—"}</strong></div>
            <div><span>Hakem</span><strong>Veri yok</strong></div>
            <div><span>Hava durumu</span><strong>Veri yok</strong></div>
          </div>
        </article>
      </div>
      <FotMobTeamFormPanel matchId={match.matchId} />
      <section className="info-card">
        <div className="card-heading"><span>MEVCUT ORANLAR</span><small>Orijinal market alanlarından</small></div>
        <div className="market-grid-detail">{markets.map((market) => <MarketCard key={market.key} market={market} match={match} />)}</div>
      </section>
    </div>
  );
}

function OddsAnalysis({ match }: { match: DisplayMatch }) {
  return (
    <div className="detail-content">
      <div className="section-intro"><div><span className="eyebrow">PİYASA VERİSİ</span><h3>Oran analizi</h3></div><p>Açılış ve zaman serisi oranları kaynakta bulunmuyor. Bu görünüm yalnızca mevcut ham bültendeki değerleri listeler.</p></div>
      <div className="market-grid-detail">{markets.map((market) => <MarketCard key={market.key} market={market} match={match} />)}</div>
    </div>
  );
}

function DetailPlaceholder() {
  return <div className="placeholder-wrap"><EmptyData title="AI tahmini oluşturulmadı" description="Bu sürüm tahmin üretmez. Kaynak dışı olasılık veya sonuç uydurulmaz." /></div>;
}

function MatchDetail({ match, tab, onTabChange, homeLogo, awayLogo }: {
  match: DisplayMatch; tab: MatchDetailTab; onTabChange: (tab: MatchDetailTab) => void; homeLogo?: number | null; awayLogo?: number | null;
}) {
  const hasScore = match.fields.scoreHome !== null && match.fields.scoreHome !== undefined &&
    match.fields.scoreAway !== null && match.fields.scoreAway !== undefined &&
    String(match.fields.scoreHome) !== "" && String(match.fields.scoreAway) !== "";
  return (
    <div className="detail-pane-inner">
      <header className="detail-header">
        <div className="detail-meta"><span>{formatDate(match.date)} · {match.time || "Saat yok"}</span><b>{match.fields.leagueCode || "Lig kodu bulunmuyor"}</b></div>
        <div className="versus-header">
          <div className="detail-team"><TeamCrest id={homeLogo} name={match.homeName || ""} large /><strong>{safeTeamName(match.homeName)}</strong><small>Ev sahibi</small></div>
          <div className="match-center"><span>{hasScore ? "MAÇ SKORU" : "BAŞLANGICA KALAN"}</span><strong>{hasScore ? `${match.fields.scoreHome} : ${match.fields.scoreAway}` : "— : —"}</strong><small>{statusLabel(match.status)}</small></div>
          <div className="detail-team"><TeamCrest id={awayLogo} name={match.awayName || ""} large /><strong>{safeTeamName(match.awayName)}</strong><small>Deplasman</small></div>
        </div>
      </header>
      <nav className="detail-tabs" aria-label="Maç detay sekmeleri">
        {detailTabs.map((item) => <button type="button" key={item.id} className={tab === item.id ? "active" : ""} onClick={() => onTabChange(item.id)}>{item.label}</button>)}
      </nav>
      {tab === "overview" ? <Overview match={match} /> : tab === "odds" ? <OddsAnalysis match={match} /> : tab === "squad" ? <FotMobLineupPanel matchId={match.matchId} /> : <DetailPlaceholder />}
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
    if (activeNav !== "leagues" || leagueDirectory.length > 0) return;
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
        setSelectedLeagueId(current => current && leagues.some(league => league.id === current) ? current : leagues[0]?.id ?? null);
      })
      .catch(reason => { if (active) setLeagueDirectoryError(reason instanceof Error ? reason.message : "Lig listesi alınamadı."); })
      .finally(() => { if (active) setLeagueDirectoryLoading(false); });
    return () => { active = false; };
  }, [activeNav, leagueDirectory.length]);

  const matches = useMemo<DisplayMatch[]>(() => dedupeByMatchId(bulletin?.matches ?? []), [bulletin]);
  const filteredMatches = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    return matches.filter((match) => {
      const live = match.status > 0 && match.status < 4;
      if (statusFilter === "live" && !live) return false;
      // The feed has no verified "closing" flag; don't infer it from status codes.
      if (statusFilter === "closing") return false;
      if (!query) return true;
      return [match.homeName, match.awayName, match.fields.leagueCode, String(match.matchId)]
        .some((value) => String(value ?? "").toLocaleLowerCase("tr-TR").includes(query));
    }).sort((a, b) => dateTimeKey(a).localeCompare(dateTimeKey(b)));
  }, [matches, statusFilter, search]);

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

  const teamLogosByMatch = useMemo(() => {
    const map = new Map<string, { home: number | null; away: number | null }>();
    for (const league of leagueDirectory) for (const match of league.matches || []) {
      map.set(String(match.mackolikMatchId), { home: match.homeTeamId || null, away: match.awayTeamId || null });
    }
    return map;
  }, [leagueDirectory]);
  const selectedMatchLogos = selectedId ? teamLogosByMatch.get(selectedId) : undefined;
  const selectedMatch = useMemo(
    () => matches.find((match) => String(match.matchId) === selectedId) ?? null,
    [matches, selectedId]
  );
  const filteredLeagues = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    return leagueDirectory.filter(league => !query || [league.name, league.country].some(value => String(value || "").toLocaleLowerCase("tr-TR").includes(query)));
  }, [leagueDirectory, search]);
  const selectedLeague = useMemo(
    () => leagueDirectory.find(league => league.id === selectedLeagueId) ?? null,
    [leagueDirectory, selectedLeagueId]
  );

  const liveCount = useMemo(() => matches.filter((match) => match.status > 0 && match.status < 4).length, [matches]);
  const visibleCount = filteredMatches.length;
  const sourceCount = bulletin?.meta.sourceMatchCount ?? 0;

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
        <div className="rail-bottom"><span className={error ? "connection-indicator error" : "connection-indicator"} /><small>0 TL</small></div>
      </aside>

      <aside className="match-list-pane">
        <div className="list-header">
          <div className="brand-line"><div><span className="eyebrow">ORANTAHMİN</span><h1>{activeNav === "matches" ? "Maç Merkezi" : activeNav === "leagues" ? "Ligler" : "Ayarlar"}</h1></div><span className="count-pill">{activeNav === "leagues" ? leagueDirectory.length : matches.length}</span></div>
          {activeNav === "matches" && <div className="status-filters">
            <button className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")}>Tümü <b>{matches.length}</b></button>
            <button className={statusFilter === "live" ? "active" : ""} onClick={() => setStatusFilter("live")}>Canlı <b>{liveCount}</b></button>
            <button className={statusFilter === "closing" ? "active" : ""} onClick={() => setStatusFilter("closing")}>Kapanış</button>
          </div>}
          <label className="match-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={activeNav === "leagues" ? "Lig veya ülke ara..." : "Takım, lig veya maç ara..."} /><kbd>/</kbd></label>
          <div className="list-caption"><span>{activeNav === "leagues" ? "FotMob lig kataloğu" : statusFilter === "closing" ? "Kapanış durumu kaynakta yok" : `${visibleCount} karşılaşma`}</span><span>{activeNav === "leagues" ? `${leagueDirectory.filter(league => league.matchCount > 0).length} aktif · ${leagueDirectory.reduce((sum, league) => sum + league.matchCount, 0)} maç` : sourceCount + " kayıt"}</span></div>
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
            : filteredMatches.length === 0 ? <div className="list-message">{statusFilter === "closing" ? "Kaynakta kapanış durumu alanı bulunmuyor." : "Eşleşen maç bulunamadı."}</div>
            : leagueGroups.map(([league, group]) => (
              <section className="league-group" key={league}>
                <div className="league-heading"><span className="league-dot" />{league}<b>{group.length}</b></div>
                {group.map((match) => <MatchRow key={String(match.matchId)} match={match} active={String(match.matchId) === selectedId} onSelect={selectMatch} homeLogo={teamLogosByMatch.get(String(match.matchId))?.home} awayLogo={teamLogosByMatch.get(String(match.matchId))?.away} />)}
              </section>
            ))}
        </div> : <div className="league-directory-empty">Ayarlar</div>}
        <div className="list-footer"><span><i /> {activeNav === "leagues" ? "Tüm FotMob ligleri" : "Yerel veri bağlantısı"}</span><span>{bulletin?.meta.schemaVersion ?? "—"}</span></div>
      </aside>

      <main className="detail-pane">
        {loading ? <EmptyData title="Bülten yükleniyor" description="Yerel maç verileri okunuyor." />
          : error ? <EmptyData title="Veri yüklenemedi" description={error} />
          : activeNav === "leagues" ? leagueDirectoryLoading ? <EmptyData title="Ligler yükleniyor" description="FotMob lig kataloğu ve günlük maç eşleşmeleri yükleniyor." /> : leagueDirectoryError ? <EmptyData title="Lig verisi alınamadı" description={leagueDirectoryError} /> : selectedLeague ? <FotMobLeagueHub league={selectedLeague} /> : <EmptyData title="Lig bulunamadı" description="FotMob lig kataloğunda seçilebilir lig bulunamadı." />
          : activeNav === "settings" ? <EmptyData title="Görünüm ayarları" description="Tema ve veri kaynağı ayarları bu sürümde sabit: koyu tema ve ücretsiz yerel JSON." />
          : selectedMatch ? <MatchDetail match={selectedMatch} tab={activeTab} onTabChange={setActiveTab} homeLogo={selectedMatchLogos?.home} awayLogo={selectedMatchLogos?.away} />
          : <div className="detail-empty"><div className="empty-graphic"><span>↖</span></div><h2>Bir maç seçin</h2><p>Detayını görmek için listeden bir maç seç.</p><small>61 alanlı kaynak şeması · Ham veri korunur</small></div>}
      </main>
    </div>
  );
}

export default App;
