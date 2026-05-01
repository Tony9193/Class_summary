"""应用配置管理"""
import os
from pathlib import Path
from dotenv import load_dotenv, set_key

# 项目根目录
BASE_DIR = Path(__file__).parent.parent
ENV_FILE = BASE_DIR / ".env"

# 加载.env文件
load_dotenv(ENV_FILE)

# 数据存储目录
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
HISTORY_DIR = DATA_DIR / "history"

# 确保目录存在
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
HISTORY_DIR.mkdir(parents=True, exist_ok=True)

# 阶跃星辰 ASR 配置
STEP_ASR_URL = "https://api.stepfun.com/v1/audio/asr/sse"


def get_config():
    """获取当前配置"""
    load_dotenv(ENV_FILE, override=True)
    return {
        "step_api_key": os.getenv("STEP_API_KEY", ""),
        "llm_api_key": os.getenv("LLM_API_KEY", ""),
        "llm_base_url": os.getenv("LLM_BASE_URL", "https://api.deepseek.com"),
        "llm_model": os.getenv("LLM_MODEL", "deepseek-v4-flash"),
        "host": os.getenv("HOST", "0.0.0.0"),
        "port": int(os.getenv("PORT", "8000"))
    }


def save_config(config: dict):
    """保存配置到.env文件"""
    # 确保.env文件存在
    if not ENV_FILE.exists():
        ENV_FILE.touch()
    
    # 保存每个配置项
    for key, value in config.items():
        env_key = key.upper()
        set_key(str(ENV_FILE), env_key, str(value))
    
    # 重新加载环境变量
    load_dotenv(ENV_FILE, override=True)


def get_step_api_key():
    """获取阶跃星辰API Key"""
    return os.getenv("STEP_API_KEY", "")


def get_llm_api_key():
    """获取LLM API Key"""
    return os.getenv("LLM_API_KEY", "")


def get_llm_base_url():
    """获取LLM Base URL"""
    return os.getenv("LLM_BASE_URL", "https://api.deepseek.com")


def get_llm_model():
    """获取LLM模型名称"""
    return os.getenv("LLM_MODEL", "deepseek-v4-flash")


# 服务器配置
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# 支持的音频格式
SUPPORTED_AUDIO_FORMATS = {".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac", ".wma", ".webm"}
