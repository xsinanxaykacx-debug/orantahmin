const MARKET_NAMES = {
  "1:1": "Maç Sonucu",
  "2:92": "Çifte Şans",
  "2:88": "İlk Yarı Sonucu",
  "2:36": "İkinci Yarı Sonucu",
  "2:77": "İlk Yarı Çifte Şans",
  "2:89": "Karşılıklı Gol",
  "2:720": "İlk Yarı Karşılıklı Gol",
  "2:101": "Alt / Üst",
  "2:60": "İlk Yarı Alt / Üst",
  "2:603": "Ev Sahibi Gol Alt / Üst",
  "2:604": "Deplasman Gol Alt / Üst",
  "2:100": "Handikaplı Maç Sonucu",
  "2:90": "İlk Yarı / Maç Sonucu",
  "2:91": "Tek / Çift",
  "2:4": "Toplam Gol Aralığı",
  "2:6": "Daha Çok Gol Olacak Yarı",
  "2:7": "Maç Sonucu ve Alt / Üst",
  "2:698": "Maç Sonucu ve Karşılıklı Gol",
  "2:700": "Alt / Üst ve Karşılıklı Gol",
  "2:48": "Korner Alt / Üst",
  "2:67": "Toplam Korner Aralığı",
  "2:822": "Ev Sahibi Korner Alt / Üst",
  "2:823": "Deplasman Korner Alt / Üst",
  "2:52": "Kim Daha Çok Korner Kullanır",
  "2:863": "Korner Handikap",
  "2:658": "Toplam Kart Alt / Üst",
  "2:865": "İlk Yarı Kart Alt / Üst",
  "2:824": "Kim Daha Çok Kart Görür",
  "2:17": "Kırmızı Kart Olur Mu"
};

function asNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function label(value) {
  return String(value ?? "").trim();
}

export function parseIddaaMarkets(event, marketConfig = {}) {
  return (event.m || []).map(m => {
    const code = `${Number(m.t)}:${Number(m.st)}`;
    const line = m.sov == null ? null : String(m.sov);
    return {
      t: Number(m.t),
      st: Number(m.st),
      line,
      code: `${code}:${line ?? ""}`,
      name: (marketConfig[`${Number(m.t)}_${Number(m.st)}`]?.n ||
        MARKET_NAMES[code] || `Market ${code}`)
        .replaceAll("{0}", line || "")
        .replaceAll("{h}", line || ""),
      outcomes: (m.o || []).map(o => ({
        no: Number(o.no),
        name: label(o.n),
        odd: asNumber(o.odd)
      }))
    };
  }).filter(m => m.outcomes.length > 0);
}
