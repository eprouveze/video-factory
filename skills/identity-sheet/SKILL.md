---
name: identity-sheet
description: Build a consistent 20-shot identity sheet from one photograph and feed it to the image adapters as multiple refs, so a face or product holds across every shot of a film.
---

# Identity sheet

A single reference image is enough to *start*; it is not enough to stay consistent. When a
film has the same person in twelve shots, one source photo means the model has seen that face
once, from one angle, and every generation re-guesses the rest. The identity drifts, and the
drift is invisible in a still frame but obvious in motion.

The fix is to spend the cheap calls first: generate a **sheet** of the same person from many
angles, then hand several of those images to every later generation as `refs[]`. Both image
adapters in this repo accept multiple references, so nothing else needs to change.

## The two paths, and which one we take

| Path | What it is | Where it runs |
|---|---|---|
| Trained identity (vendor "Soul ID" style) | 20-70 photos train a private identity model | Hosted vendor feature; not available to us through the API adapters we have |
| **Synthetic identity sheet** | One photo plus 20 prompts produce a consistent reference set | `scripts/identity-sheet.mjs`, any `image` adapter |

We take the second. It needs no new provider, no training step, and it produces ordinary image
files that `refs[]` and `visual.asset` already understand. It also stays honest about what it
is: references, not a model.

## Run it

```bash
# the default adapter: gpt-image-2.6-sunburst, ~$0.02/image -> ~$0.40 for the sheet
node scripts/identity-sheet.mjs --source photo.jpg --out identity/me

# 2K alternative (Nano Banana Pro, ~$0.134/image -> ~$2.68 for the full sheet)
node scripts/identity-sheet.mjs --source photo.jpg --out identity/me --adapter nano-banana-pro

# a subset, or a redo after swapping one prompt
node scripts/identity-sheet.mjs --source photo.jpg --out identity/me --only 01,02,05,07
node scripts/identity-sheet.mjs --source photo.jpg --out identity/me --force

node scripts/identity-sheet.mjs --source photo.jpg --out identity/me --dry-run   # print briefs, spend nothing
```

Output is `NN-slug.png` per shot plus `identity-sheet.json`, recording the source hash, the
adapter, and every prompt used. The run is resumable (existing files are skipped) and a failed
shot does not stop the rest; the script exits non-zero if any shot failed.

## Wiring it into a film

Point the scene's refs at the sheet. In a manifest, a scene that carries the character uses
the sheet files as its `refs`, and the start frame generated from them becomes the clip's
`ref_frame`:

```
image adapter  ->  frames/s3.png   (refs: identity/me/01-*.png, 05-*.png, 03-*.png)
clip adapter   ->  clips/s3.mp4    (ref_frame: frames/s3.png)
```

Three to five angles is usually enough per generation. More refs is not automatically better:
each one competes for attention, and two conflicting angles can produce a face that is an
average of both.

## Verify before you trust the sheet

Generation success is not identity success. Open the sheet and check, in this order:

1. **Same person across all 20.** If shot 12 is a different face, regenerate it alone with
   `--only 12`.
2. **The profile shots.** These are where synthetic sheets fail most often, and they are also
   the shots that save a film: a bicycle shot looked wrong because the model had never seen
   the subject from the side.
3. **Age and build.** Models quietly slim and smooth. Compare against the source photo, not
   against the previous shot.
4. **Wardrobe drift.** Every prompt varies framing, angle and expression only. If clothing
   changes, the sheet will drag that change into the film.

## When not to use this

- A person appears once, or always from the same angle. One reference is cheaper.
- The subject is a product with a fixed catalog photograph. Use that photograph; do not
  synthesise a fake set of it.
- Nothing about the result will be shown to a human before it goes into a film. The sheet is a
  taste artifact; someone has to look at it.

## Prompt set

`prompts/identity-sheet.v1.json` holds the 20 shots (front, three-quarter, profile, full body,
seated, walking, low and high angle, over-shoulder, eye close-up, hands and torso) plus the
shared identity lock, camera and lighting blocks. Edit the JSON to change the sheet; the
script reads it, it does not embed prompts.
