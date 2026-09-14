"""Runtime authentication selection only. Importing this module never connects."""
import os

def select_auth(environ=None, exists=None, expanduser=None):
    environ = os.environ if environ is None else environ
    exists = os.path.isfile if exists is None else exists
    expanduser = os.path.expanduser if expanduser is None else expanduser
    for candidate in ("~/.ssh/vps_deploy", "~/.ssh/nfe_deploy_ed25519", "~/.ssh/doom_vps", "~/.ssh/id_ed25519", "~/.ssh/id_rsa"):
        key = expanduser(candidate)
        if exists(key):
            return {"key_filename": key}
    password = environ.get("WEBCAD_VPS_PASSWORD")
    if password:
        return {"password": password}
    raise RuntimeError("No deployment key or WEBCAD_VPS_PASSWORD available.")
