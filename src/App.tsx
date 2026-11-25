import { useEffect, useMemo, useState } from "react";
import { OddsService } from "./services/mackolikOddsService";
import type {
  BulletinDocument,
  Match,
  MatchStatus
} from "./types/match";
import "./index.css";

type Page = "Bülten" | "Oran Analizi" | "İstatistikler";

const pages: Page[] = ["Bülten", "Oran Analizi", "İstatistikler"];

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatNumber(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(2)
    : "—";
}

function formatPercent(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `%${value.toFixed(1)}`
    : "—";
}

function statusLabel(status: MatchStatus): string {
  const labels: Record<MatchStatus, string> = {
    scheduled: "Başlamadı",
    live: "Canlı",
    finished: "Tamamlandı",
    postponed: "Ertelendi",
    cancelled: "İptal"
  };

  return labels[status] ?? status;
}

function scoreLabel(match: Match): string {
  if (
    match.score?.home === null ||
    match.score?.home === undefined ||
    match.score?.away === null ||
    match.score?.away === undefined
  ) {
    return "—";
  }

  return `${match.score.home} - ${match.score.away}`;
}

function movement(opening: number | null, closing: number | null): string {
  if (
    opening === null ||
    closing === null ||
    !Number.isFinite(opening) ||
    !Number.isFinite(closing)
  ) {
    return "Veri yok";
  }

  const difference = closing - opening;
  const sign = difference > 0 ? "+" : "";

  return `${sign}${difference.toFixed(2)}`;
}

function App() {
  const [activePage, setActivePage] = useState<Page>("Bülten");
  const [bulletin, setBulletin] = useState<BulletinDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<MatchStatus | "all">("all");
  const [leagueFilter, setLeagueFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadBulletin() {
      setLoading(true);
      setError(null);

      try {
        const result = await OddsService.getBulletin();

        if (!cancelled) {
          setBulletin(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Bülten yüklenirken bilinmeyen bir hata oluştu."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadBulletin();

    return () => {
      cancelled = true;
    };
  }, []);

  const matches = bulletin?.matches ?? [];

  const leagues = useMemo(() => {
    const unique = new Map<string, string>();

    matches.forEach((match) => {
      unique.set(match.league.code, match.league.name);
    });

    return Array.from(unique.entries()).sort((a, b) =>
      a[1].localeCompare(b[1], "tr")
    );
  }, [matches]);

  const filteredMatches = useMemo(
    () =>
      OddsService.filterMatches(matches, {
        status: statusFilter,
        league: leagueFilter,
        team: teamFilter
      }),
    [matches, statusFilter, leagueFilter, teamFilter]
  );

  const liveCount = matches.filter((match) => match.status === "live").length;

  function renderEmpty(message: string) {
    return (
      <div className="empty-state">
        <div className="empty-icon">◎</div>
        <h3>{message}</h3>
        <p>
          Maçkolik JSON dosyasında bu ekran için kullanılabilir veri bulunmuyor.
        </p>
      </div>
    );
  }

  function renderBulletin() {
    return (
      <>
        <div className="filter-bar">
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as MatchStatus | "all")
            }
          >
            <option value="all">Tüm durumlar</option>
            <option value="scheduled">Başlamadı</option>
            <option value="live">Canlı</option>
            <option value="finished">Tamamlandı</option>
          </select>

          <select
            value={leagueFilter}
            onChange={(event) => setLeagueFilter(event.target.value)}
          >
            <option value="all">Tüm ligler</option>
            {leagues.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>

          <input
            value={teamFilter}
            onChange={(event) => setTeamFilter(event.target.value)}
            placeholder="Takım ara..."
          />
        </div>

        {filteredMatches.length === 0 ? (
          renderEmpty("Filtrelere uygun maç bulunamadı")
        ) : (
          <div className="match-list">
            {filteredMatches.map((match) => (
              <article className="match-row" key={match.id}>
                <div className="match-league">
                  <span>{match.league.country ?? "—"}</span>
                  <strong>{match.league.name}</strong>
                </div>

                <div className="match-time">
                  {formatTime(match.kickoff)}
                </div>

                <div className="match-teams">
                  <strong>{match.home_team}</strong>
                  <span>{match.away_team}</span>
                </div>

                <div className="match-result">
                  <strong>{scoreLabel(match)}</strong>
                  {match.status === "live" && match.minute !== null ? (
                    <span>{match.minute}'</span>
                  ) : (
                    <span>{statusLabel(match.status)}</span>
                  )}
                </div>

                <span className={`match-status ${match.status}`}>
                  {statusLabel(match.status)}
                </span>
              </article>
            ))}
          </div>
        )}
      </>
    );
  }

  function renderOdds() {
    if (matches.length === 0) {
      return renderEmpty("Oran verisi bulunamadı");
    }

    return (
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Karşılaşma</th>
              <th>Sonuç</th>
              <th>Açılış</th>
              <th>Kapanış</th>
              <th>Değişim</th>
              <th>2.5 Üst Açılış</th>
              <th>2.5 Üst Kapanış</th>
              <th>KG Var Açılış</th>
              <th>KG Var Kapanış</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((match) => {
              const ms = match.odds?.ms;
              const ou = match.odds?.ou_2_5;
              const kg = match.odds?.kg;

              return (
                <tr key={match.id}>
                  <td>
                    <strong>{match.home_team}</strong>
                    <span className="table-subtitle">{match.away_team}</span>
                  </td>
                  <td>1X2</td>
                  <td>
                    {formatNumber(ms?.opening?.["1"])} /{" "}
                    {formatNumber(ms?.opening?.X)} /{" "}
                    {formatNumber(ms?.opening?.["2"])}
                  </td>
                  <td>
                    {formatNumber(ms?.closing?.["1"])} /{" "}
                    {formatNumber(ms?.closing?.X)} /{" "}
                    {formatNumber(ms?.closing?.["2"])}
                  </td>
                  <td>
                    1: {movement(ms?.opening?.["1"] ?? null, ms?.closing?.["1"] ?? null)}
                    <br />
                    X: {movement(ms?.opening?.X ?? null, ms?.closing?.X ?? null)}
                    <br />
                    2: {movement(ms?.opening?.["2"] ?? null, ms?.closing?.["2"] ?? null)}
                  </td>
                  <td>{formatNumber(ou?.opening?.over)}</td>
                  <td>{formatNumber(ou?.closing?.over)}</td>
                  <td>{formatNumber(kg?.opening?.yes)}</td>
                  <td>{formatNumber(kg?.closing?.yes)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  function renderStatistics() {
    const matchesWithStats = matches.filter((match) => match.stats !== null);

    if (matchesWithStats.length === 0) {
      return renderEmpty("İstatistik verisi bulunamadı");
    }

    return (
      <div className="stats-match-list">
        {matchesWithStats.map((match) => {
          const stats = match.stats;

          if (!stats) return null;

          const distribution = stats.similar_odds_distribution;

          return (
            <article className="stats-match-card" key={match.id}>
              <div className="stats-match-heading">
                <div>
                  <strong>
                    {match.home_team} - {match.away_team}
                  </strong>
                  <span>{match.league.name}</span>
                </div>
                <span>Örneklem: {stats.sample_size ?? "—"}</span>
              </div>

              <div className="stats-values">
                <div>
                  <span>Benzer oran 1</span>
                  <strong>{formatPercent(distribution?.["1"])}</strong>
                </div>
                <div>
                  <span>Benzer oran X</span>
                  <strong>{formatPercent(distribution?.X)}</strong>
                </div>
                <div>
                  <span>Benzer oran 2</span>
                  <strong>{formatPercent(distribution?.["2"])}</strong>
                </div>
                <div>
                  <span>2.5 Üst</span>
                  <strong>{formatPercent(stats.over_2_5_rate)}</strong>
                </div>
                <div>
                  <span>Karşılıklı gol</span>
                  <strong>{formatPercent(stats.btts_rate)}</strong>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    );
  }

  const pageDescription: Record<Page, string> = {
    Bülten: "Maçkolik maç bülteni ve karşılaşma durumları.",
    "Oran Analizi": "Açılış ve kapanış oranlarının karşılaştırması.",
    İstatistikler: "Maç verilerinden gelen istatistik dağılımları."
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">O</div>
          <div>
            <div className="brand-name">OranTahmin</div>
            <div className="brand-caption">MAÇ ANALİZ PLATFORMU</div>
          </div>
        </div>

        <div className="nav-heading">MENÜ</div>

        <nav className="navigation">
          {pages.map((page) => (
            <button
              key={page}
              className={`nav-item ${activePage === page ? "active" : ""}`}
              onClick={() => setActivePage(page)}
            >
              <span className="nav-indicator" />
              {page}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="connection-indicator">
            <span className="status-dot" />
            <span>{error ? "Veri alınamadı" : "Maçkolik JSON"}</span>
          </div>
          <div className="version">OranTahmin v1.0</div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            Platform <span>/</span> {activePage}
          </div>
          <div className="topbar-label">ANALİZ PANELİ</div>
        </header>

        <section className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">ORANTAHMİN PLATFORMU</div>
              <h1>{activePage}</h1>
              <p>{pageDescription[activePage]}</p>
            </div>
            <div className="date-label">
              <span className="status-dot" />
              {loading ? "Yükleniyor" : error ? "Veri bekleniyor" : "JSON yüklendi"}
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">TOPLAM MAÇ</div>
              <div className="stat-value">{loading ? "…" : matches.length}</div>
              <div className="stat-description">Bülten kayıtları</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">CANLI MAÇ</div>
              <div className="stat-value">{loading ? "…" : liveCount}</div>
              <div className="stat-description">Canlı karşılaşmalar</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">İLK AÇILIŞ ORANI</div>
              <div className="stat-value">
                {matches.filter((match) => match.odds?.ms?.opening !== null && match.odds?.ms?.opening !== undefined).length}
              </div>
              <div className="stat-description">1X2 açılış verisi bulunan maç</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">SON GÜNCELLEME</div>
              <div className="stat-value stat-date">
                {bulletin?.meta.fetched_at
                  ? formatTime(bulletin.meta.fetched_at)
                  : "—"}
              </div>
              <div className="stat-description">
                {bulletin?.meta.bulletin_date ?? "Veri yok"}
              </div>
            </div>
          </div>

          <section className="content-panel">
            <div className="panel-heading">
              <div>
                <h2>{activePage}</h2>
                <p>{pageDescription[activePage]}</p>
              </div>
              <span className="panel-tag">
                {error ? "VERİ HATASI" : "MAÇKOLİK JSON"}
              </span>
            </div>

            {loading ? (
              renderEmpty("Bülten yükleniyor")
            ) : error ? (
              <div className="empty-state">
                <div className="empty-icon">!</div>
                <h3>Veri dosyası okunamadı</h3>
                <p>{error}</p>
                <span className="empty-note">
                  Beklenen konum: public/data/mackolik-bulletin.json
                </span>
              </div>
            ) : !bulletin ? (
              renderEmpty("Bülten bulunamadı")
            ) : activePage === "Bülten" ? (
              renderBulletin()
            ) : activePage === "Oran Analizi" ? (
              renderOdds()
            ) : (
              renderStatistics()
            )}
          </section>

          <footer className="page-footer">
            <span>© 2026 OranTahmin</span>
            <span>
              Kaynak: {bulletin?.meta.source ?? "—"}
              {" · "}
              {bulletin?.meta.version ?? "—"}
            </span>
          </footer>
        </section>
      </main>
    </div>
  );
}

export default App;