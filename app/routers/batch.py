"""批量处理路由"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pathlib import Path
from typing import List, Optional
import logging

from app.config import SUPPORTED_AUDIO_FORMATS
from app.services.storage_service import storage_service
from app.services.batch_service import batch_service
from app.utils.audio_utils import preprocess_audio, get_audio_duration

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/batch", tags=["批量处理"])


@router.post("/upload")
async def batch_upload(
    files: List[UploadFile] = File(...),
    enable_denoise: bool = Form(False),
    denoise_method: Optional[str] = Form(None)
):
    """批量上传音频文件"""
    if not files:
        raise HTTPException(status_code=400, detail="请至少选择一个文件")

    if len(files) > 20:
        raise HTTPException(status_code=400, detail="单次最多上传20个文件")

    results = []
    for file in files:
        try:
            ext = Path(file.filename).suffix.lower()
            if ext not in SUPPORTED_AUDIO_FORMATS:
                results.append({
                    "filename": file.filename,
                    "success": False,
                    "error": f"不支持的格式: {ext}"
                })
                continue

            content = await file.read()
            if len(content) > 500 * 1024 * 1024:
                results.append({
                    "filename": file.filename,
                    "success": False,
                    "error": "文件超过500MB限制"
                })
                continue

            file_path = storage_service.save_upload(content, file.filename)

            try:
                preprocess_result = preprocess_audio(
                    file_path,
                    enable_denoise=enable_denoise,
                    denoise_method=denoise_method or "afftdn",
                    enable_split=True
                )
                results.append({
                    "filename": file.filename,
                    "success": True,
                    "file_path": file_path,
                    "size": len(content),
                    "duration": preprocess_result["original_duration"],
                    "chunks": preprocess_result["chunks"],
                    "denoised": preprocess_result["denoised"]
                })
            except Exception as e:
                results.append({
                    "filename": file.filename,
                    "success": True,
                    "file_path": file_path,
                    "size": len(content),
                    "duration": get_audio_duration(file_path),
                    "chunks": [file_path],
                    "warning": f"预处理失败: {str(e)}"
                })
        except Exception as e:
            results.append({
                "filename": file.filename,
                "success": False,
                "error": str(e)
            })

    return {
        "success": True,
        "files": results,
        "total": len(results),
        "success_count": sum(1 for r in results if r.get("success")),
        "fail_count": sum(1 for r in results if not r.get("success"))
    }


@router.post("/start")
async def start_batch(
    files: list[dict],
    auto_summary: bool = False
):
    """启动批量处理任务"""
    if not files:
        raise HTTPException(status_code=400, detail="没有待处理的文件")

    task = batch_service.create_task(files, auto_summary=auto_summary)

    return {
        "success": True,
        "task_id": task.id,
        "total": task.total
    }


@router.get("/status/{task_id}")
async def get_batch_status(task_id: str):
    """获取批量任务状态"""
    task = batch_service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    return {
        "success": True,
        "task": task.model_dump()
    }


@router.get("/list")
async def list_batch_tasks():
    """获取所有批量任务"""
    tasks = batch_service.list_tasks()
    return {
        "success": True,
        "tasks": [t.model_dump() for t in tasks]
    }
