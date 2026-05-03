"""音频相关路由"""
from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from pathlib import Path
from typing import Optional

from app.config import SUPPORTED_AUDIO_FORMATS, get_denoise_method
from app.services.storage_service import storage_service
from app.utils.audio_utils import preprocess_audio, get_audio_duration

router = APIRouter(prefix="/api/audio", tags=["音频"])


@router.post("/upload")
async def upload_audio(
    file: UploadFile = File(...),
    enable_denoise: bool = Form(False),
    denoise_method: Optional[str] = Form(None)
):
    """上传音频文件，支持预降噪"""
    # 检查文件格式
    ext = Path(file.filename).suffix.lower()
    if ext not in SUPPORTED_AUDIO_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的音频格式: {ext}，支持: {', '.join(SUPPORTED_AUDIO_FORMATS)}"
        )
    
    # 读取文件内容
    content = await file.read()
    
    # 检查文件大小 (限制500MB)
    if len(content) > 500 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="文件大小超过500MB限制")
    
    # 保存原始文件
    file_path = storage_service.save_upload(content, file.filename)
    
    # 确定降噪方法：前端传值 > 配置文件默认值
    method = denoise_method if denoise_method in ("afftdn", "noisereduce") else get_denoise_method()
    
    # 预处理（降噪+切割检测）
    try:
        preprocess_result = preprocess_audio(
            file_path, 
            enable_denoise=enable_denoise,
            denoise_method=method,
            enable_split=True
        )
        
        return {
            "success": True,
            "file_path": file_path,
            "filename": file.filename,
            "size": len(content),
            "duration": preprocess_result["original_duration"],
            "denoised": preprocess_result["denoised"],
            "denoise_method": preprocess_result["denoise_method"],
            "need_split": preprocess_result["split"],
            "chunks": preprocess_result["chunks"]
        }
    except Exception as e:
        # 预处理失败，仍返回原始文件
        return {
            "success": True,
            "file_path": file_path,
            "filename": file.filename,
            "size": len(content),
            "duration": get_audio_duration(file_path),
            "denoised": False,
            "denoise_method": None,
            "need_split": False,
            "chunks": [file_path],
            "warning": f"预处理失败: {str(e)}"
        }
