---
name: quality-rules
description: The encodable rules that separate incredible video from AI slop — hook, pacing, motivated b-roll, sound design, captions, color, shot variety. Apply when authoring a manifest or reviewing a scene.
metadata:
  author: Emmanuel Prouvèze
---

# Incredible vs Slop — encodable rules

The components (TTS, clips, captions) are necessary but don't make video *good*. Quality
lives in these rules. Encode them in the manifest; enforce them in `:scene-review`.

## 1. Hook (0-3s)
50-60% of drop-off is in the first 3 seconds. The opening frame must work **muted** (60%+
watch silent). Never open on a logo. Five templates: bold claim · curiosity gap · micro-story
· visual shock · direct question. Text overlay lands the idea before the voiceover.

## 2. Pacing — map cuts to the emotional arc, not a timer
- First 30s: a visual change every 10-15s. Pattern interrupt at 25-35s.
- Body: longer holds (20-40s) when the message carries itself; cut on topic/tone shift.
- Long-form: calm explanation interleaved with 5-10 quick-cut "burst sequences" every 2-3 min.
- Music tempo: 60-80 BPM teaching/narrative; 100-120 BPM for energy/builds.

## 3. B-roll motivation — SEMANTIC triggers, not time triggers
Cut to b-roll when narration names a concept with a concrete visual referent. Never on a
fixed N-second timer; never mid-sentence unless the b-roll IS the punchline. End a cutaway on
movement that flows into the next shot. Heavy transitions (wipes/morphs) only on scene changes
or reveals — never as filler. *(This is the field's #1 unsolved problem; the `visual_brief` +
Editor review is how we beat it.)*

## 4. Sound design — the biggest human/AI gap
Music ducking targets: **−20 to −25 dB** under voice; **−8 to −12 dB** in montage; drop to
**−25 dB or silence 0.5-1s before a reveal/hit**. SFX on hard cuts (soft whoosh for smooth,
impact for hard). Change the track per narrative chapter — don't loop one bed. Silence is a
tool: 0.5-1s before a key line forces attention.

## 5. Captions — the clearest slop tell when done wrong
Word-by-word highlight from **real STT timestamps** (not character estimates). Bold/color the
spoken word, dim the rest. Mobile-first 36-42pt @1080p, high-contrast stroke/shadow. Break
lines at breath pauses, not character counts. ≤1 contextual emoji per 5-7 words.

## 6. Color consistency
AI clips drift in temperature/gamma across prompts. Lock a brand **LUT** before scene-specific
correction. (Premium finishing tier: DaVinci pass for grade/HDR/broadcast.)

## 7. Shot variety
≥3 shot types per 60s (wide establishing + medium context + close emphasis). Vary camera
height (eye + one low/high). Mix static / push / handheld.

## 8. Script & on-screen text — strip the AI tells

The narration (`tts_script`), hook, and on-screen copy are where slop creeps back in even when
the visuals are clean. Run every line through **`/deslop`** (a 22-pattern AI-writing check)
before the manifest is locked. If `/deslop` isn't installed, apply this BLOCK-level subset:

- **AI-tell words** — delve, landscape, realm, leverage (verb), robust, utilize, elevate,
  foster, streamline, cutting-edge, game-changer, deep dive → plain English.
- **Em-dashes** (more than a couple per script) → commas, colons, or split the sentence.
- **Throat-clearing** ("Let's dive in", "In this video…") → open on the content.
- **Gift-wrapped endings** ("In summary", "The bottom line", "…on purpose, not by accident")
  → end on the insight, not a bow.
- **Tricolon / rule-of-threes** ("flat, generic, forgettable") → one sharp claim beats three weak ones.
- **Corrective antithesis / negation framing** ("It's not X, it's Y", "isn't just about…")
  → state the positive directly.

Spoken copy especially: write for the ear, not the textbook. (Full skill + the other 16
patterns: `/deslop`, MIT — github.com/eprouveze/claude-skills.)

## 9. Recaps of real events — ground truth beats invention

When the video recaps something that actually happened (a talk, launch, customer story), the
quality bar is *fidelity*, not just craft. The `event-recap` template encodes this.

- **Ground in source, don't guess.** Ingest the real **transcript, slide deck, recording, and
  photos** before authoring. Numbers, dates, names, and framework labels are quoted exactly —
  never paraphrased, never inferred from a photo when a transcript exists. (Reading the deck +
  transcript changed the Munich recap materially vs. the photo-only first pass.)
- **Verbatim gold quotes carry the payoff.** Pull the highest-impact lines *exactly* and put them
  on **code cards** — the generators garble text, so every real quote/number/date lives in a card,
  never in a generated frame.
- **Real voice on the apex lines.** If you have the recording, use the speaker's ACTUAL voice on
  the gold quotes (`scripts/extract-voice.mjs` → scene `voiceover:`). It blends with a TTS narrator
  on the connective lines and beats any clone for authenticity. Keep `tts_script` verbatim-equal so
  captions match.
- **Credit & ethos accuracy.** Reflect the speaker's own framing. If they credit the team, the
  recap credits the team — never assign individual credit they explicitly disown. Getting this
  wrong is worse than any visual flaw.
- **Real assets first.** Use the actual photos (cull underexposed shots, colour-correct, set
  `objectPosition` so an off-centre subject survives 9:16) and the real slides (`pdftoppm` →
  `assets/slides/`) before reaching for generation. Generative b-roll here is **abstract, textless,
  motivated** texture only — never a stand-in for what really happened.

## The divide (what the Editor scores against)
| Slop | Incredible |
|---|---|
| No arc | tension → build → resolution |
| Generic b-roll (cities, typing, handshakes) | specific motivated visual per claim |
| One flat energy | pacing matches the arc; silence used deliberately |
| Looping flat-volume music | ducked to spec, chapter-aware, SFX-augmented |
| Static bottom-thirds | word-level animated, mobile-first |
| Mismatched color across clips | brand LUT locked |
| Opens on a logo | first frame is the most interesting moment |
