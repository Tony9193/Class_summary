"""数据模型定义"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class SummaryRequest(BaseModel):
    """总结请求"""
    model_config = {'protected_namespaces': ()}
    
    text: str
    task_id: Optional[str] = None
    model_id: Optional[str] = None


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
    model_config = {'protected_namespaces': ()}
    
    text: str
    task_id: Optional[str] = None
    model_id: Optional[str] = None


# 模型配置相关数据模型

class ModelConfigCreate(BaseModel):
    """创建模型配置请求"""
    name: str = Field(..., min_length=1, max_length=50, description="模型名称标识")
    display_name: str = Field(..., min_length=1, max_length=100, description="显示名称")
    api_key: str = Field(..., min_length=1, description="API Key")
    base_url: str = Field(..., min_length=1, description="API Base URL")
    model: str = Field(..., min_length=1, description="模型名称")
    description: Optional[str] = Field(None, max_length=200, description="模型描述")
    is_default: bool = Field(False, description="是否为默认模型")


class ModelConfigUpdate(BaseModel):
    """更新模型配置请求"""
    display_name: Optional[str] = Field(None, max_length=100)
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None
    description: Optional[str] = Field(None, max_length=200)
    is_default: Optional[bool] = None


class ModelConfigResponse(BaseModel):
    """模型配置响应"""
    id: str
    name: str
    display_name: str
    api_key_masked: str
    base_url: str
    model: str
    description: Optional[str]
    is_default: bool
    created_at: str
    updated_at: str
    usage_count: int = 0
    total_tokens: int = 0


class ModelConfigListResponse(BaseModel):
    """模型配置列表响应"""
    model_config = {'protected_namespaces': ()}
    
    success: bool
    models: list[ModelConfigResponse]
    active_model_id: Optional[str] = None


class ModelUsageStats(BaseModel):
    """模型用量统计"""
    model_config = {'protected_namespaces': ()}
    
    model_id: str
    model_name: str
    display_name: str
    call_count: int = 0
    total_tokens: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    last_used_at: Optional[str] = None


class ModelUsageListResponse(BaseModel):
    """模型用量统计列表响应"""
    success: bool
    stats: list[ModelUsageStats]
