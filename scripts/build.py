#!/usr/bin/env python3
"""Generate the static DOT Report Card site into dist/ from data/carriers.json + content/."""
import argparse
import datetime as dt
import hashlib
import json
import re
import shutil
from collections import Counter, defaultdict
from pathlib import Path
from xml.sax.saxutils import escape

from jinja2 import Environment, FileSystemLoader, select_autoescape
from grading import assess_many

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
SITE = "DOT Report Card"
STATES = {"AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "DC": "District of Columbia",
          "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana",
          "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska",
          "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio",
          "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas",
          "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming", "PR": "Puerto Rico"}


UPPER = {"LLC", "LP", "LLP", "USA", "DBA", "II", "III", "IV"}


def cname(s):
    """Legal names arrive upper-case; title-case them but keep corporate suffixes and initials readable."""
    return " ".join(w if w in UPPER or (len(w) <= 2 and w.isalpha()) else w.title() for w in (s or "").split())


def front_matter(path):
    """content/*.html: '---' yaml-ish key: value block, then the HTML body."""
    text = path.read_text()
    m = re.match(r"---\n(.*?)\n---\n(.*)", text, re.S)
    meta = dict(line.split(":", 1) for line in m.group(1).splitlines() if ":" in line)
    return {k.strip(): v.strip() for k, v in meta.items()}, m.group(2)



def write_sitemaps(urls, origin, base, lastmod=None, limit=5000):
    """One sitemap index plus a file per section, so Search Console reports coverage per section
    instead of one opaque pile. urls is a list of (shard, path)."""
    shards = defaultdict(list)
    for shard, u in urls:
        shards[shard].append(u)
    for k in [k for k, v in shards.items() if len(v) < 10 and k != "core"]:
        shards["core"] += shards.pop(k)
    out = DIST / "sitemaps"
    out.mkdir(parents=True, exist_ok=True)
    names = []
    for shard in sorted(shards):
        rows = shards[shard]
        parts = [rows[i:i + limit] for i in range(0, len(rows), limit)] or [[]]
        for n, part in enumerate(parts, 1):
            fn = f"{shard}.xml" if len(parts) == 1 else f"{shard}-{n}.xml"
            lm = f"<lastmod>{lastmod}</lastmod>" if lastmod else ""
            body = "\n".join(f"<url><loc>{escape(origin + base + u)}</loc>{lm}</url>" for u in part)
            (out / fn).write_text('<?xml version="1.0" encoding="UTF-8"?>\n'
                                  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                                  + body + "\n</urlset>")
            names.append(fn)
    idx = "".join(f"<sitemap><loc>{origin}{base}sitemaps/{n}</loc></sitemap>" for n in names)
    (DIST / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n'
                                      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
                                      + idx + "</sitemapindex>")
    return names


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="/")
    ap.add_argument("--origin", default="https://dotreportcard.com")
    ap.add_argument("--cname", default="dotreportcard.com")
    ap.add_argument("--api", default="https://api.dotreportcard.com")
    ap.add_argument("--adsense-pub", default="pub-8425563704095379")
    args = ap.parse_args()
    base = args.base if args.base.endswith("/") else args.base + "/"
    origin = args.origin.rstrip("/")
    today = dt.date.today().isoformat()

    # Static pages: US-based only, and drop obvious MCS-150 typos (e.g. "599,996 power units, 8 drivers") that would top every ranking.
    # Both groups stay reachable through the live search.
    carriers = [c for c in json.loads((ROOT / "data/carriers.json").read_text())
                if c["state"] in STATES and not (c["pu"] >= 200 and c["drivers"] * 10 < c["pu"])]
    nat = json.loads((ROOT / "data/national.json").read_text())
    partners = json.loads((ROOT / "data/partners.json").read_text())
    for c, view in zip(carriers, assess_many(carriers, nat)):
        c["view"] = view
        c["grade"] = view["grade"]
    by_state = defaultdict(list)
    for c in carriers:
        by_state[c["state"]].append(c)
    states = []
    for code, cs in by_state.items():
        if code not in STATES:
            continue
        di, do = sum(c.get("driver_insp") or 0 for c in cs), sum(c.get("driver_oos") or 0 for c in cs)
        vi, vo = sum(c.get("vehicle_insp") or 0 for c in cs), sum(c.get("vehicle_oos") or 0 for c in cs)
        grades = Counter(c["grade"]["letter"] for c in cs)
        states.append({"code": code, "name": STATES[code], "carriers": cs, "n": len(cs), "pu": sum(c["pu"] for c in cs), "grades": grades,
                       "driver_oos_rate": round(100 * do / di, 1) if di else 0, "vehicle_oos_rate": round(100 * vo / vi, 1) if vi else 0,
                       "dist": f"{grades.get('A', 0) + grades.get('B', 0)} are graded A or B, {grades.get('D', 0) + grades.get('F', 0)} D or F; {grades.get('NR', 0)} not rated."})
    states.sort(key=lambda s: -s["n"])
    guides = []
    for f in sorted((ROOT / "content/guides").glob("*.html")):
        meta, html = front_matter(f)
        guides.append({"slug": f.stem, "html": html, **meta})
    guides.sort(key=lambda g: g["date"], reverse=True)

    h = hashlib.md5()
    for f in sorted((ROOT / "static").glob("*")):
        h.update(f.read_bytes())
    v = h.hexdigest()[:8]
    env = Environment(loader=FileSystemLoader(ROOT / "templates"), autoescape=select_autoescape(["html"]))
    env.filters["cname"] = cname
    env.globals.update(site=SITE, base=base, origin=origin, today=today, v=v, adsense_pub=args.adsense_pub, api=args.api,
                       nat=nat, partners=partners, states=states, guides=guides, n_carriers=len(carriers))

    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()
    shutil.copytree(ROOT / "static", DIST / "static")
    urls = []

    def write(path, template, sm=None, **ctx):
        out = DIST / path
        out.mkdir(parents=True, exist_ok=True)
        (out / "index.html").write_text(env.get_template(template).render(path=path, **ctx))
        urls.append((sm or path.split("/")[0] or "core", path))

    write("", "index.html")
    for f in sorted((ROOT / "content/pages").glob("*.html")):
        meta, html = front_matter(f)
        html = env.from_string(html).render()  # pages may reference nat.* etc.
        write(f"{f.stem}/", "page.html", html=html, **meta)
    write("guides/", "guides.html")
    for g in guides:
        write(f"guides/{g['slug']}/", "guide.html", g=g)
    write("carriers/", "states.html")
    for s in states:
        write(f"carriers/{s['code'].lower()}/", "state.html", s=s)
        for i, c in enumerate(s["carriers"]):
            related = [o for o in s["carriers"][max(0, i - 3):i + 4] if o is not c][:6]
            write(f"carrier/{c['dot']}-{c['slug']}/", "carrier.html", sm=f"carrier-{s['code'].lower()}", c=c, state_name=s["name"], related=related)
    # index of static pages so the live lookup can link to the permanent page when one exists
    (DIST / "static/index.json").write_text(json.dumps({c["dot"]: c["slug"] for c in carriers}, separators=(",", ":")))

    # No lastmod: a rebuild is not a content change. Google uses lastmod only when it is
    # "consistently and verifiably accurate"; stamping today's date on every URL fails that.
    write_sitemaps(urls, origin, base)
    (DIST / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {origin}{base}sitemap.xml\n")
    (DIST / "404.html").write_text(env.get_template("404.html").render(path="404"))
    (DIST / ".nojekyll").write_text("")
    key = (ROOT / "static/indexnow-key.txt").read_text().strip()
    (DIST / f"{key}.txt").write_text(key + "\n")
    if args.adsense_pub:
        (DIST / "ads.txt").write_text(f"google.com, {args.adsense_pub}, DIRECT, f08c47fec0942fa0\n")
    if args.cname:
        (DIST / "CNAME").write_text(args.cname + "\n")
    print(f"built {len(urls)} pages ({len(carriers)} carriers, {len(states)} states, {len(guides)} guides) -> {DIST}")


if __name__ == "__main__":
    main()
