# Twilight Glass highlight builder

`build-highlight.mjs` captures 27.3 seconds of live Kaki Surf canvas motion from
the local release server, records the game's WebAudio mix when Chromium permits
it, and composes a phone-first 1080 x 1920 H.264/AAC master with FFmpeg.

The edit follows `docs/HIGHLIGHT-BRIEF.md`: strongest barrel image first,
immediate danger, visible speed-building, wave escalation, big air, wildlife,
collapse, final landing, earned result, and an abrupt call to action. It uses no
external footage, music, branding, or copyrighted media.

## Requirements

- Kaki Surf served at `http://127.0.0.1:9876/index.html`
- Chromium with remote debugging at `http://127.0.0.1:9224`
- Node.js 22+, FFmpeg/FFprobe with libass, and DejaVu Sans

Run from the repository root:

```sh
node tools/highlight/build-highlight.mjs
```

Environment overrides:

- `KAKI_SURF_QA_URL`
- `KAKI_SURF_CDP_URL`
- `KAKI_HIGHLIGHT_SOURCE`
- `KAKI_HIGHLIGHT_OUTPUT`
- `FFMPEG`
- `FFPROBE`

Outputs:

- `docs/video/twilight-glass-highlight.mp4`
- `docs/video/twilight-glass-highlight-poster.jpg`
- `docs/video/twilight-glass-highlight.ffprobe.json`

The intermediate WebM defaults to `/tmp/kaki-surf-twilight-highlight-source.webm`
so the repository only keeps the release master and its validation artifacts.
