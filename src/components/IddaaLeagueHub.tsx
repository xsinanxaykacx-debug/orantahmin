import { useEffect, useMemo, useState } from "react";
import "./FotMobLeagueHub.css";
import "./IddaaLeagueHub.css";
import { readStandingsGoals, readStandingsPosition, readStandingsStat } from "../lib/iddaaStandings.ts";

type LeagueSummary = { id: number; name: string; country: string | null; logo: string; matchCount: number };
type Payload = { source: string; season?: { id: number; name: string }; fetchedAt?: string; data: Record<string, any>; feedErrors?: Record<string, string>; error?: string };
type TeamPayload = { team?: any; players: any[]; facts: Record<string, any>; injuries: any[]; error?: string };
type View = "standings" | "fixtures" | "leaders" | "teams";
type Mode = "total" | "home" | "away";
type Leader = "goals" | "assists" | "cards";

const arr = (v: any): any[] => Array.isArray(v) ? v : [];
const val = (...v: any[]) => v.find(x => x !== undefined && x !== null && x !== "");
const txt = (v: any) => typeof v === "string" || typeof v === "number" ? String(v) : "";
const name = (v: any) => typeof v === "string" || typeof v === "number" ? String(v) : txt(val(v?.name, v?._name, v?.fullname, v?.shortname, v?.teamname));
const uid = (v: any) => txt(val(v?._id, v?.id, v?.uid, v?.teamUid));
const team = (r: any) => val(r?.team, r?.participant, r?.competitor, {});
const teamName = (r: any) => name(team(r)) || txt(r?.teamname) || "Takım";
const teamKey = (r: any) => uid(team(r)) || teamName(r).toLocaleLowerCase("tr-TR");
const number = (v: any) => v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);

function form(value: any): string[] {
  const raw = Array.isArray(value) ? value.join("") : txt(value);
  return raw.toUpperCase().split("").filter(x => "WDLGBMY".includes(x)).slice(-5).map(x => x === "W" || x === "G" ? "G" : x === "D" || x === "B" ? "B" : "M");
}
function tables(data: any): any[] { return arr(data?.season?.tables || data?.tables); }
function rowsFor(data: any, mode: Mode): any[] {
  const list = tables(data);
  const table = mode === "total"
    ? list.find(x => /total|overall|toplam/i.test(txt(val(x?.name, x?.tabletype, x?.type)))) || list[0]
    : list.find(x => mode === "home" ? /home|ev sahibi|iç saha/i.test(txt(val(x?.name, x?.tabletype, x?.type))) : /away|deplasman/i.test(txt(val(x?.name, x?.tabletype, x?.type))));
  if (table) return arr(table.tablerows || table.rows);
  if (mode === "total") return arr(data?.season?.tables?.[0]?.tablerows || data?.tablerows || data?.dynamicTable?.rows || data?.rows);
  return [];
}
function dateText(v: any): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  const d = typeof v === "number" || /^\d{10,13}$/.test(String(v)) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? txt(v) : d.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function fixtureTeam(m: any, side: "home" | "away"): any {
  const event = val(m?.sport_event, m?.event, m);
  const competitors = arr(event?.competitors || event?.teams);
  const qualified = competitors.find((entry: any) => txt(entry?.qualifier).toLowerCase() === side);
  return val(m?.[side]?.team, m?.[side], m?.[side === "home" ? "_home" : "_away"], m?.[side === "home" ? "team1" : "team2"], qualified, competitors[side === "home" ? 0 : 1], {});
}
function fixtureScore(m: any, side: "home" | "away"): any {
  const i = side === "home" ? 0 : 1;
  const status = val(m?.sport_event_status, m?.status, {});
  return val(m?.[side]?.score, m?.[side]?.goals, m?.[side === "home" ? "_homescore" : "_awayscore"], m?.[side === "home" ? "homeScore" : "awayScore"], m?.result?.[side], m?.result?.[i], status?.[side === "home" ? "home_score" : "away_score"], m?.scores?.[i]?.score);
}
function roundOf(m: any): string {
  const r = val(m?.round?.name, m?.roundname, m?.roundName, m?.matchday, m?.round, m?._round, m?.stage?.name, m?.sport_event?.sport_event_context?.round?.name, m?.sport_event?.sport_event_context?.round?.number);
  return typeof r === "object" ? name(r) : txt(r);
}
function playerOf(e: any): any { return val(e?.player, e?.participant, e); }
function playerName(e: any): string { return name(playerOf(e)) || txt(e?.playername) || "Oyuncu"; }
function playerTeam(e: any): string {
  const t = val(e?.team, e?.player?.team, e?.teamname);
  if (t) return typeof t === "string" ? t : name(t);
  const teams = e?.teams;
  if (Array.isArray(teams)) return name(teams[0]) || "—";
  if (teams && typeof teams === "object") return name(Object.values(teams)[0]) || "—";
  return "—";
}
function leaderStat(e: any, mode: Leader): string {
  const t = e?.total || e?.stats || e;
  if (mode === "cards") {
    const y = number(val(t?.yellow_cards, t?.yellowcards, t?.yellow));
    const r = number(val(t?.red_cards, t?.redcards, t?.red));
    if (y !== null || r !== null) return String(y ?? 0) + "S / " + String(r ?? 0) + "K";
  }
  return txt(val(mode === "goals" ? t?.goals : t?.assists, t?.total, e?.value)) || "—";
}
function TeamMark({ label }: { label: string }) { return <span className="iddaa-team-mark">{label.slice(0, 1).toLocaleUpperCase("tr-TR") || "?"}</span>; }

export function IddaaLeagueHub({ league }: { league: LeagueSummary }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("standings");
  const [mode, setMode] = useState<Mode>("total");
  const [leader, setLeader] = useState<Leader>("goals");
  const [fixtureMode, setFixtureMode] = useState<"upcoming" | "results">("upcoming");
  const [round, setRound] = useState("all");
  const [teamUid, setTeamUid] = useState("");
  const [teamData, setTeamData] = useState<TeamPayload | null>(null);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    fetch("/api/iddaa-superlig", { signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "İddaa Süper Lig verisi alınamadı.");
      return body as Payload;
    }).then(body => { if (!controller.signal.aborted) setPayload(body); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "İddaa verisi alınamadı."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [league.id]);

  const data = payload?.data || {};
  const tableRows = useMemo(() => rowsFor(data.standings, mode), [data.standings, mode]);
  const formMap = useMemo(() => new Map(arr(data.form?.teams).map(r => { const recent = arr(r?.form?.total).slice(0, 5).reverse().map(item => item?.value); return [txt(val(r?.team?.name, r?.["Takım"], r?.teamname, teamKey(r))).toLocaleLowerCase("tr-TR"), form(recent)]; })), [data.form]);
  const upcoming = arr(data.fixtures?.matches || data.fixtures?.events || data.fixtures?.schedules || data.fixtures?.NextXEvents || data.fixtures?.schedule || data.fixtures?.data?.schedules || data.fixtures);
  const results = arr(data.results?.matches || data.results?.events || data.results);
  const currentFixtures = fixtureMode === "upcoming" ? upcoming : results;
  const rounds = useMemo(() => [...new Set([...upcoming, ...results].map(roundOf).filter(Boolean))].sort((a,b) => Number(a)-Number(b) || a.localeCompare(b,"tr")), [upcoming, results]);
  const filteredFixtures = currentFixtures.filter(m => round === "all" || roundOf(m) === round);
  const leaders = arr(data[leader]?.players);
  const teams = arr(data.teams?.teams).filter(t => Number(val(t?.teamtypeid, t?.teamTypeId, 0)) === 0);
  const selectedTeam = teams.find(t => uid(t) === teamUid);

  useEffect(() => {
    if (!teamUid) { setTeamData(null); return; }
    const controller = new AbortController();
    setTeamLoading(true); setTeamError(null); setTeamData(null);
    fetch("/api/iddaa-superlig-team?teamUid=" + encodeURIComponent(teamUid), { signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Takım kadrosu alınamadı.");
      return body as TeamPayload;
    }).then(body => { if (!controller.signal.aborted) setTeamData(body); })
      .catch(reason => { if (!controller.signal.aborted) setTeamError(reason instanceof Error ? reason.message : "Takım kadrosu alınamadı."); })
      .finally(() => { if (!controller.signal.aborted) setTeamLoading(false); });
    return () => controller.abort();
  }, [teamUid]);

  const tabs: Array<[View, string]> = [["standings","Puan Durumu"],["fixtures","Fikstür"],["leaders","Liderler"],["teams","Takım Kadroları"]];
  return <div className="league-hub iddaa-league-hub">
    <header className="league-hub-header">
      <div className="league-hub-logo"><span>TR</span></div>
      <div><span className="eyebrow">İDDAA LİG MERKEZİ</span><h2>Türkiye Süper Lig</h2><p>{payload?.season?.name || "Süper Lig 26/27"} · {payload?.fetchedAt ? "Güncelleme: " + dateText(payload.fetchedAt) : "Güncel sezon"}</p></div>
      <div className="league-hub-count"><b>{tableRows.length || 18}</b><span>Takım</span></div>
    </header>
    {loading ? <div className="league-loading">İddaa puan durumu, fikstür ve oyuncu verileri yükleniyor…</div>
    : error ? <div className="league-warning">{error}</div>
    : <>
      <nav className="iddaa-main-tabs">{tabs.map(([id,label]) => <button type="button" key={id} className={view===id?"active":""} onClick={() => setView(id)}>{label}</button>)}</nav>
      {view === "standings" ? <section className="info-card league-panel league-table-panel">
        <div className="card-heading"><span>PUAN DURUMU</span><small>{payload?.season?.name || "2026/27"}</small></div>
        <div className="iddaa-subtabs">{(["total","home","away"] as Mode[]).map((m,i)=><button type="button" key={m} className={mode===m?"active":""} onClick={()=>setMode(m)}>{["Toplam","Ev Sahibi","Deplasman"][i]}</button>)}</div>
        {tableRows.length ? <div className="league-table-scroll"><table className="league-table iddaa-standings-table">
          <thead><tr><th>Poz</th><th>Takım</th><th>O</th><th>G</th><th>B</th><th>M</th><th>AG:YG</th><th>+/-</th><th>P</th><th>Form</th></tr></thead>
          <tbody>{tableRows.map((r:any,i:number)=>{
            const t=val(r?.team,r?.participant,r?.competitor,r?.["Takım"],{}), n=name(t)||txt(r?.teamname)||"Takım", f=form(val(r?.Form,r?.form,r?.recentform,r?.last5,formMap.get(n.toLocaleLowerCase("tr-TR"))));
            const p=readStandingsPosition(r,i+1);
            const o=readStandingsStat(r,mode,["played","matches","matchplayed","_played","_matches"],"O");
            const g=readStandingsStat(r,mode,["won","wins","win"],"G");
            const b=readStandingsStat(r,mode,["drawn","draws","draw"],"B");
            const l=readStandingsStat(r,mode,["lost","losses","loss"],"M");
            const [gf,ga]=readStandingsGoals(r,mode);
            const gd=readStandingsStat(r,mode,["goalsdiff","goaldifference","goal_diff"],"+/-");
            const pts=readStandingsStat(r,mode,["points","pts"],"P");
            return <tr key={uid(t)||n}><td>{p}</td><td className="league-team-cell"><TeamMark label={n}/><span>{n}</span></td><td>{txt(o)||"—"}</td><td>{txt(g)||"—"}</td><td>{txt(b)||"—"}</td><td>{txt(l)||"—"}</td><td>{gf==null&&ga==null?"—":(txt(gf)||"—")+":"+(txt(ga)||"—")}</td><td>{gd==null?"—":(Number(gd)>0?"+":"")+String(gd)}</td><td><b>{txt(pts)||"—"}</b></td><td><span className="league-form">{f.length?f.map((x,j)=><i key={j} className={"league-form-"+x.toLowerCase()} title={x==="G"?"Galibiyet":x==="B"?"Beraberlik":"Mağlubiyet"}>{x}</i>):"—"}</span></td></tr>;
          })}</tbody>
        </table></div> : <div className="league-empty">{mode==="total"?"Puan tablosu verisi bulunamadı.":"Kaynak bu görünüm için ayrı bir tablo sağlamadı."}</div>}
      </section> : null}
      {view === "fixtures" ? <section className="info-card league-panel league-fixture-panel">
        <div className="card-heading"><span>FİKSTÜR VE SONUÇLAR</span><small>{filteredFixtures.length} karşılaşma</small></div>
        <div className="iddaa-subtabs"><button type="button" className={fixtureMode==="upcoming"?"active":""} onClick={()=>{setFixtureMode("upcoming");setRound("all");}}>Fikstür</button><button type="button" className={fixtureMode==="results"?"active":""} onClick={()=>{setFixtureMode("results");setRound("all");}}>Sonuçlar</button></div>
        {rounds.length?<label className="iddaa-round-filter">Tur <select value={round} onChange={e=>setRound(e.target.value)}><option value="all">Tüm turlar</option>{rounds.map(r=><option key={r} value={r}>{r}</option>)}</select></label>:null}
        {filteredFixtures.length?<div className="league-fixtures">{filteredFixtures.map((m:any,i:number)=>{
          const event=val(m?.sport_event,m?.event,m),h=fixtureTeam(m,"home"),a=fixtureTeam(m,"away"),hn=name(h)||"Ev sahibi",an=name(a)||"Deplasman",hs=fixtureScore(m,"home"),as=fixtureScore(m,"away");
          return <div className="league-fixture" key={txt(val(m?._id,m?.id,m?.matchid,m?.matchId,event?.id,i))}><div className="league-fixture-time">{dateText(val(m?.date,m?._dt,m?.datetime,m?.starttime,m?.time,event?.start_time))}<small>{roundOf(m)||txt(val(m?.status?.name,m?.status,m?._status))||"—"}</small></div><div className="league-fixture-teams"><span><TeamMark label={hn}/>{hn}</span><span><TeamMark label={an}/>{an}</span></div><b className="league-fixture-score">{hs!=null&&as!=null?String(hs)+" : "+String(as):"— : —"}</b></div>;
        })}</div>:<div className="league-empty">Bu görünümde listelenebilir maç bulunamadı.</div>}
        {fixtureMode==="upcoming"&&payload?.feedErrors?.fixtures?<p className="iddaa-feed-warning">{payload.feedErrors.fixtures}</p>:null}
      </section>:null}
      {view === "leaders" ? <section className="info-card league-panel league-scorers-panel">
        <div className="card-heading"><span>OYUNCU LİDERLERİ</span><small>İddaa · İlk 10</small></div>
        <div className="iddaa-subtabs">{(["goals","assists","cards"] as Leader[]).map((m,i)=><button type="button" key={m} className={leader===m?"active":""} onClick={()=>setLeader(m)}>{["Goller","Asistler","Kartlar"][i]}</button>)}</div>
        {leaders.length?<div className="league-scorers">{leaders.slice(0,10).map((e:any,i:number)=>{
          const total=e?.total||e?.stats||{}, matches=val(total?.matches,total?.played), pid=val(e?.player?._id,e?.player?.id,e?._playerid,e?.id);
          return <div key={txt(pid)||i}><span>{i+1}</span><b>{playerName(e)}<small>{playerTeam(e)}</small></b><strong>{leaderStat(e,leader)}{matches!=null?<small>{matches} maç</small>:null}</strong></div>;
        })}</div>:<div className="league-empty">{payload?.feedErrors?.[leader]||"Bu kategoride oyuncu verisi bulunamadı."}</div>}
      </section>:null}
      {view === "teams" ? <section className="info-card league-panel iddaa-team-panel">
        <div className="card-heading"><span>TAKIM KADROLARI</span><small>{teams.length||18} takım</small></div>
        <label className="iddaa-team-select">Takım seç <select value={teamUid} onChange={e=>setTeamUid(e.target.value)}><option value="">Takım seçin</option>{teams.map(t=><option key={uid(t)} value={uid(t)}>{name(t)}</option>)}</select></label>
        {teamLoading?<div className="league-loading">Kadro yükleniyor…</div>:teamError?<div className="league-warning">{teamError}</div>:teamData?<div className="iddaa-squad-content">
          <h3>{name(teamData.team)||name(selectedTeam)||"Takım kadrosu"}</h3>
          {arr(teamData.players).length?<div className="iddaa-squad-grid">{teamData.players.map((p:any,i:number)=>{
            const id=txt(val(p?._id,p?.id,p?.playerid)), fact=teamData.facts?.[id], stats=fact?.stats?.teams?.[teamUid]?.seasons?.[String(payload?.season?.id||143916)]||fact?.stats||{}, injury=arr(teamData.injuries).find((x:any)=>txt(val(x?.player?._id,x?.player?.id))===id);
            return <div className="iddaa-squad-player" key={id||i}><span className="iddaa-shirt">{txt(val(p?.shirtnumber,p?.shirt_number,p?.number))||"—"}</span><div><b>{name(p)||txt(p?.fullname)||"Oyuncu"}</b><small>{name(p?.position)||txt(p?.position)||"—"}{injury?" · Durum bildirimi":""}</small></div><strong>{txt(val(stats?.matches,stats?.played))||"—"}<small>maç</small></strong></div>;
          })}</div>:<div className="league-empty">Bu takım için kadro verisi bulunamadı.</div>}
        </div>:<div className="league-empty">Kadro ve oyuncu istatistiklerini görmek için takım seçin.</div>}
      </section>:null}
      <p className="league-source-note">Kaynak: iddaa.com · Sportradar Gismo. Veriler güncel sezon servislerinden alınır.</p>
    </>}
  </div>;
}
