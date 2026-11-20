#!/usr/bin/env python3
"""Upload a film to YouTube (private by default), optionally with a thumbnail and a caption track.

  yt_upload.py VIDEO.mp4 --title T [--description-file F] [--privacy private|unlisted|public]
               [--srt F.srt --srt-lang en --srt-name Lyrics] [--thumbnail F.jpg]
               [--channel-id UC...] [--srt-allowlist FILE]
  yt_upload.py --only-caption VIDEO_ID --srt F.srt     (add a caption track to an existing video)
  yt_upload.py --only-thumbnail VIDEO_ID --thumbnail F.jpg

Credentials come from the environment, never from arguments or the repo:
  YOUTUBE_OAUTH_CLIENT_JSON_FILE   path to the OAuth client JSON (see yt_auth.py)
  YOUTUBE_OAUTH_REFRESH_TOKEN      refresh token written by yt_auth.py
  YOUTUBE_CHANNEL_ID               optional; same as --channel-id
With a channel id, the token is checked against it and the upload is refused on a mismatch.
The default privacy is "private": publishing is a separate human decision (--privacy public).
--srt-allowlist FILE: a text file with one allowed subtitle path per line; any other --srt is
refused (guards against uploading the wrong subtitle version). Category Music, not made for kids,
synthetic media declared (--not-synthetic to turn that off). Resumable upload, 64 MB chunks.
No token is ever printed. Stdlib only.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


def need(k):
    v = os.environ.get(k)
    if not v:
        sys.exit(f"{k} is not set")
    return v


def req(url, data=None, headers=None, method=None):
    r = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        return urllib.request.urlopen(r, timeout=600)
    except urllib.error.HTTPError as e:
        sys.exit(f'HTTP {e.code} on {url.split("?")[0]}: {e.read().decode()[:600]}')


ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
ap.add_argument("video", nargs="?")
ap.add_argument("--title", default="")
ap.add_argument("--description-file")
ap.add_argument("--privacy", choices=["private", "unlisted", "public"], default="private")
ap.add_argument("--category-id", default="10")
ap.add_argument("--not-synthetic", action="store_true", help="do not declare synthetic media")
ap.add_argument("--srt")
ap.add_argument("--srt-lang", default="en")
ap.add_argument("--srt-name", default="Lyrics")
ap.add_argument("--srt-allowlist")
ap.add_argument("--thumbnail")
ap.add_argument("--only-thumbnail", metavar="VIDEO_ID")
ap.add_argument("--only-caption", metavar="VIDEO_ID")
ap.add_argument("--channel-id", default=os.environ.get("YOUTUBE_CHANNEL_ID"))
a = ap.parse_args()
if not (a.video or a.only_caption or a.only_thumbnail):
    ap.error("a video path, --only-caption or --only-thumbnail is required")
if a.srt and a.srt_allowlist:
    allowed = [os.path.abspath(l.strip()) for l in open(a.srt_allowlist) if l.strip() and not l.startswith("#")]
    if os.path.abspath(a.srt) not in allowed:
        sys.exit(f"{a.srt} is not in {a.srt_allowlist}: refusing")

c = json.load(open(need("YOUTUBE_OAUTH_CLIENT_JSON_FILE")))
c = c.get("web") or c.get("installed") or c
tok = json.load(req("https://oauth2.googleapis.com/token", urllib.parse.urlencode(dict(
    client_id=c["client_id"], client_secret=c["client_secret"], grant_type="refresh_token",
    refresh_token=need("YOUTUBE_OAUTH_REFRESH_TOKEN"))).encode()))
H = {"Authorization": "Bearer " + tok["access_token"]}
if a.channel_id:
    ids = [i["id"] for i in json.load(req("https://www.googleapis.com/youtube/v3/channels?part=id&mine=true", headers=H)).get("items", [])]
    if a.channel_id not in ids:
        sys.exit(f"token is not for channel {a.channel_id} (got {ids}): refusing")


def add_caption(video_id):
    bnd = "vfboundary7f3"
    body = (f"--{bnd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"
            + json.dumps({"snippet": {"videoId": video_id, "language": a.srt_lang, "name": a.srt_name, "isDraft": False}})
            + f"\r\n--{bnd}\r\nContent-Type: application/octet-stream\r\n\r\n").encode() + open(a.srt, "rb").read() + f"\r\n--{bnd}--\r\n".encode()
    cap = json.load(req("https://www.googleapis.com/upload/youtube/v3/captions?uploadType=multipart&part=snippet", body,
                        {**H, "Content-Type": f"multipart/related; boundary={bnd}"}))
    print("CAPTION", cap["id"], cap["snippet"]["language"], cap["snippet"]["name"])


def set_thumbnail(video_id):
    req(f"https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId={video_id}", open(a.thumbnail, "rb").read(),
        {**H, "Content-Type": "image/jpeg"})
    print("THUMBNAIL set on", video_id)


if a.only_caption:
    if not a.srt:
        sys.exit("--only-caption needs --srt")
    sys.exit(add_caption(a.only_caption))
if a.only_thumbnail:
    if not a.thumbnail:
        sys.exit("--only-thumbnail needs --thumbnail")
    sys.exit(set_thumbnail(a.only_thumbnail))
meta = {"snippet": {"title": a.title, "description": open(a.description_file).read() if a.description_file else "", "categoryId": a.category_id},
        "status": {"privacyStatus": a.privacy, "selfDeclaredMadeForKids": False, "containsSyntheticMedia": not a.not_synthetic}}
size = os.path.getsize(a.video)
init = req("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
           json.dumps(meta).encode(), {**H, "Content-Type": "application/json; charset=UTF-8",
                                       "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": str(size)})
loc = init.headers["Location"]
CH = 64 * 1024 * 1024
with open(a.video, "rb") as f:
    off = 0
    while off < size:
        f.seek(off)
        b = f.read(CH)
        end = off + len(b) - 1
        r = urllib.request.Request(loc, data=b, method="PUT", headers={**H, "Content-Length": str(len(b)),
                                                                       "Content-Range": f"bytes {off}-{end}/{size}"})
        try:
            vid = json.load(urllib.request.urlopen(r, timeout=600))
            off = size
        except urllib.error.HTTPError as e:
            if e.code != 308:
                sys.exit(f"upload failed HTTP {e.code}: {e.read().decode()[:600]}")
            rng = e.headers.get("Range")
            off = int(rng.split("-")[1]) + 1 if rng else 0
        print(f"uploaded {min(off, size) * 100 // size}%", flush=True)
print("VIDEO", vid["id"], "https://youtu.be/" + vid["id"], "privacy", vid["status"]["privacyStatus"])
if a.thumbnail:
    set_thumbnail(vid["id"])
if a.srt:
    add_caption(vid["id"])
