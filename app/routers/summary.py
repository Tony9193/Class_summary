"""AI总结路由"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import json

from app.models.schemas import SummaryRequest
from app.services.llm_service import llm_service
from app.services.storage_service import storage_service

router = APIRouter(prefix="/api/summary", tags=["AI总结"])


@router.post("/generate")
async def generate_summary(request: SummaryRequest):
    """生成课程总结"""
    try:
        result = await llm_service.generate_summary(request.text)
        
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
        raise HTTPException(status_code=500, detail=f"生成总结失败: {str(e)}")


@router.post("/generate/stream")
async def generate_summary_stream(request: SummaryRequest):
    """流式生成课程总结"""
    async def event_generator():
        full_summary = ""
        try:
            async for chunk in llm_service.generate_summary_stream(request.text):
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
