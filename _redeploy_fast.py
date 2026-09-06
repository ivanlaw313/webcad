"""Fast static deploy: upload Vite assets without slow server-side recompression."""
import os
import posixpath
import paramiko

LOCAL = r"C:\ClaudeCode\webcad\dist"
REMOTE = "/var/www/webcad"
HOST = "38.242.215.29"
from _deploy_auth import select_auth
AUTH = select_auth()

def say(*parts):
    print(*parts, flush=True)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username="root", **AUTH, timeout=20, banner_timeout=20, auth_timeout=20)
sftp = ssh.open_sftp()

def run(command):
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=45)
    status = stdout.channel.recv_exit_status()
    output = (stdout.read() + stderr.read()).decode(errors="replace").strip()
    if status:
        raise RuntimeError(f"remote command failed ({status}): {output}")
    return output

# Remove the entry document first, upload its hashed dependencies, then upload
# the entry document last. A client never receives an index pointing to assets
# which have not yet arrived.
run(f"rm -f {REMOTE}/index.html {REMOTE}/*.svg && mkdir -p {REMOTE}/assets")
uploaded = skipped = 0
pending_index: tuple[str, str] | None = None
for root, _dirs, files in os.walk(LOCAL):
    relative = os.path.relpath(root, LOCAL).replace("\\", "/")
    remote_dir = REMOTE if relative == "." else posixpath.join(REMOTE, relative)
    try:
        sftp.mkdir(remote_dir)
    except OSError:
        pass
    for filename in files:
        local_path = os.path.join(root, filename)
        remote_path = posixpath.join(remote_dir, filename)
        if filename == "index.html":
            pending_index = (local_path, remote_path)
            continue
        try:
            if sftp.stat(remote_path).st_size == os.path.getsize(local_path):
                skipped += 1
                continue
        except OSError:
            pass
        sftp.put(local_path, remote_path)
        uploaded += 1

if not pending_index:
    raise RuntimeError("dist/index.html is missing")
sftp.put(*pending_index)
uploaded += 1
run(f"chown -R www-data:www-data {REMOTE} && chmod -R 755 {REMOTE}")
say(f"uploaded {uploaded}; skipped {skipped}")
say(run("curl -skI https://cad.neuralworkshk.com/ | head -1"))
sftp.close()
ssh.close()
