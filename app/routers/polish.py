"""口语优化路由"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import json
import logging

from app.models.schemas import PolishRequest
from app.services.llm_service import llm_service
from app.services.storage_service import storage_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/polish", tags=["口语优化"])


@router.post("")
async def polish_text(request: PolishRequest):
    """优化口语化文本"""
    try:
        result = await llm_service.polish_text(request.text, model_id=request.model_id)
        
        # 如果有task_id，更新历史记录
        if request.task_id:
            storage_service.update_record(
                request.task_id,
                polished_text=result
            )
        
        return {
            "success": True,
            "original": request.text,
            "polished": result
        }
    except Exception as e:
        error_msg = str(e)
        logger.error(f"优化失败: {error_msg}")
        
        # 提供更友好的错误信息
        if "404" in error_msg or "NOT_FOUND" in error_msg:
            raise HTTPException(
                status_code=400, 
                detail="模型接口不存在，请检查Base URL和模型名称配置是否正确"
            )
        elif "401" in error_msg or "Unauthorized" in error_msg:
            raise HTTPException(
                status_code=400, 
                detail="API Key无效或已过期，请检查API Key配置"
            )
        elif "429" in error_msg or "rate" in error_msg.lower():
            raise HTTPException(
                status_code=429, 
                detail="API调用频率超限，请稍后再试"
            )
        else:
            raise HTTPException(status_code=500, detail=f"优化失败: {error_msg}")


@router.post("/stream")
async def polish_text_stream(request: PolishRequest):
    """流式优化口语化文本"""
    async def event_generator():
        full_polished = ""
        try:
            async for chunk in llm_service.polish_text_stream(request.text, model_id=request.model_id):
                full_polished += chunk
                yield f"data: {json.dumps({'type': 'chunk', 'text': chunk}, ensure_ascii=False)}\n\n"
            
            # 完成后更新记录
            if request.task_id:
                storage_service.update_record(request.task_id, polished_text=full_polished)
            
            yield f"data: {json.dumps({'type': 'done', 'full_polished': full_polished}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
