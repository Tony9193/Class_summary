"""历史记录路由"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse
from typing import Optional

from app.services.storage_service import storage_service

router = APIRouter(prefix="/api/history", tags=["历史记录"])


@router.get("/list")
async def list_records(
    keyword: Optional[str] = None,
    page: int = 1,
    page_size: int = 20
):
    """获取历史记录列表"""
    result = storage_service.list_records(keyword, page, page_size)
    return {
        "success": True,
        "total": result.total,
        "records": [r.model_dump() for r in result.records]
    }


@router.get("/{record_id}")
async def get_record(record_id: str):
    """获取单条记录"""
    record = storage_service.get_record(record_id)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    
    return {
        "success": True,
        "record": record.model_dump()
    }


@router.delete("/{record_id}")
async def delete_record(record_id: str):
    """删除记录"""
    success = storage_service.delete_record(record_id)
    if not success:
        raise HTTPException(status_code=404, detail="记录不存在")
    
    return {"success": True, "message": "删除成功"}


@router.get("/export/{record_id}")
async def export_record(record_id: str):
    """导出记录"""
    content = storage_service.export_record(record_id)
    if not content:
        raise HTTPException(status_code=404, detail="记录不存在")
    
    return PlainTextResponse(
        content,
        headers={
            "Content-Disposition": f"attachment; filename=record_{record_id}.txt"
        }
    )
