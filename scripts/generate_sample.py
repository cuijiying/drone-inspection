#!/usr/bin/env python3
"""生成龙羊峡水光互补光伏电站的合成巡检航迹与带 EXIF 的缺陷照片。

航迹落在 OpenStreetMap 光伏方阵 way/475253201 内部
（约 36.130–36.140°N，100.546–100.571°E）。
高度为相对地面高度，便于在无地形服务时做三维回放。
照片时间写成北京时间，与 GPX 的 UTC 时刻对应。
"""

from __future__ import annotations

import base64
import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path

import piexif
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "sample"
PHOTO_DIR = OUT / "photos"

LAT0 = 36.13220
LON0 = 100.55120
N_ROWS = 12
SPACING_M = 36.0
START = datetime(2026, 6, 18, 1, 6, 0, tzinfo=timezone.utc)
DURATION_S = 24 * 60
FONT_PATH = "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"

TYPE_LABEL = {
    "hotspot": "热斑",
    "crack": "隐裂",
    "glass": "玻璃破损",
    "soiling": "组件污秽",
    "diode": "二极管故障",
    "bird": "鸟粪遮挡",
    "snail": "蜗牛纹",
    "frame": "边框变形",
    "junction": "接线盒烧蚀",
    "weed": "杂草遮挡",
    "dust": "灰尘堆积",
    "missing": "组件缺失",
    "ribbon": "焊带变色",
    "rust": "支架锈蚀",
    "pid": "PID疑似",
    "tilt": "组件倾角异常",
}
SEV_LABEL = {"severe": "严重", "medium": "一般", "minor": "轻微"}

# frac, left-positive offset meters, code, severity, module, note
DEFECTS = [
    (0.04, 6, "soiling", "minor", "A-02-06", "组件表面大面积灰土，建议纳入清洗"),
    (0.09, 18, "bird", "minor", "A-03-11", "鸟粪点状遮挡，位置略偏出航线"),
    (0.13, 4, "hotspot", "severe", "A-04-08", "红外热斑明显，单片温差异常"),
    (0.18, -12, "crack", "medium", "A-05-15", "电池片隐裂，可见光下呈枝状"),
    (0.22, 3, "glass", "severe", "A-05-02", "玻璃星形破裂，建议更换组件"),
    (0.27, 15, "weed", "minor", "A-06-19", "阵列边缘杂草遮挡组件下沿"),
    (0.31, -5, "diode", "severe", "A-07-04", "旁路二极管热异常，所在组串偏热"),
    (0.36, 8, "snail", "medium", "A-07-16", "蜗牛纹沿焊带蔓延"),
    (0.41, -16, "frame", "medium", "A-08-09", "铝边框角部变形"),
    (0.45, 2, "junction", "severe", "A-08-21", "接线盒烧蚀发黑，有过热痕迹"),
    (0.50, 11, "dust", "minor", "A-09-03", "均匀积灰，预计影响输出"),
    (0.54, -7, "hotspot", "medium", "A-09-12", "单片轻度热斑，建议继续观察"),
    (0.58, 20, "missing", "severe", "A-10-07", "组件缺失，支架空置"),
    (0.63, 5, "ribbon", "medium", "A-10-18", "焊带变色，疑似虚焊"),
    (0.68, -14, "rust", "minor", "A-11-05", "支架螺栓锈蚀"),
    (0.73, 9, "crack", "severe", "A-11-14", "隐裂贯穿相邻两片电池"),
    (0.78, -3, "pid", "medium", "A-12-02", "边缘电池片发暗，疑似电位诱导衰减"),
    (0.84, 13, "glass", "medium", "A-12-11", "玻璃划伤，暂未见进水"),
    (0.90, 7, "tilt", "medium", "A-13-06", "组件倾角明显偏离同排阵列"),
    (0.95, -9, "hotspot", "severe", "A-13-17", "热斑再次出现，建议停串复查"),
]


def meters_to_lat(m: float) -> float:
    return m / 111_320.0


def meters_to_lon(m: float, lat: float) -> float:
    return m / (111_320.0 * math.cos(math.radians(lat)))


def hav(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def build_path(row_len_m: float) -> list[tuple[float, float]]:
    pts: list[tuple[float, float]] = []
    direction = 1
    lat = LAT0
    lon = LON0
    pts.append((lat, lon))

    def line_to(lat2: float, lon2: float) -> None:
        nonlocal lat, lon
        dist = hav(lat, lon, lat2, lon2)
        steps = max(1, int(round(dist / 6.0)))
        lat1, lon1 = lat, lon
        for i in range(1, steps + 1):
            t = i / steps
            pts.append((lat1 + (lat2 - lat1) * t, lon1 + (lon2 - lon1) * t))
        lat, lon = lat2, lon2

    for i in range(N_ROWS):
        line_to(lat, lon + meters_to_lon(row_len_m, lat) * direction)
        if i == N_ROWS - 1:
            break
        radius = SPACING_M / 2
        center_lat = lat + meters_to_lat(radius)
        center_lon = lon
        steps = 18
        if direction == 1:
            a0, a1 = -math.pi / 2, math.pi / 2
        else:
            a0, a1 = -math.pi / 2, -math.pi / 2 - math.pi
        for s in range(1, steps + 1):
            a = a0 + (a1 - a0) * s / steps
            east = radius * math.cos(a)
            north = radius * math.sin(a)
            pts.append(
                (
                    center_lat + meters_to_lat(north),
                    center_lon + meters_to_lon(east, center_lat),
                )
            )
        lat = pts[-1][0]
        lon = pts[-1][1]
        direction *= -1
    return pts


def path_length(pts: list[tuple[float, float]]) -> float:
    return sum(hav(a[0], a[1], b[0], b[1]) for a, b in zip(pts, pts[1:]))


def solve_row_length(target_m: float = 6800.0) -> tuple[float, list[tuple[float, float]], float]:
    lo, hi = 200.0, 900.0
    best: list[tuple[float, float]] = []
    length = 0.0
    row = 500.0
    for _ in range(28):
        row = (lo + hi) / 2
        best = build_path(row)
        length = path_length(best)
        if length < target_m:
            lo = row
        else:
            hi = row
    return row, best, length


def with_distance(pts: list[tuple[float, float]]) -> list[tuple[float, float, float]]:
    out = [(pts[0][0], pts[0][1], 0.0)]
    acc = 0.0
    for a, b in zip(pts, pts[1:]):
        acc += hav(a[0], a[1], b[0], b[1])
        out.append((b[0], b[1], acc))
    return out


def sample_at(pts: list[tuple[float, float, float]], dist: float) -> tuple[float, float, float, float]:
    """返回 lat, lon, heading_deg（正北顺时针）, 实际距离。"""
    if dist <= 0:
        lat, lon, _ = pts[0]
        lat2, lon2, _ = pts[1]
        return lat, lon, heading(lat, lon, lat2, lon2), 0.0
    total = pts[-1][2]
    dist = min(dist, total)
    for a, b in zip(pts, pts[1:]):
        if b[2] >= dist:
            span = b[2] - a[2]
            t = 0 if span == 0 else (dist - a[2]) / span
            lat = a[0] + (b[0] - a[0]) * t
            lon = a[1] + (b[1] - a[1]) * t
            return lat, lon, heading(a[0], a[1], b[0], b[1]), dist
    lat, lon, _ = pts[-1]
    return lat, lon, 0.0, total


def heading(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    east = (lon2 - lon1) * math.cos(math.radians((lat1 + lat2) / 2))
    north = lat2 - lat1
    return (math.degrees(math.atan2(east, north)) + 360) % 360


def offset_point(lat: float, lon: float, heading_deg: float, left_m: float) -> tuple[float, float]:
    # 航向顺时针自北，左侧为航向减 90°
    bearing = math.radians(heading_deg - 90)
    north = math.cos(bearing) * left_m
    east = math.sin(bearing) * left_m
    return lat + meters_to_lat(north), lon + meters_to_lon(east, lat)


def altitude(dist: float, total: float) -> float:
    x = dist / total
    return 96 + 7.5 * math.sin(4 * math.pi * x) + 2.2 * math.sin(10 * math.pi * x)


def deg_to_dms_rational(deg: float) -> tuple[tuple[int, int], tuple[int, int], tuple[int, int]]:
    deg = abs(deg)
    d = int(deg)
    m_float = (deg - d) * 60
    m = int(m_float)
    s = int(round((m_float - m) * 60 * 10000))
    if s >= 60 * 10000:
        s -= 60 * 10000
        m += 1
    if m >= 60:
        m -= 60
        d += 1
    return ((d, 1), (m, 1), (s, 10000))


def xml_escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def write_gpx(pts: list[tuple[float, float, float]], total: float) -> None:
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gpx version="1.1" creator="drone-inspection-sample"',
        '  xmlns="http://www.topografix.com/GPX/1/1">',
        "  <metadata>",
        "    <name>龙羊峡水光互补光伏电站 · 架次 LYX-2026-0618-03</name>",
        "    <desc>青海省海南州共和县塔拉滩 A 区合成巡检航线。ele 为相对地面高度（米），time 为 UTC。</desc>",
        "    <time>2026-06-18T01:06:00Z</time>",
        "  </metadata>",
        "  <trk>",
        "    <name>龙羊峡水光互补光伏电站 · 架次 LYX-2026-0618-03</name>",
        "    <desc>塔拉滩 A 区往复航线，覆盖约十二条组串巡检带。</desc>",
        "    <trkseg>",
    ]
    for lat, lon, dist in pts:
        t = START + timedelta(seconds=DURATION_S * dist / total)
        stamp = t.strftime("%Y-%m-%dT%H:%M:%SZ")
        ele = altitude(dist, total)
        lines.append(
            f'      <trkpt lat="{lat:.7f}" lon="{lon:.7f}"><ele>{ele:.2f}</ele><time>{stamp}</time></trkpt>'
        )
    lines += ["    </trkseg>", "  </trk>", "</gpx>", ""]
    (OUT / "flight.gpx").write_text("\n".join(lines), encoding="utf-8")


def write_kml(pts: list[tuple[float, float, float]], total: float) -> None:
    whens = []
    coords = []
    for lat, lon, dist in pts:
        t = START + timedelta(seconds=DURATION_S * dist / total)
        whens.append(f"        <when>{t.strftime('%Y-%m-%dT%H:%M:%SZ')}</when>")
        coords.append(f"        <gx:coord>{lon:.7f} {lat:.7f} {altitude(dist, total):.2f}</gx:coord>")
    body = "\n".join(
        [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">',
            "  <Document>",
            "    <name>龙羊峡水光互补光伏电站 · 架次 LYX-2026-0618-03</name>",
            "    <description>塔拉滩 A 区合成巡检航线。gx:coord 第三值为相对地面高度（米）。</description>",
            "    <Placemark>",
            "      <name>巡检航迹</name>",
            "      <gx:Track>",
            "        <altitudeMode>relativeToGround</altitudeMode>",
            *whens,
            *coords,
            "      </gx:Track>",
            "    </Placemark>",
            "  </Document>",
            "</kml>",
            "",
        ]
    )
    (OUT / "flight.kml").write_text(body, encoding="utf-8")


def load_font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_PATH, size)


def thermal_color(t: float) -> tuple[int, int, int]:
    t = max(0.0, min(1.0, t))
    # 冷蓝 → 紫 → 红 → 黄 → 白
    stops = [
        (0.0, (18, 28, 92)),
        (0.35, (78, 28, 130)),
        (0.55, (176, 42, 58)),
        (0.75, (232, 150, 40)),
        (0.9, (255, 220, 90)),
        (1.0, (255, 250, 240)),
    ]
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        if t <= b:
            u = 0 if b == a else (t - a) / (b - a)
            return tuple(int(ca[i] + (cb[i] - ca[i]) * u) for i in range(3))  # type: ignore[return-value]
    return stops[-1][1]


def draw_photo(path: Path, spec: dict, when_local: datetime) -> None:
    w, h = 880, 560
    rng = spec["index"] * 17 + 3
    thermal = spec["code"] in {"hotspot", "diode"}
    img = Image.new("RGB", (w, h), (12, 18, 28) if thermal else (28, 36, 44))
    draw = ImageDraw.Draw(img, "RGBA")
    font = load_font(20)
    font_sm = load_font(16)
    font_lg = load_font(28)

    # 地面 / 天空
    if thermal:
        for y in range(h):
            shade = 16 + int(18 * y / h)
            draw.line([(0, y), (w, y)], fill=(shade, shade // 2, shade + 20))
    else:
        draw.rectangle([0, 0, w, int(h * 0.42)], fill=(126, 158, 176))
        draw.rectangle([0, int(h * 0.42), w, h], fill=(62, 78, 70))
        for i in range(8):
            yy = int(h * 0.46) + i * 28
            draw.line([(0, yy), (w, yy + 10)], fill=(48, 62, 56), width=10)

    # 组件位置，轻微随机倾斜
    skew = ((rng % 7) - 3) * 6
    top, left, right, bottom = 78, 150 + skew, 730 - skew // 2, 470
    if spec["code"] == "tilt":
        top, left, right, bottom = 96, 188, 700, 468
        skew = 36

    frame = (186, 194, 198) if not thermal else (90, 96, 110)
    draw.polygon(
        [(left - 16, top - 12), (right + 16, top - 12 + skew // 5), (right + 16, bottom + 14), (left - 16, bottom + 14)],
        fill=frame,
    )

    cols, rows = 6, 10
    cw = (right - left) / cols
    rh = (bottom - top) / rows

    def cell_box(c: int, r: int) -> tuple[int, int, int, int]:
        x0 = left + c * cw
        y0 = top + r * rh + skew * (1 - c / cols) * 0.15
        return int(x0 + 3), int(y0 + 3), int(x0 + cw - 3), int(y0 + rh - 3)

    for r in range(rows):
        for c in range(cols):
            box = cell_box(c, r)
            if thermal:
                base = 0.38 + 0.04 * math.sin(c * 1.7 + r)
                if spec["code"] == "diode" and c == 0:
                    base = 0.82
                color = thermal_color(base)
            else:
                dark = 18 + ((c + r + rng) % 3) * 6
                color = (20 + dark // 4, 48 + dark, 120 + dark)
                if spec["code"] == "pid" and (c == 0 or r == 0):
                    color = (16, 32, 70)
            if spec["code"] == "missing" and c == 4 and r == 6:
                draw.rectangle(box, fill=(92, 84, 62))
                continue
            draw.rectangle(box, fill=color)
            if not thermal:
                # 主栅线
                mx = (box[0] + box[2]) // 2
                draw.line([(mx, box[1] + 2), (mx, box[3] - 2)], fill=(196, 206, 214), width=2)

    if spec["code"] == "hotspot":
        cx, cy = cell_box(3, 4)[0:2]
        cx += 28
        cy += 18
        for rad, temp in ((70, 0.55), (46, 0.72), (28, 0.86), (14, 0.98)):
            col = thermal_color(temp)
            draw.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=col + (180,))
    elif spec["code"] == "crack":
        x, y = cell_box(2, 2)[0], cell_box(2, 2)[1]
        crack = [(x + 10, y + 8), (x + 40, y + 36), (x + 28, y + 70), (x + 90, y + 120), (x + 70, y + 180)]
        draw.line(crack, fill=(236, 242, 245), width=2)
        draw.line([(p[0] + 1, p[1] - 8) for p in crack[1:4]], fill=(220, 230, 236), width=1)
    elif spec["code"] == "glass":
        cx = (left + right) // 2
        cy = (top + bottom) // 2 - 10
        for ang in range(0, 360, 28):
            rad = math.radians(ang)
            draw.line(
                [(cx, cy), (cx + int(math.cos(rad) * 120), cy + int(math.sin(rad) * 70))],
                fill=(255, 255, 255, 210),
                width=2,
            )
        draw.ellipse([cx - 8, cy - 8, cx + 8, cy + 8], fill=(255, 255, 255))
    elif spec["code"] == "soiling":
        for i in range(18):
            x = left + ((i * 97 + rng) % (right - left))
            y = top + ((i * 53) % (bottom - top))
            draw.ellipse([x, y, x + 50, y + 26], fill=(120, 96, 62, 90))
    elif spec["code"] == "bird":
        x, y = cell_box(4, 3)[0] - 6, cell_box(4, 3)[1] + 4
        draw.ellipse([x, y, x + 74, y + 48], fill=(236, 236, 228, 230))
        draw.ellipse([x + 18, y + 10, x + 40, y + 28], fill=(86, 48, 120, 220))
    elif spec["code"] == "snail":
        x, y = left + 40, top + 50
        trail = []
        for i in range(18):
            trail.append((x + i * 28, y + int(40 * math.sin(i * 0.7)) + i * 12))
        draw.line(trail, fill=(92, 64, 42), width=8)
    elif spec["code"] == "frame":
        draw.polygon([(right - 10, top), (right + 28, top + 24), (right + 8, top + 70), (right - 20, top + 40)], fill=(150, 156, 160))
    elif spec["code"] == "junction":
        box = [ (left + right) // 2 - 36, bottom - 8, (left + right) // 2 + 36, bottom + 28]
        draw.rounded_rectangle(box, radius=4, fill=(24, 24, 26))
        draw.ellipse([box[0] + 18, box[1] + 4, box[2] - 18, box[3] - 4], fill=(180, 70, 24))
    elif spec["code"] == "weed":
        for i in range(7):
            x = left + 30 + i * 70
            draw.polygon([(x, bottom + 8), (x + 14, bottom - 36), (x + 28, bottom + 8)], fill=(64, 120, 48))
    elif spec["code"] == "ribbon":
        box = cell_box(1, 5)
        draw.line([(box[0] + 8, (box[1] + box[3]) // 2), (box[2] + 80, (box[1] + box[3]) // 2)], fill=(176, 120, 48), width=4)
    elif spec["code"] == "rust":
        draw.rectangle([left - 16, bottom - 20, right + 16, bottom + 14], fill=(138, 78, 36))
    elif spec["code"] == "dust":
        dust = Image.new("RGBA", (w, h), (150, 140, 110, 70))
        img.paste(dust, (0, 0), dust)
        draw = ImageDraw.Draw(img, "RGBA")
    elif spec["code"] == "glass" and False:
        pass

    # 取景框
    margin = 18
    bracket = (240, 246, 236)
    arm = 28
    for x, y, sx, sy in (
        (margin, margin, 1, 1),
        (w - margin, margin, -1, 1),
        (margin, h - margin, 1, -1),
        (w - margin, h - margin, -1, -1),
    ):
        draw.line([(x, y), (x + arm * sx, y)], fill=bracket, width=2)
        draw.line([(x, y), (x, y + arm * sy)], fill=bracket, width=2)

    mode = "红外" if thermal else "可见光"
    stamp = when_local.strftime("%Y-%m-%d %H:%M:%S")
    draw.rectangle([0, 0, w, 40], fill=(0, 0, 0, 150))
    draw.text((14, 8), f"M30T   {mode}   {stamp}  北京时间", font=font, fill=(236, 242, 232))
    tag = f"{TYPE_LABEL[spec['code']]} · {SEV_LABEL[spec['severity']]}"
    draw.rounded_rectangle([14, 50, 14 + 18 * len(tag), 86], radius=6, fill=(12, 16, 14, 170))
    draw.text((24, 54), tag, font=font_lg, fill=(255, 214, 120) if spec["severity"] == "severe" else (232, 238, 230))
    footer = f"{spec['lat']:.6f}°N   {spec['lon']:.6f}°E   相对高度 {spec['alt']:.0f} m   {spec['module']}"
    draw.rectangle([0, h - 36, w, h], fill=(0, 0, 0, 150))
    draw.text((14, h - 30), footer, font=font_sm, fill=(226, 232, 220))

    note = spec["note"]
    desc = "|".join(
        [
            spec["code"],
            spec["severity"],
            spec["module"],
            base64.b64encode(note.encode("utf-8")).decode("ascii"),
        ]
    )
    dt = when_local.strftime("%Y:%m:%d %H:%M:%S")
    lat, lon = spec["lat"], spec["lon"]
    gps = {
        piexif.GPSIFD.GPSLatitudeRef: "N",
        piexif.GPSIFD.GPSLatitude: deg_to_dms_rational(lat),
        piexif.GPSIFD.GPSLongitudeRef: "E",
        piexif.GPSIFD.GPSLongitude: deg_to_dms_rational(lon),
        piexif.GPSIFD.GPSAltitudeRef: 0,
        piexif.GPSIFD.GPSAltitude: (int(round(spec["alt"] * 100)), 100),
    }
    zeroth = {
        piexif.ImageIFD.Make: b"DJI",
        piexif.ImageIFD.Model: b"M30T",
        piexif.ImageIFD.Software: b"drone-inspection-sample",
        piexif.ImageIFD.DateTime: dt.encode("ascii"),
        piexif.ImageIFD.ImageDescription: desc.encode("ascii"),
    }
    exif_ifd = {
        piexif.ExifIFD.DateTimeOriginal: dt.encode("ascii"),
        piexif.ExifIFD.DateTimeDigitized: dt.encode("ascii"),
    }
    exif_bytes = piexif.dump({"0th": zeroth, "Exif": exif_ifd, "GPS": gps})
    img.convert("RGB").save(path, format="JPEG", quality=82, exif=exif_bytes)


def main() -> None:
    PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    row, raw, length = solve_row_length(6800)
    measured = with_distance(raw)
    total = measured[-1][2]
    # 抽稀到大约 6 米一点已经在生成时完成；再保证首尾都在
    write_gpx(measured, total)
    write_kml(measured, total)

    names = []
    for index, (frac, off, code, sev, module, note) in enumerate(DEFECTS, start=1):
        dist = total * frac
        lat, lon, hdg, _ = sample_at(measured, dist)
        plat, plon = offset_point(lat, lon, hdg, off)
        alt = altitude(dist, total)
        when = START + timedelta(seconds=DURATION_S * dist / total)
        local = when.astimezone(timezone(timedelta(hours=8)))
        fname = f"D{index:02d}.jpg"
        spec = {
            "index": index,
            "code": code,
            "severity": sev,
            "module": module,
            "note": note,
            "lat": plat,
            "lon": plon,
            "alt": alt,
        }
        draw_photo(PHOTO_DIR / fname, spec, local)
        names.append(f"photos/{fname}")

    manifest = {
        "track": "flight.gpx",
        "kml": "flight.kml",
        "site": "龙羊峡水光互补光伏电站",
        "sortie": "LYX-2026-0618-03",
        "zone": "青海省海南州共和县塔拉滩 A 区",
        "photos": names,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"row_len_m={row:.2f}")
    print(f"distance_m={total:.2f}")
    print(f"duration_s={DURATION_S}")
    print(f"points={len(measured)}")
    print(f"photos={len(names)}")
    print(f"bbox lat {min(p[0] for p in measured):.5f}-{max(p[0] for p in measured):.5f}")
    print(f"bbox lon {min(p[1] for p in measured):.5f}-{max(p[1] for p in measured):.5f}")


if __name__ == "__main__":
    main()
