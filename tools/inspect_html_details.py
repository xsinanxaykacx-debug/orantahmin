from pathlib import Path
from html.parser import HTMLParser
import re
import json

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"

files = sorted(RAW_DIR.glob("mackolik_*.html"), key=lambda p: p.stat().st_mtime, reverse=True)
if not files:
    raise SystemExit("data/raw içinde HTML dosyası bulunamadı.")

source = files[0]
html = source.read_text(encoding="utf-8", errors="replace")

class PageInspector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts = []
        self.links = []
        self.forms = []
        self.current_script = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)

        if tag == "script":
            self.current_script = {
                "src": a.get("src"),
                "type": a.get("type"),
                "text": ""
            }
            self.scripts.append(self.current_script)

        elif tag == "link" and a.get("href"):
            self.links.append({
                "rel": a.get("rel"),
                "href": a.get("href")
            })

        elif tag == "form":
            self.forms.append({
                "action": a.get("action"),
                "method": a.get("method")
            })

    def handle_data(self, data):
        if self.current_script is not None:
            self.current_script["text"] += data

    def handle_endtag(self, tag):
        if tag == "script":
            self.current_script = None

parser = PageInspector()
parser.feed(html)

print("\n--- DOSYA ---")
print(source)
print("Boyut:", source.stat().st_size, "byte")

print("\n--- JAVASCRIPT DOSYALARI ---")
for item in parser.scripts:
    if item["src"]:
        print(json.dumps({
            "src": item["src"],
            "type": item["type"]
        }, ensure_ascii=False))

print("\n--- SATIR İÇİ SCRIPT ÖZETİ ---")
for i, item in enumerate(parser.scripts, 1):
    if not item["src"] and item["text"].strip():
        content = item["text"].strip()
        print(f"\nScript #{i} | {len(content)} karakter")
        print(content[:700].replace("\n", " "))

print("\n--- VERİ / API İZLERİ ---")
patterns = [
    r"api", r"json", r"mackolik", r"iddaa",
    r"odds", r"fixture", r"match", r"event",
    r"program", r"ajax", r"fetch", r"XMLHttpRequest"
]

for pattern in patterns:
    matches = list(re.finditer(pattern, html, re.IGNORECASE))
    if matches:
        print(f"\n[{pattern}] {len(matches)} eşleşme")
        for match in matches[:4]:
            start = max(0, match.start() - 100)
            end = min(len(html), match.end() + 180)
            print(html[start:end].replace("\n", " "))

print("\n--- FORM ACTION ADRESLERİ ---")
for item in parser.forms:
    print(json.dumps(item, ensure_ascii=False))

print("\n--- İLGİLİ LINKLER ---")
for item in parser.links:
    href = item["href"] or ""
    if any(word in href.lower() for word in ("api", "iddaa", "program", "mac", "ajax")):
        print(json.dumps(item, ensure_ascii=False))

print("\n--- İNCELEME TAMAMLANDI ---")