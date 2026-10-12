"""Build the portable calendar. Standard-library only; keeps the source assets intact."""
from pathlib import Path
import base64

ROOT = Path(__file__).resolve().parent

def data_uri(name, mime):
    return f"data:{mime};base64," + base64.b64encode((ROOT / "assets" / name).read_bytes()).decode()

css = (ROOT / "src" / "style.css").read_text()
for token, name, mime in [
    ("SCENE_IMAGE", "whoville.png", "image/png"),
    ("GRINCH_ATLAS", "grinch-gifts.png", "image/png"),
    ("GRINCH_REVISED", "grinch-revised.png", "image/png"),
    ("CAVEAT_LATIN", "caveat-latin-700-normal.woff2", "font/woff2"),
    ("CAVEAT_CYRILLIC", "caveat-cyrillic-700-normal.woff2", "font/woff2"),
    ("CORMORANT", "cormorant-garamond-latin-600-normal.woff2", "font/woff2"),
]:
    css = css.replace(f"__{token}__", data_uri(name, mime))
html = (ROOT / "src" / "index.template.html").read_text()
html = html.replace("/* INLINE_STYLES */", css)
html = html.replace("/* INLINE_GAME */", (ROOT / "src" / "game.js").read_text())
(ROOT / "index.html").write_text(html)
print(f"Built index.html ({len(html.encode()):,} bytes), all assets embedded.")
