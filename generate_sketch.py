"""Generate drawing assets from the Durga Maa artwork for line-by-line animation.

Pipeline:
  1. Extract edges via multi-threshold Canny on the grayscale image and the alpha
     channel (silhouette), then apply morphological closing and light dilation so
     every contour encloses a meaningful area.
  2. Find contours and simplify them to compact SVG path data.
  3. Separate the main silhouette (largest contour) into an "outline" layer that
     is always drawn first.  The remaining contours are classified into semantic
     layers (halo, crown, face, eyes, hair, jewellery, arms, weapons, torso,
     sari, lion, decorative).
  4. Sort strokes within each layer to simulate a skilled artist drawing the
     goddess top-to-bottom, silhouette-first.
  5. Emit ``assets/drawing-paths.js`` (path data + timing manifest) and
     ``assets/durga-sketch.png`` (warm-ink overlay for fallback / reduced motion).

Usage (from this folder):
    python -m pip install -r requirements.txt
    python generate_sketch.py
"""

from __future__ import annotations

from pathlib import Path
import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
SOURCE = ASSETS / "durga-maa.png"
SKETCH_PNG = ASSETS / "durga-sketch.png"
PATHS_JS = ASSETS / "drawing-paths.js"

VIEWBOX_W, VIEWBOX_H = 1199, 1312

# ---------------------------------------------------------------------------
# Layer table -- checked in order, first match wins.
#
# y_top / y_bottom are fractions of total image height.  min_area is the
# minimum contour area for a *primary shape* in that band; smaller contours
# fall through to the next (more detail-oriented) layer or to "decorative".
#
# The area threshold implements the silhouette-before-details principle:
# large contours become the main shape (face, hair, arms, ...) while small
# contours in the same region become detail sub-layers (eyes, jewellery,
# weapons).
#
# lion is listed *before* sari so that contours in the 0.90-1.00 band with
# sufficient area are classified as lion, not sari.
# ---------------------------------------------------------------------------
LAYERS: list[tuple[str, float, float, float]] = [
    ("halo",       0.00, 0.18,  15),
    ("crown",      0.10, 0.36,  18),
    ("face",       0.30, 0.54,  60),
    ("eyes",       0.34, 0.50,  10),
    ("hair",       0.42, 0.68,  20),
    ("jewellery",  0.44, 0.66,  10),
    ("arms",       0.55, 0.76,  25),
    ("weapons",    0.55, 0.80,  10),
    ("torso",      0.68, 0.86,  60),
    ("lion",       0.90, 1.00,  25),
    ("sari",       0.80, 0.94,  30),
    ("decorative", 0.00, 1.00,   0),
]

# Layer timing schedule (seconds from drawing start).
# Gaps between layers create deliberate pauses between major sections.
LAYER_TIMING: dict[str, tuple[float, float]] = {
    "outline":    (0.0,   3.5),
    "halo":       (3.7,   0.8),
    "crown":      (4.5,   4.0),
    "face":       (8.7,   4.8),
    "eyes":       (13.7,  2.7),
    "hair":       (16.6,  4.0),
    "jewellery":  (20.8,  2.8),
    "arms":       (23.8,  3.3),
    "weapons":    (27.3,  2.8),
    "torso":      (30.3,  3.3),
    "sari":       (33.8,  4.6),
    "lion":       (38.6,  2.7),
    "decorative": (41.5,  0.6),
}

TOTAL_DRAW_DURATION = 42.1
MAX_PATHS_PER_LAYER = 30
OUTLINE_AREA_THRESHOLD = 10000  # contours above this are candidates for the outline


def extract_edges(rgba: np.ndarray, rgb: np.ndarray) -> np.ndarray:
    """Return a binary edge map suitable for contour extraction.

    Combines multi-threshold Canny edges (strong outlines + fine details) with
    alpha-channel silhouette edges, then applies morphological closing and light
    dilation so every contour encloses a meaningful area.
    """
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    smoothed = cv2.bilateralFilter(gray, d=7, sigmaColor=35, sigmaSpace=35)

    # Strong edges (silhouette, major colour transitions)
    edges_strong = cv2.Canny(smoothed, threshold1=60, threshold2=150, L2gradient=True)
    # Fine edges (jewellery, facial features, weapon engravings)
    edges_fine = cv2.Canny(smoothed, threshold1=20, threshold2=60, L2gradient=True)

    # Alpha-channel silhouette (clean outer boundary of goddess + lion)
    alpha_bin = (rgba[:, :, 3] > 128).astype(np.uint8) * 255
    alpha_edges = cv2.Canny(alpha_bin, 50, 150)

    combined = cv2.bitwise_or(cv2.bitwise_or(edges_strong, edges_fine), alpha_edges)

    # Close small gaps, then dilate lightly so contours have non-trivial area.
    kernel3 = np.ones((3, 3), np.uint8)
    kernel2 = np.ones((2, 2), np.uint8)
    combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel3, iterations=1)
    combined = cv2.dilate(combined, kernel2, iterations=2)
    combined = cv2.GaussianBlur(combined, (3, 3), sigmaX=0.4)
    combined = cv2.threshold(combined, 30, 255, cv2.THRESH_BINARY)[1]
    return combined


def edges_for_sketch(rgba: np.ndarray, rgb: np.ndarray) -> np.ndarray:
    """Return thin edge image for the warm-ink sketch PNG overlay."""
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    smoothed = cv2.bilateralFilter(gray, d=9, sigmaColor=42, sigmaSpace=42)
    edges = cv2.Canny(smoothed, threshold1=28, threshold2=85, L2gradient=True)
    edges = cv2.dilate(edges, np.ones((2, 2), np.uint8), iterations=1)
    edges = cv2.GaussianBlur(edges, (3, 3), sigmaX=0.55)
    return edges


def contour_to_path(contour: np.ndarray, epsilon: float) -> str | None:
    """Simplify a contour and return the SVG ``d`` attribute, or ``None``."""
    peri = cv2.arcLength(contour, True)
    approx = cv2.approxPolyDP(contour, epsilon, True)
    if len(approx) < 2:
        return None
    points = approx.reshape(-1, 2)
    # Start from the top-most (then left-most) point -- a natural pen-down spot.
    start_idx = np.lexsort((points[:, 0], points[:, 1]))[0]
    points = np.roll(points, -start_idx, axis=0)
    path = f"M{points[0, 0]:.1f},{points[0, 1]:.1f}"
    for p in points[1:]:
        path += f" L{p[0]:.1f},{p[1]:.1f}"
    path += " Z"
    return path


def classify(y_centroid: float, area: float, height: int) -> str:
    """Return the semantic layer name for a contour centroid + area."""
    y_frac = y_centroid / height
    for name, y_top, y_bottom, min_area in LAYERS:
        if y_top <= y_frac <= y_bottom:
            if area >= min_area or name == "decorative":
                return name
    return "decorative"


def main() -> None:
    if not SOURCE.is_file():
        raise FileNotFoundError(f"Missing source artwork: {SOURCE}")

    img = Image.open(SOURCE).convert("RGBA")
    rgba = np.array(img)
    rgb = rgba[:, :, :3]
    height, width = rgb.shape[:2]

    # ---- Edge extraction ----
    edges = extract_edges(rgba, rgb)

    # ---- Find contours ----
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)

    # ---- Process contours ----
    layer_order = {name: i for i, (name, *_rest) in enumerate(LAYERS)}
    entries: list[dict] = []

    for contour in contours:
        M = cv2.moments(contour)
        if M["m00"] == 0:
            continue
        area = M["m00"]
        if area < 8:
            continue
        peri = cv2.arcLength(contour, True)
        if peri < 20:
            continue

        cy = M["m01"] / M["m00"]
        cx = M["m10"] / M["m00"]

        # Adaptive simplification: large contours (silhouette) keep more detail.
        if area > 5000:
            epsilon = max(0.5, peri * 0.003)
        else:
            epsilon = max(0.8, peri * 0.012)
        path_data = contour_to_path(contour, epsilon)
        if path_data is None:
            continue

        layer = classify(cy, area, height)

        entries.append(
            {
                "data": path_data,
                "layer": layer,
                "area": float(area),
                "cx": float(cx),
                "cy": float(cy),
                "perimeter": float(peri),
            }
        )

    # ---- Separate main silhouette into "outline" layer ----
    if entries:
        largest_idx = max(range(len(entries)), key=lambda i: entries[i]["area"])
        if entries[largest_idx]["area"] >= OUTLINE_AREA_THRESHOLD:
            outline_entry = entries.pop(largest_idx)
            outline_entry["layer"] = "outline"
            outline_entry["startTime"] = LAYER_TIMING["outline"][0]
            outline_entry["duration"] = LAYER_TIMING["outline"][1]
            entries.insert(0, outline_entry)

    # ---- Group by layer, sort, cap ----
    layer_paths: dict[str, list[dict]] = {}
    for e in entries:
        layer_paths.setdefault(e["layer"], []).append(e)

    for layer_name, *_rest in LAYERS:
        group = layer_paths.get(layer_name)
        if not group:
            continue
        group.sort(key=lambda e: (-e["area"], e["cy"], e["cx"]))
        if len(group) > MAX_PATHS_PER_LAYER:
            overflow = group[MAX_PATHS_PER_LAYER:]
            for e in overflow:
                e["layer"] = "decorative"
            layer_paths["decorative"] = layer_paths.get("decorative", []) + overflow
            layer_paths[layer_name] = group[:MAX_PATHS_PER_LAYER]

    # Handle outline layer separately (already timed)
    outline_group = layer_paths.get("outline", [])
    for e in outline_group:
        e["startTime"] = LAYER_TIMING["outline"][0]
        e["duration"] = max(1.0, LAYER_TIMING["outline"][1])

    # ---- Assign staggered timing within each layer ----
    timed: list[dict] = []
    # Outline first
    for e in outline_group:
        timed.append(e)
    # Then regular layers in draw order
    draw_order = [
        "halo", "crown", "face", "eyes", "hair", "jewellery",
        "arms", "weapons", "torso", "sari", "lion", "decorative",
    ]
    for name in draw_order:
        group = layer_paths.get(name)
        if not group:
            continue
        start_s, dur_s = LAYER_TIMING[name]
        n = len(group)
        for i, e in enumerate(group):
            if n == 1:
                e_start = start_s
                e_dur = max(0.3, dur_s)
            else:
                e_start = start_s + (i / max(1, n - 1)) * dur_s
                e_dur = max(0.22, dur_s / n * 1.10)
            e["startTime"] = e_start
            e["duration"] = e_dur
            timed.append(e)

    timed.sort(key=lambda e: e["startTime"])

    # ---- Warm-ink sketch PNG ----
    print("Generating warm-ink sketch PNG ...")
    sketch_edges = edges_for_sketch(rgba, rgb)
    stroke_val = np.clip(sketch_edges.astype(np.float32) * 0.86, 0, 230).astype(np.uint8)
    sketch_alpha = np.minimum(stroke_val, rgba[:, :, 3])
    sketch = np.zeros_like(rgba)
    sketch[:, :, :3] = (255, 225, 168)
    sketch[:, :, 3] = sketch_alpha
    Image.fromarray(sketch, mode="RGBA").save(SKETCH_PNG, optimize=True)
    print(f"  -> {SKETCH_PNG}")

    # ---- drawing-paths.js ----
    print("Generating drawing-paths.js ...")
    layer_js = ",\n".join(
        f'    "{name}": {{ start: {LAYER_TIMING[name][0]:.3f}, '
        f'duration: {LAYER_TIMING[name][1]:.3f}, count: {len(layer_paths.get(name, []))} }}'
        for name in ["outline"] + [l[0] for l in LAYERS]
    )

    path_lines: list[str] = []
    for e in timed:
        d = e["data"]
        path_lines.append(
            f'  {{ data: "{d}", '
            f'layer: "{e["layer"]}", '
            f'startTime: {e["startTime"]:.3f}, '
            f'duration: {e["duration"]:.3f}, '
            f'area: {e["area"]:.0f} }}'
        )

    js = (
        "// Auto-generated by generate_sketch.py -- DO NOT EDIT MANUALLY.\n"
        "// Contour-based SVG path data for the line-by-line Goddess Durga drawing.\n"
        "// The browser animation engine (script.js) consumes this via requestAnimationFrame.\n"
        "//\n"
        "// Timing is elapsed-time based: each path's startTime and duration are\n"
        "// expressed in seconds and resolved against the drawing start timestamp.\n"
        "// Drawing order: outline -> halo -> crown -> face -> eyes -> hair ->\n"
        "// jewellery -> arms -> weapons -> torso -> sari -> lion -> decorative.\n\n"
        f"window.DRAWING_CONFIG = {{\n"
        f"  viewBox: \"0 0 {VIEWBOX_W} {VIEWBOX_H}\",\n"
        f"  totalDuration: {TOTAL_DRAW_DURATION},\n"
        f"  layers: {{\n{layer_js}\n  }}\n"
        f"}};\n\n"
        f"window.DRAWING_PATHS = [\n"
        f"{',\n'.join(path_lines)}\n"
        f"];\n"
        f"// Total paths: {len(timed)}\n"
    )
    PATHS_JS.write_text(js, encoding="utf-8")
    print(f"  -> {PATHS_JS}  ({len(timed)} paths)")

    # ---- Layer breakdown ----
    print("\nLayer breakdown:")
    total = 0
    for name in ["outline"] + [l[0] for l in LAYERS]:
        count = len(layer_paths.get(name, []))
        total += count
        print(f"  {name:<12s} {count:>4d} paths")
    print(f"  {'TOTAL':<12s} {total:>4d} paths")


if __name__ == "__main__":
    main()
