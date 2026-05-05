"""ASR转写路由"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
import json
import logging

from app.services.asr_service import asr_service
from app.services.storage_service import storage_service
from app.models.schemas import TranscribeRequest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/asr", tags=["ASR"])


@router.post("/transcribe")
async def transcribe_audio(request: TranscribeRequest):
    """转写音频文件（完整返回），支持分段转写"""
    try:
        # 确定要转写的文件列表
        file_paths = request.chunks if request.chunks else [request.file_path]
        
        full_text = ""
        for i, chunk_path in enumerate(file_paths):
            logger.info(f"[ASR路由] 开始转写第 {i+1}/{len(file_paths)} 段: {chunk_path}")
            # 转写每一段
            chunk_text = await asr_service.transcribe_file_sync(chunk_path)
            logger.info(f"[ASR路由] 第 {i+1} 段转写完成，文本长度: {len(chunk_text)}")
            
            # 多段时添加分隔
            if len(file_paths) > 1:
                if i > 0:
                    full_text += "\n\n"
                full_text += chunk_text
            else:
                full_text = chunk_text
        
        logger.info(f"[ASR路由] 全部转写完成，总文本长度: {len(full_text)}")
        # 保存到历史记录
        from pathlib import Path
        filename = Path(request.file_path).name
        record = storage_service.create_record(filename, full_text)
        logger.info(f"[ASR路由] 记录已保存，ID: {record.id}")
        
        return {
            "success": True,
            "task_id": record.id,
            "text": full_text,
            "chunks_count": len(file_paths)
        }
    except FileNotFoundError as e:
        return JSONResponse(
            status_code=404,
            content={"success": False, "message": str(e)}
        )
    except Exception as e:
        logger.error(f"转写失败: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"转写失败: {str(e)}"}
        )


@router.post("/transcribe/stream")
async def transcribe_audio_stream(request: TranscribeRequest):
    """转写音频文件（SSE流式返回），支持分段转写"""
    async def event_generator():
        full_text = ""
        try:
            # 确定要转写的文件列表
            file_paths = request.chunks if request.chunks else [request.file_path]
            total_chunks = len(file_paths)
            
            for i, chunk_path in enumerate(file_paths):
                # 通知开始转写新段
                if total_chunks > 1:
                    yield f"data: {json.dumps({'type': 'progress', 'current': i+1, 'total': total_chunks, 'message': f'正在转写第 {i+1}/{total_chunks} 段...'}, ensure_ascii=False)}\n\n"
                
                chunk_text = ""
                async for delta in asr_service.transcribe_file(chunk_path):
                    if delta:
                        chunk_text += delta
                        full_text += delta
                        yield f"data: {json.dumps({'type': 'delta', 'text': delta}, ensure_ascii=False)}\n\n"
                
                # 多段时添加换行分隔
                if total_chunks > 1 and i < total_chunks - 1:
                    full_text += "\n\n"
                    newline_text = "\n\n"
                    yield f"data: {json.dumps({'type': 'delta', 'text': newline_text}, ensure_ascii=False)}\n\n"
            
            # 转写完成，保存记录
            from pathlib import Path
            filename = Path(request.file_path).name
            record = storage_service.create_record(filename, full_text)
            yield f"data: {json.dumps({'type': 'done', 'task_id': record.id, 'full_text': full_text, 'chunks_count': total_chunks}, ensure_ascii=False)}\n\n"
            
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
