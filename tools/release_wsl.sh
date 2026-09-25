#!/usr/bin/env bash
# WebCAD release (run inside WSL Ubuntu): clean Linux build of a branch -> new release dir on VPS -> switch nginx.
# Linux build is required: Windows builds chunk differently (verified 2026-09-25: WSL build of 6e06800 == live v2.03 byte-for-byte).
# Usage: wsl -d Ubuntu -- bash /mnt/c/ClaudeCode/webcad-v2/tools/release_wsl.sh <branch> <version>   e.g. claude/integration 2.10
# Rollback: ssh root@VPS, sed the root line in BOTH sites-available/cad.conf and sites-enabled/cad.conf back to the previous stamp, nginx -t && systemctl reload nginx.
set -euo pipefail
BRANCH=${1:?branch}; VER=${2:?version}
SRC=/mnt/c/ClaudeCode/webcad-v2
VPS=root@38.242.215.29
mkdir -p ~/.ssh && cp /mnt/c/Users/ivanl/.ssh/webcad_vps_ed25519 ~/.ssh/webcad_vps && chmod 600 ~/.ssh/webcad_vps
SSH="ssh -i $HOME/.ssh/webcad_vps -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
. ~/.nvm/nvm.sh >/dev/null; nvm use 22.19.0 >/dev/null
W=~/wc-release; rm -rf "$W"
git clone -q -c core.autocrlf=false --single-branch -b "$BRANCH" "$SRC" "$W"
cd "$W"
grep -q "APP_VERSION = '$VER'" src/version.ts || { echo "src/version.ts is not $VER"; exit 1; }
grep -q "webcad-v$VER'" public/sw.js || { echo "public/sw.js CACHE is not webcad-v$VER"; exit 1; }
pnpm install --frozen-lockfile >/dev/null 2>&1
pnpm build > build.log 2>&1 || { tail -30 build.log; exit 1; }
STAMP="v$VER-$(TZ=Asia/Hong_Kong date +%Y%m%d-%H%M%S)"
ENTRY=$(grep -oE 'assets/index-[A-Za-z0-9_-]+-r2\.js' dist/index.html | head -1)
MD5=$(md5sum "dist/$ENTRY" | cut -d' ' -f1)
echo "stamp=$STAMP entry=$ENTRY md5=$MD5 commit=$(git rev-parse --short HEAD)"
R=/var/www/webcad-releases/$STAMP
PREV=$($SSH $VPS "grep -oE 'root /var/www/webcad-releases/[^;]+' /etc/nginx/sites-enabled/cad.conf | head -1 | cut -d' ' -f2")
echo "previous=$PREV"
tar czf /tmp/wc-dist.tgz -C dist .
scp -q -i ~/.ssh/webcad_vps -o IdentitiesOnly=yes /tmp/wc-dist.tgz $VPS:/tmp/wc-dist-$STAMP.tgz
$SSH $VPS "set -e; mkdir -p $R && tar xzf /tmp/wc-dist-$STAMP.tgz -C $R && rm /tmp/wc-dist-$STAMP.tgz
  test \"\$(md5sum $R/$ENTRY | cut -d' ' -f1)\" = $MD5
  cp /etc/nginx/sites-available/cad.conf /root/nginx-cad-before-$STAMP.conf
  for f in /etc/nginx/sites-available/cad.conf /etc/nginx/sites-enabled/cad.conf; do sed -i 's|root /var/www/webcad-releases/[^;]*;|root $R;|' \$f; done
  nginx -t && systemctl reload nginx"
sleep 2
LIVE=$(curl -s https://cad.neuralworkshk.com/ | grep -oE 'assets/index-[A-Za-z0-9_-]+-r2\.js' | head -1)
LMD5=$(curl -s "https://cad.neuralworkshk.com/$LIVE" | md5sum | cut -d' ' -f1)
curl -s https://cad.neuralworkshk.com/sw.js | grep -o "webcad-v[0-9.]*"
[ "$LIVE" = "$ENTRY" ] && [ "$LMD5" = "$MD5" ] && echo "VERIFIED live=$STAMP (rollback target: $PREV)" || { echo "VERIFY FAILED live=$LIVE"; exit 1; }
