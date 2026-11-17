# /// script
# requires-python = ">=3.10"
# dependencies = ["mcp>=2"]
# ///
"""MCP server: exposes the skill's search script (skills/starbucks-parking/scripts/find.py) as a tool.

Run:      uv run mcp/server.py            (stdio)
Register: claude mcp add starbucks-parking -- uv run /abs/path/mcp/server.py
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from typing import Literal

from mcp.server.mcpserver import MCPServer

FIND = Path(__file__).resolve().parent.parent / "skills" / "starbucks-parking" / "scripts" / "find.py"
mcp = MCPServer("starbucks-parking")


@mcp.tool()
def find_parking(
    near: str | None = None,
    lat: float | None = None,
    lng: float | None = None,
    name: str | None = None,
    parking_type: Literal["any", "free", "free-only", "all"] = "any",
    min_hours: float | None = None,
    radius_km: float = 2.0,
    limit: int = 10,
) -> str:
    """Find Starbucks Korea stores with parking.

    Give one of: `near` (store name fragment, dong or gu, e.g. 공덕, 판교, 성수동),
    `lat`+`lng`, or `name` (one store's parking note).
    parking_type: any = parking exists, free = free or free with purchase, free-only = free without conditions.
    min_hours: free parking for at least this many hours.
    Returns each store's parking type, original parking note and a Naver Map link.
    """
    args = [sys.executable, str(FIND), "--type", parking_type, "--radius", str(radius_km), "--limit", str(limit)]
    if name:
        args += ["--name", name]
    elif lat is not None and lng is not None:
        args += ["--lat", str(lat), "--lng", str(lng)]
    elif near:
        args += ["--near", near]
    else:
        return "near, lat+lng, name 중 하나가 필요합니다."
    if min_hours is not None:
        args += ["--min-hours", str(min_hours)]
    out = subprocess.run(args, capture_output=True, text=True, timeout=30)
    return (out.stdout + out.stderr).strip()


if __name__ == "__main__":
    mcp.run()
