import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from html.parser import HTMLParser


ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"


class HTMLTitleParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_title = False
        self.title_parts = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() == "title":
            self.in_title = True

    def handle_endtag(self, tag):
        if tag.lower() == "title":
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title_parts.append(data.strip())

    @property
    def title(self):
        return " ".join(part for part in self.title_parts if part)


def detect_format(body, content_type):
    content_type = (content_type or "").lower()
    sample = body[:2048].decode("utf-8-sig", errors="replace").lstrip()

    if "application/json" in content_type or "application/ld+json" in content_type:
        return "json"

    if "text/html" in content_type or sample.lower().startswith(
        ("<!doctype html", "<html", "<head", "<body")
    ):
        return "html"

    if sample.startswith("{") or sample.startswith("["):
        try:
            json.loads(body.decode("utf-8-sig"))
            return "json"
        except (ValueError, UnicodeDecodeError):
            return "unknown"

    return "unknown"


def summarize_json(data):
    if isinstance(data, dict):
        return {
            "top_level_type": "object",
            "keys": list(data.keys()),
            "fields": {
                str(key): type(value).__name__
                for key, value in data.items()
            }
        }

    if isinstance(data, list):
        return {
            "top_level_type": "array",
            "item_count": len(data),
            "first_item_type": (
                type(data[0]).__name__ if data else None
            ),
            "first_item_keys": (
                list(data[0].keys())
                if data and isinstance(data[0], dict)
                else None
            )
        }

    return {
        "top_level_type": type(data).__name__
    }


def main():
    parser = argparse.ArgumentParser(
        description="Maçkolik ham HTTP yanıtını kaydeder ve formatını inceler."
    )
    parser.add_argument(
        "--url",
        required=True,
        help="İncelenecek herkese açık Maçkolik URL'si"
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=25,
        help="HTTP zaman aşımı (saniye), varsayılan: 25"
    )
    args = parser.parse_args()

    parsed = urlparse(args.url)

    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        print("HATA: Geçerli bir HTTP/HTTPS adresi girilmelidir.")
        return 2

    RAW_DIR.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    request = Request(
        args.url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 Chrome/120.0 Safari/537.36"
            ),
            "Accept": (
                "application/json,text/html,application/xhtml+xml,"
                "*/*;q=0.8"
            ),
            "Accept-Encoding": "identity"
        }
    )

    status = None
    content_type = None
    body = b""
    error_message = None

    try:
        with urlopen(request, timeout=args.timeout) as response:
            status = response.status
            content_type = response.headers.get("Content-Type")
            body = response.read()

    except HTTPError as error:
        status = error.code
        content_type = error.headers.get("Content-Type")
        body = error.read()
        error_message = str(error)

    except (URLError, TimeoutError, OSError) as error:
        print(f"BAĞLANTI HATASI: {error}")
        return 3

    detected = detect_format(body, content_type)

    extension = {
        "json": "json",
        "html": "html",
        "unknown": "bin"
    }[detected]

    raw_path = RAW_DIR / f"mackolik_{timestamp}.{extension}"
    meta_path = RAW_DIR / f"mackolik_{timestamp}.meta.json"

    # Ham yanıt byte düzeyinde değiştirilmeden kaydedilir.
    raw_path.write_bytes(body)

    details = {
        "requested_url": args.url,
        "http_status": status,
        "content_type": content_type,
        "detected_format": detected,
        "body_size_bytes": len(body),
        "saved_raw_file": str(raw_path.relative_to(ROOT)),
        "retrieved_at_utc": datetime.now(timezone.utc).isoformat(),
        "http_error": error_message
    }

    if detected == "json":
        try:
            parsed_json = json.loads(body.decode("utf-8-sig"))
            details["structure"] = summarize_json(parsed_json)
        except (ValueError, UnicodeDecodeError) as error:
            details["detected_format"] = "invalid_json"
            details["parse_error"] = str(error)

    elif detected == "html":
        text = body.decode("utf-8-sig", errors="replace")
        title_parser = HTMLTitleParser()
        title_parser.feed(text)

        details["structure"] = {
            "document_type": "HTML",
            "title": title_parser.title or None,
            "html_length": len(text)
        }

    meta_path.write_text(
        json.dumps(details, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    print("\n--- MAÇKOLİK HAM YANIT RAPORU ---")
    print(f"HTTP durumu : {status}")
    print(f"Content-Type: {content_type}")
    print(f"Format      : {details['detected_format']}")
    print(f"Boyut       : {len(body)} byte")
    print(f"Ham dosya   : {raw_path}")
    print(f"Metadata    : {meta_path}")

    if "structure" in details:
        print("\n--- ÜST SEVİYE YAPI ---")
        print(json.dumps(
            details["structure"],
            ensure_ascii=False,
            indent=2
        ))

    if error_message:
        print(f"\nHTTP HATASI: {error_message}")

    return 0 if status is not None and 200 <= status < 300 else 4


if __name__ == "__main__":
    sys.exit(main())