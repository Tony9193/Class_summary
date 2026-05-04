"""模型配置管理服务"""
import json
import uuid
import base64
from pathlib import Path
from typing import Optional
from datetime import datetime

from app.config import BASE_DIR


# 模型配置存储文件
MODELS_CONFIG_FILE = BASE_DIR / "data" / "models_config.json"
MODEL_USAGE_FILE = BASE_DIR / "data" / "model_usage.json"

# 简单的API Key编码密钥（混淆用，非安全加密）
_KEY_SHIFT = 7


def _encode_key(key: str) -> str:
    """编码API Key（简单混淆，防止意外泄露）"""
    if not key:
        return ""
    shifted = ''.join(chr(ord(c) + _KEY_SHIFT) for c in key)
    return base64.b64encode(shifted.encode('utf-8')).decode('utf-8')


def _decode_key(encoded: str) -> str:
    """解码API Key"""
    if not encoded:
        return ""
    try:
        decoded = base64.b64decode(encoded.encode('utf-8')).decode('utf-8')
        return ''.join(chr(ord(c) - _KEY_SHIFT) for c in decoded)
    except Exception:
        return encoded  # 兼容未编码的旧数据


class ModelService:
    """模型配置管理服务"""

    def __init__(self):
        self._ensure_files()

    def _ensure_files(self):
        """确保存储文件存在"""
        MODELS_CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)

        if not MODELS_CONFIG_FILE.exists():
            self._save_config({
                "models": {},
                "active_model_id": None
            })

        if not MODEL_USAGE_FILE.exists():
            self._save_usage({})

    def _load_config(self) -> dict:
        """加载模型配置"""
        try:
            with open(MODELS_CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            return {"models": {}, "active_model_id": None}

    def _save_config(self, config: dict):
        """保存模型配置"""
        with open(MODELS_CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)

    def _load_usage(self) -> dict:
        """加载用量统计"""
        try:
            with open(MODEL_USAGE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            return {}

    def _save_usage(self, usage: dict):
        """保存用量统计"""
        with open(MODEL_USAGE_FILE, 'w', encoding='utf-8') as f:
            json.dump(usage, f, ensure_ascii=False, indent=2)

    def _mask_api_key(self, key: str) -> str:
        """掩码API Key"""
        if not key or len(key) <= 12:
            return "****" if key else ""
        return key[:8] + "****" + key[-4:]

    def get_all_models(self) -> list[dict]:
        """获取所有模型配置"""
        config = self._load_config()
        usage = self._load_usage()
        models = []

        for model_id, model_data in config["models"].items():
            usage_data = usage.get(model_id, {})
            models.append({
                "id": model_id,
                "name": model_data["name"],
                "display_name": model_data["display_name"],
                "api_key_masked": self._mask_api_key(model_data["api_key"]),
                "base_url": model_data["base_url"],
                "model": model_data["model"],
                "description": model_data.get("description"),
                "is_default": model_data.get("is_default", False),
                "created_at": model_data.get("created_at", ""),
                "updated_at": model_data.get("updated_at", ""),
                "usage_count": usage_data.get("call_count", 0),
                "total_tokens": usage_data.get("total_tokens", 0)
            })

        return models

    def get_model(self, model_id: str) -> Optional[dict]:
        """获取单个模型配置（包含完整API Key）"""
        config = self._load_config()
        if model_id not in config["models"]:
            return None

        model_data = config["models"][model_id].copy()
        # 解码API Key
        model_data["api_key"] = _decode_key(model_data.get("api_key_encoded", model_data.get("api_key", "")))

        return {
            "id": model_id,
            **model_data
        }

    def get_active_model(self) -> Optional[dict]:
        """获取当前激活的模型配置"""
        config = self._load_config()
        active_id = config.get("active_model_id")

        def _prepare_model(model_id, model_data):
            data = model_data.copy()
            data["api_key"] = _decode_key(data.get("api_key_encoded", data.get("api_key", "")))
            return {"id": model_id, **data}

        if active_id and active_id in config["models"]:
            return _prepare_model(active_id, config["models"][active_id])

        # 如果没有激活的模型，返回默认模型
        for model_id, model_data in config["models"].items():
            if model_data.get("is_default"):
                return _prepare_model(model_id, model_data)

        # 如果没有默认模型，返回第一个
        if config["models"]:
            first_id = next(iter(config["models"]))
            return _prepare_model(first_id, config["models"][first_id])

        return None

    def create_model(self, data: dict) -> dict:
        """创建模型配置"""
        config = self._load_config()

        # 检查名称是否重复
        for existing in config["models"].values():
            if existing["name"] == data["name"]:
                raise ValueError(f"模型名称 '{data['name']}' 已存在")

        model_id = str(uuid.uuid4())[:8]
        now = datetime.now().isoformat()

        # 如果是第一个模型，自动设为默认
        is_default = data.get("is_default", False) or len(config["models"]) == 0

        # 编码API Key存储
        api_key = data["api_key"]

        config["models"][model_id] = {
            "name": data["name"],
            "display_name": data["display_name"],
            "api_key_encoded": _encode_key(api_key),
            "api_key": "",  # 不存储明文
            "base_url": data["base_url"],
            "model": data["model"],
            "description": data.get("description"),
            "is_default": is_default,
            "created_at": now,
            "updated_at": now
        }

        # 如果设为默认，取消其他模型的默认状态
        if is_default:
            for mid in config["models"]:
                if mid != model_id:
                    config["models"][mid]["is_default"] = False

        # 如果没有激活模型，设为激活
        if not config.get("active_model_id"):
            config["active_model_id"] = model_id

        self._save_config(config)

        return {
            "id": model_id,
            **config["models"][model_id],
            "api_key": api_key  # 返回时包含明文
        }

    def update_model(self, model_id: str, data: dict) -> Optional[dict]:
        """更新模型配置"""
        config = self._load_config()

        if model_id not in config["models"]:
            return None

        model = config["models"][model_id]

        # 更新字段
        for key, value in data.items():
            if value is not None:
                if key == "api_key":
                    # 编码API Key
                    model["api_key_encoded"] = _encode_key(value)
                    model["api_key"] = ""
                else:
                    model[key] = value

        model["updated_at"] = datetime.now().isoformat()

        # 如果设为默认，取消其他模型的默认状态
        if data.get("is_default"):
            for mid in config["models"]:
                if mid != model_id:
                    config["models"][mid]["is_default"] = False

        self._save_config(config)

        return {
            "id": model_id,
            **model
        }

    def delete_model(self, model_id: str) -> bool:
        """删除模型配置"""
        config = self._load_config()

        if model_id not in config["models"]:
            return False

        # 删除模型
        del config["models"][model_id]

        # 如果删除的是激活模型，切换到其他模型
        if config.get("active_model_id") == model_id:
            if config["models"]:
                config["active_model_id"] = next(iter(config["models"]))
            else:
                config["active_model_id"] = None

        self._save_config(config)

        # 清除用量统计
        usage = self._load_usage()
        if model_id in usage:
            del usage[model_id]
            self._save_usage(usage)

        return True

    def set_active_model(self, model_id: str) -> bool:
        """设置激活模型"""
        config = self._load_config()

        if model_id not in config["models"]:
            return False

        config["active_model_id"] = model_id
        self._save_config(config)

        return True

    def get_active_model_id(self) -> Optional[str]:
        """获取当前激活模型ID"""
        config = self._load_config()
        return config.get("active_model_id")

    def record_usage(self, model_id: str, prompt_tokens: int = 0, completion_tokens: int = 0):
        """记录模型用量"""
        usage = self._load_usage()

        if model_id not in usage:
            usage[model_id] = {
                "call_count": 0,
                "total_tokens": 0,
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "last_used_at": None
            }

        usage[model_id]["call_count"] += 1
        usage[model_id]["prompt_tokens"] += prompt_tokens
        usage[model_id]["completion_tokens"] += completion_tokens
        usage[model_id]["total_tokens"] += prompt_tokens + completion_tokens
        usage[model_id]["last_used_at"] = datetime.now().isoformat()

        self._save_usage(usage)

    def get_usage_stats(self) -> list[dict]:
        """获取所有模型的用量统计"""
        config = self._load_config()
        usage = self._load_usage()
        stats = []

        for model_id, model_data in config["models"].items():
            usage_data = usage.get(model_id, {})
            stats.append({
                "model_id": model_id,
                "model_name": model_data["name"],
                "display_name": model_data["display_name"],
                "call_count": usage_data.get("call_count", 0),
                "total_tokens": usage_data.get("total_tokens", 0),
                "prompt_tokens": usage_data.get("prompt_tokens", 0),
                "completion_tokens": usage_data.get("completion_tokens", 0),
                "last_used_at": usage_data.get("last_used_at")
            })

        return stats

    def import_from_env(self) -> Optional[dict]:
        """从环境变量导入配置"""
        from app.config import get_config
        config = get_config()

        if not config.get("llm_api_key"):
            return None

        # 检查是否已有相同配置
        models = self.get_all_models()
        for m in models:
            if m["base_url"] == config["llm_base_url"] and m["model"] == config["llm_model"]:
                return None

        return self.create_model({
            "name": config["llm_model"],
            "display_name": f"{config['llm_model']} (从环境变量导入)",
            "api_key": config["llm_api_key"],
            "base_url": config["llm_base_url"],
            "model": config["llm_model"],
            "description": "从.env文件自动导入",
            "is_default": len(models) == 0
        })


# 全局单例
model_service = ModelService()
