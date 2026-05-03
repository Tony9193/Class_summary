"""配置管理路由"""
import os
import shutil
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.config import get_config, save_config, UPLOADS_DIR, HISTORY_DIR

router = APIRouter(prefix="/api/config", tags=["配置"])


class ConfigUpdate(BaseModel):
    """配置更新请求"""
    step_api_key: Optional[str] = None
    llm_api_key: Optional[str] = None
    llm_base_url: Optional[str] = None
    llm_model: Optional[str] = None
    denoise_method: Optional[str] = None


@router.get("")
async def get_current_config():
    """获取当前配置（隐藏敏感信息）"""
    config = get_config()
    
    # 隐藏API Key，只显示前8位和后4位
    def mask_key(key: str) -> str:
        if not key or len(key) <= 12:
            return "****" if key else ""
        return key[:8] + "****" + key[-4:]
    
    return {
        "success": True,
        "config": {
            "step_api_key": mask_key(config["step_api_key"]),
            "llm_api_key": mask_key(config["llm_api_key"]),
            "llm_base_url": config["llm_base_url"],
            "llm_model": config["llm_model"],
            "denoise_method": config.get("denoise_method", "afftdn"),
            "step_api_key_set": bool(config["step_api_key"]),
            "llm_api_key_set": bool(config["llm_api_key"])
        }
    }


@router.put("")
async def update_config(request: ConfigUpdate):
    """更新配置"""
    try:
        # 获取当前配置
        current = get_config()
        
        # 只更新非空字段
        update_data = request.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            if value is not None and value != "":
                if key == "denoise_method" and value not in ("afftdn", "noisereduce"):
                    continue
                current[key] = value
        
        # 保存配置
        save_config(current)
        
        return {
            "success": True,
            "message": "配置保存成功"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存配置失败: {str(e)}")


@router.post("/test/asr")
async def test_asr_connection():
    """测试ASR连接"""
    from app.config import get_step_api_key
    key = get_step_api_key()
    
    if not key:
        return {"success": False, "message": "未配置阶跃星辰API Key"}
    
    # 验证Key长度
    if len(key) < 10:
        return {"success": False, "message": "API Key格式不正确，长度过短"}
    
    return {"success": True, "message": "API Key格式正确"}


@router.post("/test/llm")
async def test_llm_connection():
    """测试LLM连接"""
    from app.config import get_llm_api_key, get_llm_base_url, get_llm_model
    from openai import AsyncOpenAI
    
    api_key = get_llm_api_key()
    base_url = get_llm_base_url()
    model = get_llm_model()
    
    if not api_key:
        return {"success": False, "message": "未配置LLM API Key"}
    
    try:
        client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        # 尝试发送一个简单请求
        response = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "Hello"}],
            max_tokens=10
        )
        return {"success": True, "message": f"连接成功，模型: {model}"}
    except Exception as e:
        return {"success": False, "message": f"连接失败: {str(e)}"}


def get_dir_size(dir_path: str) -> int:
    """获取目录大小（字节）"""
    total_size = 0
    if os.path.exists(dir_path):
        for dirpath, dirnames, filenames in os.walk(dir_path):
            for f in filenames:
                fp = os.path.join(dirpath, f)
                if os.path.exists(fp):
                    total_size += os.path.getsize(fp)
    return total_size


def format_size(size_bytes: int) -> str:
    """格式化文件大小"""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.1f} GB"


@router.delete("/cache/{cache_type}")
async def clear_cache(cache_type: str):
    """清除缓存"""
    # 验证缓存类型
    valid_types = ["uploads", "history", "all"]
    if cache_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"无效的缓存类型: {cache_type}，有效类型: {valid_types}")
    
    try:
        if cache_type == "uploads":
            # 清除上传的音频文件
            if UPLOADS_DIR.exists():
                for item in UPLOADS_DIR.iterdir():
                    if item.is_file():
                        item.unlink()
                    elif item.is_dir():
                        shutil.rmtree(item)
            return {"success": True, "message": "音频文件缓存已清除"}
        
        elif cache_type == "history":
            # 清除历史记录
            if HISTORY_DIR.exists():
                for item in HISTORY_DIR.iterdir():
                    if item.is_file():
                        item.unlink()
                    elif item.is_dir():
                        shutil.rmtree(item)
            return {"success": True, "message": "历史记录已清除"}
        
        elif cache_type == "all":
            # 清除所有缓存
            if UPLOADS_DIR.exists():
                for item in UPLOADS_DIR.iterdir():
                    if item.is_file():
                        item.unlink()
                    elif item.is_dir():
                        shutil.rmtree(item)
            
            if HISTORY_DIR.exists():
                for item in HISTORY_DIR.iterdir():
                    if item.is_file():
                        item.unlink()
                    elif item.is_dir():
                        shutil.rmtree(item)
            
            return {"success": True, "message": "所有缓存已清除"}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"清除缓存失败: {str(e)}")


@router.get("/cache/info")
async def get_cache_info():
    """获取缓存信息"""
    uploads_size = get_dir_size(str(UPLOADS_DIR))
    history_size = get_dir_size(str(HISTORY_DIR))
    
    return {
        "success": True,
        "cache_info": {
            "uploads": {
                "size": uploads_size,
                "size_formatted": format_size(uploads_size),
                "path": str(UPLOADS_DIR)
            },
            "history": {
                "size": history_size,
                "size_formatted": format_size(history_size),
                "path": str(HISTORY_DIR)
            },
            "all": {
                "size": uploads_size + history_size,
                "size_formatted": format_size(uploads_size + history_size)
            }
        }
    }
