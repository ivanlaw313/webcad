"""Create cad.neuralworkshk.com A record via Cloudflare API (token from cloudflared cert.pem)."""
import warnings; warnings.filterwarnings("ignore")
import base64, json, re, urllib.request, urllib.error

cert = open(r"C:\Users\ivanl\.cloudflared\cert.pem").read()
m = re.search(r"-----BEGIN ARGO TUNNEL TOKEN-----(.*?)-----END", cert, re.S)
tok = json.loads(base64.b64decode(re.sub(r"\s+", "", m.group(1))))
API, ZONE = tok["apiToken"], tok["zoneID"]
H = {"Authorization": "Bearer " + API, "Content-Type": "application/json"}

def req(method, path, body=None):
    data = json.dumps(body).encode() if body else None
    r = urllib.request.Request("https://api.cloudflare.com/client/v4" + path, data=data, headers=H, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read())

z = req("GET", "/zones/" + ZONE)
print("ZONE:", z.get("result", {}).get("name"), "| token ok:", z.get("success"))
if not z.get("success"):
    print("ERR:", z.get("errors")); raise SystemExit

recs = req("GET", "/zones/%s/dns_records?per_page=200" % ZONE).get("result", [])
for r in recs:
    if r["name"] in ("cad.neuralworkshk.com", "rig.neuralworkshk.com", "rig2.neuralworkshk.com"):
        print("  existing: %-7s %-26s -> %-16s proxied=%s" % (r["type"], r["name"], r["content"], r["proxied"]))

cad = [r for r in recs if r["name"] == "cad.neuralworkshk.com" and r["type"] == "A"]
body = {"type": "A", "name": "cad", "content": "38.242.215.29", "ttl": 1, "proxied": False}  # DNS-only for clean Let's Encrypt
if cad:
    out = req("PUT", "/zones/%s/dns_records/%s" % (ZONE, cad[0]["id"]), body)
    print("UPDATED cad:", out.get("success"))
else:
    out = req("POST", "/zones/%s/dns_records" % ZONE, body)
    print("CREATED cad:", out.get("success"), "" if out.get("success") else [e.get("message") for e in out.get("errors", [])])
print("RESULT:", out.get("result", {}).get("name"), "->", out.get("result", {}).get("content"), "proxied=", out.get("result", {}).get("proxied"))
