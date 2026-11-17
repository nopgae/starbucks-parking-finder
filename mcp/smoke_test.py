# Run: uv run --with "mcp>=2" python mcp/smoke_test.py
# Smoke test: start the server over stdio like a real MCP client and call the tool.
import asyncio
from pathlib import Path
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
async def main():
    p=StdioServerParameters(command="uv", args=["run", str(Path(__file__).parent / "server.py")])
    async with stdio_client(p) as (r,w):
        async with ClientSession(r,w) as s:
            await s.initialize()
            tools=(await s.list_tools()).tools
            assert [t.name for t in tools]==["find_parking"], tools
            res=await s.call_tool("find_parking",{"near":"공덕","parking_type":"free","min_hours":2,"limit":3})
            text=res.content[0].text; print(text[:600]); assert "네이버 지도" in text
            res=await s.call_tool("find_parking",{}); assert "필요합니다" in res.content[0].text
            print("OK")
asyncio.run(main())
