"""FastAPI主应用"""
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from app.routers import audio, asr, summary, history, config, polish

app = FastAPI(
    title="课程录音转文字+AI智能总结",
    description="将课程录音快速转化为结构清晰的文字笔记和知识要点",
    version="1.0.0"
)

# 注册路由
app.include_router(audio.router)
app.include_router(asr.router)
app.include_router(summary.router)
app.include_router(history.router)
app.include_router(config.router)
app.include_router(polish.router)

# 挂载静态文件
static_dir = Path(__file__).parent.parent / "static"
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


@app.get("/")
async def index():
    """返回主页"""
    return FileResponse(str(static_dir / "index.html"))


@app.get("/health")
async def health():
    """健康检查"""
    return {"status": "ok", "version": "1.0.0"}
