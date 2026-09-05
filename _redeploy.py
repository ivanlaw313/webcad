"""Light redeploy: replace /var/www/webcad static files only (nginx + cert already set)."""
import warnings; warnings.filterwarnings("ignore")
import os, posixpath, paramiko
def p(*a): print(*a, flush=True)
LOCAL = r"C:\ClaudeCode\webcad\dist"; REMOTE = "/var/www/webcad"
# VPS 已收紧到【只准 publickey】（sshd 关咗 password auth）→ 纯密码版会 BadAuthenticationType 挂。
# 先揾本机 deploy key，冇 key 至退返密码（旧路径保留，方便未换 key 嘅机）。密钥/密码都唔写死喺脚本。
PASSWORD = os.environ.get("WEBCAD_VPS_PASSWORD")
KEY = next((k for k in (os.path.expanduser(x) for x in ("~/.ssh/nfe_deploy_ed25519", "~/.ssh/doom_vps", "~/.ssh/id_ed25519", "~/.ssh/id_rsa")) if os.path.exists(k)), None)
if not KEY and not PASSWORD:
    raise RuntimeError("冇 deploy key（~/.ssh/…）亦冇 WEBCAD_VPS_PASSWORD — 唔部署得。")
ssh = paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
p("connect: starting (%s)" % ("key" if KEY else "password"))
if KEY:
    ssh.connect("38.242.215.29", username="root", key_filename=KEY, timeout=20, banner_timeout=20, auth_timeout=20)
else:
    ssh.connect("38.242.215.29", username="root", password=PASSWORD, timeout=20, banner_timeout=20, auth_timeout=20)
p("connect: ready")
def run(c, t=60):
    _i, o, e = ssh.exec_command(c, timeout=t)
    o.channel.settimeout(t)
    status = o.channel.recv_exit_status()
    return (o.read() + e.read()).decode(errors="replace").strip() + ("" if status == 0 else "\nexit=%d" % status)
sftp = ssh.open_sftp()
# Publish the entry point last: assets are uploaded first, then index.html points at them.
p("remote: clean entry files"); run("rm -rf %s/index.html %s/*.svg" % (REMOTE, REMOTE))
# T808（报告观察 J — stale chunk）：唔再 rm -rf assets。改【叠加上传 + 宽限期清理】：新 build 嘅 hash 资产
# 同旧嘅共存，长开分页仍可载入旧 lazy chunk（避免重部署即 404）；只删 3 日前嘅孤儿资产（界封顶磁碟）。
# index.html / *.svg 仍即时替换（入口要最新）。配合 main.tsx 嘅 vite:preloadError 兜底，双保险。
p("remote: clean entry files"); run("rm -rf %s/index.html %s/*.svg" % (REMOTE, REMOTE))
p("remote: ensure assets"); run("mkdir -p %s/assets" % REMOTE)
FORCE = os.environ.get("WEBCAD_FORCE_UPLOAD") == "1"   # 一次过全量重传（修复被误删嘅资产时用）
n = 0; skipped = 0; current = []                       # current = 今次 build 所有远端路径（prune 白名单）
for root, _d, files in os.walk(LOCAL):
    rel = os.path.relpath(root, LOCAL).replace("\\", "/")
    rdir = REMOTE if rel == "." else posixpath.join(REMOTE, rel)
    try: sftp.mkdir(rdir)
    except Exception: pass
    for f in files:
        local_path = os.path.join(root, f); remote_path = posixpath.join(rdir, f)
        current.append(remote_path)
        same_size = False
        if f != "index.html" and not FORCE:
            try: same_size = sftp.stat(remote_path).st_size == os.path.getsize(local_path)
            except Exception: pass
        if same_size: skipped += 1; continue
        p("upload:", posixpath.join(rel, f) if rel != "." else f)
        sftp.put(local_path, remote_path); n += 1
run("chown -R www-data:www-data %s; chmod -R 755 %s" % (REMOTE, REMOTE))
p("uploaded %d files; skipped %d unchanged%s" % (n, skipped, " (FORCE)" if FORCE else ""))
# ★★ 修一个会整冧个站嘅 time bomb ★★
#   旧逻辑：① 大小一样就 skip 上传（server mtime 维持旧日期）② prune 删 assets 入面 mtime>3 日嘅嘢。
#   两者夹埋 = 一个【冇改过但仍然被 index.html 引用】嘅 chunk，够 3 日就会俾自己删走 → 全站 404 白屏
#   （2026-07-25 实际发生：7 个 runtime/css chunk 唔见咗）。
#   修法：prune 之前，把【今次 build 嘅每一个文件（连其 .gz/.br）】touch 一次 → 佢哋 mtime 永远系「而家」，
#   宽限期清理只会命中真·孤儿（旧 build 遗留），既保住长开分页嘅旧 lazy chunk，又唔会自杀。
p("touch current build (免被 prune 误删)")
for i in range(0, len(current), 60):
    batch = " ".join("'%s'" % q.replace("'", "'\\''") for q in current[i:i + 60])
    # ⚠ touch 会【建立】唔存在嘅文件 → 唔可以盲 touch "$f.gz"（会整出空 .gz，nginx gzip_static 送空档）。
    #   所以逐个先 -e 检查存在先至 touch。
    run("for f in %s; do touch \"$f\"; [ -e \"$f.gz\" ] && touch \"$f.gz\"; [ -e \"$f.br\" ] && touch \"$f.br\"; done; true" % batch, t=120)
# 宽限期清理：只删 3 日前未被刷新嘅【孤儿】资产（连其 .gz/.br）。今次 build 嘅文件啱啱 touch 过，唔会中招。
p("prune:", run(r"find %s/assets -type f -mtime +3 -delete 2>/dev/null; echo done" % REMOTE))
# T802（报告 P0）：预压缩大资产成 .gz，nginx gzip_static 零 CPU 直送（冷启动 14.8MB→~5.9MB）。
# -f 覆盖：新资产生成 .gz；旧资产已有 .gz（重做无害），孤儿连 .gz 一齐俾上面 prune 清走。
p("gzip:", run(r'''cd %s && find . -type f \( -name '*.js' -o -name '*.wasm' -o -name '*.css' -o -name '*.json' -o -name '*.svg' \) -exec sh -c 'test -s "$1.gz" || { echo "$1"; rm -f "$1.gz"; gzip -9 -k "$1"; }' _ {} \; && echo done''' % REMOTE, t=600))
# T806（报告观察 E）：brotli 预压缩（nginx brotli_static 直送 .br，比 gzip 再细 ~15%，wasm/js 尤其）。
# -q 10（非 11）：11MB wasm q11 太慢，q10 速度快好多、压缩率几乎一样。
# S105：加 -print 令 find 逐个文件实时输出 → SSH channel 唔会因「全程无输出」而 PipeTimeout（旧 300s
#   无输出停顿坑）；timeout 提到 600s 兜底大 wasm。
p("brotli:", run(r'''cd %s && find . -type f \( -name '*.js' -o -name '*.wasm' -o -name '*.css' -o -name '*.json' -o -name '*.svg' \) -exec sh -c 'test -s "$1.br" || { echo "$1"; rm -f "$1.br"; brotli -q 10 -k "$1"; }' _ {} \; && echo done''' % REMOTE, t=600))
p("index:", run("ls -la %s/index.html" % REMOTE))
p("verify:", run("curl -skI https://cad.neuralworkshk.com/ | head -1"))
sftp.close(); ssh.close(); p("DONE")
