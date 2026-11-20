# Geometry blockout: a 3D set for consistent stills

An image model guesses geometry. Words about layout ("the panel is at frame left") do not carry 3D
position or size, so the same room drifts between stills, and set elements land in the wrong place
or bend (a conveyor, a column standing through a belt). A blockout gives the room one fixed geometry
that every shot is cut from.

## When to block out

Do it when several shots share one room, when a shot depends on where an element stands, or when two
stills of the same place must agree. Do not bother for a close-up, for a background that carries no
geometry another shot must match, or when the video model's own invention is wanted: the plain
image-model route is cheaper. A set costs about an hour of build time plus render time and pays back
across several shots.

## Geometry authority

The 3D set decides **where things are and how big they are in frame**. The image model decides
**only the look**: light, paint, texture, mood. Say it in the prompt, for example:

> GEOMETRY AUTHORITY: copy where things are and how big they are in frame from the blockout image,
> nothing else. Take the look from the style reference.

State the negative explicitly when an element must be absent ("do not paint any panel on the wall").
A recorded result of the blockout attached as the last image: two of three previously wrong stills
came out fully right, the third improved.

## Route: render, then repaint

1. Build the set once as editable code (a procedural script that rebuilds the scene), with one named
   camera per shot and a collection for people or moving props that can be hidden to render an empty
   room.
2. Render the shot's camera. A plain flat-shaded or simple lit render is enough; raw renders are not
   film stills (paler walls, weaker lamps).
3. Give the image model two images: the render (geometry) and a locked still of the same place
   (look), plus a prompt that says what to keep from each. The first and last frames of one camera
   move repainted this way stay consistent with each other.
4. Watch for new flaws the repaint adds (for example reflections on a ceiling that should be dry).

A first and last repainted frame can then feed a clip in first/last-frame mode: the camera travels
between two geometry-true positions and the video model draws only the motion between them. Rendering
the camera move itself as a reference video for the model is a separate route; it followed the camera
but the look drifted back to the raw render in the second half, so treat it as unproven. First/last
frame and reference inputs cannot be mixed in one request.

## Practical notes

- Decide the camera move per shot before rendering. A moving shot needs a start camera and a
  different end camera (or a zoom); one camera for both frames produces a static clip. Say the move
  in the video prompt.
- Check the camera path against the object list before rendering; a path can run through a column.
- A neutral grey "clay" render is not automatically a good geometry input: an enclosed room renders
  black without lamps, and a material override kills emissive lights.
- Move a .blend between machines with its assets packed. Run one GPU render at a time per machine.
- The .blend is the only faithful copy; procedural materials show only in the rendered or material
  preview, and Solid view looks grey. A browser viewer needs flat colours per material, and a name
  regex for "ceiling" objects can tag the whole room shell: check the export by screenshot.

## Verify stills before paying for video

Stills are cheap, clips are not. Before any paid clip: put the repainted stills on a contact sheet
next to the renders, compare positions and sizes element by element, reject (do not patch) stills
with stray elements, and get the owner's explicit approval of each still as a reference (Gate 5 in
`commands/music-video.md`). A wrong element in a start still is paid for again in every take.
