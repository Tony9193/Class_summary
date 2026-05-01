"""数据模型定义"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class TranscribeRequest(BaseModel):
    """转写请求"""
    audio_data: Optional[str] = None  # Base64编码的音频数据
    file_path: Optional[str] = None   # 或文件路径


class TranscribeResponse(BaseModel):
    """转写响应"""
    task_id: str
    text: str
    duration: Optional[float] = None


class SummaryRequest(BaseModel):
    """总结请求"""
    text: str
    task_id: Optional[str] = None


class SummaryResponse(BaseModel):
    """总结响应"""
    task_id: str
    summary: str
    key_points: list[str]
    structure: dict


class HistoryRecord(BaseModel):
    """历史记录"""
    id: str
    filename: str
    created_at: str
    duration: Optional[float] = None
    transcription: str
    polished_text: Optional[str] = None
    summary: Optional[str] = None
    key_points: Optional[list[str]] = None


class HistoryListResponse(BaseModel):
    """历史记录列表响应"""
    total: int
    records: list[HistoryRecord]


class PolishRequest(BaseModel):
    """口语优化请求"""
    text: str
    task_id: Optional[str] = None
