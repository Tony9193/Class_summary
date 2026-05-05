"""批量处理服务"""
import asyncio
import uuid
import logging
from datetime import datetime
from typing import Optional, List

from app.models.schemas import BatchTask, BatchTaskItem
from app.services.asr_service import asr_service
from app.services.llm_service import llm_service
from app.services.storage_service import storage_service

logger = logging.getLogger(__name__)

# 并发控制：最多同时处理3个文件
MAX_CONCURRENT_FILES = 3


class BatchService:
    """批量处理服务"""

    def __init__(self):
        self.tasks: dict[str, BatchTask] = {}
        self._running = False
        self._current_task_id: Optional[str] = None
        self._semaphore = asyncio.Semaphore(MAX_CONCURRENT_FILES)

    async def _process_single_item(self, item: BatchTaskItem, auto_summary: bool):
        """处理单个文件（受信号量控制）"""
        async with self._semaphore:
            try:
                # 更新状态
                item.status = "transcribing"
                item.progress_message = "正在转写..."
                logger.info(f"[批量] 开始转写: {item.filename}")

                # 转写
                file_paths = item.chunks if item.chunks else [item.file_path]
                full_text = ""

                for i, chunk_path in enumerate(file_paths):
                    chunk_text = await asr_service.transcribe_file_sync(chunk_path)
                    if len(file_paths) > 1 and i > 0:
                        full_text += "\n\n"
                    full_text += chunk_text

                item.transcription = full_text
                logger.info(f"[批量] 转写完成: {item.filename}, 长度: {len(full_text)}")

                # 保存到历史记录
                record = storage_service.create_record(item.filename, full_text)
                item.record_id = record.id

                # 自动生成总结
                if auto_summary and full_text.strip():
                    item.status = "summarizing"
                    item.progress_message = "正在生成总结..."
                    try:
                        result = await llm_service.generate_summary(full_text)
                        item.summary = result["summary"]
                        storage_service.update_record(
                            record.id,
                            summary=result["summary"],
                            key_points=result.get("key_points")
                        )
                        logger.info(f"[批量] 总结完成: {item.filename}")
                    except Exception as e:
                        logger.warning(f"[批量] 生成总结失败: {item.filename}, {e}")
                        item.summary = None

                item.status = "done"
                item.progress_message = "完成"
                return True

            except Exception as e:
                logger.error(f"[批量] 处理失败: {item.filename}, {e}")
                item.status = "error"
                item.error = str(e)
                item.progress_message = f"错误: {str(e)}"
                return False

    def create_task(self, files: list[dict], auto_summary: bool = False) -> BatchTask:
        """
        创建批量任务
        files: [{"filename": "xxx.mp3", "file_path": "...", "chunks": [...]}]
        """
        task_id = uuid.uuid4().hex[:12]
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        items = []
        for f in files:
            item = BatchTaskItem(
                id=uuid.uuid4().hex[:8],
                filename=f["filename"],
                file_path=f["file_path"],
                chunks=f.get("chunks"),
                status="pending"
            )
            items.append(item)

        task = BatchTask(
            id=task_id,
            items=items,
            status="pending",
            created_at=now,
            total=len(items)
        )

        self.tasks[task_id] = task

        # 异步启动处理
        asyncio.create_task(self._process_task(task_id, auto_summary))

        return task

    def get_task(self, task_id: str) -> Optional[BatchTask]:
        """获取批量任务状态"""
        return self.tasks.get(task_id)

    def list_tasks(self) -> list[BatchTask]:
        """获取所有批量任务"""
        return list(self.tasks.values())

    async def _process_task(self, task_id: str, auto_summary: bool = False):
        """处理批量任务（并发执行）"""
        task = self.tasks.get(task_id)
        if not task:
            return

        task.status = "processing"
        self._current_task_id = task_id

        # 并发处理所有文件
        tasks = [
            self._process_single_item(item, auto_summary)
            for item in task.items
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # 统计结果
        for result in results:
            if isinstance(result, Exception):
                task.failed += 1
            elif result:
                task.completed += 1
            else:
                task.failed += 1

        # 更新任务状态
        if task.failed == 0:
            task.status = "done"
        elif task.completed > 0:
            task.status = "partial_error"
        else:
            task.status = "error"

        task.completed_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self._current_task_id = None
        logger.info(f"[批量] 任务完成: {task_id}, 成功: {task.completed}, 失败: {task.failed}")


# 全局单例
batch_service = BatchService()
