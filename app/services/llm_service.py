"""AI总结服务 (OpenAI兼容接口)"""
from openai import AsyncOpenAI
from typing import AsyncGenerator, Optional

from app.config import get_llm_api_key, get_llm_base_url, get_llm_model


class LLMService:
    """AI总结服务"""

    def __init__(self):
        self._clients = {}  # model_id -> client
        self._client_configs = {}  # model_id -> config

    def _get_model_config(self, model_id: Optional[str] = None) -> dict:
        """获取模型配置"""
        # 确保model_id有效（非空字符串）
        if model_id and model_id.strip():
            from app.services.model_service import model_service
            model = model_service.get_model(model_id)
            if model:
                return {
                    "api_key": model["api_key"],
                    "base_url": model["base_url"],
                    "model": model["model"],
                    "model_id": model_id
                }

        # 尝试获取当前激活的模型
        from app.services.model_service import model_service
        active_model = model_service.get_active_model()
        if active_model:
            return {
                "api_key": active_model["api_key"],
                "base_url": active_model["base_url"],
                "model": active_model["model"],
                "model_id": active_model["id"]
            }

        # 回退到环境变量配置
        return {
            "api_key": get_llm_api_key(),
            "base_url": get_llm_base_url(),
            "model": get_llm_model(),
            "model_id": None
        }

    def _get_client(self, model_id: Optional[str] = None) -> tuple[AsyncOpenAI, str, Optional[str]]:
        """获取客户端（带缓存）"""
        config = self._get_model_config(model_id)
        cache_key = f"{config['api_key']}:{config['base_url']}"

        # 如果配置变化或客户端不存在，重新创建
        if cache_key not in self._clients or self._client_configs.get(cache_key) != config:
            self._clients[cache_key] = AsyncOpenAI(
                api_key=config["api_key"],
                base_url=config["base_url"]
            )
            self._client_configs[cache_key] = config

        return self._clients[cache_key], config["model"], config["model_id"]

    def _record_usage(self, model_id: Optional[str], response):
        """记录用量统计"""
        if model_id and response and hasattr(response, 'usage') and response.usage:
            from app.services.model_service import model_service
            model_service.record_usage(
                model_id,
                prompt_tokens=response.usage.prompt_tokens or 0,
                completion_tokens=response.usage.completion_tokens or 0
            )

    def _build_summary_prompt(self, text: str) -> str:
        """构建课程总结Prompt"""
        return f"""你是一个专业的课程笔记整理助手。请根据以下课程录音转写文本，生成结构化的课程总结。

要求：
1. 生成简洁清晰的课程总结
2. 提取尽可能多个的语音里存在的知识点
3. 使用Markdown格式输出
4. 关键知识点或者被强调的知识点要突出显示

课程转写文本：
{text}

请按以下格式输出：

## 课程总结
[这里写课程的整体总结]

## 关键知识点
- 知识点1：[描述]
- 知识点2：[描述]
- 知识点3：[描述]
...

## 重点内容
[这里列出课程中强调的重点内容]

## 补充内容
[这里列出课程中的普通知识点内容]

## 疑问点
[这里列出可能需要进一步理解的内容]
"""

    async def generate_summary(self, text: str, model_id: Optional[str] = None) -> dict:
        """生成课程总结"""
        prompt = self._build_summary_prompt(text)
        client, model, mid = self._get_client(model_id)

        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "你是一个专业的课程笔记整理助手，擅长从录音转写文本中提取关键信息并生成结构化总结。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=2000
        )

        # 记录用量
        self._record_usage(mid, response)

        # 检查响应是否有效
        if not response or not response.choices or len(response.choices) == 0:
            raise Exception("AI模型返回了空响应，请检查模型配置")

        content = response.choices[0].message.content
        if not content:
            raise Exception("AI模型返回了空内容，请重试")

        # 使用正则表达式解析关键知识点（更健壮）
        key_points = []
        import re
        # 匹配"关键知识点"标题后的内容，直到下一个##标题或文本结束
        kp_match = re.search(r'#+\s*关键知识点\s*\n([\s\S]*?)(?=\n##|\Z)', content)
        if kp_match:
            kp_section = kp_match.group(1)
            for line in kp_section.strip().split("\n"):
                line = line.strip()
                # 支持 - 和 * 开头的列表项
                if re.match(r'^[-*]\s+', line):
                    point = re.sub(r'^[-*]\s+', '', line).strip()
                    if point:
                        key_points.append(point)

        return {
            "summary": content,
            "key_points": key_points[:5]  # 最多5个关键点
        }

    async def generate_summary_stream(self, text: str, model_id: Optional[str] = None) -> AsyncGenerator[str, None]:
        """流式生成课程总结"""
        prompt = self._build_summary_prompt(text)
        client, model, mid = self._get_client(model_id)

        stream = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "你是一个专业的课程笔记整理助手，擅长从录音转写文本中提取关键信息并生成结构化总结。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=2000,
            stream=True
        )

        async for chunk in stream:
            # 安全检查：确保chunk和choices有效
            if not chunk or not chunk.choices or len(chunk.choices) == 0:
                continue
            if chunk.choices[0].delta and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

        # 流式完成后记录用量（近似值）
        if mid:
            from app.services.model_service import model_service
            model_service.record_usage(mid, prompt_tokens=500, completion_tokens=1500)

    def _build_polish_prompt(self, text: str) -> str:
        """构建口语优化Prompt"""
        return f"""你是一个专业的文本优化助手。请将以下课堂录音转写的口语化文本优化为规范的书面语。

优化规则：
1. 去除所有语气词和口头禅（如：嗯、啊、呃、那个、就是说、然后、对吧、是不是、这个、反正、其实、我觉得吧、你知道吗等）
2. 去除重复表达和冗余内容
3. 将口语化表达转换为规范的书面语
4. 保持原意不变，不遗漏任何知识点和信息
5. 保持句子的完整性，使表达清晰流畅
6. 如果原文有明显的语序混乱，适当调整使其通顺
7. 不要添加原文中没有的内容
8. 不要改变原文的专业术语和核心概念

重要提示：
- 信息完整性是最重要的，绝对不能丢失任何知识点
- 输出时保留原文的段落结构（如果有明显分段的话）
- 直接输出优化后的文本，不要添加任何解释说明

原始口语化文本：
{text}

优化后的书面文本："""

    async def polish_text(self, text: str, model_id: Optional[str] = None) -> str:
        """优化口语化文本"""
        prompt = self._build_polish_prompt(text)
        client, model, mid = self._get_client(model_id)

        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "你是一个专业的文本优化助手，擅长将口语化内容转换为规范的书面语，同时确保信息完整不丢失。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=4000
        )

        # 记录用量
        self._record_usage(mid, response)

        # 检查响应是否有效
        if not response or not response.choices or len(response.choices) == 0:
            raise Exception("AI模型返回了空响应，请检查模型配置")

        content = response.choices[0].message.content
        if not content:
            raise Exception("AI模型返回了空内容，请重试")

        return content

    async def polish_text_stream(self, text: str, model_id: Optional[str] = None) -> AsyncGenerator[str, None]:
        """流式优化口语化文本"""
        prompt = self._build_polish_prompt(text)
        client, model, mid = self._get_client(model_id)

        stream = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "你是一个专业的文本优化助手，擅长将口语化内容转换为规范的书面语，同时确保信息完整不丢失。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=4000,
            stream=True
        )

        async for chunk in stream:
            # 安全检查：确保chunk和choices有效
            if not chunk or not chunk.choices or len(chunk.choices) == 0:
                continue
            if chunk.choices[0].delta and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

        # 流式完成后记录用量（近似值）
        if mid:
            from app.services.model_service import model_service
            model_service.record_usage(mid, prompt_tokens=500, completion_tokens=1500)


# 全局单例
llm_service = LLMService()
