# SIET Ayudha Puja — CSE & AIML Showcase

A projector-first devotional experience for **Srinivasa Institute of Engineering and Technology**, Department of **CSE & AIML**. This build features:

- A **curtain-reveal ceremony** with premium velvet curtains and gold trim
- An **animated SVG line-drawing** of Goddess Durga drawn path-by-path using contour-extracted paths from the source artwork
- A **sketch-to-colour transition** where the warm-ink outline blooms into the full-colour illustration
 - A **3D-style suspended golden bell** centered at the top of the page that rings with a rich, multi-partial bronze-temple bell chime (click or press **Space**)
 - A **rotating celestial chakra** that spins behind the goddess during the ceremony
 - **Three glowing oil lamps (diyas)** with flickering flames below the goddess's feet
 - **Ambient particle effects** — marigold and rose petals, gold dust, and flower clusters floating across the screen
- **Optional devotional audio** — plays a local MP3 if provided, otherwise falls back to a built-in ambient drone
- An **auto-loop mode** that cycles through the full ceremony automatically
- **Reduced-motion support** — respects `prefers-reduced-motion` and shows a static sketch + colour fallback
- A **full-size poster viewer** with download link

## Run the website (no Python installation required)

1. Extract the ZIP into a normal folder on your computer.
2. Open the extracted `ayudha_puja_cse` folder in VS Code.
3. In the VS Code terminal, run:

   ```powershell
   python -m http.server 8000
   ```

4. Open **http://localhost:8000** in Chrome or Edge.
5. Click **Open the curtains**. Press **F11** for full-screen projector mode.
6. Keep the terminal/server running while the presentation is open. Stop it with `Ctrl+C` after the event.

If `python` isn't recognised, install the VS Code **Live Server** extension, right-click `index.html`, and choose **Open with Live Server**. The `Start-Showcase.bat` file is also included for Windows.

## Controls

- **Open the curtains** — opens the velvet curtains, begins the path-by-path line drawing of Goddess Durga, blooms the colour artwork in, and starts the sound.
- **Redraw Maa** — restarts the sketch-to-colour reveal without touching the curtains.
- **Reset** — returns the ceremony to the initial state (curtains closed, intro overlay visible).
- **AUTO LOOP ON/OFF** — when enabled, automatically cycles: hold → curtain close → curtain reopen → redraw → colour reveal → repeat.
- **MUSIC ON/OFF** — plays the optional local devotional MP3 when installed; otherwise, plays the built-in ambient drone.
- **RING THE BELL** (centred at the top of the page) — rings a separate, synthesized bronze-temple bell with a 3D swing animation and radiant glow. Works even while music is off. Press **Space** to ring from anywhere. Has a 3.5-second cooldown.
- **View official invitation** — opens the poster at full size. The poster can also be downloaded from the page.

## Add a Durga Maa devotional song

The project does not bundle copyrighted recordings. Copy a song file you have permission to play into `assets` and name it exactly:

```text
assets/durga-devotional.mp3
```

Reload the page using the local server. Click **Open the curtains** or **MUSIC OFF** to start it. If the file is not found or cannot be played, the website falls back to its built-in original ambient sound. Keep the MP3 in the `assets` folder rather than linking to a streaming service, so the presentation remains reliable offline.

## Python sketch regeneration (optional)

The generated sketch and drawing paths are already included:
- `assets/durga-sketch.png` — the warm-ink outline layer
- `assets/drawing-paths.js` — 348 SVG path segments with per-path timing

You do not need Python to run the site. To rebuild them from the original transparent artwork:

```powershell
python -m pip install -r requirements.txt
python generate_sketch.py
```

The script uses OpenCV edge detection to create the transparent warm-ink outline and extracts 348 semantic path layers (outline, halo, crown, face, eyes, hair, jewellery, arms, weapons, torso, sari, lion, decorative) with per-layer timing. The browser animation engine (`script.js`) consumes this via `requestAnimationFrame` for smooth 60fps path-by-path drawing.

## Included files

- `index.html` — page structure, SIET logo, poster, centred bell, chakra, oil lamps, controls, drawing canvas
- `styles.css` — curtain opening, premium wine/gold design, responsive layouts, bell swing, chakra rotation, lamp flame flickering, drawing/bell animations
- `script.js` — 8-state ceremony state machine, SVG path-by-path drawing engine, auto-loop, bell synthesis, audio, particles, poster modal
- `assets/siet-logo.png` — supplied SIET wordmark
- `assets/official-poster.png` — supplied Ayudha Puja invitation poster
- `assets/durga-maa.png` — transparent full-colour Durga Maa illustration
- `assets/durga-sketch.png` — generated warm-ink outline used for the drawing effect
- `assets/drawing-paths.js` — generated SVG path data (348 paths across 13 layers)
- `assets/durga-devotional.mp3` — optional local devotional track
- `assets/ADD-DEVOTIONAL-TRACK-HERE.txt` — optional local song instructions
- `generate_sketch.py` — regenerate the sketch image and drawing paths with Python
- `generate_poster.py` — the original alternate Python poster generator
- `copy_mp3.bat` — re-copy the devotional MP3 into assets
- `Start-Showcase.bat` — Windows launcher

## Before the event

- Run the site on the actual laptop and projector before the audience arrives.
- Press **F11**, use 100% browser zoom, and select 1920×1080 when the projector supports it.
- Connect speakers and test sound at a comfortable volume. Click the bell to check it.
- Enable **AUTO LOOP** only if you want the ceremony to repeat automatically.
- Keep all files and the `assets` folder in their original layout; do not move the HTML file away from its assets.
