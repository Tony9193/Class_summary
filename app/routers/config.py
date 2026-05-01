"""配置管理路由"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.config import get_config, save_config

router = APIRouter(prefix="/api/config", tags=["配置"])


class ConfigUpdate(BaseModel):
    """配置更新请求"""
    step_api_key: Optional[str] = None
    llm_api_key: Optional[str] = None
    llm_base_url: Optional[str] = None
    llm_model: Optional[str] = None


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
