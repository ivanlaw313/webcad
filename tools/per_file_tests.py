"""Run every tests/*.test.mjs as its own node --test process (timeout each) and write pass/fail per file.
Usage: python tools/per_file_tests.py <repo_dir> <out.json> [workers]
Used to compare two trees (e.g. a baseline release vs integration) without one hung test blocking the suite."""
import json, os, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor

repo, out = sys.argv[1], sys.argv[2]
workers = int(sys.argv[3]) if len(sys.argv) > 3 else 4
files = sorted(f for f in os.listdir(os.path.join(repo, "tests")) if f.endswith(".test.mjs"))
# tests sharing the FEA compiler output dir must not run concurrently (see scripts/run-tests.mjs)
shared = set()
try:
    src = open(os.path.join(repo, "scripts", "run-tests.mjs"), encoding="utf-8").read()
    import re
    m = re.search(r"sharedOutputFiles\s*=\s*new Set\(\[(.*?)\]\)", src, re.S)
    if m:
        shared = set(re.findall(r"'([^']+)'|\"([^\"]+)\"", m.group(1)))
        shared = {a or b for a, b in shared}
except Exception:
    pass

def run(f):
    t0 = time.time()
    try:
        p = subprocess.run(["node", "--experimental-strip-types", "--import", "./tests/register-resolver.mjs", "--test", f"tests/{f}"],
                           cwd=repo, capture_output=True, timeout=180, text=True, encoding="utf-8", errors="replace")
        res = "pass" if p.returncode == 0 else "fail"
        tail = "" if res == "pass" else "\n".join(l for l in p.stdout.splitlines() if l.startswith("not ok"))[:600]
    except subprocess.TimeoutExpired:
        res, tail = "timeout", ""
    return f, {"result": res, "sec": round(time.time() - t0, 1), "fails": tail}

results = {}
with ThreadPoolExecutor(workers) as ex:
    for f, r in ex.map(run, [f for f in files if f not in shared]):
        results[f] = r
for f in [f for f in files if f in shared]:
    results[f] = run(f)[1]
json.dump(results, open(out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
from collections import Counter
print(out, Counter(r["result"] for r in results.values()))
