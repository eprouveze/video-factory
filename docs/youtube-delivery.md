# YouTube delivery

Delivery is a human decision. The upload script defaults to **private**; making a film public is a
separate step the owner takes.

## Captions

- `scripts/srt-from-words.mjs` writes the SRT/VTT from measured word times.
- `scripts/srt_to_srv3.py IN.srt OUT.srv3` makes YouTube timed text with one colour per speaker (same
  words and times). A line starting `NAME:` or `NAME (note):` sets the speaker for the cue;
  unlabelled cues belong to `--lead` (default: the first speaker named); `[bracketed]` lines are
  sound descriptions. Labels stay in the text: colour is never the only cue.
- `scripts/make_fr_captions.py SOURCE.srt TRANSLATION.txt OUT.srt --lang fr` puts a translation on
  the source cue times. It refuses a different cue count, a cue whose kind differs (sound
  description versus sung line), and lines over 42 characters, and applies French typography
  (no-break space before `: ; ? ! »`). French is the worked example; add a function to `TYPO` for
  another language.

Upload the deaf-friendly caption version, not the plain lyrics file: keep a short allowlist of the
subtitle files that may go up and pass it with `--srt-allowlist`.

## Credentials

No token or client secret lives in the repo or in arguments.

1. Create an OAuth client in Google Cloud (YouTube Data API v3), download the client JSON, set
   `YOUTUBE_OAUTH_CLIENT_JSON_FILE` to its path.
2. One-time consent (create the directory first: `mkdir -p -m 700 ~/.config/vf`): `python3 scripts/yt_auth.py --client-json "$YOUTUBE_OAUTH_CLIENT_JSON_FILE" --token-out ~/.config/vf/yt-refresh.txt --channel-id UC...`
   (on a remote machine, forward the port: `ssh -t -L 8080:localhost:8080 HOST ...`). The refresh token
   is written with mode 0600 and never printed. Keep one token per channel.
3. Export it for uploads: `export YOUTUBE_OAUTH_REFRESH_TOKEN="$(cat ~/.config/vf/yt-refresh.txt)"`.

## Upload

```
python3 scripts/yt_upload.py film.mp4 --title "..." --description-file desc.txt \
  --srt subs.srt --srt-lang en --srt-name Lyrics --channel-id UC...
```

Private by default (`--privacy unlisted|public` to change), category Music, not made for kids,
synthetic media declared. With `--channel-id` (or `YOUTUBE_CHANNEL_ID`) the token is checked against
the channel and the upload is refused on a mismatch. `--only-caption VIDEO_ID --srt F` adds a caption
track later; `--only-thumbnail VIDEO_ID --thumbnail F.jpg` sets a thumbnail.

The upload is resumable: the access token is refreshed before it expires, and a 5xx response or a
dropped connection is retried with backoff after asking the upload session how many bytes it holds.
The session URL is not saved, so if the script exits after repeated failures, start the upload again.
