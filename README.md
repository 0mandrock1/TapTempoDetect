# TapTempoDetect

Browser BPM meter with two ways to find a tempo: tap it in, or let the microphone hear it.
Built for the moment when a track is playing somewhere and you need the number *now* — no install,
works on a phone.

## What it does

- **Tap mode** — spacebar, click or touch. Keeps a rolling window of the last 8 taps and averages
  the intervals; taps older than 3 s are dropped so a new tempo starts clean. 100 ms debounce kills
  accidental double-hits.
- **Mic mode** — WebAudio `AnalyserNode` (fftSize 1024) reads low-band energy every frame. A beat
  fires when energy exceeds both `avg × 1.6` and 85 % of a decaying running peak, with a 280 ms
  refractory gap. Dynamic thresholding, so it adapts to loud and quiet rooms instead of a fixed level.
- **Stability score** — standard deviation across the tap intervals, shown as Perfect / Stable /
  Steady / Variable / Erratic. Tells you whether the reading is trustworthy or you're drifting.
- **Genre hint** — maps the detected BPM to a rough style band (Boom Bap, House/Techno, DnB …).
- The whole background colour interpolates across a six-stop gradient driven by BPM, and
  `navigator.vibrate` gives haptic feedback on each tap (toggleable).

The two modes are mutually exclusive by design: while the mic is listening, manual taps are ignored.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
```

No API keys. The `GEMINI_API_KEY` wiring in `vite.config.ts` is left over from the AI Studio
scaffold this started from — nothing in the app calls it.

## Stack

React 19 + TypeScript, Vite, Tailwind 4, `motion` for animation, `lucide-react` icons.
Everything lives in `src/App.tsx`; no backend, no storage, no analytics.

## Status

Working and used as-is. Mic detection is tuned for percussive material — it does not track
ambient or heavily sidechained mixes well.
