"""WebCAD 资产生成器 — 自架 Flux.1-schnell (api.igotoschoolbybus.net)。无 key。
用法：在 JOBS 列表填 {name,prompt,w,h,neg?}，跑 `python _fluxgen.py [name过滤]`。
submit→poll status→取 result PNG → 存 _genassets/<name>.png。临时档，_ 前缀。"""
import sys, json, time, os, urllib.request
BASE = "https://api.igotoschoolbybus.net"
OUT = os.path.join(os.path.dirname(__file__), "_genassets")
os.makedirs(OUT, exist_ok=True)

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"   # 服务器挡默认 Python-urllib UA → 必须伪装浏览器 UA

def _post(path, payload):
    req = urllib.request.Request(BASE + path, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json", "User-Agent": UA}, method="POST")
    with urllib.request.urlopen(req, timeout=35) as r:
        return json.load(r)

def _get_json(path):
    req = urllib.request.Request(BASE + path, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=35) as r:
        return json.load(r)

def _get_bytes(path):
    req = urllib.request.Request(BASE + path, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read()

def gen(name, prompt, w=1024, h=1024, neg=None, seed=-1):
    payload = {"prompt": prompt, "width": w, "height": h, "steps": 4, "seed": seed}
    if neg:
        payload["negative_prompt"] = neg
    j = _post("/queue/generate", payload)
    jid = j.get("job_id") or j.get("id")
    if not jid:
        print(name, "NO job_id:", j); return None
    for _ in range(150):
        st = _get_json(f"/queue/status/{jid}")
        s = st.get("status")
        if s == "done":
            break
        if s in ("error", "failed"):
            print(name, "FAILED:", st); return None
        time.sleep(2)
    else:
        print(name, "TIMEOUT", jid); return None
    data = _get_bytes(f"/queue/result/{jid}")
    p = os.path.join(OUT, name + ".png")
    with open(p, "wb") as f:
        f.write(data)
    print(f"OK {name}: {len(data)} bytes -> {p}")
    return p

_LOGONEG = "text, letters, words, watermark, signature, photo, realistic render, clutter, busy, gradient mesh, blurry, low quality, shadow"
_ICONNEG = "text, words, watermark, photo, realistic, clutter, multiple objects, blurry, low quality, gradient, noisy background"
_MATNEG = "text, words, watermark, multiple spheres, cube, box, clutter, busy background, blurry, low quality, dark background, harsh shadow"
_MATSUF = ", single sphere centered, soft even studio lighting, plain light grey seamless studio background, material preview swatch, clean product render"
# 21 种材质球（同 MATERIALS 对齐）—— 一致灰底+居中 → 统一 swatch 观感。512² 生成，之后 Pillow 缩 → 128²。
_MATS = {
    "steel": "a smooth brushed stainless steel metal", "alu": "a smooth brushed aluminium metal",
    "brass": "a polished golden brass metal", "copper": "a polished reddish copper metal",
    "plastic": "a glossy bright blue plastic", "paint": "a glossy red automotive painted",
    "gold": "a polished shiny gold metal", "silver": "a polished bright silver metal",
    "titanium": "a matte grey titanium metal", "blackplastic": "a matte black plastic",
    "stainless": "a highly polished mirror chrome stainless steel", "bronze": "an aged warm bronze metal",
    "wood": "a natural wood with visible wood grain", "rubber": "a matte black rubber",
    "glass": "a clear transparent glass with subtle refraction", "pla": "a glossy cyan blue PLA 3d-print plastic",
    "petg": "a translucent green PETG plastic", "abs": "a matte grey ABS plastic",
    "tpu": "a soft matte pink TPU rubbery plastic", "nylon": "a matte cream off-white nylon plastic",
    "resin": "a glossy smooth lavender purple resin",
}
# ── 资产清单 ──
JOBS = [
    # 标志（3 版本拣）
    {"name": "logo_v1", "w": 1024, "h": 1024, "neg": _LOGONEG,
     "prompt": "app icon for a parametric 3D CAD modeling software, minimalist geometric emblem, a clean blue isometric cube made of precise wireframe edges with one solid filled corner face, flat vector logo style, centered on pure white background, professional engineering tech brand mark, crisp sharp edges, blue and slate grey, simple"},
    {"name": "logo_v2", "w": 1024, "h": 1024, "neg": _LOGONEG,
     "prompt": "modern app logo for 3D CAD software, a rounded square app tile with soft blue gradient, containing a white isometric cube outline with a glowing edge, flat minimal icon, centered, pure white background, clean tech branding, depth"},
    {"name": "logo_v3", "w": 1024, "h": 1024, "neg": _LOGONEG,
     "prompt": "minimalist logo mark for engineering CAD app, abstract letter C formed by a precise parametric curve and a small cube node, deep blue and orange accent, flat vector, centered on white, geometric, professional, simple bold shapes"},
    # 空状态 / 上手插画（2 版本）
    {"name": "empty_v1", "w": 1024, "h": 1024, "neg": _LOGONEG + ", text, ui, buttons",
     "prompt": "friendly minimal flat illustration for an empty 3D CAD canvas onboarding screen, a soft isometric workbench with a small floating wireframe cube and a pencil sketching a blue curve, light pastel blue and grey palette, lots of white space, gentle, modern vector illustration, no text"},
    {"name": "empty_v2", "w": 1024, "h": 1024, "neg": _LOGONEG + ", text, ui, buttons",
     "prompt": "minimal flat vector illustration, a glowing blueprint grid plane with a single semi-transparent blue cube rising from it and dashed construction lines, inviting empty-state graphic for a CAD app, soft blue and white, clean, lots of negative space, no text"},
    # 材质球样办（4 个判断质量）
    {"name": "mat_steel", "w": 640, "h": 640, "neg": _ICONNEG,
     "prompt": "a single perfectly smooth polished stainless steel sphere, studio product render, soft neutral grey seamless background, centered, material preview swatch, realistic reflective metal, clean"},
    {"name": "mat_brass", "w": 640, "h": 640, "neg": _ICONNEG,
     "prompt": "a single smooth polished brass golden metal sphere, studio product render, soft neutral grey seamless background, centered, material preview swatch, warm reflective metal, clean"},
    {"name": "mat_abs", "w": 640, "h": 640, "neg": _ICONNEG,
     "prompt": "a single matte red ABS plastic sphere, soft studio lighting, soft neutral grey seamless background, centered, material preview swatch, smooth injection-moulded plastic, clean"},
    {"name": "mat_glass", "w": 640, "h": 640, "neg": _ICONNEG,
     "prompt": "a single clear transparent glass sphere with subtle refraction, studio product render, soft neutral grey seamless background, centered, material preview swatch, clean"},
    # Ribbon 图标样办（4 个判断 raster 图标是否够 crisp）
    {"name": "icon_extrude", "w": 512, "h": 512, "neg": _ICONNEG,
     "prompt": "flat minimal UI icon, a 2D square profile being extruded upward into a 3D box with an arrow, thick blue line-art on white, centered, simple pictogram, app toolbar icon style"},
    {"name": "icon_fillet", "w": 512, "h": 512, "neg": _ICONNEG,
     "prompt": "flat minimal UI icon, a cube with one edge rounded into a fillet, thick blue line-art on white, centered, simple pictogram, app toolbar icon style"},
    {"name": "icon_hole", "w": 512, "h": 512, "neg": _ICONNEG,
     "prompt": "flat minimal UI icon, a plate with a round drilled hole and a downward arrow, thick blue line-art on white, centered, simple pictogram, app toolbar icon style"},
    {"name": "icon_sketch", "w": 512, "h": 512, "neg": _ICONNEG,
     "prompt": "flat minimal UI icon, a pencil drawing a line on a grid plane, thick blue line-art on white, centered, simple pictogram, app toolbar icon style"},
]

MATJOBS = [{"name": "mat2_" + k, "w": 512, "h": 512, "neg": _MATNEG,
            "prompt": v + " sphere" + _MATSUF} for k, v in _MATS.items()]

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"
    jobs = MATJOBS if mode == "mats" else JOBS
    flt = sys.argv[2] if len(sys.argv) > 2 else None
    for jb in jobs:
        if flt and flt not in jb["name"]:
            continue
        gen(**jb)
