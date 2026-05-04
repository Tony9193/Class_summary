"""模型配置管理路由"""
from fastapi import APIRouter, HTTPException
from typing import Optional

from app.models.schemas import (
    ModelConfigCreate, ModelConfigUpdate,
    ModelConfigResponse, ModelConfigListResponse,
    ModelUsageListResponse
)
from app.services.model_service import model_service

router = APIRouter(prefix="/api/models", tags=["模型配置"])


@router.get("")
async def list_models():
    """获取所有模型配置列表"""
    models = model_service.get_all_models()
    active_id = model_service.get_active_model_id()

    return {
        "success": True,
        "models": models,
        "active_model_id": active_id
    }


@router.get("/active")
async def get_active_model():
    """获取当前激活的模型配置"""
    model = model_service.get_active_model()

    if not model:
        return {
            "success": False,
            "message": "未配置任何模型",
            "model": None
        }

    return {
        "success": True,
        "model": {
            "id": model["id"],
            "name": model["name"],
            "display_name": model["display_name"],
            "base_url": model["base_url"],
            "model": model["model"],
            "description": model.get("description")
        }
    }


@router.get("/usage")
async def get_usage_stats():
    """获取模型用量统计"""
    stats = model_service.get_usage_stats()

    return {
        "success": True,
        "stats": stats
    }


@router.get("/{model_id}")
async def get_model(model_id: str):
    """获取单个模型配置"""
    model = model_service.get_model(model_id)

    if not model:
        raise HTTPException(status_code=404, detail="模型不存在")

    return {
        "success": True,
        "model": {
            "id": model["id"],
            "name": model["name"],
            "display_name": model["display_name"],
            "api_key_masked": model_service._mask_api_key(model["api_key"]),
            "base_url": model["base_url"],
            "model": model["model"],
            "description": model.get("description"),
            "is_default": model.get("is_default", False)
        }
    }


@router.post("")
async def create_model(request: ModelConfigCreate):
    """创建模型配置"""
    try:
        model = model_service.create_model(request.model_dump())

        return {
            "success": True,
            "message": "模型配置创建成功",
            "model": {
                "id": model["id"],
                "name": model["name"],
                "display_name": model["display_name"]
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建失败: {str(e)}")


@router.put("/{model_id}")
async def update_model(model_id: str, request: ModelConfigUpdate):
    """更新模型配置"""
    update_data = request.model_dump(exclude_unset=True)

    if not update_data:
        raise HTTPException(status_code=400, detail="没有要更新的数据")

    model = model_service.update_model(model_id, update_data)

    if not model:
        raise HTTPException(status_code=404, detail="模型不存在")

    return {
        "success": True,
        "message": "模型配置更新成功"
    }


@router.delete("/{model_id}")
async def delete_model(model_id: str):
    """删除模型配置"""
    success = model_service.delete_model(model_id)

    if not success:
        raise HTTPException(status_code=404, detail="模型不存在")

    return {
        "success": True,
        "message": "模型配置已删除"
    }


@router.post("/{model_id}/activate")
async def activate_model(model_id: str):
    """设置激活模型"""
    success = model_service.set_active_model(model_id)

    if not success:
        raise HTTPException(status_code=404, detail="模型不存在")

    return {
        "success": True,
        "message": "模型已切换"
    }


@router.post("/test/{model_id}")
async def test_model_connection(model_id: str):
    """测试模型连接"""
    from openai import AsyncOpenAI

    model = model_service.get_model(model_id)
    if not model:
        raise HTTPException(status_code=404, detail="模型不存在")

    try:
        client = AsyncOpenAI(api_key=model["api_key"], base_url=model["base_url"])
        response = await client.chat.completions.create(
            model=model["model"],
            messages=[{"role": "user", "content": "Hello"}],
            max_tokens=10
        )
        return {
            "success": True,
            "message": f"连接成功，模型: {model['model']}"
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"连接失败: {str(e)}"
        }


@router.post("/import-env")
async def import_from_env():
    """从环境变量导入模型配置"""
    try:
        model = model_service.import_from_env()

        if not model:
            return {
                "success": False,
                "message": "环境变量中没有可导入的配置，或配置已存在"
            }

        return {
            "success": True,
            "message": "已从环境变量导入模型配置",
            "model": {
                "id": model["id"],
                "name": model["name"]
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导入失败: {str(e)}")
