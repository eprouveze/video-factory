#!/usr/bin/env python3
"""One-time YouTube OAuth consent; the refresh token is written to a private file, never printed.

  yt_auth.py --client-json client_secret.json --token-out refresh_token.txt [--channel-id UC...] [--port 8080]

--client-json (or env YOUTUBE_OAUTH_CLIENT_JSON_FILE) is the OAuth client file from Google Cloud
(web or installed type; add http://localhost:PORT/ as an allowed redirect). On a remote machine,
forward the port from the machine that has the browser:  ssh -t -L 8080:localhost:8080 HOST ...
Prints the consent URL, waits for Google's redirect, exchanges the code (PKCE), checks the channel
when --channel-id is given (nothing is saved if it does not match), and writes the refresh token to
--token-out with mode 0600. Keep one token per channel. Stdlib only.
"""
import argparse
import base64
import hashlib
import http.server
import json
import os
import secrets
import sys
import urllib.parse
import urllib.request

SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl"

ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
ap.add_argument("--client-json", default=os.environ.get("YOUTUBE_OAUTH_CLIENT_JSON_FILE"))
ap.add_argument("--token-out", required=True)
ap.add_argument("--channel-id", default=os.environ.get("YOUTUBE_CHANNEL_ID"))
ap.add_argument("--port", type=int, default=8080)
a = ap.parse_args()
if not a.client_json:
    sys.exit("pass --client-json or set YOUTUBE_OAUTH_CLIENT_JSON_FILE")

REDIRECT = f"http://localhost:{a.port}/"
c = json.load(open(a.client_json))
c = c.get("web") or c.get("installed") or c
verifier = secrets.token_urlsafe(64)
challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
state = secrets.token_urlsafe(16)
url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(dict(
    client_id=c["client_id"], redirect_uri=REDIRECT, response_type="code", scope=SCOPES, access_type="offline",
    prompt="consent select_account", state=state, code_challenge=challenge, code_challenge_method="S256"))
got = {}


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        if "code" in q or "error" in q:
            got.update({k: v[0] for k, v in q.items()})
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(b"Done. You can close this tab and go back to the terminal.")

    def log_message(self, *args):
        pass


print("\nOpen this URL in a browser, sign in with the account that manages the channel, pick the channel if asked, then Allow:\n")
print(url + "\n", flush=True)
srv = http.server.HTTPServer(("127.0.0.1", a.port), H)
while not got:
    srv.handle_request()
if got.get("error") or got.get("state") != state:
    sys.exit(f"consent failed: {got.get('error', 'state mismatch')}")
body = urllib.parse.urlencode(dict(code=got["code"], client_id=c["client_id"], client_secret=c["client_secret"],
                                   redirect_uri=REDIRECT, grant_type="authorization_code", code_verifier=verifier)).encode()
tok = json.load(urllib.request.urlopen("https://oauth2.googleapis.com/token", body))
rt = tok.get("refresh_token")
if not rt:
    sys.exit("Google returned no refresh token (scopes granted: %s)" % tok.get("scope"))
ch = json.load(urllib.request.urlopen(urllib.request.Request(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    headers={"Authorization": "Bearer " + tok["access_token"]})))
print("Authorized channel:", ", ".join(i["snippet"]["title"] for i in ch.get("items", [])) or "(none found)")
if a.channel_id and a.channel_id not in [i["id"] for i in ch.get("items", [])]:
    sys.exit("Not the expected channel: nothing saved. Re-run and pick the right channel in the account chooser.")
fd = os.open(a.token_out, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as f:
    f.write(rt)
print(f"refresh token written to {a.token_out} (mode 0600); export it as YOUTUBE_OAUTH_REFRESH_TOKEN for yt_upload.py")
