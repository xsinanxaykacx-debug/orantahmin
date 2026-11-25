
import json
from decimal import Decimal, InvalidOperation
from collections import Counter, defaultdict
from pathlib import Path

# ============================================================
# MACKOLIK 61 ALAN ŞEMA KONTROLÜ
# Salt okunur: Kaynak JSON üzerinde değişiklik yapmaz.
# ============================================================

SOURCE = Path("data/raw/mackolik_program_20261125_151442.json")

ODDS_RANGE = range(16, 48)
MARKET_ID_RANGE = range(51, 61)

# Oran indeksleri -> ilgili market ID indeksi
MARKETS = {
    "Maç Sonucu": ([16, 17, 18], 51),
    "Çifte Şans": ([19, 20, 21], 52),
    "2,5 Gol Alt/Üst": ([22, 23], 53),
    "İlk Yarı Sonucu": ([33, 34, 35], 54),
    "Toplam Gol": ([29, 30, 31, 32], 55),
    "Karşılıklı Gol": ([39, 40], 56),
    "Handikaplı Maç Sonucu": ([36, 37, 38], 57),
    "1,5 Gol Alt/Üst": ([44, 45], 58),
    "3,5 Gol Alt/Üst": ([46, 47], 59),
    "İlk Yarı 1,5 Gol Alt/Üst": ([42, 43], 60),
}


def classify(value):
    """Ham değeri değiştirmeden sınıflandırır."""

    if value is None or value == "":
        return "BOŞ"

    if isinstance(value, str):
        normalized = value.strip()

        if normalized == "":
            return "BOŞ"

        if normalized == "-":
            return "TİRE"

        normalized = normalized.replace(",", ".")

    elif isinstance(value, (int, float, Decimal)) and not isinstance(value, bool):
        normalized = str(value)

    else:
        return "SAYISAL DEĞİL"

    try:
        number = Decimal(normalized)

        if not number.is_finite():
            return "SAYISAL DEĞİL"

        if number == 0:
            return "SIFIR (0,00)"

        return "GEÇERLİ SAYISAL"

    except (InvalidOperation, ValueError):
        return "SAYISAL DEĞİL"


def is_empty_market_id(value):
    return value is None or (
        isinstance(value, str) and value.strip() == ""
    )


def collect_matches(data):
    matches = []

    for group in data.get("m", []):
        group_matches = group.get("m", [])

        if not isinstance(group_matches, list):
            continue

        for match in group_matches:
            if isinstance(match, list):
                matches.append(match)

    return matches


def print_distribution(title, indices, matches):
    print("\n" + "=" * 75)
    print(title)
    print("=" * 75)

    totals = Counter()

    print(
        f"{'İndeks':<10}"
        f"{'Sıfır':>10}"
        f"{'Tire':>10}"
        f"{'Boş':>10}"
        f"{'Sayısal':>12}"
        f"{'Diğer':>12}"
    )

    for index in indices:
        counts = Counter()

        for match in matches:
            if index >= len(match):
                continue

            counts[classify(match[index])] += 1

        totals.update(counts)

        print(
            f"{index:<10}"
            f"{counts['SIFIR (0,00)']:>10}"
            f"{counts['TİRE']:>10}"
            f"{counts['BOŞ']:>10}"
            f"{counts['GEÇERLİ SAYISAL']:>12}"
            f"{counts['SAYISAL DEĞİL']:>12}"
        )

    print("-" * 75)
    print(
        f"{'TOPLAM':<10}"
        f"{totals['SIFIR (0,00)']:>10}"
        f"{totals['TİRE']:>10}"
        f"{totals['BOŞ']:>10}"
        f"{totals['GEÇERLİ SAYISAL']:>12}"
        f"{totals['SAYISAL DEĞİL']:>12}"
    )


def main():
    if not SOURCE.exists():
        print(f"HATA: Kaynak dosya bulunamadı: {SOURCE}")
        return

    with SOURCE.open("r", encoding="utf-8-sig") as file:
        data = json.load(file)

    matches = collect_matches(data)

    print("=" * 75)
    print("MACKOLIK 61 ALAN ŞEMA KONTROL RAPORU")
    print("=" * 75)

    print(f"Kaynak dosya : {SOURCE}")
    print(f"Toplam maç   : {len(matches)}")

    # --------------------------------------------------------
    # 1. SATIR UZUNLUKLARI
    # --------------------------------------------------------

    print("\n[1] SATIR UZUNLUKLARI")

    length_counts = Counter(len(match) for match in matches)

    for length, count in sorted(length_counts.items()):
        status = "BEKLENEN" if length == 61 else "UYUMSUZ"
        print(f"{length} alan: {count} maç ({status})")

    malformed = [
        match for match in matches if len(match) != 61
    ]

    print(f"61 alan dışında kalan maç: {len(malformed)}")

    for match in malformed[:10]:
        print(
            f"  Maç ID={match[0] if match else '?'} "
            f"Takımlar={match[1] if len(match) > 1 else '?'} - "
            f"{match[3] if len(match) > 3 else '?'} "
            f"Alan sayısı={len(match)}"
        )

    # --------------------------------------------------------
    # 2. BEKLENMEYEN NESNE / LİSTE TİPLERİ
    # --------------------------------------------------------

    print("\n[2] BEKLENMEYEN NESNE / LİSTE TİPLERİ")

    unexpected = defaultdict(list)
    type_counts = Counter()

    for match in matches:
        for index, value in enumerate(match):
            if isinstance(value, dict):
                type_counts["dict"] += 1

                if index != 25:
                    unexpected[index].append(value)

            elif isinstance(value, list):
                type_counts["list"] += 1
                unexpected[index].append(value)

    print(f"Toplam nesne alanı (dict): {type_counts['dict']}")
    print(f"Toplam liste alanı (list): {type_counts['list']}")

    if unexpected:
        for index, values in sorted(unexpected.items()):
            print(
                f"İndeks {index}: {len(values)} adet "
                f"beklenmeyen nesne/liste"
            )
            print(f"  Örnek: {values[0]!r}")
    else:
        print("matchData[25] dışında nesne/liste bulunmadı.")

    # 25. indeksin beklenen tipini de kontrol et.
    detail_types = Counter(
        type(match[25]).__name__
        for match in matches
        if len(match) > 25
    )

    print(f"İndeks 25 tip dağılımı: {dict(detail_types)}")

    # --------------------------------------------------------
    # 3. ORAN ALANLARI
    # --------------------------------------------------------

    print_distribution(
        "[3] ORAN ALANLARI (16–47)",
        ODDS_RANGE,
        matches
    )

    # --------------------------------------------------------
    # 4. MARKET ID ALANLARI
    # --------------------------------------------------------

    print_distribution(
        "[4] MARKET ID ALANLARI (51–60)",
        MARKET_ID_RANGE,
        matches
    )

    # --------------------------------------------------------
    # 5. 0,00 ORANLARININ MARKET ID DURUMU
    # --------------------------------------------------------

    print("\n" + "=" * 75)
    print("[5] SIFIR ORANLARINDA MARKET ID DOLULUK KONTROLÜ")
    print("=" * 75)

    for market_name, (odds_indices, market_id_index) in MARKETS.items():
        zero_filled = 0
        zero_empty = 0
        zero_total = 0

        valid_filled = 0
        valid_empty = 0

        for match in matches:
            if len(match) <= max(odds_indices + [market_id_index]):
                continue

            market_id = match[market_id_index]
            id_empty = is_empty_market_id(market_id)

            for odds_index in odds_indices:
                category = classify(match[odds_index])

                if category == "SIFIR (0,00)":
                    zero_total += 1

                    if id_empty:
                        zero_empty += 1
                    else:
                        zero_filled += 1

                elif category == "GEÇERLİ SAYISAL":
                    if id_empty:
                        valid_empty += 1
                    else:
                        valid_filled += 1

        print(f"\n{market_name}")
        print(f"  Oran indeksleri       : {odds_indices}")
        print(f"  Market ID indeksi     : {market_id_index}")
        print(f"  0,00 toplamı          : {zero_total}")
        print(f"    Market ID dolu      : {zero_filled}")
        print(f"    Market ID boş       : {zero_empty}")
        print(f"  Geçerli oran + ID dolu: {valid_filled}")
        print(f"  Geçerli oran + ID boş : {valid_empty}")

    # --------------------------------------------------------
    # 6. SONUÇ
    # --------------------------------------------------------

    print("\n" + "=" * 75)
    print("[6] KONTROL SONUCU")
    print("=" * 75)

    if len(matches) == 107 and all(len(m) == 61 for m in matches):
        print("107 maçın tamamı 61 alanlı.")
    else:
        print("UYARI: Maç sayısı veya satır uzunluklarında farklılık var.")

    if unexpected:
        print("UYARI: Beklenmeyen nesne/liste tipleri bulundu.")
    else:
        print("Beklenmeyen nesne/liste tipi bulunmadı.")

    print("\nBu betik hiçbir kaynak dosyayı değiştirmedi.")


if __name__ == "__main__":
    main()
