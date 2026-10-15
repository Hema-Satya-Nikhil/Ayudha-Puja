"""Generate the SIET Ayudha Puja poster using Pillow and the included Durga artwork.

Usage:
    python -m pip install Pillow
    python generate_poster.py

The source image should remain at assets/durga-maa.png. Output: assets/event-poster.png
"""
from pathlib import Path
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
ART_PATH = ASSETS / "durga-maa.png"
OUT_PATH = ASSETS / "event-poster.png"
W, H = 1080, 1350


def get_font(size: int, serif: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf" if serif else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSerif-Regular.ttf" if serif else "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
        "C:/Windows/Fonts/georgia.ttf" if serif else "C:/Windows/Fonts/arial.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def centered_text(draw: ImageDraw.ImageDraw, text: str, y: int, font, fill, *, tracking: float = 0, stroke_width: int = 0, stroke_fill=None):
    if tracking <= 0:
        box = draw.textbbox((0, 0), text, font=font, stroke_width=stroke_width)
        x = (W - (box[2] - box[0])) / 2
        draw.text((x, y), text, font=font, fill=fill, stroke_width=stroke_width, stroke_fill=stroke_fill)
        return
    widths = [draw.textlength(ch, font=font) for ch in text]
    total = sum(widths) + tracking * max(0, len(text) - 1)
    x = (W - total) / 2
    for ch, cw in zip(text, widths):
        draw.text((x, y), ch, font=font, fill=fill, stroke_width=stroke_width, stroke_fill=stroke_fill)
        x += cw + tracking


def gradient_background() -> Image.Image:
    img = Image.new("RGB", (W, H))
    pix = img.load()
    top = (34, 10, 21)
    bottom = (12, 6, 12)
    for y in range(H):
        t = y / (H - 1)
        # Very slight wine-red illumination toward the upper centre.
        r = int(top[0] * (1 - t) + bottom[0] * t)
        g = int(top[1] * (1 - t) + bottom[1] * t)
        b = int(top[2] * (1 - t) + bottom[2] * t)
        for x in range(W):
            center_glow = max(0, 1 - math.sqrt(((x - W * .5) / (W * .62)) ** 2 + ((y - H * .42) / (H * .62)) ** 2))
            pix[x, y] = (min(255, int(r + 23 * center_glow)), min(255, int(g + 4 * center_glow)), min(255, int(b + 7 * center_glow)))
    return img


def main() -> None:
    if not ART_PATH.exists():
        raise FileNotFoundError(f"Missing Durga artwork: {ART_PATH}")
    poster = gradient_background().convert("RGBA")
    draw = ImageDraw.Draw(poster)

    gold = (230, 192, 124, 255)
    pale_gold = (249, 226, 180, 255)
    cream = (255, 242, 220, 255)
    muted = (216, 193, 164, 255)
    red = (117, 28, 46, 255)

    # Double frame with small lotus-like diamond ornaments.
    draw.rounded_rectangle((30, 30, W - 30, H - 30), radius=8, outline=gold, width=2)
    draw.rounded_rectangle((44, 44, W - 44, H - 44), radius=5, outline=(230, 192, 124, 95), width=1)
    for x in (55, W - 55):
        for y in (55, H - 55):
            draw.regular_polygon((x, y, 13), n_sides=4, rotation=45, fill=gold)
            draw.ellipse((x - 4, y - 4, x + 4, y + 4), fill=red, outline=pale_gold, width=1)

    # Top seal and institutional name.
    draw.ellipse((W // 2 - 34, 65, W // 2 + 34, 133), outline=gold, width=2)
    # Draw a small lotus/sun seal with geometry so it renders consistently on any system font.
    seal_cx, seal_cy = W // 2, 99
    for i in range(12):
        angle = math.radians(i * 30)
        px = seal_cx + math.cos(angle) * 19
        py = seal_cy + math.sin(angle) * 19
        draw.ellipse((px - 3.5, py - 5.5, px + 3.5, py + 5.5), fill=pale_gold)
    draw.ellipse((seal_cx - 5, seal_cy - 5, seal_cx + 5, seal_cy + 5), fill=red, outline=pale_gold, width=1)
    centered_text(draw, "SRINIVASA INSTITUTE OF", 151, get_font(20), cream, tracking=2.1)
    centered_text(draw, "ENGINEERING AND TECHNOLOGY", 181, get_font(23, True), pale_gold, tracking=1.4)
    draw.line((225, 224, W - 225, 224), fill=(230, 192, 124, 180), width=1)
    draw.polygon([(W // 2, 219), (W // 2 + 6, 224), (W // 2, 229), (W // 2 - 6, 224)], fill=gold)

    centered_text(draw, "CELEBRATING", 246, get_font(15), muted, tracking=5)
    centered_text(draw, "AYUDHA PUJA", 278, get_font(65, True), pale_gold, tracking=2.5, stroke_width=1, stroke_fill=(70, 26, 31, 255))
    centered_text(draw, "A TRIBUTE TO KNOWLEDGE · CREATION · NEW BEGINNINGS", 359, get_font(14), cream, tracking=1.1)

    # A soft warm halo behind the transparent goddess artwork.
    halo = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    halo_draw = ImageDraw.Draw(halo)
    halo_draw.ellipse((195, 390, 885, 1125), fill=(183, 98, 45, 45))
    halo = halo.filter(ImageFilter.GaussianBlur(65))
    poster = Image.alpha_composite(poster, halo)

    art = Image.open(ART_PATH).convert("RGBA")
    max_width, max_height = 780, 735
    scale = min(max_width / art.width, max_height / art.height)
    art = art.resize((int(art.width * scale), int(art.height * scale)), Image.Resampling.LANCZOS)
    art_x = (W - art.width) // 2
    art_y = 390 + max(0, (max_height - art.height) // 2)
    poster.alpha_composite(art, (art_x, art_y))

    draw = ImageDraw.Draw(poster)
    # Footer divider and department credit.
    draw.line((165, 1150, W - 165, 1150), fill=(230, 192, 124, 175), width=1)
    draw.polygon([(W // 2, 1144), (W // 2 + 6, 1150), (W // 2, 1156), (W // 2 - 6, 1150)], fill=gold)
    centered_text(draw, "DEPARTMENT OF", 1171, get_font(13), muted, tracking=3)
    centered_text(draw, "CSE  &  AIML", 1194, get_font(34, True), pale_gold, tracking=2)
    centered_text(draw, "Tradition inspires us. Technology carries us forward.", 1247, get_font(16, True), cream)
    centered_text(draw, "WISDOM IN EVERY TOOL  ·  CREATE WITH PURPOSE", 1290, get_font(11), muted, tracking=1.15)

    poster.convert("RGB").save(OUT_PATH, quality=95, optimize=True)
    print(f"Poster created: {OUT_PATH}")


if __name__ == "__main__":
    main()
