"""数据模型定义"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class TranscribeRequest(BaseModel):
    """转写请求"""
    file_path: str
    chunks: Optional[List[str]] = None  # 分段文件列表


class SummaryRequest(BaseModel):
    """总结请求"""
    model_config = {'protected_namespaces': ()}

    text: str = Field(..., max_length=100000, description="转写文本")
    task_id: Optional[str] = None
    model_id: Optional[str] = None


class BatchUploadResponse(BaseModel):
    """批量上传响应"""
    success: bool
    files: list[dict]
    total: int


class BatchTaskItem(BaseModel):
    """批量任务中的单个文件"""
    id: str
    filename: str
    file_path: str
    chunks: Optional[List[str]] = None
    status: str = "pending"  # pending / uploading / transcribing / summarizing / done / error
    transcription: Optional[str] = None
    summary: Optional[str] = None
    error: Optional[str] = None
    record_id: Optional[str] = None
    progress_message: Optional[str] = None


class BatchTask(BaseModel):
    """批量任务"""
    id: str
    items: List[BatchTaskItem]
    status: str = "pending"  # pending / processing / done / partial_error
    created_at: str
    completed_at: Optional[str] = None
    total: int
    completed: int = 0
    failed: int = 0


class BatchTaskResponse(BaseModel):
    """批量任务响应"""
    success: bool
    task: BatchTask


class MindmapNode(BaseModel):
    """思维导图节点"""
    title: str
    children: Optional[List['MindmapNode']] = None


class MindmapRequest(BaseModel):
    """思维导图请求"""
    model_config = {'protected_namespaces': ()}

    text: str = Field(..., max_length=100000, description="转写文本")
    record_id: Optional[str] = None
    model_id: Optional[str] = None


class MindmapResponse(BaseModel):
    """思维导图响应"""
    success: bool
    mindmap: MindmapNode
    record_id: Optional[str] = None


class ExplainRequest(BaseModel):
    """知识点解析请求"""
    model_config = {'protected_namespaces': ()}

    keyword: str = Field(..., max_length=200, description="知识点关键词")
    context: str = Field(..., max_length=100000, description="上下文文本")
    model_id: Optional[str] = None


class ExplainFollowupRequest(BaseModel):
    """知识点追问请求"""
    model_config = {'protected_namespaces': ()}

    keyword: str = Field(..., max_length=200, description="知识点关键词")
    context: str = Field(..., max_length=100000, description="上下文文本")
    history: list[dict] = []  # [{"role": "user"/"assistant", "content": "..."}]
    question: str = Field(..., max_length=2000, description="追问问题")
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
    
    text: str = Field(..., max_length=100000, description="转写文本")
    task_id: Optional[str] = None
    model_id: Optional[str] = None


class ConfigUpdate(BaseModel):
    """配置更新请求"""
    step_api_key: Optional[str] = None
    llm_api_key: Optional[str] = None
    llm_base_url: Optional[str] = None
    llm_model: Optional[str] = None
    denoise_method: Optional[str] = None


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
