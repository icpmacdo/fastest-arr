"""Render the Fastest ARR trailer: frames from trailer.html (headless Chrome via Playwright) + synthesized sound -> MP4.

  uv run --with playwright --with numpy python scripts/trailer/render.py [out.mp4]

Needs Google Chrome and ffmpeg on PATH. The page draws any frame on demand (window.seek(t)), so the render is deterministic.
"""
import subprocess, sys, wave, pathlib, tempfile
import numpy as np
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else HERE / "fastest-arr-trailer.mp4").resolve()
FPS, SR = 30, 44100


def audio(dur, scenes):
    n = int(dur * SR)
    x = np.zeros(n)
    t = np.arange(n) / SR

    def add(at, sig, gain=1.0):
        i = int(at * SR)
        if i >= n: return
        j = min(n, i + len(sig))
        x[i:j] += sig[: j - i] * gain

    def env(d, a=0.005, r=None):
        m = int(d * SR); e = np.ones(m)
        k = max(1, int(a * SR)); e[:k] = np.linspace(0, 1, k)
        e *= np.exp(-np.arange(m) / SR / (r or d / 4))
        return e

    def tone(f, d, r=None, a=0.005, harm=()):
        tt = np.arange(int(d * SR)) / SR
        s = np.sin(2 * np.pi * f * tt)
        for h, g in harm: s += g * np.sin(2 * np.pi * f * h * tt)
        return s * env(d, a, r)

    def thud(at, f=58, g=0.9, d=0.9):
        tt = np.arange(int(d * SR)) / SR
        s = np.sin(2 * np.pi * (f + 90 * np.exp(-tt * 18)) * tt) * np.exp(-tt * 5.5)
        add(at, s, g)

    def ding(at, g=0.35):
        add(at, tone(2093, 1.1, 0.22), g); add(at, tone(3136, 0.9, 0.16), g * .6); add(at, tone(4186, .5, .08), g * .25)

    def tick(at, g=0.18):
        add(at, tone(1800, .05, .012, 0.001), g)

    rng = np.random.default_rng(7)
    def whoosh(at, d, g=0.12):
        nz = rng.standard_normal(int(d * SR))
        k = np.hanning(int(d * SR)); add(at, np.convolve(nz, np.ones(40) / 40, mode='same') * k, g)

    # drone: swells up to the Collect and the tombstone, then falls away
    sw = np.clip(t / scenes["E"][0], 0, 1) ** 1.6 * np.clip((scenes["F"][1] - t) / 1.5, 0, 1)
    x += (np.sin(2 * np.pi * 55 * t) + 0.5 * np.sin(2 * np.pi * 82.4 * t * (1 + 0.02 * sw)) + 0.25 * np.sin(2 * np.pi * 110 * t)) * 0.09 * (0.25 + sw)

    thud(scenes["B"][0], 50, 0.7)                                   # "How fast?"
    whoosh(scenes["C"][0] - .3, .5)
    ding(scenes["C"][0] + 1.2, .22)                                 # Incorporate
    for i in range(int(3.9 / .13)): tick(scenes["D"][0] + 0.2 + i * .13, .1 + .08 * i / 30)   # the clock
    ding(scenes["D"][0] + 3.9, .5)                                  # Collect
    thud(scenes["E"][0] + 0.05, 46, 1.0, 1.4)                       # the tombstone
    add(scenes["E"][0] + .05, tone(110, 2.5, .9, 0.02, ((2, .5), (3, .3), (4, .15))), .12)
    for i in range(5): ding(scenes["F"][0] + .2 + i * .3 + .05, .12 + .02 * i)   # ledger rows
    for i in range(3): thud(scenes["G"][0] + i * (scenes["G"][1] - scenes["G"][0]) / 3, 70, .45, .5)
    seg = (scenes["H"][1] - scenes["H"][0]) / 4
    for i in range(4): thud(scenes["H"][0] + i * seg, 62 + i * 7, .6, .45); whoosh(scenes["H"][0] + i * seg - .05, .22, .08)
    b = scenes["I"][0] + .1                                          # title: a very polite braam
    for f, g in ((55, .5), (82.5, .35), (110, .3), (165, .15)):
        tt = np.arange(int(3.2 * SR)) / SR
        saw = 2 * ((f * tt) % 1) - 1
        add(b, saw * np.exp(-tt * 1.2) * np.minimum(1, tt * 40), g * .5)
    for k, f in enumerate((261.6, 329.6, 392.0)): add(b + 1.1 + k * .15, tone(f, 3.5, 1.4, .03, ((2, .3),)), .09)   # warm resolve
    ding(scenes["I"][0] + 3.7, .25)                                  # fine print

    x /= max(1e-9, np.abs(x).max()); x *= 0.8
    fade = np.clip((dur - t) / 1.2, 0, 1); x *= fade
    return (x * 32767).astype(np.int16)


def main():
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="arr-trailer-"))
    with sync_playwright() as p:
        br = p.chromium.launch(channel="chrome", args=["--force-device-scale-factor=1"])
        pg = br.new_page(viewport={"width": 1920, "height": 1080})
        pg.goto((HERE / "trailer.html").as_uri())
        pg.evaluate("document.fonts.ready.then(() => true)")
        pg.wait_for_timeout(800)
        dur = pg.evaluate("window.DURATION")
        scenes = pg.evaluate("Object.fromEntries(Object.entries(SC))")
        frames = int(dur * FPS)
        enc = subprocess.Popen(
            ["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(FPS), "-i", "-",
             "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "16", "-preset", "slow", "-vf", "format=yuv420p", str(tmp / "v.mp4")],
            stdin=subprocess.PIPE)
        for f in range(frames):
            pg.evaluate(f"seek({f / FPS})")
            enc.stdin.write(pg.screenshot(type="png"))
            if f % 100 == 0: print(f"frame {f}/{frames}", flush=True)
        enc.stdin.close(); enc.wait(); br.close()
    wav = tmp / "a.wav"
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(audio(dur, scenes).tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(tmp / "v.mp4"), "-i", str(wav), "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(OUT)], check=True)
    print("wrote", OUT)


main()
