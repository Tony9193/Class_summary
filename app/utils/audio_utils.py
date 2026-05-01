"""音频预处理工具（降噪+切割）"""
import subprocess
import os
from pathlib import Path
from typing import List

from app.config import UPLOADS_DIR

# ASR单次上传最大限制 (40MB，留一些余量)
MAX_CHUNK_SIZE = 38 * 1024 * 1024  # 38MB


def get_audio_duration(file_path: str) -> float:
    """获取音频时长（秒）"""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", 
             "-of", "default=noprint_wrappers=1:nokey=1", file_path],
            capture_output=True, text=True
        )
        return float(result.stdout.strip())
    except Exception:
        return 0.0


def get_audio_size(file_path: str) -> int:
    """获取音频文件大小（字节）"""
    return os.path.getsize(file_path)


def denoise_audio(input_path: str, output_path: str) -> str:
    """
    音频降噪处理
    使用ffmpeg的afftdn滤波器进行降噪
    """
    try:
        # 使用afftdn降噪滤波器
        cmd = [
            "ffmpeg", "-y", "-i", input_path,
            "-af", "afftdn=nf=-25",  # 降噪强度，nf越小降噪越强
            "-ar", "16000",  # 统一采样率
            "-ac", "1",      # 单声道
            output_path
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        return output_path
    except subprocess.CalledProcessError as e:
        raise Exception(f"降噪处理失败: {e.stderr.decode()}")


def split_audio(input_path: str, chunk_duration: int = 300) -> List[str]:
    """
    切割音频文件
    chunk_duration: 每段时长（秒），默认5分钟
    返回切割后的文件路径列表
    """
    try:
        # 获取音频总时长
        total_duration = get_audio_duration(input_path)
        if total_duration <= 0:
            raise Exception("无法获取音频时长")
        
        # 计算需要切割的段数
        num_chunks = int(total_duration / chunk_duration) + 1
        
        # 如果只有一段且大小不超限，直接返回
        if num_chunks <= 1 and get_audio_size(input_path) <= MAX_CHUNK_SIZE:
            return [input_path]
        
        # 根据文件大小动态调整段时长
        file_size = get_audio_size(input_path)
        if file_size > MAX_CHUNK_SIZE:
            # 计算每段应该的时长，使得每段大小不超过限制
            chunk_duration = int((MAX_CHUNK_SIZE / file_size) * total_duration * 0.9)
            chunk_duration = max(chunk_duration, 60)  # 最少60秒
            num_chunks = int(total_duration / chunk_duration) + 1
        
        chunk_paths = []
        base_name = Path(input_path).stem
        ext = Path(input_path).suffix
        
        for i in range(num_chunks):
            start_time = i * chunk_duration
            chunk_path = str(UPLOADS_DIR / f"{base_name}_chunk{i:03d}{ext}")
            
            cmd = [
                "ffmpeg", "-y", "-i", input_path,
                "-ss", str(start_time),
                "-t", str(chunk_duration),
                "-c", "copy",  # 快速切割，不重新编码
                chunk_path
            ]
            
            result = subprocess.run(cmd, capture_output=True)
            if result.returncode == 0 and os.path.exists(chunk_path) and os.path.getsize(chunk_path) > 0:
                chunk_paths.append(chunk_path)
        
        return chunk_paths if chunk_paths else [input_path]
        
    except Exception as e:
        raise Exception(f"音频切割失败: {str(e)}")


def preprocess_audio(input_path: str, enable_denoise: bool = False, 
                     enable_split: bool = True) -> dict:
    """
    音频预处理主函数
    
    Args:
        input_path: 输入音频路径
        enable_denoise: 是否启用降噪
        enable_split: 是否启用大文件切割
    
    Returns:
        {
            "chunks": [文件路径列表],
            "original_duration": 原始时长,
            "denoised": 是否进行了降噪,
            "split": 是否进行了切割
        }
    """
    result = {
        "chunks": [],
        "original_duration": get_audio_duration(input_path),
        "denoised": False,
        "split": False
    }
    
    current_path = input_path
    
    # 1. 降噪处理
    if enable_denoise:
        denoised_path = str(UPLOADS_DIR / f"denoised_{Path(input_path).name}")
        current_path = denoise_audio(input_path, denoised_path)
        result["denoised"] = True
    
    # 2. 切割处理（如果文件超过限制）
    file_size = get_audio_size(current_path)
    if enable_split and file_size > MAX_CHUNK_SIZE:
        chunks = split_audio(current_path)
        result["chunks"] = chunks
        result["split"] = True
    else:
        result["chunks"] = [current_path]
    
    return result
