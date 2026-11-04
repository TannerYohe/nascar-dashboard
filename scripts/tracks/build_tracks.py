"""Build track layouts for the replay from OpenStreetMap.

For each track in tracks.toml: fetch the `highway=raceway` ways around it from
the Overpass API, join them into a graph, and pick the loop whose length is
closest to each lap length raced there. The loop is rotated to start on the
start/finish line (beside the middle of pit road, unless tracks.toml says
where), oriented in race direction, projected to a flat SVG coordinate system
(north up) and written to frontend/public/tracks/{track_id}.json.

    python scripts/tracks/build_tracks.py                 # every track
    python scripts/tracks/build_tracks.py 105 214         # just these
    python scripts/tracks/build_tracks.py --sheet out.html  # also a contact sheet

Overpass responses are cached in scripts/tracks/.cache. Standard library only.
Map data © OpenStreetMap contributors, available under the ODbL.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import time
import tomllib
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT_DIR = ROOT / "frontend" / "public" / "tracks"
CACHE_DIR = HERE / ".cache"
# Public Overpass instances, tried in turn: the main one rate-limits hard.
OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
USER_AGENT = "race-rewind-track-builder/0.1 (+https://github.com/TannerYohe/nascar-dashboard)"

MILE = 1609.344
VIEW = 1000.0  # longer side of the viewBox
SIMPLIFY = 0.5  # Douglas-Peucker tolerance, viewBox units
MAX_ERROR = 0.12  # reject a loop more than 12% off the target length
SEARCH_STEPS = 400_000
# How much an oval's loop is charged for being unround, against length error.
OVAL_SHAPE_WEIGHT = 0.3
PIT_MAX_GAP_M = 70  # how far, on average, a pit way may run from the racing line
PIT = re.compile(r"\bpit", re.I)

Point = tuple[float, float]


# ---------------------------------------------------------------- fetching


def fetch(lat: float, lon: float, radius: int) -> dict:
    CACHE_DIR.mkdir(exist_ok=True)
    cached = CACHE_DIR / f"{lat:.4f}_{lon:.4f}_{radius}.json"
    if cached.exists():
        return json.loads(cached.read_text(encoding="utf-8"))
    query = (
        f'[out:json][timeout:90];way["highway"="raceway"](around:{radius},{lat},{lon});'
        "(._;>;);out body;"
    )
    data = urllib.parse.urlencode({"data": query}).encode()
    body = None
    for attempt in range(6):
        url = OVERPASS[attempt % len(OVERPASS)]
        req = urllib.request.Request(url, data=data, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=120) as res:
                body = res.read().decode("utf-8")
            break
        except Exception as err:  # noqa: BLE001 - Overpass rate-limits with 429/504
            wait = 5 * (attempt + 1)
            print(f"    {url}: {err}; retrying in {wait}s", file=sys.stderr)
            time.sleep(wait)
    if body is None:
        raise RuntimeError("Overpass unavailable")
    cached.write_text(body, encoding="utf-8")
    time.sleep(2)  # be polite between uncached queries
    return json.loads(body)


# ---------------------------------------------------------------- graph


@dataclass
class Way:
    id: int
    nodes: list[int]
    tags: dict[str, str]

    @property
    def is_pit(self) -> bool:
        t = self.tags
        return bool(
            PIT.search(t.get("name", ""))
            or t.get("raceway") == "pit_lane"
            or t.get("service") in ("pit_lane", "pitlane")
            or t.get("pitlane") == "yes"
        )

    @property
    def oneway(self) -> int:
        v = self.tags.get("oneway", "")
        return 1 if v in ("yes", "true", "1") else -1 if v == "-1" else 0


@dataclass
class Segment:
    """A run of nodes between two junctions, within one way."""

    nodes: list[int]
    length: float
    oneway: int  # 1 forward only, -1 backward only, 0 both


@dataclass
class Graph:
    xy: dict[int, Point]
    ways: list[Way]
    segments: list[Segment] = field(default_factory=list)
    out: dict[int, list[tuple[int, bool]]] = field(
        default_factory=dict
    )  # node -> (segment, forward)


def project(lat0: float, lon0: float):
    kx = math.cos(math.radians(lat0)) * 111_320.0
    ky = 110_540.0
    return lambda lat, lon: ((lon - lon0) * kx, (lat - lat0) * ky)


def dist(a: Point, b: Point) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def polyline_length(pts: list[Point]) -> float:
    return sum(dist(a, b) for a, b in zip(pts, pts[1:], strict=False))


def build_graph(data: dict, lat0: float, lon0: float) -> Graph:
    proj = project(lat0, lon0)
    xy = {e["id"]: proj(e["lat"], e["lon"]) for e in data["elements"] if e["type"] == "node"}
    ways = [
        Way(e["id"], [n for n in e["nodes"] if n in xy], e.get("tags", {}))
        for e in data["elements"]
        if e["type"] == "way"
    ]
    ways = [w for w in ways if len(w.nodes) >= 2]
    g = Graph(xy, ways)

    racing = [w for w in ways if not w.is_pit]
    degree: dict[int, int] = {}
    for w in racing:
        for a, b in zip(w.nodes, w.nodes[1:], strict=False):
            degree[a] = degree.get(a, 0) + 1
            degree[b] = degree.get(b, 0) + 1
    junctions = {n for n, d in degree.items() if d != 2}
    for w in racing:
        junctions.add(w.nodes[0])
        junctions.add(w.nodes[-1])

    for w in racing:
        run = [w.nodes[0]]
        for n in w.nodes[1:]:
            run.append(n)
            if n in junctions:
                pts = [xy[k] for k in run]
                g.segments.append(Segment(run, polyline_length(pts), w.oneway))
                run = [n]
    for i, s in enumerate(g.segments):
        if s.oneway >= 0:
            g.out.setdefault(s.nodes[0], []).append((i, True))
        if s.oneway <= 0:
            g.out.setdefault(s.nodes[-1], []).append((i, False))
    return g


def find_loop(
    g: Graph, target: float, respect_oneway: bool, oval: bool
) -> tuple[list[int], float] | None:
    """The simple cycle of segments that best fits `target` metres.

    Best means closest in length. For an oval it also has to look like one: an
    infield road course can be the same length (Las Vegas), so each loop is
    also charged for how far it is from round (4*pi*area / length^2).
    """
    out = g.out
    if not respect_oneway:
        out = {}
        for i, s in enumerate(g.segments):
            out.setdefault(s.nodes[0], []).append((i, True))
            out.setdefault(s.nodes[-1], []).append((i, False))

    best: tuple[float, float, list[int]] | None = None  # (score, error, nodes)
    steps = 0

    def nodes_of(path: list[tuple[int, bool]]) -> list[int]:
        nodes: list[int] = []
        for seg, fwd in path:
            run = g.segments[seg].nodes if fwd else g.segments[seg].nodes[::-1]
            nodes.extend(run if not nodes else run[1:])
        return nodes[:-1]  # drop the repeated start node

    def score(err: float, nodes: list[int], length: float) -> float:
        if not oval:
            return err
        pts = [g.xy[n] for n in nodes]
        roundness = 4 * math.pi * abs(signed_area(pts)) / (length * length)
        return err + OVAL_SHAPE_WEIGHT * (1 - roundness)
    limit = target * (1 + MAX_ERROR)

    def end(seg: int, fwd: bool) -> int:
        s = g.segments[seg]
        return s.nodes[-1] if fwd else s.nodes[0]

    for start in sorted(out):
        stack: list[tuple[int, float, list[tuple[int, bool]], set[int]]] = [
            (start, 0.0, [], {start})
        ]
        while stack:
            steps += 1
            if steps > SEARCH_STEPS:
                break
            node, length, path, seen = stack.pop()
            for seg, fwd in out.get(node, []):
                if path and path[-1][0] == seg:
                    continue
                total = length + g.segments[seg].length
                if total > limit:
                    continue
                nxt = end(seg, fwd)
                if nxt == start:
                    err = abs(total - target) / target
                    if err <= MAX_ERROR:
                        nodes = nodes_of([*path, (seg, fwd)])
                        sc = score(err, nodes, total)
                        if best is None or sc < best[0]:
                            best = (sc, err, nodes)
                    continue
                # Each loop is found once, from its smallest junction id.
                if nxt in seen or nxt < start:
                    continue
                stack.append((nxt, total, [*path, (seg, fwd)], seen | {nxt}))
    if best is None:
        return None
    return best[2], best[1]


# ---------------------------------------------------------------- shaping


def signed_area(pts: list[Point]) -> float:
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1], strict=False)) / 2


def nearest_index(pts: list[Point], p: Point) -> int:
    return min(range(len(pts)), key=lambda i: dist(pts[i], p))


def segment_distance(p: Point, a: Point, b: Point) -> float:
    dx, dy = b[0] - a[0], b[1] - a[1]
    span = dx * dx + dy * dy
    k = 0.0 if span == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / span))
    return dist(p, (a[0] + dx * k, a[1] + dy * k))


def loop_fraction(pts: list[Point], cum: list[float], p: Point) -> float:
    return cum[nearest_index(pts, p)] / cum[-1]


def pit_chain(g: Graph, loop: list[Point]) -> list[Point] | None:
    """The pit lane running beside the loop, joined into one polyline."""
    edges = list(zip(loop, loop[1:] + loop[:1], strict=False))

    def gap(p: Point) -> float:
        return min(segment_distance(p, a, b) for a, b in edges)

    def mean_gap(nodes: list[int]) -> float:
        return sum(gap(g.xy[n]) for n in nodes) / len(nodes)

    # Only pit ways that run alongside this loop: another configuration's pit
    # road (a road course's, inside an oval) heads off into the infield.
    pits = [w for w in g.ways if w.is_pit and mean_gap(w.nodes) < PIT_MAX_GAP_M]
    if not pits:
        return None
    # Connected groups of pit ways.
    groups: list[list[Way]] = []
    for w in pits:
        joined = [grp for grp in groups if any(set(w.nodes) & set(x.nodes) for x in grp)]
        merged = [w] + [x for grp in joined for x in grp]
        groups = [grp for grp in groups if grp not in joined] + [merged]

    def chain(grp: list[Way]) -> list[int]:
        nodes = list(grp[0].nodes)
        rest = grp[1:]
        while rest:
            for w in rest:
                if w.nodes[0] == nodes[-1]:
                    nodes += w.nodes[1:]
                elif w.nodes[-1] == nodes[0]:
                    nodes = w.nodes[:-1] + nodes
                elif w.nodes[-1] == nodes[-1]:
                    nodes += w.nodes[::-1][1:]
                elif w.nodes[0] == nodes[0]:
                    nodes = w.nodes[::-1][:-1] + nodes
                else:
                    continue
                rest.remove(w)
                break
            else:
                break
        return nodes

    def score(pts: list[Point]) -> float:
        # Close to the racing line, and long: pit road runs alongside the track.
        near = sum(gap(p) for p in pts) / len(pts)
        return near - polyline_length(pts) * 0.05

    candidates = [[g.xy[n] for n in chain(grp)] for grp in groups]
    candidates = [c for c in candidates if polyline_length(c) > 120]
    if not candidates:
        return None
    best = min(candidates, key=score)
    if score(best) > 150:  # nowhere near this loop (another configuration's pits)
        return None
    return best


def midpoint(pts: list[Point]) -> Point:
    """The point halfway along a polyline, by distance (nodes bunch up on curves)."""
    half = polyline_length(pts) / 2
    run = 0.0
    for a, b in zip(pts, pts[1:], strict=False):
        step = dist(a, b)
        if run + step >= half and step > 0:
            k = (half - run) / step
            return (a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k)
        run += step
    return pts[-1]


def simplify(pts: list[Point], tol: float) -> list[Point]:
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    norm = math.hypot(dx, dy) or 1.0
    far, idx = 0.0, 0
    for i in range(1, len(pts) - 1):
        p = pts[i]
        d = abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / norm
        if d > far:
            far, idx = d, i
    if far <= tol:
        return [a, b]
    return simplify(pts[: idx + 1], tol)[:-1] + simplify(pts[idx:], tol)


def simplify_loop(pts: list[Point], tol: float) -> list[Point]:
    """Simplify a closed loop, keeping pts[0] (the start/finish line) in place."""
    far = max(range(len(pts)), key=lambda i: dist(pts[0], pts[i]))
    first = simplify(pts[: far + 1], tol)
    second = simplify(pts[far:] + pts[:1], tol)
    return first[:-1] + second[:-1]


def path_d(pts: list[Point], closed: bool) -> str:
    body = " L".join(f"{x:.1f} {y:.1f}" for x, y in pts)
    return f"M{body}{' Z' if closed else ''}"


def build_variant(g: Graph, spec: dict, target_mi: float, proj) -> dict | None:
    target = target_mi * MILE
    oval = not spec.get("road", False)
    found = find_loop(g, target, respect_oneway=True, oval=oval)
    directed = found is not None
    if found is None:
        found = find_loop(g, target, respect_oneway=False, oval=oval)
    if found is None:
        return None
    node_ids, err = found
    loop = [g.xy[n] for n in node_ids]

    used_oneway = directed and any(
        s.oneway for s in g.segments if s.nodes[0] in node_ids and s.nodes[-1] in node_ids
    )
    want_ccw = spec.get("direction", "ccw") == "ccw"
    if not used_oneway and (signed_area(loop) > 0) != want_ccw:
        loop.reverse()

    pit = pit_chain(g, loop)
    if "sf" in spec:
        sf_point = proj(*spec["sf"])
    elif pit:
        sf_point = midpoint(pit)
    else:
        sf_point = loop[0]
    i = nearest_index(loop, sf_point)
    loop = loop[i:] + loop[:i]

    cum = [0.0]
    for a, b in zip(loop, loop[1:] + loop[:1], strict=False):
        cum.append(cum[-1] + dist(a, b))

    pit_window = [0.06, 0.06]
    if pit:
        # Orient pit road entry -> exit in race direction, and measure how far
        # it reaches before and after the line.
        f0 = loop_fraction(loop, cum, pit[0])
        f1 = loop_fraction(loop, cum, pit[-1])
        before0, before1 = (1 - f0) % 1, (1 - f1) % 1
        if before1 > before0:  # pit[-1] is further back, so it's the entry
            pit.reverse()
            f0, f1 = f1, f0
        before = min(0.3, (1 - f0) % 1)
        after = min(0.3, f1 if f1 < 0.5 else 0.0)
        pit_window = [round(before, 3), round(after, 3)]

    # Fit to the viewBox, north up (SVG y grows downward).
    every = loop + (pit or [])
    minx, maxx = min(p[0] for p in every), max(p[0] for p in every)
    miny, maxy = min(p[1] for p in every), max(p[1] for p in every)
    scale = VIEW / max(maxx - minx, maxy - miny)
    to_svg = lambda p: ((p[0] - minx) * scale, (maxy - p[1]) * scale)  # noqa: E731
    svg_loop = simplify_loop([to_svg(p) for p in loop], SIMPLIFY)
    layout = {
        "length_mi": target_mi,
        "osm_length_mi": round(cum[-1] / MILE, 3),
        "viewBox": [0, 0, round((maxx - minx) * scale, 1), round((maxy - miny) * scale, 1)],
        "path": path_d(svg_loop, closed=True),
        "pit_window": pit_window,
    }
    if pit:
        layout["pit"] = path_d(simplify([to_svg(p) for p in pit], SIMPLIFY), closed=False)
    layout["_report"] = {
        "error": round(err, 3),
        "directed": used_oneway,
        "pit": bool(pit),
        "sf": "manifest" if "sf" in spec else "pit road" if pit else "arbitrary",
    }
    return layout


def build_track(track_id: int, spec: dict) -> dict | None:
    lat, lon = spec["lat"], spec["lon"]
    data = fetch(lat, lon, spec.get("radius", 2000))
    g = build_graph(data, lat, lon)
    if not g.segments:
        print(f"  {track_id:>4} {spec['name']}: no raceway ways in OSM")
        return None
    proj = project(lat, lon)
    variants = []
    for target in spec["variants"]:
        v = build_variant(g, spec, target, proj)
        if v is None:
            print(f"  {track_id:>4} {spec['name']} @ {target} mi: no loop within {MAX_ERROR:.0%}")
            continue
        r = v.pop("_report")
        print(
            f"  {track_id:>4} {spec['name']} @ {target} mi: {v['osm_length_mi']} mi "
            f"({r['error']:.1%} off), direction {'from oneway' if r['directed'] else 'assumed'}, "
            f"pit {'yes' if r['pit'] else 'no'}, s/f from {r['sf']}"
        )
        variants.append(v)
    if not variants:
        return None
    return {
        "track_id": track_id,
        "name": spec["name"],
        "source": "© OpenStreetMap contributors",
        "variants": variants,
    }


def contact_sheet(layouts: list[dict], path: Path) -> None:
    cells = []
    for t in layouts:
        for v in t["variants"]:
            w, h = v["viewBox"][2], v["viewBox"][3]
            pad = 40
            cells.append(
                f'<figure><svg viewBox="{-pad} {-pad} {w + 2 * pad} {h + 2 * pad}">'
                f'<path d="{v["path"]}" fill="none" stroke="#888" stroke-width="10"/>'
                + (
                    f'<path d="{v["pit"]}" fill="none" stroke="#38bdf8" stroke-width="5"/>'
                    if "pit" in v
                    else ""
                )
                + f'<path id="p{t["track_id"]}{v["length_mi"]}" d="{v["path"]}" fill="none"/>'
                '<circle r="16" fill="#f5c518"><animateMotion dur="6s" repeatCount="indefinite">'
                f'<mpath href="#p{t["track_id"]}{v["length_mi"]}"/></animateMotion></circle>'
                f'<circle r="14" fill="#ef4444" cx="{v["path"][1:].split(" L")[0].split(" ")[0]}" '
                f'cy="{v["path"][1:].split(" L")[0].split(" ")[1]}"/>'
                f"</svg><figcaption>{t['track_id']} {t['name']} · {v['length_mi']} mi "
                f"(osm {v['osm_length_mi']})</figcaption></figure>"
            )
    path.write_text(
        "<!doctype html><meta charset=utf-8><title>Track layouts</title><style>"
        "body{background:#0b0d10;color:#ccc;font:12px system-ui;display:grid;"
        "grid-template-columns:repeat(6,1fr);gap:12px;padding:12px}"
        "figure{margin:0;background:#15181d;border-radius:8px;padding:8px}"
        "svg{width:100%;height:170px}</style>"
        "<p style='grid-column:1/-1'>Red dot: start/finish. Yellow dot: runs in race direction.</p>"
        + "".join(cells),
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Build track layouts from OpenStreetMap.")
    parser.add_argument("tracks", nargs="*", type=int, help="track ids (default: all)")
    parser.add_argument("--sheet", type=Path, help="write an HTML contact sheet here")
    args = parser.parse_args()

    manifest = {
        int(k): v for k, v in tomllib.loads((HERE / "tracks.toml").read_text("utf-8")).items()
    }
    ids = args.tracks or sorted(manifest)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    built = []
    for track_id in ids:
        spec = manifest[track_id]
        try:
            layout = build_track(track_id, spec)
        except RuntimeError as err:
            print(f"  {track_id:>4} {spec['name']}: skipped ({err})")
            continue
        if layout is None:
            continue
        (OUT_DIR / f"{track_id}.json").write_text(json.dumps(layout, ensure_ascii=False), "utf-8")
        built.append(layout)
    print(f"Built {len(built)} of {len(ids)} tracks into {OUT_DIR.relative_to(ROOT)}")
    if args.sheet:
        contact_sheet(built, args.sheet)
        print(f"Contact sheet: {args.sheet}")


if __name__ == "__main__":
    main()
