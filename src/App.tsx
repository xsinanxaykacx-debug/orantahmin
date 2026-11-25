import { useEffect, useMemo, useState } from "react";
import { OddsService } from "./services/mackolikOddsService";
import type { BulletinDocument, BulletinMatch, MatchFields } from "./types/match";
import "./index.css";

type Page = "Bülten" | "Oranlar" | "Veri Durumu";
type Selection = { label: string; field: keyof MatchFields };
type MarketDefinition = { key: string; title: string; selections: Selection[] };

const pages: Page[] = ["Bülten", "Oranlar", "Veri Durumu"];

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

function teamName(value: string | null | undefined): string {
  return value?.trim() || "Eksik takım adı";
}

function formatOdds(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(2).replace(".", ",")
    : "—";
}

function marketHasOdds(match: BulletinMatch, market: MarketDefinition): boolean {
  return market.selections.some(({ field }) => typeof match.fields[field] === "number");
}

function matchHasAnyOdds(match: BulletinMatch): boolean {
  return markets.some((market) => marketHasOdds(match, market));
}

function dateSortValue(match: BulletinMatch): string {
  const [day, month, year] = match.date.split(".");
  return `${year}-${month}-${day}T${match.time}`;
}

function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function marketCount(matches: BulletinMatch[], market: MarketDefinition): number {
  return matches.filter((match) => marketHasOdds(match, market)).length;
}

function App() {
  const [activePage, setActivePage] = useState<Page>("Bülten");
  const [bulletin, setBulletin] = useState<BulletinDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState("all");
  const [leagueFilter, setLeagueFilter] = useState("all");
  const [marketFilter, setMarketFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    OddsService.getBulletin()
      .then((result) => {
        if (active) setBulletin(result);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Bülten yüklenemedi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const matches = bulletin?.matches ?? [];

  const dates = useMemo(
    () => [...new Set(matches.map((match) => match.date))].sort((a, b) => {
      const [ad, am, ay] = a.split(".");
      const [bd, bm, by] = b.split(".");
      return new Date(`${ay}-${am}-${ad}`).getTime() - new Date(`${by}-${bm}-${bd}`).getTime();
    }),
    [matches]
  );

  const leagues = useMemo(
    () => [...new Set(matches.map((match) => match.fields.leagueCode).filter((code): code is string => Boolean(code)))].sort(),
    [matches]
  );

  const filteredMatches = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    return [...matches]
      .filter((match) => dateFilter === "all" || match.date === dateFilter)
      .filter((match) => leagueFilter === "all" || match.fields.leagueCode === leagueFilter)
      .filter((match) => marketFilter === "all" || (marketFilter === "any" ? matchHasAnyOdds(match) : markets.some((market) => market.key === marketFilter && marketHasOdds(match, market))))
      .filter((match) => !query || [match.homeName, match.awayName, match.fields.leagueCode ?? "", match.matchId].some((value) => (value ?? "").toLocaleLowerCase("tr-TR").includes(query)))
      .sort((a, b) => dateSortValue(a).localeCompare(dateSortValue(b)));
  }, [matches, dateFilter, leagueFilter, marketFilter, search]);

  const liveCount = matches.filter((match) => match.status > 0 && match.status < 4).length;
  const activeMarkets = markets.filter((market) => marketCount(matches, market) > 0).length;
  const totalMarketQuotes = markets.reduce((sum, market) => sum + marketCount(matches, market), 0);

  function renderFilters() {
    return (
      <div className="filters">
        <label className="search-field">
          <span>Maç ara</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Takım, maç ID veya lig kodu..." />
        </label>
        <label>
          <span>Tarih</span>
          <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>
            <option value="all">Tüm tarihler</option>
            {dates.map((date) => <option key={date} value={date}>{date}</option>)}
          </select>
        </label>
        <label>
          <span>Lig kodu</span>
          <select value={leagueFilter} onChange={(event) => setLeagueFilter(event.target.value)}>
            <option value="all">Tüm lig kodları</option>
            {leagues.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </label>
        <label>
          <span>Market</span>
          <select value={marketFilter} onChange={(event) => setMarketFilter(event.target.value)}>
            <option value="all">Tüm marketler</option>
            <option value="any">En az bir oranı olan</option>
            {markets.map((market) => <option key={market.key} value={market.key}>{market.title}</option>)}
          </select>
        </label>
        <button className="reset-button" onClick={() => { setSearch(""); setDateFilter("all"); setLeagueFilter("all"); setMarketFilter("all"); }}>Temizle</button>
      </div>
    );
  }

  function renderMarketCards(match: BulletinMatch) {
    return (
      <div className="market-grid">
        {markets.map((market) => {
          const available = marketHasOdds(match, market);
          return (
            <section className={`market-card ${available ? "" : "market-empty"}`} key={market.key}>
              <h3>{market.title}</h3>
              <div className="market-selections">
                {market.selections.map(({ label, field }) => (
                  <div className="selection" key={field}>
                    <span>{label}</span>
                    <strong>{formatOdds(match.fields[field])}</strong>
                  </div>
                ))}
              </div>
              {!available && <span className="market-note">Veri yok</span>}
            </section>
          );
        })}
      </div>
    );
  }

  function renderBulletin() {
    return (
      <>
        {renderFilters()}
        <div className="result-line">
          <strong>{filteredMatches.length} maç</strong>
          <span>Toplam {matches.length} kayıt içinden</span>
        </div>
        {filteredMatches.length === 0 ? (
          <div className="empty-state"><h3>Sonuç bulunamadı</h3><p>Filtreleri değiştirerek tekrar deneyebilirsin.</p></div>
        ) : (
          <div className="fixture-list">
            {filteredMatches.map((match) => {
              const missingTeam = !match.homeName?.trim() || !match.awayName?.trim();
              return (
                <article className="fixture-card" key={`${match.source.groupIndex}-${match.source.matchIndex}`}>
                  <header className="fixture-heading">
                    <div className="fixture-meta">
                      <span className="date-chip">{match.date}</span>
                      <span>{match.time}</span>
                      <span className="league-code">{match.fields.leagueCode || "Lig kodu yok"}</span>
                      <span className="match-id">ID {match.matchId}</span>
                    </div>
                    <span className="status-pill">Durum kodu {match.status}</span>
                  </header>
                  <div className="teams-line">
                    <strong>{teamName(match.homeName)}</strong>
                    <span className="versus">—</span>
                    <strong>{teamName(match.awayName)}</strong>
                    {missingTeam && <span className="warning-pill">Takım bilgisi eksik</span>}
                  </div>
                  {renderMarketCards(match)}
                  {match.fields.marketHandicapMs && !match.fields.handicapMs1 && !match.fields.handicapMsX && !match.fields.handicapMs2 && (
                    <div className="handicap-note">Handikap market kimliği mevcut; çizgi ve oran doğrulanmadığı için gösterilmiyor.</div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </>
    );
  }

  function renderOdds() {
    return (
      <>
        {renderFilters()}
        <div className="result-line"><strong>{filteredMatches.length} maç</strong><span>Oran karşılaştırma görünümü · Açılış/kapanış verisi kaynakta bulunmuyor</span></div>
        <div className="odds-list">
          {filteredMatches.map((match) => (
            <article className="odds-row" key={`${match.source.groupIndex}-${match.source.matchIndex}`}>
              <div className="odds-match-title">
                <span>{match.date} · {match.time} · {match.fields.leagueCode || "—"}</span>
                <strong>{teamName(match.homeName)} – {teamName(match.awayName)}</strong>
                <small>ID {match.matchId}</small>
              </div>
              <div className="odds-market-strip">
                {markets.filter((market) => marketHasOdds(match, market)).map((market) => (
                  <div className="odds-market" key={market.key}>
                    <b>{market.title}</b>
                    <span>{market.selections.filter(({ field }) => typeof match.fields[field] === "number").map(({ label, field }) => `${label}: ${formatOdds(match.fields[field])}`).join("  ·  ")}</span>
                  </div>
                ))}
                {!matchHasAnyOdds(match) && <span className="no-odds">Bu maçta kullanılabilir oran yok.</span>}
              </div>
            </article>
          ))}
        </div>
      </>
    );
  }

  function renderDataStatus() {
    if (!bulletin) return null;
    const warnings = bulletin.diagnostics.warnings;
    return (
      <div className="data-status">
        <div className="data-summary-grid">
          <div className="summary-tile"><span>Şema</span><strong>{bulletin.meta.schemaVersion}</strong></div>
          <div className="summary-tile"><span>Kaynak alan sayısı</span><strong>{bulletin.meta.sourceFieldCount}</strong></div>
          <div className="summary-tile"><span>Kaynak maç</span><strong>{bulletin.meta.sourceMatchCount}</strong></div>
          <div className="summary-tile"><span>Bültene alınan</span><strong>{bulletin.meta.includedMatchCount}</strong></div>
          <div className="summary-tile"><span>Reddedilen</span><strong>{bulletin.meta.rejectedMatchCount}</strong></div>
          <div className="summary-tile"><span>Uyarı sayısı</span><strong>{bulletin.meta.warningCount}</strong></div>
        </div>
        <section className="status-panel">
          <div className="section-heading"><div><h3>Market doluluk durumu</h3><p>Oranı bulunan maç sayısı · toplam {matches.length} maç</p></div><span>{activeMarkets}/9 aktif market</span></div>
          {markets.map((market) => {
            const count = marketCount(matches, market);
            const percent = matches.length ? (count / matches.length) * 100 : 0;
            return (
              <div className="market-progress" key={market.key}>
                <div><strong>{market.title}</strong><span>{count}/{matches.length}</span></div>
                <div className="progress-track"><span style={{ width: `${percent}%` }} /></div>
              </div>
            );
          })}
          <p className="integrity-note">Marketlerde oranı olmayan kayıtlar eksik veri olarak korunur. Ham 61 alanlı kayıtlar değiştirilmez. Açılış/kapanış oranı veya doğrulanmamış handikap değeri üretilmez.</p>
        </section>
        <section className="status-panel">
          <div className="section-heading"><div><h3>Kaynak uyarıları</h3><p>Veri dönüştürme sırasında tespit edilen kayıtlar</p></div><span>{warnings.length} kayıt</span></div>
          {warnings.length === 0 ? <p className="integrity-note">Uyarı bulunmuyor.</p> : (
            <div className="warning-list">
              {warnings.map((warning, index) => (
                <div className="warning-row" key={`${warning.code}-${warning.matchId}-${index}`}>
                  <span className="warning-icon">!</span>
                  <div><strong>{warning.message}</strong><small>Maç ID {warning.matchId} · Grup {warning.sourceGroup} / Kayıt {warning.sourceIndex}</small></div>
                  <code>{warning.code}</code>
                </div>
              ))}
            </div>
          )}
        </section>
        <div className="source-footnote">Kaynak dosya: {bulletin.meta.sourceFile} · Son üretim: {formatGeneratedAt(bulletin.meta.generatedAt)} · Market-oran eşleşmesi toplamı: {totalMarketQuotes}</div>
      </div>
    );
  }

  const descriptions: Record<Page, string> = {
    Bülten: "Maçları ve mevcut dokuz oran marketini tek ekranda incele.",
    Oranlar: "Kaynakta bulunan oranları karşılaşma bazında karşılaştır.",
    "Veri Durumu": "Şema, market doluluğu ve veri kalitesi uyarıları."
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">O</div>
          <div><strong>OranTahmin</strong><span>MAÇ VERİ PANELİ</span></div>
        </div>
        <div className="nav-label">ÇALIŞMA ALANI</div>
        <nav className="main-nav">
          {pages.map((page) => (
            <button className={activePage === page ? "nav-button active" : "nav-button"} key={page} onClick={() => setActivePage(page)}>
              <span className="nav-bullet" />{page}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className={error ? "connection-dot error" : "connection-dot"} />
          <span>{error ? "Veri bağlantı hatası" : loading ? "Bülten yükleniyor" : "Yerel JSON verisi"}</span>
          <small>0 TL · Yerel veri</small>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar"><span>ORANTAHMİN <i>/</i> {activePage.toLocaleUpperCase("tr-TR")}</span><span className="topbar-right">61 ALANLI KAYNAK ŞEMASI</span></header>
        <div className="page-wrap">
          <section className="page-heading">
            <div><span className="eyebrow">MAÇ VERİSİ · ANALİZ</span><h1>{activePage}</h1><p>{descriptions[activePage]}</p></div>
            <div className="data-state"><span className={error ? "state-light error" : "state-light"} />{loading ? "Yükleniyor" : error ? "Veri okunamadı" : "Veri yüklendi"}</div>
          </section>

          <section className="overview-grid">
            <div className="overview-card"><span>TOPLAM MAÇ</span><strong>{loading ? "—" : matches.length}</strong><small>Bültene alınan kayıt</small></div>
            <div className="overview-card"><span>CANLI / DEVAM EDEN</span><strong>{loading ? "—" : liveCount}</strong><small>Kaynak durum kodu 1–3</small></div>
            <div className="overview-card"><span>AKTİF MARKET</span><strong>{loading ? "—" : `${activeMarkets}/9`}</strong><small>En az bir oranı bulunan market</small></div>
            <div className="overview-card"><span>VERİ UYARISI</span><strong>{loading ? "—" : bulletin?.meta.warningCount ?? 0}</strong><small>Dönüştürme uyarısı</small></div>
          </section>

          <section className="content-panel">
            <div className="panel-top"><div><h2>{activePage}</h2><p>{descriptions[activePage]}</p></div><span className="source-tag">MACKOLIK JSON</span></div>
            {loading ? <div className="empty-state"><div className="loader" /><strong>Bülten yükleniyor</strong><span>Yerel JSON dosyası okunuyor.</span></div>
              : error ? <div className="empty-state error-state"><strong>Veri dosyası okunamadı</strong><span>{error}</span></div>
              : !bulletin ? <div className="empty-state"><strong>Bülten bulunamadı</strong></div>
              : activePage === "Bülten" ? renderBulletin()
              : activePage === "Oranlar" ? renderOdds()
              : renderDataStatus()}
          </section>
          <footer className="page-footer"><span>© 2026 OranTahmin</span><span>{bulletin?.meta.schemaVersion ?? "—"} · Son veri üretimi: {bulletin ? formatGeneratedAt(bulletin.meta.generatedAt) : "—"}</span></footer>
        </div>
      </main>
    </div>
  );
}

export default App;
