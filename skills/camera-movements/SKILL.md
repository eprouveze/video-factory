---
name: camera-movements
description: 46 AI filmmaking camera movement prompts across 7 categories (Pan/Tilt, Zoom/Lens, Dolly/Track, Physical Moves, Human Camera, Drone/Crane, Specials), plus the 5-slot camera prompt grammar (Camera / Movement / Speed / Framing / End) and first-frame reference lock assembly. Use when planning storyboards, cut lists, manifest visual.shot.move fields, or generative video clip prompts.
allowed-tools: Read, Write, Edit, Bash
metadata:
  author: Emmanuel Prouvèze
---

# Camera Movements — 46-Move AI Cinematography Library & Prompt Builder

Generative video models (Kling, Seedance, MiniMax Hailuo, Veo/Omni, Wan, Runway) fail when camera motion and scene action are tangled together or underspecified. This skill encodes a 46-move camera taxonomy across 7 categories and a deterministic **5-slot camera prompt grammar** so every generative video shot executes the exact camera trajectory intended by the Director.

> **Attribution:** Taxonomy and 5-slot prompt-builder architecture inspired by Dan Kieft ([aicameramovements.com](https://aicameramovements.com/) / YouTube `7GWd4PV3hoA`). All 46 prompts, dramatic intents, and storyboard restraint guidelines are written in original prose for Video Factory.

---

## 1. Storyboard Restraint & Cinematic Impact (Non-Negotiable)

Consider this 46-move library for **every shot during storyboard and cut-list creation** (`visual.shot.move` in `manifest.json` or `edl.json`), **without overdoing motion**:

1. **Every move must earn its place.** Camera movement is punctuation, not wallpaper. Before assigning a move, ask: *what emotional or narrative shift does this trajectory serve?*
2. **Default to stillness or subtle parallax for grounded beats.** Use `static-shot` (`01`), `slider-right`/`slider-left` (`12`/`12B`), or `slow-zoom-in` (`05`) when the spoken line, lyric, or performance carries the weight. If every shot moves aggressively, no move has impact.
3. **Save high-kinetic moves for earned turns.** Reserve `crash-zoom-in`/`out` (`07A`/`07B`), `whip-pan-right`/`left` (`03`/`03B`), `snorricam` (`24`), `orbit-clockwise`/`counterclockwise` (`15`/`15B`), `crane-up`/`down` (`25`/`25B`), and `Specials` (`S1`–`S6`) for genuine narrative pivots, chorus drops, shock reveals, or finale payoffs (typically 1–2 showcase moves per 30–60 seconds).
4. **Separate optical lens changes from physical camera translation.**
   - *Optical zoom (`05`–`07B`)*: camera body stays fixed; focal length changes (flattens perspective, clinical or punchy).
   - *Physical dolly/truck/slider (`08`–`15B`)*: camera body moves through 3D space at fixed focal length (creates foreground/background parallax and physical presence).
5. **Keep start-still (`ref_frame`) prompts free of camera motion.** Generate the start still first from a static composition brief, then apply the 5-slot camera movement prompt only to the video (`clip`) generation call.

---

## 2. The 5-Slot Camera Prompt Grammar

Every camera movement prompt is structured into five explicit slots:

```text
Camera: <move name & physical mount>.
Movement: <3D trajectory or optical focal change>.
Speed: <velocity, pacing & dynamics>.
Framing: <subject lock, horizon & parallax rules>.
End: <landing composition & stability>.
```

Why all 5 slots matter:
- **`Camera:`** anchors the rig behavior (locked tripod vs. precision slider vs. chest-mounted Snorricam vs. gyro helicopter).
- **`Movement:`** disambiguates rotation (pan/tilt) from translation (truck/pedestal/dolly) and optical focal change (zoom).
- **`Speed:`** prevents models from defaulting to floaty mid-speed drift.
- **`Framing:`** tells the model what stays fixed in screen space while the world moves.
- **`End:`** prevents late-clip drift, warping, or unmotivated rebound in the final second.

---

## 3. First-Frame-Locked Clip Prompt Assembly

When building a prompt for an image-to-video (`i2v`) or text-to-video (`t2v`) clip take, keep camera physics separated from scene action:

```text
Camera movement:
<5-slot prompt from moves.json>

Reference image context:
Use the provided start frame as the locked opening composition. Preserve subject identity, framing, lighting, depth, lens feel, and screen direction from the reference image while applying only the specified camera movement.

Scene action:
<visual_brief — concrete subject + setting + simple, readable physical action>

Mood and style:
<brand.style_suffix>

No text, no captions, no interface, no logos.
```

---

## 4. CLI & Programmatic API

Machine-readable catalog: [`moves.json`](moves.json)
Library helper: `scripts/lib/camera-moves.mjs`
CLI: `scripts/camera-move.mjs`

```bash
# List all 46 movements (or filter by category)
node scripts/camera-move.mjs list
node scripts/camera-move.mjs list --category "Dolly/Track"
node scripts/camera-move.mjs list --json

# Inspect one movement by ID, slug, or alias
node scripts/camera-move.mjs get 08
node scripts/camera-move.mjs get low-tracking
node scripts/camera-move.mjs get snorricam

# Build a complete clip prompt with 5-slot camera block + first-frame lock + no-text guard
node scripts/camera-move.mjs build \
  --move dolly-in \
  --brief "A watchmaker seated at a walnut bench adjusts a brass escapement under a warm desk lamp" \
  --ref-context "Medium shot of the watchmaker in a dark apron, warm tungsten key light from frame left" \
  --style "35mm anamorphic lens, shallow depth of field, Kodak Vision3 500T grain"
```

In `manifest.json`, set `visual.shot.move` on any scene:

```json
"visual": {
  "source": "clip",
  "visual_brief": "A lone commuter standing on a rain-slicked Tokyo platform as headlight beams cut through mist",
  "shot": {
    "size": "medium",
    "angle": "eye",
    "motion": "push",
    "move": "dolly-in"
  }
}
```

When `scripts/produce.mjs` runs a generative `clip` scene:
- The start still (`ref_frame`) is generated from `visual_brief` + `brand.style_suffix` *without* camera movement instructions.
- The video clip call receives the full assembled prompt (`buildClipPrompt`) prepending the resolved 5-slot camera block and reference-frame preservation instructions.

---

## 5. Complete 46-Move Reference Table

### Category 1: Pan/Tilt (7 moves — fixed camera base, rotational head)

| ID | Slug | Name | Remotion Fallback | Dramatic Intent | When to Use |
|---|---|---|---|---|---|
| `01` | `static-shot` | Static shot | `static` | Undivided focus on performance or tableau; composure, observational neutrality, or deadpan tension. | Dialogue holds, deadpan beats, dense visual frames where internal subject action carries the shot. |
| `02` | `pan-right` | Pan right | `pan` | Scans laterally rightward or links a subject to off-screen space on the right. | Room reveals, following left-to-right crossings, linking cause on the left to effect on the right. |
| `02B` | `pan-left` | Pan left | `pan` | Sweeps attention leftward across an environment to uncover off-screen context. | Scanning interiors right-to-left, tracking a character's leftward glance, revealing a hidden observer. |
| `03` | `whip-pan-right` | Whip pan right | `pan` | Sudden kinetic energy, surprise, or comic timing via a fast rotational snap right with motion blur. | High-tempo reaction cuts, rapid topic transitions, punchline juxtapositions. |
| `03B` | `whip-pan-left` | Whip pan left | `pan` | Abrupt leftward rotational snap with motion blur for urgency, shock, or rhythmic punch. | Fast dialogue ping-pong, sudden off-screen alarms, energetic scene bridges. |
| `04` | `tilt-up` | Tilt up | `pan` | Builds awe, scale, dominance, or aspiration by rotating upward from ground to height. | Character intros from boots to face, revealing tall architecture, following an upward gaze. |
| `04B` | `tilt-down` | Tilt down | `pan` | Grounds a scene from height down to intimate detail, vulnerability, or a floor clue. | Skyline-to-street transitions, following a dropped object, revealing ground details. |

### Category 2: Zoom/Lens (6 moves — fixed camera body, optical focal-length change)

| ID | Slug | Name | Remotion Fallback | Dramatic Intent | When to Use |
|---|---|---|---|---|---|
| `05` | `slow-zoom-in` | Slow zoom in | `push` | Ratchets psychological tension and intimacy with a slow, flat-perspective optical creep. | Monologues, confessions, creeping dread, isolating a face or clue without 3D parallax distraction. |
| `05B` | `slow-zoom-out` | Slow zoom out | `push` | Emotional detachment, solitude, or growing perspective as wider context surrounds the subject. | Chapter endings, showing a character small against an indifferent setting. |
| `06` | `fast-zoom-in` | Fast zoom in | `push` | Punctuates a sudden discovery or reality check without full crash-zoom aggression. | Moment of recognition, spotting a hazard, sudden vulnerability on a speaker's face. |
| `06B` | `fast-zoom-out` | Fast zoom out | `push` | Rapidly recontextualizes a close detail into a wider reality for exposure or scale shift. | Sudden situational reveals, rhythmic widening on a musical accent. |
| `07A` | `crash-zoom-in` | Crash zoom in | `push` | Maximum visceral shock, melodramatic intensity, or comedic punch slamming into a close-up. | Action shock beats, sudden overwhelming realizations, hard musical drops. |
| `07B` | `crash-zoom-out` | Crash zoom out | `push` | Unveils an absurd, chaotic, or shocking wider environment in an instant. | Visual punchlines where a serious close-up sits inside a chaotic setting. |

### Category 3: Dolly/Track (9 moves — physical camera translation relative to subject)

| ID | Slug | Name | Remotion Fallback | Dramatic Intent | When to Use |
|---|---|---|---|---|---|
| `08` | `dolly-in` | Dolly in | `push` | Physically steps the viewer closer with true 3D parallax; earned intimacy or mounting suspense. | Approaching a character at a turning point, creeping down a hallway, landing a key statement. |
| `09` | `dolly-out` | Dolly out | `push` | Physically retreats from the subject with true spatial parallax; abandonment, solitude, or reflection. | Leaving a character behind, closing a poignant scene, revealing foreground space. |
| `16` | `tracking-shot` | Tracking shot | `pan` | Travels through the environment in lockstep with a moving subject. | Characters striding through busy workspaces, corridors, or streets. |
| `17` | `follow-shot` | Follow shot / over-the-shoulder | `push` | Aligns behind the character's shoulder so the audience enters the unfolding space with them. | Entering unknown rooms, walking down dark corridors, building anticipation before a reveal. |
| `18` | `reverse-tracking` | Reverse tracking / walk-and-talk | `push` | Retreats ahead of a forward-walking subject, locking onto their facial expression and emotion. | Walk-and-talk delivery, determined marches toward camera, lead vocal performance walks. |
| `19` | `side-tracking` | Side tracking | `pan` | Moves parallel beside a walking or running subject to showcase profile determination and speed. | Runners, profile travel sequences, directional velocity across a landscape. |
| `20` | `low-tracking` | Low tracking | `pan` | Tracks below waist height along footsteps or wheels for mystery, swagger, or kinetic rhythm. | Mysterious arrivals, rhythmic footstep cuts on beat, wheel/ground-level motion. |
| `21` | `vehicle-tracking` | Vehicle tracking | `pan` | Matches high-velocity automotive, cycle, or train travel while the road blurs past. | Highway travel sequences, motorcycle rides, rolling arrival/departure shots. |
| `22` | `chase-shot` | Chase shot | `handheld` | Breathless, reactive pursuit scrambling to keep up with fast, unpredictable action. | Escape sequences, action sprints, high-adrenaline climax beats. |

### Category 4: Physical Moves (11 moves — rigged studio/location camera translations)

| ID | Slug | Name | Remotion Fallback | Dramatic Intent | When to Use |
|---|---|---|---|---|---|
| `10` | `truck-right` | Truck right | `pan` | Rich 3D depth by sliding laterally right past foreground and background planes. | Moving alongside a wall, lineup, or facade; pacing lateral action. |
| `10B` | `truck-left` | Truck left | `pan` | Slides laterally left with full parallax separation to reveal adjacent space. | Cross-section set exploration right-to-left, unveiling action behind a divider. |
| `11A` | `pedestal-up` | Pedestal up | `pan` | Elevates the camera body straight up with a level lens to reveal full stature or rise above a barrier. | Vertical character reveals from ground to eye level, rising above a desk or wall. |
| `11B` | `pedestal-down` | Pedestal down | `pan` | Lowers the camera body straight down with a level lens toward desk or floor level. | Lowering to tabletop or floor detail, descending below a surface edge. |
| `12` | `slider-right` | Slider right | `pan` | Subtle, high-craft lateral parallax over a short span for tactile intimacy. | Desk/craft work, tabletop evidence, quiet dialogue where a full truck would overwhelm. |
| `12B` | `slider-left` | Slider left | `pan` | Delicate leftward parallax in tight spaces, keeping a quiet shot dimensional and alive. | Intimate portraits, prop inspection, subtle reframing during a pause. |
| `13` | `push-past` | Push past / pass-by shot | `push` | Voyeuristic discovery by gliding forward past a foreground obstacle into the room beyond. | Entering through a doorway, passing cables/pillars/foliage to discover a subject at work. |
| `14` | `arc-right` | Arc right | `pan` | Curves partially around the subject to the right, shifting angle and rotating the background. | Pivotal dialogue turns, shifting from back/profile to facial reaction. |
| `14B` | `arc-left` | Arc left | `pan` | Curves partially around the subject to the left for dimensional emphasis. | Arcing around a shoulder to reveal what the character sees, energizing a conversation. |
| `15` | `orbit-clockwise` | Orbit clockwise | `pan` | Full 360-degree clockwise encirclement; heightens heroism, romance, or surreal spectacle. | Heroic standoffs, climactic realizations, fantasy reveals, emotional peaks. |
| `15B` | `orbit-counterclockwise` | Orbit counterclockwise | `pan` | Full 360-degree counterclockwise encirclement at the eye of a swirling world. | Action showcases, euphoric musical bridges, reversing orbital momentum. |

### Category 5: Human Camera (2 moves — operator or body-coupled motion)

| ID | Slug | Name | Remotion Fallback | Dramatic Intent | When to Use |
|---|---|---|---|---|---|
| `23` | `handheld-shot` | Handheld shot | `handheld` | Strips away robotic AI polish for raw human presence, documentary immediacy, or tension. | Heated arguments, verite intimacy, scenes where mechanical perfection feels sterile. |
| `24` | `snorricam` | Body-mounted camera / Snorricam | `handheld` | Visceral panic, vertigo, or overload by locking the actor's face at center while the world lurches. | Panic attacks, disorientation, chaotic crowd stumbles, intense music-video hooks. |

### Category 6: Drone/Crane (5 moves — vertical jib and aerial trajectories)

| ID | Slug | Name | Remotion Fallback | Dramatic Intent | When to Use |
|---|---|---|---|---|---|
| `25` | `crane-up` | Crane up | `pan` | Lifts skyward from an intimate moment into sweeping geographic scale; liberation or finality. | Scene/film endings, rising from a lone traveler above rooftops to reveal a vast city. |
| `25B` | `crane-down` | Crane down | `pan` | Descends from grand establishing scale right down to a single protagonist or detail. | Opening a chapter by dropping from skyline scale down to street-level story. |
| `26` | `drone-push-in` | Drone push in | `push` | Flies smoothly across altitude and terrain toward a landmark or rooftop destination. | Approaching a building, coastline, vehicle, or subject from the air. |
| `26B` | `drone-pull-back` | Drone pull back | `push` | Retreats into the sky away from the subject to unveil breathtaking surrounding scale. | Epic scale reveals, cliffside/rooftop/desert isolation shots, aerial outros. |
| `27` | `helicopter-shot` | Helicopter shot | `pan` | Theatrical, ultra-steady high-altitude cruise over coastlines, mountains, or skylines. | Grand opening titles, establishing a massive environment or highway journey. |

### Category 7: Specials (6 moves — subjective, optical, temporal & impossible transitions)

| ID | Slug | Name | Remotion Fallback | Dramatic Intent | When to Use |
|---|---|---|---|---|---|
| `S1` | `fpv` | First-person view | `handheld` | Places the viewer directly inside the character's eyes with hands/arms in peripheral frame. | Subjective exploration, reaching for objects, crossing a threshold firsthand. |
| `S2` | `tilt-shift` | Tilt-shift | `static` | Turns a full-size city, harbor, or crowd into a toy-like miniature diorama via selective plane focus. | Stylized overviews, playful establishing shots, complex systems rendered as tabletop models. |
| `S3` | `infinite-zoom` | Infinite zoom | `push` | Hypnotic tunnel zoom where driving through the center continuously unveils a nested world. | Surreal transitions, mind-bending conceptual hooks, dream sequences. |
| `S4` | `earth-zoom-out` | Earth zoom out | `push` | Rockets vertically from a single person/building through city, continent, and out to planetary scale. | Global scale statements, connecting a local moment to worldwide impact. |
| `S5` | `time-lapse` | Time-lapse | `static` | Compresses hours of changing light, weather, clouds, or crowds into seconds from a locked tripod. | Passage of time, day-to-night transitions, bustling urban or natural transformation. |
| `S6` | `pass-through` | Pass-through objects | `push` | Cinema-magic forward glide threading straight through a window, aperture, or barrier into a new space. | Seamless exterior-to-interior transitions, crossing through glass or a narrow opening. |
