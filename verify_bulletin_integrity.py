
from pathlib import Path
from collections import Counter
import json
import math
import sys


ROOT = Path(__file__).resolve().parent

RAW_PATH = ROOT / "data/raw/mackolik_program_20261125_151442.json"
BULLETIN_PATH = ROOT / "public/data/mackolik-bulletin.json"

# normalized alan adı, ham alan indeksi
ODDS_FIELDS = [
    ("ms1", 16), ("msX", 17), ("ms2", 18),
    ("doubleChance1X", 19), ("doubleChance12", 20),
    ("doubleChanceX2", 21),
    ("goals25Under", 22), ("goals25Over", 23),
    ("totalGoals01", 29), ("totalGoals23", 30),
    ("totalGoals46", 31), ("totalGoals7Plus", 32),
    ("halfTimeResult1", 33), ("halfTimeResultX", 34),
    ("halfTimeResult2", 35),
    ("handicapMs1", 36), ("handicapMsX", 37),
    ("handicapMs2", 38),
    ("bttsYes", 39), ("bttsNo", 40),
    ("halfTimeGoals15Under", 42),
    ("halfTimeGoals15Over", 43),
    ("goals15Under", 44), ("goals15Over", 45),
    ("goals35Under", 46), ("goals35Over", 47),
]

# Market alanı, ham market ID indeksi, ilişkili oran alanları
MARKETS = [
    ("marketMs", 51, [("ms1", 16), ("msX", 17), ("ms2", 18)]),
    ("marketDoubleChance", 52, [
        ("doubleChance1X", 19), ("doubleChance12", 20),
        ("doubleChanceX2", 21),
    ]),
    ("marketGoals25", 53, [
        ("goals25Under", 22), ("goals25Over", 23),
    ]),
    ("marketHalfTimeResult", 54, [
        ("halfTimeResult1", 33), ("halfTimeResultX", 34),
        ("halfTimeResult2", 35),
    ]),
    ("marketTotalGoals", 55, [
        ("totalGoals01", 29), ("totalGoals23", 30),
        ("totalGoals46", 31), ("totalGoals7Plus", 32),
    ]),
    ("marketBtts", 56, [
        ("bttsYes", 39), ("bttsNo", 40),
    ]),
    ("marketHandicapMs", 57, [
        ("handicapMs1", 36), ("handicapMsX", 37),
        ("handicapMs2", 38),
    ]),
    ("marketGoals15", 58, [
        ("goals15Under", 44), ("goals15Over", 45),
    ]),
    ("marketGoals35", 59, [
        ("goals35Under", 46), ("goals35Over", 47),
    ]),
    ("marketHalfTimeGoals15", 60, [
        ("halfTimeGoals15Under", 42),
        ("halfTimeGoals15Over", 43),
    ]),
]


errors = []


def fail(message):
    errors.append(message)
    print("[HATA]", message)


def load_json(path):
    if not path.exists():
        raise FileNotFoundError(str(path))

    with path.open("r", encoding="utf-8-sig") as file:
        return json.load(file)


def clean_text(value):
    if value is None:
        return None

    value = str(value).strip()

    if value in ("", "-"):
        return None

    return value


def parse_number(value):
    if value is None:
        return None

    text = str(value).strip()

    if text in ("", "-"):
        return None

    try:
        number = float(text.replace(",", "."))
    except ValueError:
        return None

    if not math.isfinite(number):
        return None

    return number


def normalize_odds(value):
    number = parse_number(value)

    if number is None or number == 0:
        return None

    return number


def normalize_line(value):
    # Handikap çizgisinde sıfır geçerlidir.
    return parse_number(value)


def same_number(expected, actual):
    if expected is None:
        return actual is None

    if actual is None or isinstance(actual, bool):
        return False

    try:
        return math.isclose(
            float(expected),
            float(actual),
            rel_tol=1e-9,
            abs_tol=1e-9,
        )
    except (TypeError, ValueError):
        return False


def raw_token(value):
    if value is None:
        return "EMPTY"

    text = str(value).strip()

    if text == "":
        return "EMPTY"

    if text == "-":
        return "DASH"

    number = parse_number(text)

    if number == 0:
        return "ZERO:" + text

    if number is not None:
        return "VALID"

    return "OTHER:" + text


def main():
    raw_doc = load_json(RAW_PATH)
    bulletin = load_json(BULLETIN_PATH)

    raw_groups = raw_doc["m"]
    bulletin_matches = bulletin["matches"]

    # Kaynak konumu üzerinden indeksleme.
    raw_by_position = {}
    raw_rows = []
    match_ids = Counter()

    for group_index, group in enumerate(raw_groups):
        for match_index, row in enumerate(group["m"]):
            raw_by_position[(group_index, match_index)] = row
            raw_rows.append(row)
            match_ids[str(row[0])] += 1

    print("\n=== DOSYA VE MAÇ SAYILARI ===")
    print("Ham maç:", len(raw_rows))
    print("Bülten maç:", len(bulletin_matches))
    print("Ham alan uzunlukları:", sorted({
        len(row) for row in raw_rows
    }))

    if len(raw_rows) != len(bulletin_matches):
        fail("Ham maç sayısı ile bülten maç sayısı farklı.")

    # Ham oran hücrelerindeki 0,00 / - / boş ayrımı.
    odds_tokens = Counter()

    for row in raw_rows:
        for _, raw_index in ODDS_FIELDS:
            odds_tokens[raw_token(row[raw_index])] += 1

    print("\n=== HAM ORAN DEĞERLERİ ===")
    for token, count in sorted(odds_tokens.items()):
        print(f"{token}: {count}")

    # Bülten kayıtlarını kaynak grup/maç indeksiyle kontrol et.
    checked = 0

    for match in bulletin_matches:
        source = match.get("source") or {}

        group_index = source.get("groupIndex")
        match_index = source.get("matchIndex")

        position = (group_index, match_index)

        if position not in raw_by_position:
            fail(f"Kaynak konumu bulunamadı: {position}")
            continue

        source_row = raw_by_position[position]
        fields = match.get("fields") or {}

        checked += 1

        if len(source_row) != 61:
            fail(
                f"{match.get('matchId')}: ham alan sayısı "
                f"{len(source_row)}, beklenen 61."
            )

        if match.get("raw") != source_row:
            fail(
                f"{match.get('matchId')}: bültendeki raw "
                "dizi kaynak satırla aynı değil."
            )

        if str(match.get("matchId")) != str(source_row[0]):
            fail(
                f"{match.get('matchId')}: matchId kaynak "
                "satırla uyuşmuyor."
            )

        # 26 oran alanının normalizasyon kontrolü.
        for field_name, raw_index in ODDS_FIELDS:
            expected = normalize_odds(source_row[raw_index])
            actual = fields.get(field_name)

            if not same_number(expected, actual):
                fail(
                    f"{match.get('matchId')} / {field_name}: "
                    f"ham={source_row[raw_index]!r}, "
                    f"beklenen={expected!r}, mevcut={actual!r}"
                )

        # 10 market ID alanının normalizasyon kontrolü.
        for market_name, raw_index, _ in MARKETS:
            expected = clean_text(source_row[raw_index])
            actual = fields.get(market_name)

            if expected != actual:
                fail(
                    f"{match.get('matchId')} / {market_name}: "
                    f"ham={source_row[raw_index]!r}, "
                    f"beklenen={expected!r}, mevcut={actual!r}"
                )

        # Handikap çizgileri: sıfır geçerli, boş ve '-' null.
        for field_name, raw_index in [
            ("handicapHome", 14),
            ("handicapAway", 15),
        ]:
            expected = normalize_line(source_row[raw_index])
            actual = fields.get(field_name)

            if not same_number(expected, actual):
                fail(
                    f"{match.get('matchId')} / {field_name}: "
                    f"ham={source_row[raw_index]!r}, "
                    f"beklenen={expected!r}, mevcut={actual!r}"
                )

    print("\n=== KAYNAK KONUMU VE NORMALİZASYON ===")
    print("Kontrol edilen kayıt:", checked)
    print("Oran hücresi:", checked * len(ODDS_FIELDS))
    print("Market ID hücresi:", checked * len(MARKETS))

    # Market bazında ID/oran dolulukları.
    print("\n=== MARKET ID / ORAN DOLULUKLARI ===")

    for market_name, market_index, odds in MARKETS:
        id_count = 0
        any_odds_count = 0
        all_odds_count = 0
        id_without_odds = 0
        odds_without_id = 0

        for row in raw_rows:
            market_id = clean_text(row[market_index])
            values = [
                normalize_odds(row[raw_index])
                for _, raw_index in odds
            ]

            has_any_odds = any(v is not None for v in values)
            has_all_odds = all(v is not None for v in values)

            if market_id is not None:
                id_count += 1

            if has_any_odds:
                any_odds_count += 1

            if has_all_odds:
                all_odds_count += 1

            if market_id is not None and not has_any_odds:
                id_without_odds += 1

            if market_id is None and has_any_odds:
                odds_without_id += 1

        print(
            f"{market_name}: "
            f"ID={id_count}, "
            f"oranlı={any_odds_count}, "
            f"tam={all_odds_count}, "
            f"ID-var/oran-yok={id_without_odds}, "
            f"oran-var/ID-yok={odds_without_id}"
        )

    # 57. alan: 24 ID ve 72 sıfır oran kontrolü.
    handicap_rows = [
        row for row in raw_rows
        if clean_text(row[57]) is not None
    ]

    handicap_odds_tokens = Counter()
    handicap_line_tokens = Counter()
    handicap_valid_odds = 0
    handicap_valid_lines = 0

    for row in handicap_rows:
        for raw_index in (36, 37, 38):
            handicap_odds_tokens[
                raw_token(row[raw_index])
            ] += 1

            if normalize_odds(row[raw_index]) is not None:
                handicap_valid_odds += 1

        for raw_index in (14, 15):
            handicap_line_tokens[
                raw_token(row[raw_index])
            ] += 1

            if normalize_line(row[raw_index]) is not None:
                handicap_valid_lines += 1

    print("\n=== HANDİKAP MARKETİ (ALAN 57) ===")
    print("Market ID dolu maç:", len(handicap_rows))
    print("36–38 ham oran değerleri:", dict(handicap_odds_tokens))
    print("14–15 ham çizgi değerleri:", dict(handicap_line_tokens))
    print("Geçerli handikap oranı:", handicap_valid_odds)
    print("Geçerli handikap çizgisi:", handicap_valid_lines)

    # 4581739 özel kaydı.
    special = [
        match for match in bulletin_matches
        if str(match.get("matchId")) == "4581739"
    ]

    print("\n=== 4581739 KONTROLÜ ===")

    if len(special) != 1:
        fail(
            "4581739 bültende tam bir kayıt olarak bulunamadı."
        )
    else:
        match = special[0]
        source = match.get("source") or {}
        fields = match.get("fields") or {}
        raw = match.get("raw") or []

        print("Kaynak konumu:", source)
        print("homeName:", fields.get("homeName"))
        print("Ham ev sahibi değeri:", raw[1] if len(raw) > 1 else None)

        if source != {"groupIndex": 0, "matchIndex": 41}:
            fail("4581739 kaynak konumu beklenen (0, 41) değil.")

        if fields.get("homeName") is not None:
            fail("4581739 homeName null değil.")

        if len(raw) <= 1 or raw[1] != "":
            fail("4581739 ham ev sahibi değeri boş metin değil.")

    # Uyarı kayıtları.
    diagnostics = bulletin.get("diagnostics") or {}
    warning_counts = diagnostics.get("warningCounts") or {}
    warnings = diagnostics.get("warnings") or []

    missing_team_warning = any(
        warning.get("code") == "MISSING_TEAM_NAME"
        and str(warning.get("matchId")) == "4581739"
        for warning in warnings
    )

    handicap_warning_count = warning_counts.get(
        "HANDICAP_MARKET_WITHOUT_VALID_LINES_OR_ODDS", 0
    )

    print("\n=== DİAGNOSTİK UYARILARI ===")
    print("Uyarı sayıları:", warning_counts)
    print("4581739 MISSING_TEAM_NAME:", missing_team_warning)
    print("Handikap uyarısı:", handicap_warning_count)

    if not missing_team_warning:
        fail("4581739 için MISSING_TEAM_NAME uyarısı yok.")

    if handicap_warning_count != 24:
        fail(
            "Handikap uyarı sayısı 24 değil: "
            f"{handicap_warning_count}"
        )

    # Yinelenen maç ID'leri hata değildir; yalnızca raporlanır.
    duplicates = {
        match_id: count
        for match_id, count in match_ids.items()
        if count > 1
    }

    print("\n=== YİNELENEN MAÇ ID'LERİ ===")
    print(duplicates if duplicates else "Yok")

    print("\n=== SONUÇ ===")

    if errors:
        print(f"BAŞARISIZ: {len(errors)} hata bulundu.")
        sys.exit(1)

    print("BAŞARILI: Kontrollerde uyuşmazlık bulunmadı.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("[ÇALIŞMA HATASI]", repr(exc))
        sys.exit(2)
