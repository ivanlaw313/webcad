import os, posixpath, time, paramiko
from pathlib import Path

STAMP = Path('/workspace/webcad/work/_v198_stamp.txt').read_text().strip()
ENTRY = Path('/workspace/webcad/work/_v198_entry.txt').read_text().strip()
MD5 = Path('/workspace/webcad/work/_v198_md5.txt').read_text().strip()
LOCAL = Path('/tmp/webcad-v198-release/dist').resolve()
REMOTE = f'/var/www/webcad-releases/{STAMP}'
PREV = '/var/www/webcad-releases/v1.97-20260919-184516'
KEY = '/home/box/.ssh/vps_deploy'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('cad.neuralworkshk.com', username='root', key_filename=KEY, timeout=30,
            look_for_keys=False, allow_agent=False)

def run(cmd, t=180):
    _, o, e = ssh.exec_command(cmd, timeout=t)
    out = (o.read() + e.read()).decode(errors='replace')
    st = o.channel.recv_exit_status()
    if st != 0:
        raise RuntimeError(f'fail({st}): {cmd}\n{out}')
    return out.strip()

print('STAMP', STAMP)
print('ENTRY', ENTRY)
print('MD5', MD5)
print('PREV', PREV, '->', run(f'test -d {PREV} && echo ok || echo missing'))
run(f'rm -rf {REMOTE} && mkdir -p {REMOTE}/assets')
sftp = ssh.open_sftp()

def put_retry(lp, rp, tries=5):
    last = None
    for i in range(tries):
        try:
            if not os.path.exists(lp):
                raise FileNotFoundError(lp)
            sftp.put(str(lp), rp, confirm=False)
            local_sz = os.path.getsize(lp)
            remote_sz = sftp.stat(rp).st_size
            if local_sz != remote_sz:
                raise IOError(f'size mismatch {remote_sz} != {local_sz}')
            return
        except Exception as ex:
            last = ex
            print(f'  retry {i+1}/{tries} {os.path.basename(lp)}: {ex}')
            time.sleep(0.5 * (i + 1))
            try:
                sftp.remove(rp)
            except Exception:
                pass
    raise last

uploaded = 0
for root, dirs, files in os.walk(LOCAL):
    rel = os.path.relpath(root, LOCAL).replace(chr(92), '/')
    rdir = REMOTE if rel == '.' else posixpath.join(REMOTE, rel)
    parts = rdir.strip('/').split('/')
    cur = ''
    for part in parts:
        cur += '/' + part
        try:
            sftp.mkdir(cur)
        except OSError:
            pass
    for f in files:
        lp = os.path.join(root, f)
        rp = posixpath.join(rdir, f)
        put_retry(lp, rp)
        uploaded += 1
        if uploaded % 25 == 0:
            print(f'  uploaded {uploaded}…')
print(f'uploaded={uploaded}')
sftp.close()

remote_md5 = run(f'md5sum {REMOTE}/assets/{ENTRY}').split()[0]
assert remote_md5 == MD5, (remote_md5, MD5)

for conf in ['/etc/nginx/sites-available/cad.conf', '/etc/nginx/sites-enabled/cad.conf']:
    run(f"sed -i 's|root /var/www/webcad-releases/[^;]*;|root {REMOTE};|' {conf}")

run('nginx -t && systemctl reload nginx')
live_sw = run('curl -sS https://cad.neuralworkshk.com/sw.js | head -20')
print('LIVE_SW_HEAD:\n', live_sw)
live_idx = run('curl -sS https://cad.neuralworkshk.com/ | head -c 800')
print('LIVE_IDX_SNIP:\n', live_idx)
print('DONE', STAMP)
ssh.close()
