# 课程录音转文字 + AI智能总结

[![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.109+-green.svg)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

将课程录音快速转化为结构清晰的文字笔记和知识要点，大幅提升学习效率。

## ✨ 功能特性

- 🎤 **音频转写** - 支持上传音频文件或实时录音，通过ASR语音识别转写为文字
- 🤖 **AI智能总结** - 由AI大模型生成结构化课程总结、知识点提取
- 📝 **历史记录** - 转写记录管理、搜索、导出
- 💻 **双模式使用** - 支持CLI命令行和Web UI两种使用方式
- 🎯 **多格式支持** - 支持 MP3、WAV、OGG、M4A、FLAC、AAC、WMA、WebM

## 🛠️ 技术栈

| 组件 | 技术 |
|------|------|
| 后端框架 | Python + FastAPI |
| ASR语音识别 | 阶跃星辰 StepAudio 2.5 ASR |
| AI总结 | OpenAI兼容接口（DeepSeek、小米MiMo等） |
| 前端 | HTML + Tailwind CSS |
| 数据存储 | JSON文件 |

## 📦 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/your-username/class-summary.git
cd class-summary
```

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

### 3. 配置API Key

**方式一：CLI配置向导（推荐）**

```bash
python cli.py config setup
```

**方式二：CLI命令配置**

```bash
# 查看当前配置
python cli.py config show

# 设置阶跃星辰 API Key
python cli.py config set --step-key sk-xxxxx

# 设置AI模型配置
python cli.py config set --llm-key sk-xxxxx --llm-url https://api.deepseek.com --llm-model deepseek-v4-flash
```

**方式三：Web界面配置**

启动服务后，点击右上角 ⚙️ 设置按钮进行配置。

**方式四：手动编辑 .env 文件**

```bash
cp .env.example .env
# 编辑 .env 文件填入配置
```

### 4. 启动Web服务

```bash
python run.py
```

访问 http://localhost:8000 即可使用Web界面。

### 5. 使用CLI工具

```bash
# 转写音频文件
python cli.py transcribe audio.mp3

# 转写并生成总结
python cli.py transcribe audio.mp3 --summary

# 查看历史记录
python cli.py history

# 启动Web服务
python cli.py serve
```

## 📖 CLI命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `config setup` | 交互式配置向导 | `python cli.py config setup` |
| `config show` | 显示当前配置 | `python cli.py config show` |
| `config set` | 设置配置项 | `python cli.py config set --step-key sk-xxx` |
| `transcribe` | 转写音频文件 | `python cli.py transcribe audio.mp3` |
| `summarize` | 生成文本总结 | `python cli.py summarize "文本内容"` |
| `history` | 查看历史记录 | `python cli.py history -k "关键词"` |
| `show` | 查看记录详情 | `python cli.py show <record_id>` |
| `export` | 导出记录 | `python cli.py export <record_id>` |
| `serve` | 启动Web服务 | `python cli.py serve -p 8000` |

## 🔌 API接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/audio/upload` | POST | 上传音频文件 |
| `/api/asr/transcribe` | POST | ASR转写 |
| `/api/asr/transcribe/stream` | POST | ASR转写（SSE流式） |
| `/api/summary/generate` | POST | 生成AI总结 |
| `/api/summary/generate/stream` | POST | 流式生成AI总结 |
| `/api/history/list` | GET | 获取历史记录列表 |
| `/api/history/{id}` | GET/DELETE | 查询/删除记录 |
| `/api/history/export/{id}` | GET | 导出记录 |

## 📁 目录结构

```
Class_summury/
├── app/                          # 后端应用
│   ├── main.py                   # FastAPI主入口
│   ├── config.py                 # 配置管理
│   ├── routers/                  # API路由
│   ├── services/                 # 业务逻辑
│   └── models/                   # 数据模型
├── static/                       # 前端静态文件
│   ├── index.html                # 主页面
│   ├── css/style.css             # 样式
│   └── js/                       # JavaScript
├── data/                         # 数据存储（已gitignore）
│   ├── uploads/                  # 上传的音频
│   └── history/                  # 历史记录
├── cli.py                        # CLI入口
├── run.py                        # 启动脚本
├── requirements.txt              # 依赖
├── .env.example                  # 环境变量示例
└── .gitignore                    # Git忽略配置
```

## 🔑 API Key获取

| 服务 | 获取地址 |
|------|----------|
| 阶跃星辰 | https://platform.stepfun.com |
| DeepSeek | https://platform.deepseek.com |
| 小米MiMo | https://platform.xiaomimimo.com |

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建你的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交你的更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开一个 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

## 🙏 致谢

- [FastAPI](https://fastapi.tiangolo.com/)
- [阶跃星辰](https://platform.stepfun.com)
- [Tailwind CSS](https://tailwindcss.com/)
