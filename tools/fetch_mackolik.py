
from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path
from typing import Any

import json5
import requests


BASE_URL = "https://arsiv.mackolik.com"
PAGE_URL = f"{BASE_URL}/Genis-Iddaa-Programi"
DATA_URL = f"{BASE_URL}/AjaxHandlers/ProgramDataHandler.ashx"

RAW_DIR = Path("data/raw")
RAW_DIR.mkdir(parents=True, exist_ok=True)

TIMEOUT = 30


def build_params(
    day: str | None = None,
    match_type: str = "6",
) -> dict[str, str]:
    return {
        "type": match_type,
        "sortValue": "DATE",
        "day": day or datetime.now().strftime("%d.%m.%Y"),
        "sort": "-1",
        "sortDir": "-1",
        "groupId": "-1",
        "np": "1",
        "sport": "1",
    }


def create_session() -> requests.Session:
    session = requests.Session()

    session.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
    })

    return session


def summarize_data(data: Any) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "root_type": type(data).__name__,
    }

    if not isinstance(data, dict):
        return summary

    summary["root_keys"] = list(data.keys())

    groups = data.get("m")

    if isinstance(groups, list):
        summary["group_count"] = len(groups)
        summary["total_matches"] = 0
        summary["groups"] = []

        for group in groups:
            if not isinstance(group, dict):
                continue

            matches = group.get("m")
            match_count = len(matches) if isinstance(matches, list) else 0

            summary["total_matches"] += match_count

            summary["groups"].append({
                "date": group.get("d"),
                "match_count": match_count,
                "first_match": (
                    matches[0][:12]
                    if matches and isinstance(matches[0], list)
                    else None
                ),
            })

    return summary


def fetch_mackolik_program(
    day: str | None = None,
    match_type: str = "6",
) -> dict[str, Any]:

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    session = create_session()

    result: dict[str, Any] = {
        "source": "mackolik",
        "requested_day": day or datetime.now().strftime("%d.%m.%Y"),
        "match_type": match_type,
        "fetched_at": datetime.now().astimezone().isoformat(),
        "success": False,
    }

    try:
        # Oturum ve çerezleri al.
        page_response = session.get(
            PAGE_URL,
            timeout=TIMEOUT,
        )

        result["page_status"] = page_response.status_code
        page_response.raise_for_status()

        # Maç programını AJAX üzerinden çek.
        response = session.get(
            DATA_URL,
            params=build_params(day, match_type),
            headers={
                "Accept": "application/json, text/javascript, */*; q=0.01",
                "Referer": PAGE_URL,
                "X-Requested-With": "XMLHttpRequest",
            },
            timeout=TIMEOUT,
        )

        result["ajax_status"] = response.status_code
        result["content_type"] = response.headers.get("Content-Type", "")
        result["response_url"] = response.url

        response.raise_for_status()

        raw_text = response.text

        # Orijinal cevabı her durumda koru.
        raw_file = RAW_DIR / f"mackolik_program_{stamp}.raw"
        raw_file.write_text(raw_text, encoding="utf-8")

        result["raw_file"] = str(raw_file)
        result["response_bytes"] = len(response.content)

        # Maçkolik JSON5 / JavaScript nesne biçimi kullanıyor.
        try:
            parsed_data = json5.loads(raw_text)
        except Exception as exc:
            result["error"] = f"Veri ayrıştırılamadı: {exc}"
            result["response_preview"] = raw_text[:1000]
            return save_result(result, stamp)

        # Beklenen ana yapı: {m:[{d:'tarih',m:[maçlar]}]}
        if not isinstance(parsed_data, dict):
            result["error"] = "Yanıtın kök yapısı beklenen nesne değil."
            return save_result(result, stamp)

        if not isinstance(parsed_data.get("m"), list):
            result["error"] = "Yanıtta beklenen maç grubu alanı 'm' bulunamadı."
            result["parsed_keys"] = list(parsed_data.keys())
            return save_result(result, stamp)

        # Ayrıştırılmış gerçek veriyi kaydet.
        json_file = RAW_DIR / f"mackolik_program_{stamp}.json"

        json_file.write_text(
            json.dumps(
                parsed_data,
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        result["saved_file"] = str(json_file)
        result["data_summary"] = summarize_data(parsed_data)
        result["success"] = True

    except requests.RequestException as exc:
        result["error"] = f"HTTP isteği başarısız: {exc}"

    except Exception as exc:
        result["error"] = f"Beklenmeyen hata: {exc}"

    return save_result(result, stamp)


def save_result(
    result: dict[str, Any],
    stamp: str,
) -> dict[str, Any]:

    meta_file = RAW_DIR / f"mackolik_program_{stamp}.meta.json"

    meta_file.write_text(
        json.dumps(
            result,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    result["meta_file"] = str(meta_file)

    return result


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Maçkolik gerçek maç programı veri çekicisi"
    )

    parser.add_argument(
        "--day",
        default=None,
        help="Tarih: GG.AA.YYYY",
    )

    parser.add_argument(
        "--type",
        default="6",
        dest="match_type",
        help="Program türü",
    )

    args = parser.parse_args()

    result = fetch_mackolik_program(
        day=args.day,
        match_type=args.match_type,
    )

    print(
        json.dumps(
            result,
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
