"""存储服务"""
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.config import HISTORY_DIR, UPLOADS_DIR
from app.models.schemas import HistoryRecord, HistoryListResponse


class StorageService:
    """本地JSON存储服务"""
    
    def __init__(self):
        self.history_dir = HISTORY_DIR
        self.uploads_dir = UPLOADS_DIR
        self._ensure_dirs()
    
    def _ensure_dirs(self):
        """确保目录存在"""
        self.history_dir.mkdir(parents=True, exist_ok=True)
        self.uploads_dir.mkdir(parents=True, exist_ok=True)
    
    def _get_history_file(self) -> Path:
        """获取历史记录文件路径"""
        return self.history_dir / "records.json"
    
    def _load_records(self) -> list[dict]:
        """加载历史记录"""
        file_path = self._get_history_file()
        if file_path.exists():
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        return []
    
    def _save_records(self, records: list[dict]):
        """保存历史记录"""
        file_path = self._get_history_file()
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(records, f, ensure_ascii=False, indent=2)
    
    def save_upload(self, file_data: bytes, filename: str) -> str:
        """保存上传的文件，返回文件路径"""
        # 生成唯一文件名
        ext = Path(filename).suffix
        unique_name = f"{uuid.uuid4().hex}{ext}"
        file_path = self.uploads_dir / unique_name
        
        with open(file_path, "wb") as f:
            f.write(file_data)
        
        return str(file_path)
    
    def create_record(self, filename: str, transcription: str, 
                      duration: Optional[float] = None) -> HistoryRecord:
        """创建历史记录"""
        record_id = uuid.uuid4().hex[:12]
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        record = HistoryRecord(
            id=record_id,
            filename=filename,
            created_at=now,
            duration=duration,
            transcription=transcription
        )
        
        records = self._load_records()
        records.insert(0, record.model_dump())
        self._save_records(records)
        
        return record
    
    def update_record(self, record_id: str, summary: str = None, 
                      key_points: list[str] = None) -> Optional[HistoryRecord]:
        """更新历史记录（添加总结）"""
        records = self._load_records()
        
        for i, record in enumerate(records):
            if record["id"] == record_id:
                if summary:
                    records[i]["summary"] = summary
                if key_points:
                    records[i]["key_points"] = key_points
                self._save_records(records)
                return HistoryRecord(**records[i])
        
        return None
    
    def get_record(self, record_id: str) -> Optional[HistoryRecord]:
        """获取单条记录"""
        records = self._load_records()
        
        for record in records:
            if record["id"] == record_id:
                return HistoryRecord(**record)
        
        return None
    
    def list_records(self, keyword: str = None, page: int = 1, 
                     page_size: int = 20) -> HistoryListResponse:
        """获取历史记录列表"""
        records = self._load_records()
        
        # 关键词搜索
        if keyword:
            keyword = keyword.lower()
            records = [
                r for r in records
                if keyword in r.get("filename", "").lower() or 
                   keyword in r.get("transcription", "").lower()
            ]
        
        total = len(records)
        
        # 分页
        start = (page - 1) * page_size
        end = start + page_size
        page_records = records[start:end]
        
        return HistoryListResponse(
            total=total,
            records=[HistoryRecord(**r) for r in page_records]
        )
    
    def delete_record(self, record_id: str) -> bool:
        """删除记录"""
        records = self._load_records()
        original_len = len(records)
        records = [r for r in records if r["id"] != record_id]
        
        if len(records) < original_len:
            self._save_records(records)
            return True
        return False
    
    def export_record(self, record_id: str, format: str = "txt") -> Optional[str]:
        """导出记录为文本"""
        record = self.get_record(record_id)
        if not record:
            return None
        
        content = f"课程录音转写记录\n"
        content += f"=" * 50 + "\n"
        content += f"文件名: {record.filename}\n"
        content += f"创建时间: {record.created_at}\n"
        if record.duration:
            content += f"时长: {record.duration:.1f}秒\n"
        content += f"\n【转写内容】\n{record.transcription}\n"
        
        if record.summary:
            content += f"\n{'=' * 50}\n"
            content += f"【AI总结】\n{record.summary}\n"
        
        return content


# 全局单例
storage_service = StorageService()
