
import json
from collections import Counter

FILE = "data/raw/mackolik_program_20261125_151442.json"

def empty(v):
    return v is None or v == ""

def show(v):
    return "-" if empty(v) else str(v)

with open(FILE, "r", encoding="utf-8-sig") as f:
    data = json.load(f)

matches = [
    m for group in data["m"]
    for m in group["m"]
    if isinstance(m, list) and len(m) == 61
]

# Yalnızca 57. indeksi dolu olan maçlar
selected = [m for m in matches if not empty(m[57])]

print(f"TOPLAM MAÇ: {len(matches)}")
print(f"HANDİKAP MARKET ID DOLU: {len(selected)}")
print("\n1) MAÇ BAZINDA HANDİKAP VERİLERİ")
print("-" * 115)

for m in selected:
    print(
        f"ID: {show(m[0]):<10} "
        f"{show(m[1])} - {show(m[3])} | "
        f"Durum(05): {show(m[5]):<5} | "
        f"Handikap(14-15): {show(m[14]):>6} / {show(m[15]):<6} | "
        f"Oran(36-38): {show(m[36]):>6} / {show(m[37]):>6} / {show(m[38]):>6} | "
        f"Market ID(57): {show(m[57])}"
    )

print("\n2) İLGİLİ ALANLARIN DAĞILIMI")
print("-" * 70)

fields = {
    5: "Maç durumu",
    14: "Handikap değeri 1",
    15: "Handikap değeri 2",
    36: "Handikaplı MS 1",
    37: "Handikaplı MS X",
    38: "Handikaplı MS 2",
    57: "Handikap market ID",
}

for idx, name in fields.items():
    counts = Counter(show(m[idx]) for m in selected)
    print(f"\n[{idx:02}] {name} — {len(counts)} farklı değer")
    for value, count in counts.most_common():
        print(f"  {value:<15} {count:>3} maç")

print("\n3) 24 MAÇTA TÜM ALANLARIN ORTAK DESENİ")
print("-" * 70)

for idx in range(61):
    values = [show(m[idx]) for m in selected]
    counts = Counter(values)
    if len(counts) == 1:
        print(f"[{idx:02}] SABİT: {values[0]} ({len(values)} maç)")
    elif all(empty(m[idx]) for m in selected):
        print(f"[{idx:02}] TAMAMI BOŞ")
    elif sum(empty(m[idx]) for m in selected) > 0:
        print(
            f"[{idx:02}] Boş: "
            f"{sum(empty(m[idx]) for m in selected)}/{len(selected)}"
        )

print("\n4) HANDİKAP DEĞERİ VE ORAN BİRLİKTE KONTROL")
print("-" * 70)

patterns = Counter(
    (
        show(m[14]), show(m[15]),
        show(m[36]), show(m[37]), show(m[38])
    )
    for m in selected
)

for pattern, count in patterns.most_common():
    print(
        f"14={pattern[0]}, 15={pattern[1]} | "
        f"36={pattern[2]}, 37={pattern[3]}, 38={pattern[4]} "
        f"=> {count} maç"
    )

print("\nKONTROL TAMAMLANDI. KAYNAK DOSYADA DEĞİŞİKLİK YAPILMADI.")
