"""Make the two Color Gems QR codes and check that they decode.

Usage: python3 qr/make_qr.py [URL]
Needs: pip install qrcode pillow opencv-contrib-python-headless
"""
import os
import sys

import qrcode
from PIL import Image, ImageDraw, ImageFont, ImageChops

URL = sys.argv[1] if len(sys.argv) > 1 else "https://galynaal.github.io/color-gems/"
HERE = os.path.dirname(os.path.abspath(__file__))
LORA = os.path.join(HERE, "fonts", "Lora-BoldItalic.ttf")
NUNITO = os.path.join(HERE, "fonts", "Nunito-ExtraBold.ttf")

NAVY = (43, 35, 80)
RUBY, AMETHYST, SAPPHIRE, EMERALD = (194, 24, 91), (122, 63, 196), (36, 87, 197), (15, 138, 95)
LAVENDER = (236, 228, 252)

W, H = 1600, 1780       # canvas
M = 28                  # module size in px
QUIET = 4               # quiet zone in modules


def matrix(url):
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, border=0)
    q.add_data(url)
    q.make(fit=True)
    return q.get_matrix()


def diag_gradient(size, stops):
    """Diagonal (top-left to bottom-right) multi-stop gradient."""
    w, h = size
    small = Image.new("RGB", (256, 1))
    n = len(stops) - 1
    for x in range(256):
        t = x / 255 * n
        i = min(int(t), n - 1)
        f = t - i
        a, b = stops[i], stops[i + 1]
        small.putpixel((x, 0), tuple(round(a[k] + (b[k] - a[k]) * f) for k in range(3)))
    line = small.resize((w + h, 1), Image.BILINEAR)
    out = Image.new("RGB", (w, h))
    for y in range(h):
        out.paste(line.crop((y, 0, y + w, 1)), (0, y))
    return out


def gradient_text(img, xy_center, text, font, stops):
    d = ImageDraw.Draw(img)
    l, t, r, b = d.textbbox((0, 0), text, font=font)
    w, h = r - l, b - t
    mask = Image.new("L", (w + 20, h + 20), 0)
    ImageDraw.Draw(mask).text((10 - l, 10 - t), text, font=font, fill=255)
    grad = Image.new("RGB", mask.size)
    for x in range(mask.size[0]):
        f = x / (mask.size[0] - 1)
        c = tuple(round(stops[0][k] + (stops[1][k] - stops[0][k]) * f) for k in range(3))
        ImageDraw.Draw(grad).line([(x, 0), (x, mask.size[1])], fill=c)
    img.paste(grad, (xy_center[0] - mask.size[0] // 2, xy_center[1] - mask.size[1] // 2), mask)


def plain_text(img, xy_center, text, font, color):
    ImageDraw.Draw(img).text(xy_center, text, font=font, fill=color, anchor="mm")


def sparkle(d, cx, cy, r, color):
    k = r * 0.28
    d.polygon([(cx, cy - r), (cx + k, cy - k), (cx + r, cy), (cx + k, cy + k),
               (cx, cy + r), (cx - k, cy + k), (cx - r, cy), (cx - k, cy - k)], fill=color)


def gem(d, cx, top, w, colors):
    """Small faceted gem (same shape as the game icon, 64x64 grid)."""
    s = w / 48

    def P(pts):
        return [(cx + (x - 32) * s, top + (y - 8) * s) for x, y in pts]
    base, left, right, crown, side = colors
    d.polygon(P([(8, 22), (18, 8), (46, 8), (56, 22), (32, 58)]), fill=base)
    d.polygon(P([(8, 22), (32, 22), (32, 58)]), fill=left)
    d.polygon(P([(56, 22), (32, 22), (32, 58)]), fill=right)
    d.polygon(P([(18, 8), (46, 8), (32, 22)]), fill=crown)
    d.polygon(P([(8, 22), (18, 8), (32, 22)]), fill=side)
    return top + 50 * s  # bottom y


def make(color):
    mat = matrix(URL)
    n = len(mat)
    code = n * M
    full = (n + 2 * QUIET) * M

    img = Image.new("RGB", (W, H), LAVENDER if color else (255, 255, 255))
    d = ImageDraw.Draw(img)
    card = (60, 60, W - 60, H - 60)
    d.rounded_rectangle(card, 70, fill="white", outline=AMETHYST if color else (0, 0, 0), width=10)
    if color:
        for x, y, r, c in [(150, 160, 34, RUBY), (1450, 170, 28, SAPPHIRE), (140, H - 170, 26, EMERALD),
                           (1460, H - 160, 34, AMETHYST), (230, 260, 16, (200, 160, 240)), (1370, 270, 16, (150, 190, 250))]:
            sparkle(d, x, y, r, c)

    # Title and caption
    title_f = ImageFont.truetype(LORA, 150)
    cap_f = ImageFont.truetype(LORA, 104)
    qx = (W - full) // 2
    qy = 300
    if color:
        gradient_text(img, (W // 2, 200), "Color Gems", title_f, (RUBY, SAPPHIRE))
        gradient_text(img, (W // 2, qy + full + 110), "Scan to mix gems!", cap_f, (AMETHYST, EMERALD))
    else:
        plain_text(img, (W // 2, 200), "Color Gems", title_f, (0, 0, 0))
        plain_text(img, (W // 2, qy + full + 110), "Scan to mix gems!", cap_f, (0, 0, 0))

    ox, oy = qx + QUIET * M, qy + QUIET * M  # top-left of the first module

    # Center plate: ~31% of the code width, snapped to whole modules.
    pm = round(n * 0.31)
    if pm % 2 != n % 2:
        pm += 1
    p0 = (n - pm) // 2
    plate = (ox + p0 * M, oy + p0 * M, ox + (p0 + pm) * M, oy + (p0 + pm) * M)

    def in_finder(r, c):
        return (r < 7 and c < 7) or (r < 7 and c >= n - 7) or (r >= n - 7 and c < 7)

    def in_plate(r, c):
        return p0 <= r < p0 + pm and p0 <= c < p0 + pm

    # Data modules
    mask = Image.new("L", (code, code), 0)
    md = ImageDraw.Draw(mask)
    for r in range(n):
        for c in range(n):
            if mat[r][c] and not in_finder(r, c) and not in_plate(r, c):
                x, y = c * M, r * M
                if color:
                    md.rounded_rectangle((x + 1, y + 1, x + M - 2, y + M - 2), 6, fill=255)
                else:
                    md.rectangle((x, y, x + M - 1, y + M - 1), fill=255)
    if color:
        fill = diag_gradient((code, code), [RUBY, AMETHYST, SAPPHIRE, EMERALD])
    else:
        fill = Image.new("RGB", (code, code), (0, 0, 0))
    img.paste(fill, (ox, oy), mask)

    # Finder patterns
    centers = [RUBY, SAPPHIRE, EMERALD]
    for i, (r, c) in enumerate([(0, 0), (0, n - 7), (n - 7, 0)]):
        x, y = ox + c * M, oy + r * M
        s = 7 * M
        if color:
            d.rounded_rectangle((x, y, x + s - 1, y + s - 1), 22, fill=NAVY)
            d.rounded_rectangle((x + M, y + M, x + s - M - 1, y + s - M - 1), 12, fill="white")
            d.rounded_rectangle((x + 2 * M, y + 2 * M, x + s - 2 * M - 1, y + s - 2 * M - 1), 12, fill=centers[i])
        else:
            d.rectangle((x, y, x + s - 1, y + s - 1), fill=(0, 0, 0))
            d.rectangle((x + M, y + M, x + s - M - 1, y + s - M - 1), fill="white")
            d.rectangle((x + 2 * M, y + 2 * M, x + s - 2 * M - 1, y + s - 2 * M - 1), fill=(0, 0, 0))

    # Center plate with gem on top, "Salem 1B" below, clear gap between them
    inset = M // 2
    pl = (plate[0] + inset, plate[1] + inset, plate[2] - inset, plate[3] - inset)
    d.rounded_rectangle(pl, 36, fill="white", outline=AMETHYST if color else (0, 0, 0), width=6)
    pw = pl[2] - pl[0]
    gem_w = pw * 0.36
    gem_colors = ([(170, 130, 230), (140, 95, 210), (105, 60, 175), (225, 205, 250), (190, 160, 240)] if color
                  else [(90, 90, 90), (60, 60, 60), (25, 25, 25), (200, 200, 200), (140, 140, 140)])
    text_f = ImageFont.truetype(NUNITO, 10)
    size = 10
    while True:  # largest font that fits 80% of the plate width
        f = ImageFont.truetype(NUNITO, size + 2)
        if d.textlength("Salem 1B", font=f) > pw * 0.80:
            break
        size += 2
        text_f = f
    tb = d.textbbox((0, 0), "Salem 1B", font=text_f, anchor="ls")
    text_h = tb[3] - tb[1]
    gem_h = gem_w * 50 / 48
    gap = pw * 0.08
    total = gem_h + gap + text_h
    top = pl[1] + (pw - total) / 2
    gem_bottom = gem(d, (pl[0] + pl[2]) / 2, top, gem_w, gem_colors)
    baseline = gem_bottom + gap - tb[1]
    d.text(((pl[0] + pl[2]) / 2, baseline), "Salem 1B", font=text_f, fill=NAVY if color else (0, 0, 0), anchor="ms")
    text_top = baseline + tb[1]
    assert text_top - gem_bottom >= gap - 1, "gem and text overlap"
    assert baseline + tb[3] <= pl[3] - 6, "text does not fit the plate"
    return img


def decoders():
    import cv2
    out = [("OpenCV", lambda a: cv2.QRCodeDetector().detectAndDecode(a)[0])]
    if hasattr(cv2, "wechat_qrcode_WeChatQRCode"):
        we = cv2.wechat_qrcode_WeChatQRCode()
        out.append(("WeChat", lambda a: (we.detectAndDecode(a)[0] or [""])[0]))
    return out


def verify(path):
    import cv2
    import numpy as np
    img = Image.open(path).convert("RGB")
    ok = True
    for label, im in [("full", img), ("500px", img.resize((500, round(500 * img.height / img.width)), Image.LANCZOS))]:
        a = cv2.cvtColor(np.array(im), cv2.COLOR_RGB2BGR)
        for name, dec in decoders():
            got = dec(a)
            good = got == URL
            ok &= good
            print(f"  {'PASS' if good else 'FAIL'} {name:6} {label:5} -> {got!r}")
    return ok


if __name__ == "__main__":
    all_ok = True
    for color, name in [(True, "qr-salem-1b-color.png"), (False, "qr-salem-1b-bw.png")]:
        p = os.path.join(HERE, name)
        make(color).save(p, dpi=(300, 300))
        print(p)
        all_ok &= verify(p)
    print("URL:", URL)
    sys.exit(0 if all_ok else 1)
