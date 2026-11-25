from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import re

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
JS_DIR = RAW / "js"
JS_DIR.mkdir(parents=True, exist_ok=True)

BASE = "https://cm.mackolik.com/js5/Mackolik/"
FILES = ["Program.js", "ProgramLarge.js"]

PATTERNS = [
    r"getProgram",
    r"\$\.ajax",
    r"\.ajax\s*\(",
    r"XMLHttpRequest",
    r"\.ashx",
    r"\.asmx",
    r"\.json",
    r"url\s*:",
    r"data\s*:",
    r"method\s*:",
    r"type\s*:",
    r"success\s*:",
    r"POST",
    r"GET"
]

for filename in FILES:
    url = BASE + filename + "?v=2.141"
    print(f"\n--- {filename} ---")

    try:
        request = Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0",
                "Accept": "*/*"
            }
        )

        with urlopen(request, timeout=25) as response:
            body = response.read()
            status = response.status
            content_type = response.headers.get("Content-Type", "")

        output = JS_DIR / filename
        output.write_bytes(body)

        source = body.decode("utf-8", errors="replace")
        print("HTTP:", status)
        print("Content-Type:", content_type)
        print("Boyut:", len(body), "byte")
        print("Kaydedildi:", output)

        lines = source.splitlines()
        found = set()

        print("\nEŞLEŞEN SATIRLAR:")
        for i, line in enumerate(lines):
            if any(re.search(p, line, re.IGNORECASE) for p in PATTERNS):
                start = max(0, i - 2)
                end = min(len(lines), i + 4)

                for n in range(start, end):
                    if n not in found:
                        print(f"{n + 1}: {lines[n][:1000]}")
                        found.add(n)

                print("---")

    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        print("İNDİRME HATASI:", repr(exc))

print("\nİnceleme tamamlandı.")