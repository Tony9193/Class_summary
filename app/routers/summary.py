"""AI总结路由"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import json
import logging

from app.models.schemas import SummaryRequest
from app.services.llm_service import llm_service
from app.services.storage_service import storage_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/summary", tags=["AI总结"])


@router.post("/generate")
async def generate_summary(request: SummaryRequest):
    """生成课程总结"""
    try:
        result = await llm_service.generate_summary(request.text, model_id=request.model_id)
        
        # 如果有task_id，更新历史记录
        if request.task_id:
            storage_service.update_record(
                request.task_id,
                summary=result["summary"],
                key_points=result["key_points"]
            )
        
        return {
            "success": True,
            "summary": result["summary"],
            "key_points": result["key_points"]
        }
    except Exception as e:
        error_msg = str(e)
        logger.error(f"生成总结失败: {error_msg}")
        
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
            raise HTTPException(status_code=500, detail=f"生成总结失败: {error_msg}")


@router.post("/generate/stream")
async def generate_summary_stream(request: SummaryRequest):
    """流式生成课程总结"""
    async def event_generator():
        full_summary = ""
        try:
            async for chunk in llm_service.generate_summary_stream(request.text, model_id=request.model_id):
                full_summary += chunk
                yield f"data: {json.dumps({'type': 'chunk', 'text': chunk}, ensure_ascii=False)}\n\n"
            
            # 完成后更新记录
            if request.task_id:
                storage_service.update_record(request.task_id, summary=full_summary)
            
            yield f"data: {json.dumps({'type': 'done', 'full_summary': full_summary}, ensure_ascii=False)}\n\n"
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
