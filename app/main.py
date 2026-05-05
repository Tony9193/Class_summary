"""FastAPI主应用"""
import logging
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, Response
from pathlib import Path

from app.routers import audio, asr, summary, history, config, polish, models, batch

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="课程录音转文字+AI智能总结",
    description="将课程录音快速转化为结构清晰的文字笔记和知识要点",
    version="1.0.0"
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局异常处理器，统一错误响应格式"""
    logger.error(f"未处理的异常: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "message": f"服务器内部错误: {str(exc)}"
        }
    )

# 注册路由
app.include_router(audio.router)
app.include_router(asr.router)
app.include_router(summary.router)
app.include_router(history.router)
app.include_router(config.router)
app.include_router(polish.router)
app.include_router(models.router)
app.include_router(batch.router)

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


@app.get("/favicon.ico")
async def favicon():
    """返回favicon（空响应避免404）"""
    # 返回一个1x1透明PNG
    import base64
    pixel = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJREFUeJztzDEBAAAIwzDAv+dhAhdOAAAA0wEA7wGzAAAAAElFTkSuQmCC")
    return Response(content=pixel, media_type="image/png")
