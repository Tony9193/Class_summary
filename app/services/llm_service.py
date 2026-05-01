"""AI总结服务 (OpenAI兼容接口)"""
from openai import AsyncOpenAI
from typing import AsyncGenerator

from app.config import get_llm_api_key, get_llm_base_url, get_llm_model


class LLMService:
    """AI总结服务"""
    
    def _get_client(self) -> AsyncOpenAI:
        """获取客户端（每次创建以使用最新配置）"""
        return AsyncOpenAI(
            api_key=get_llm_api_key(),
            base_url=get_llm_base_url()
        )
    
    @property
    def model(self) -> str:
        """获取模型名称"""
        return get_llm_model()
    
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

## 重点内容
[这里列出课程中的普通知识点内容]

## 疑问点
[这里列出可能需要进一步理解的内容]
"""
    
    async def generate_summary(self, text: str) -> dict:
        """生成课程总结"""
        prompt = self._build_summary_prompt(text)
        client = self._get_client()
        
        response = await client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": "你是一个专业的课程笔记整理助手，擅长从录音转写文本中提取关键信息并生成结构化总结。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=2000
        )
        
        content = response.choices[0].message.content
        
        # 解析关键知识点
        key_points = []
        if "关键知识点" in content:
            kp_section = content.split("关键知识点")[1].split("##")[0] if "##" in content.split("关键知识点")[1] else content.split("关键知识点")[1]
            for line in kp_section.strip().split("\n"):
                line = line.strip()
                if line.startswith("-") or line.startswith("*"):
                    point = line.lstrip("-* ").strip()
                    if point:
                        key_points.append(point)
        
        return {
            "summary": content,
            "key_points": key_points[:5]  # 最多5个关键点
        }
    
    async def generate_summary_stream(self, text: str) -> AsyncGenerator[str, None]:
        """流式生成课程总结"""
        prompt = self._build_summary_prompt(text)
        client = self._get_client()
        
        stream = await client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": "你是一个专业的课程笔记整理助手，擅长从录音转写文本中提取关键信息并生成结构化总结。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=2000,
            stream=True
        )
        
        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    
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
    
    async def polish_text(self, text: str) -> str:
        """优化口语化文本"""
        prompt = self._build_polish_prompt(text)
        client = self._get_client()
        
        response = await client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": "你是一个专业的文本优化助手，擅长将口语化内容转换为规范的书面语，同时确保信息完整不丢失。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=4000
        )
        
        return response.choices[0].message.content
    
    async def polish_text_stream(self, text: str) -> AsyncGenerator[str, None]:
        """流式优化口语化文本"""
        prompt = self._build_polish_prompt(text)
        client = self._get_client()
        
        stream = await client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": "你是一个专业的文本优化助手，擅长将口语化内容转换为规范的书面语，同时确保信息完整不丢失。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=4000,
            stream=True
        )
        
        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content


# 全局单例
llm_service = LLMService()
