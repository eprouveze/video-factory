#!/usr/bin/env python3
"""Outcome check: read-only YouTube Analytics for one video, over fixed windows.

  yt_analytics.py --video-id ID --project DIR [--as-of YYYY-MM-DD] [--lag-days 3]
  yt_analytics.py --video-id ID --project DIR --from-json FILE      (offline: no network)

Writes <project>/telemetry/outcome.json. Two windows, both derived from the video's publishedAt
and never from today's date: publish day + 7 days, and publish day + 28 days. A window that is
not over yet (its last day plus --lag-days, because Analytics data arrives late) is written as
"incomplete" with no numbers, so a file never holds partial figures and a complete window never
changes on a later run. --as-of (default: today, UTC) is only used for that one decision and is
not written to the file.

Metrics: views, averageViewDuration, averageViewPercentage, likes, comments, subscribersGained.
Only GET requests are made to the Data and Analytics APIs. Credentials come from the environment,
as in yt_upload.py:
  YOUTUBE_OAUTH_CLIENT_JSON_FILE   path to the OAuth client JSON (see yt_auth.py)
  YOUTUBE_OAUTH_REFRESH_TOKEN      refresh token written by yt_auth.py
The token needs the scope https://www.googleapis.com/auth/yt-analytics.readonly. A token made
before yt_auth.py asked for it does not have it: this script then stops and says so, and a person
runs yt_auth.py again. No token is ever printed. Stdlib only.
"""
import argparse
import datetime
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

METRICS = ["views", "averageViewDuration", "averageViewPercentage", "likes", "comments", "subscribersGained"]
WINDOWS = [("publish+7d", 7), ("publish+28d", 28)]
SCOPE = "https://www.googleapis.com/auth/yt-analytics.readonly"


def windows(published_at, as_of, lag_days):
    """The fixed windows of a video: [(name, start, end, complete)] with ISO dates."""
    day = datetime.datetime.fromisoformat(published_at.replace("Z", "+00:00")).astimezone(datetime.timezone.utc).date()
    out = []
    for name, days in WINDOWS:
        end = day + datetime.timedelta(days=days)
        out.append((name, day.isoformat(), end.isoformat(), as_of > end + datetime.timedelta(days=lag_days)))
    return out


def get(url, headers):
    try:
        return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=120))
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:600]
        if e.code in (401, 403) and "youtubeanalytics" in url:
            sys.exit(f"HTTP {e.code} from YouTube Analytics. The refresh token probably lacks the scope {SCOPE}: "
                     f"a person has to run scripts/yt_auth.py again to grant it. Nothing was written.\n{body}")
        sys.exit(f'HTTP {e.code} on {url.split("?")[0]}: {body}')


def fetch(video_id, as_of, lag_days):
    def need(k):
        v = os.environ.get(k)
        if not v:
            sys.exit(f"{k} is not set")
        return v

    c = json.load(open(need("YOUTUBE_OAUTH_CLIENT_JSON_FILE")))
    c = c.get("web") or c.get("installed") or c
    token_req = urllib.request.Request("https://oauth2.googleapis.com/token", data=urllib.parse.urlencode(dict(
        client_id=c["client_id"], client_secret=c["client_secret"], grant_type="refresh_token",
        refresh_token=need("YOUTUBE_OAUTH_REFRESH_TOKEN"))).encode())
    try:
        access = json.load(urllib.request.urlopen(token_req, timeout=120))["access_token"]
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code} on the token refresh: {e.read().decode()[:300]}")
    headers = {"Authorization": "Bearer " + access}
    items = get("https://www.googleapis.com/youtube/v3/videos?" + urllib.parse.urlencode(
        dict(part="snippet", id=video_id)), headers).get("items", [])
    if not items:
        sys.exit(f"video {video_id} not found with this token")
    published_at = items[0]["snippet"]["publishedAt"]
    reports = {}
    for name, start, end, complete in windows(published_at, as_of, lag_days):
        if not complete:
            continue
        rep = get("https://youtubeanalytics.googleapis.com/v2/reports?" + urllib.parse.urlencode(dict(
            ids="channel==MINE", startDate=start, endDate=end, metrics=",".join(METRICS),
            filters=f"video=={video_id}")), headers)
        cols = [h["name"] for h in rep.get("columnHeaders", [])]
        row = (rep.get("rows") or [[0] * len(cols)])[0]
        reports[name] = dict(zip(cols, row))
    return {"published_at": published_at, "reports": reports}


def build(video_id, data, as_of, lag_days):
    rows = []
    for name, start, end, complete in windows(data["published_at"], as_of, lag_days):
        rep = data.get("reports", {}).get(name) if complete else None
        rows.append({
            "window": name, "start": start, "end": end,
            "status": "complete" if rep is not None else "incomplete",
            "metrics": {m: rep.get(m) for m in METRICS} if rep is not None else None,
        })
    return {"schema": 1, "video_id": video_id, "published_at": data["published_at"], "lag_days": lag_days, "windows": rows}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--video-id", required=True)
    ap.add_argument("--project", required=True)
    ap.add_argument("--as-of", help="YYYY-MM-DD; only decides whether a window is over (default: today, UTC)")
    ap.add_argument("--lag-days", type=int, default=3)
    ap.add_argument("--from-json", help='offline input: {"published_at": ISO, "reports": {"publish+7d": {...}}}')
    a = ap.parse_args()
    as_of = datetime.date.fromisoformat(a.as_of) if a.as_of else datetime.datetime.now(datetime.timezone.utc).date()
    data = json.load(open(a.from_json)) if a.from_json else fetch(a.video_id, as_of, a.lag_days)
    out = build(a.video_id, data, as_of, a.lag_days)
    path = os.path.join(a.project, "telemetry", "outcome.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(json.dumps(out, indent=2) + "\n")
    for w in out["windows"]:
        print(f'{w["window"]} {w["start"]}..{w["end"]}: {w["status"]}')
    print(path)


if __name__ == "__main__":
    main()
