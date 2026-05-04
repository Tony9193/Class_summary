"""阶跃星辰 ASR 语音识别服务"""
import httpx
import json
import base64
import subprocess
import tempfile
import asyncio
import logging
from pathlib import Path
from typing import AsyncGenerator, List

from app.config import get_step_api_key, STEP_ASR_URL, UPLOADS_DIR
from app.utils.audio_utils import split_audio

logger = logging.getLogger(__name__)

# ASR 单次请求最大数据量（Base64 后约 20MB，考虑 API 限制）
MAX_BASE64_SIZE = 20 * 1024 * 1024
# API 速率限制（每分钟请求数）
API_RPM_LIMIT = 9  # 留一点余量


class ASRService:
    """ASR语音识别服务"""
    
    def __init__(self):
        self.api_url = STEP_ASR_URL
    
    @property
    def api_key(self):
        """动态获取API Key"""
        return get_step_api_key()
    
    def _convert_for_asr(self, input_path: str) -> tuple[str, str]:
        """
        将音频转换为 ASR 支持的格式
        返回: (转换后的文件路径, 格式类型)
        """
        input_size = Path(input_path).stat().st_size
        suffix = Path(input_path).suffix.lower()
        
        # 如果已经是支持的格式，直接使用
        if suffix in ['.mp3', '.wav', '.ogg']:
            logger.info(f"使用原始格式: {suffix}, 大小: {input_size / 1024 / 1024:.1f}MB")
            return input_path, suffix.lstrip('.')
        
        # M4A/AAC 等格式需要转换，使用较低码率确保更小
        output_path = tempfile.mktemp(suffix=".mp3")
        cmd = [
            "ffmpeg", "-y", "-i", input_path,
            "-ar", "16000",     # 16kHz 采样率
            "-ac", "1",         # 单声道
            "-b:a", "48k",      # 48kbps 码率（更低）
            output_path
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                logger.error(f"ffmpeg 转换失败: {result.stderr}")
                return input_path, suffix.lstrip('.')
            
            output_size = Path(output_path).stat().st_size
            logger.info(f"音频已转换为 MP3 格式: {output_path}")
            logger.info(f"文件大小: {input_size / 1024 / 1024:.1f}MB -> {output_size / 1024 / 1024:.1f}MB")
            return output_path, "mp3"
        except Exception as e:
            logger.error(f"转换异常: {e}")
            return input_path, suffix.lstrip('.')
    
    def _split_audio(self, input_path: str, chunk_duration: int = 300) -> List[str]:
        """
        切割音频文件为多个小文件（使用audio_utils.split_audio）
        chunk_duration: 每段时长（秒），默认5分钟
        """
        try:
            # 根据文件大小动态调整段时长
            file_size = Path(input_path).stat().st_size
            if file_size > MAX_BASE64_SIZE * 3:  # Base64 会膨胀约 1/3
                from app.utils.audio_utils import get_audio_duration
                total_duration = get_audio_duration(input_path)
                if total_duration > 0:
                    chunk_duration = int((MAX_BASE64_SIZE * 3 / file_size) * total_duration * 0.8)
                    chunk_duration = max(chunk_duration, 60)  # 最少60秒
            
            # 使用audio_utils.split_audio，reencode=True转换为16kHz单声道
            chunk_paths = split_audio(input_path, chunk_duration, reencode=True)
            
            if len(chunk_paths) > 1:
                logger.info(f"音频切分为 {len(chunk_paths)} 段, 每段约 {chunk_duration}秒")
                for i, path in enumerate(chunk_paths):
                    size_mb = Path(path).stat().st_size / 1024 / 1024
                    logger.info(f"切段 {i+1}: {path} ({size_mb:.1f}MB)")
            
            return chunk_paths
            
        except Exception as e:
            logger.error(f"音频切割失败: {e}")
            return [input_path]
    
    async def transcribe_file(self, file_path: str) -> AsyncGenerator[str, None]:
        """转写音频文件，返回SSE流式结果"""
        audio_path = Path(file_path)
        if not audio_path.exists():
            raise FileNotFoundError(f"音频文件不存在: {file_path}")
        
        # 将音频转换为 ASR 支持的格式
        logger.info(f"原始音频: {file_path}")
        converted_path, audio_format = self._convert_for_asr(file_path)
        is_converted = converted_path != file_path
        
        # 检查文件大小，如果太大则切割
        converted_size = Path(converted_path).stat().st_size
        chunk_paths = []
        
        # Base64 会膨胀约 33%，限制单次请求 15MB（Base64 后约 20MB）
        if converted_size > 15 * 1024 * 1024:
            logger.info(f"文件过大 ({converted_size / 1024 / 1024:.1f}MB)，自动切割")
            chunk_paths = self._split_audio(converted_path)
        else:
            chunk_paths = [converted_path]
        
        try:
            total_chunks = len(chunk_paths)
            full_text = ""
            
            for i, chunk_path in enumerate(chunk_paths):
                if total_chunks > 1:
                    logger.info(f"转写第 {i+1}/{total_chunks} 段: {chunk_path}")
                
                # 读取并编码
                with open(chunk_path, "rb") as f:
                    audio_data = base64.b64encode(f.read()).decode("utf-8")
                
                # 构建请求
                format_config = {"type": audio_format}
                if audio_format in ["pcm", "wav"]:
                    format_config.update({
                        "codec": "pcm_s16le",
                        "rate": 16000,
                        "bits": 16,
                        "channel": 1
                    })
                
                payload = {
                    "audio": {
                        "data": audio_data,
                        "input": {
                            "transcription": {
                                "model": "stepaudio-2.5-asr",
                                "language": "zh",
                                "enable_itn": True
                            },
                            "format": format_config
                        }
                    }
                }
                
                headers = {
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "Accept": "text/event-stream"
                }
                
                logger.info(f"发送请求到: {self.api_url}")
                logger.info(f"音频格式: {audio_format}, Base64大小: {len(audio_data) / 1024 / 1024:.1f}MB")
                
                # 发送SSE请求
                async with httpx.AsyncClient(timeout=300.0) as client:
                    async with client.stream("POST", self.api_url, json=payload, headers=headers) as response:
                        if response.status_code != 200:
                            error_text = ""
                            async for chunk in response.aiter_text():
                                error_text += chunk
                            logger.error(f"API错误响应: {error_text}")
                            raise Exception(f"ASR API错误: {response.status_code} - {error_text}")
                        
                        chunk_text = ""
                        async for line in response.aiter_lines():
                            if line.startswith("data: "):
                                data_str = line[6:]
                                try:
                                    data = json.loads(data_str)
                                    logger.debug(f"收到数据: type={data.get('type')}")
                                    
                                    if data.get("type") == "transcript.text.delta":
                                        delta = data.get("delta", "")
                                        chunk_text += delta
                                        full_text += delta
                                        yield delta
                                    elif data.get("type") == "transcript.text.done":
                                        logger.info(f"第 {i+1} 段转写完成，文本长度: {len(chunk_text)}")
                                        break
                                    elif data.get("type") == "error":
                                        error_msg = data.get('message', '未知错误')
                                        logger.error(f"API返回错误: {error_msg}")
                                        raise Exception(f"ASR错误: {error_msg}")
                                except json.JSONDecodeError:
                                    logger.warning(f"JSON解析失败: {data_str}")
                                    continue
                
                # 多段之间添加分隔和延迟（避免 API 限速）
                if total_chunks > 1 and i < total_chunks - 1:
                    yield "\n\n"
                    full_text += "\n\n"
                    # 计算延迟时间，确保不超过 API 速率限制
                    delay = 7  # 每段间隔 7 秒（约 9 RPM）
                    logger.info(f"等待 {delay} 秒避免限速...")
                    await asyncio.sleep(delay)
            
            logger.info(f"全部转写完成，总文本长度: {len(full_text)}")
            yield ""  # 结束信号
            
        finally:
            # 清理临时文件
            if is_converted and Path(converted_path).exists():
                try:
                    Path(converted_path).unlink()
                    logger.info(f"已清理临时文件: {converted_path}")
                except Exception as e:
                    logger.error(f"清理临时文件失败: {e}")
            
            # 清理切割的临时文件
            for chunk_path in chunk_paths:
                if chunk_path != converted_path and Path(chunk_path).exists():
                    try:
                        Path(chunk_path).unlink()
                    except Exception:
                        pass
    
    async def transcribe_file_sync(self, file_path: str) -> str:
        """同步转写，返回完整文本"""
        full_text = ""
        async for delta in self.transcribe_file(file_path):
            full_text += delta
        return full_text
    
    async def transcribe_base64(self, audio_data: str, audio_format: str = "pcm") -> str:
        """转写Base64编码的音频数据"""
        payload = {
            "audio": {
                "data": audio_data,
                "input": {
                    "transcription": {
                        "model": "stepaudio-2.5-asr",
                        "language": "zh",
                        "enable_itn": True
                    },
                    "format": {
                        "type": audio_format,
                        "codec": "pcm_s16le",
                        "rate": 16000,
                        "bits": 16,
                        "channel": 1
                    }
                }
            }
        }
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "text/event-stream"
        }
        
        full_text = ""
        async with httpx.AsyncClient(timeout=300.0) as client:
            async with client.stream("POST", self.api_url, json=payload, headers=headers) as response:
                if response.status_code != 200:
                    raise Exception(f"ASR API错误: {response.status_code}")
                
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]
                        try:
                            data = json.loads(data_str)
                            if data.get("type") == "transcript.text.delta":
                                full_text += data.get("delta", "")
                            elif data.get("type") == "transcript.text.done":
                                return full_text
                        except json.JSONDecodeError:
                            continue
        
        return full_text


# 全局单例
asr_service = ASRService()
