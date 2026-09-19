"""Simplified→Traditional Chinese char helpers for WebCAD UI triage.

Cheap local filter so obvious SC leaks / orthography fixes never hit the API.
"""
from __future__ import annotations

import re

# Distinct SC markers whose TC form differs (bakeoff + common CAD UI leaks).
SC_MARKERS = {
    "铁", "开", "标", "门", "车", "发", "后", "过", "还", "这", "来", "说", "时",
    "国", "为", "会", "对", "们", "从", "进", "个", "与", "无", "书", "长", "马",
    "图", "选", "择", "圆",
}

# Minimal SC→TC map covering bakeoff strings + common ribbon leaks.
SC_TO_TC = {
    "铁": "鐵",
    "开": "開",
    "标": "標",
    "门": "門",
    "车": "車",
    "发": "發",
    "后": "後",
    "过": "過",
    "还": "還",
    "这": "這",
    "来": "來",
    "说": "說",
    "时": "時",
    "国": "國",
    "为": "為",
    "会": "會",
    "对": "對",
    "们": "們",
    "从": "從",
    "进": "進",
    "个": "個",
    "与": "與",
    "无": "無",
    "书": "書",
    "长": "長",
    "马": "馬",
    "图": "圖",
    "选": "選",
    "择": "擇",
    "圆": "圓",
}


def has_sc_leak(text: str) -> bool:
    return any(ch in SC_MARKERS for ch in text)


def to_tc_label(text: str) -> str:
    s = "".join(SC_TO_TC.get(ch, ch) for ch in text)
    # product preference: drop space between L and 角鐵
    return re.sub(r"^L\s+", "L", s)
