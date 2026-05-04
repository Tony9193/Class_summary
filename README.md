# 课程录音转文字 + AI智能总结

[![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.109+-green.svg)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> 将课程录音快速转化为结构清晰的文字笔记和知识要点，大幅提升学习效率。
<img width="2555" height="1232" alt="图片" src="https://github.com/user-attachments/assets/fa2530bb-f96a-429a-85fd-fde9991c8fe6" />

## ✨ 功能特性

### 核心功能
- 🎤 **音频转写** - 支持上传音频文件或实时录音，通过ASR语音识别转写为文字
- 🤖 **AI智能总结** - 由AI大模型生成结构化课程总结、知识点提取
- ✨ **口语优化** - AI自动去除语气词，将口语化内容转为规范书面语
- 🔊 **音频降噪** - 支持课堂录音降噪处理，提升转写准确率
- 📝 **历史记录** - 转写记录管理、搜索、导出
<img width="1108" height="944" alt="图片" src="https://github.com/user-attachments/assets/b0e50085-85e2-43d5-9736-eea655d41604" />

### 模型管理（新功能）
- 🤖 **多模型配置** - 支持配置多个AI模型，灵活切换
- 🔄 **模型切换** - 顶部栏下拉框快速切换当前使用的模型
- 📊 **用量统计** - 记录每个模型的调用次数和Token消耗
- 🔒 **安全存储** - API Key加密存储，防止意外泄露
- 🧪 **连接测试** - 一键测试模型配置是否正确
<img width="760" height="639" alt="图片" src="https://github.com/user-attachments/assets/4cdef036-4908-4589-94d1-8874423b2822" />

### 录音功能（新功能）
- 📈 **实时波形图** - 录音时显示实时音频波形和音量指示
- ⏱️ **录音计时** - 实时显示录音时长
<img width="889" height="463" alt="图片" src="https://github.com/user-attachments/assets/d90c638a-6035-4742-bc38-ca8f884a9396" />

### 界面特色
- 🎨 **Material Design 3** - 现代化 Material Design 风格界面
- 🌙 **夜间模式** - 护眼深色主题，保护视力
- 🎯 **多主题色** - 7种主题颜色可选（紫/蓝/绿/橙/红/青/粉）
- 💾 **缓存管理** - 可视化管理音频文件和历史记录缓存
<img width="736" height="774" alt="图片" src="https://github.com/user-attachments/assets/fa454884-c5c4-40e3-8258-cd4e66a9c0ba" />

### 其他特性
- 💻 **双模式使用** - 支持CLI命令行和Web UI两种使用方式
- 🎯 **多格式支持** - MP3、WAV、OGG、M4A、FLAC、AAC、WMA、WebM
- 📱 **响应式设计** - 适配不同屏幕尺寸

## 🛠️ 技术栈

| 组件 | 技术 |
|------|------|
| 后端框架 | Python + FastAPI |
| ASR语音识别 | 阶跃星辰 StepAudio 2.5 ASR |
| AI总结 | OpenAI兼容接口（DeepSeek、小米MiMo等） |
| 前端 | HTML + CSS + JavaScript |
| UI风格 | Material Design 3 |
| 数据存储 | JSON文件（API Key加密存储） |

## 📦 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/Tony9193/class-summary.git
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
```

**方式三：Web界面配置**

启动服务后，点击右上角「设置」按钮进行配置：
- **ASR配置**：配置阶跃星辰API Key（语音识别专用）
- **AI模型配置**：添加和管理AI模型（用于总结、优化等功能）

**方式四：手动编辑 .env 文件**

```bash
cp .env.example .env
# 编辑 .env 文件填入配置
```

### 4. 添加AI模型

**Web界面添加（推荐）：**
1. 点击右上角「设置」按钮
2. 在「AI模型配置」区域点击「添加模型」
3. 填写模型信息（名称、API Key、Base URL、模型名称）
4. 点击「测试连接」验证配置
5. 保存配置

**CLI添加：**

```bash
# 添加模型
python cli.py model add

# 从环境变量导入已有配置
python cli.py model import-env

# 列出所有模型
python cli.py model list
```

### 5. 启动Web服务

```bash
python run.py
```

访问 http://localhost:8000 即可使用Web界面。

### 6. 使用CLI工具

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

### 基础命令

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

### 模型管理命令（新功能）

| 命令 | 说明 | 示例 |
|------|------|------|
| `model list` | 列出所有模型配置 | `python cli.py model list` |
| `model add` | 添加模型配置 | `python cli.py model add` |
| `model edit` | 编辑模型配置 | `python cli.py model edit <id> --api-key sk-xxx` |
| `model delete` | 删除模型配置 | `python cli.py model delete <id>` |
| `model use` | 切换当前使用的模型 | `python cli.py model use <id>` |
| `model test` | 测试模型连接 | `python cli.py model test <id>` |
| `model import-env` | 从环境变量导入 | `python cli.py model import-env` |
| `model usage` | 查看用量统计 | `python cli.py model usage` |

## 🔌 API接口

### 基础接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/audio/upload` | POST | 上传音频文件 |
| `/api/asr/transcribe` | POST | ASR转写 |
| `/api/asr/transcribe/stream` | POST | ASR转写（SSE流式） |
| `/api/summary/generate` | POST | 生成AI总结 |
| `/api/summary/generate/stream` | POST | 流式生成AI总结 |
| `/api/polish` | POST | 口语优化 |
| `/api/polish/stream` | POST | 流式口语优化 |
| `/api/history/list` | GET | 获取历史记录列表 |
| `/api/history/{id}` | GET/DELETE | 查询/删除记录 |
| `/api/history/export/{id}` | GET | 导出记录 |
| `/api/config` | GET/PUT | 获取/保存配置 |
| `/api/config/cache/info` | GET | 获取缓存信息 |
| `/api/config/cache/{type}` | DELETE | 清除缓存 |

### 模型管理接口（新功能）

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/models` | GET | 获取所有模型列表 |
| `/api/models` | POST | 创建模型配置 |
| `/api/models/active` | GET | 获取当前激活模型 |
| `/api/models/usage` | GET | 获取模型用量统计 |
| `/api/models/{id}` | GET | 获取单个模型配置 |
| `/api/models/{id}` | PUT | 更新模型配置 |
| `/api/models/{id}` | DELETE | 删除模型配置 |
| `/api/models/{id}/activate` | POST | 切换激活模型 |
| `/api/models/test/{id}` | POST | 测试模型连接 |
| `/api/models/import-env` | POST | 从环境变量导入 |

## 📁 目录结构

```
Class_summary/
├── app/                          # 后端应用
│   ├── main.py                   # FastAPI主入口
│   ├── config.py                 # 配置管理
│   ├── routers/                  # API路由
│   │   ├── audio.py              # 音频上传
│   │   ├── asr.py                # ASR转写
│   │   ├── summary.py            # AI总结
│   │   ├── polish.py             # 口语优化
│   │   ├── history.py            # 历史记录
│   │   ├── config.py             # 配置管理
│   │   └── models.py             # 模型管理（新）
│   ├── services/                 # 业务逻辑
│   │   ├── asr_service.py        # ASR服务
│   │   ├── llm_service.py        # LLM服务（支持多模型）
│   │   ├── storage_service.py    # 存储服务
│   │   └── model_service.py      # 模型管理服务（新）
│   └── models/                   # 数据模型
│       └── schemas.py            # Pydantic模型定义
├── static/                       # 前端静态文件
│   ├── index.html                # 主页面
│   ├── css/style.css             # Material Design样式
│   └── js/                       # JavaScript
│       ├── api.js                # API调用
│       ├── app.js                # 主逻辑
│       └── recorder.js           # 录音模块（含波形图）
├── data/                         # 数据存储（已gitignore）
│   ├── uploads/                  # 上传的音频
│   ├── history/                  # 历史记录
│   ├── models_config.json        # 模型配置（加密存储）
│   └── model_usage.json          # 模型用量统计
├── cli.py                        # CLI入口
├── run.py                        # 启动脚本
├── requirements.txt              # 依赖
├── .env.example                  # 环境变量示例
├── .gitignore                    # Git忽略配置
└── README.md                     # 本文件
```

## 🔑 API Key获取

| 服务 | 获取地址 |
|------|----------|
| 阶跃星辰 | https://platform.stepfun.com |
| DeepSeek | https://platform.deepseek.com |
| 小米MiMo | https://platform.xiaomimimo.com |
| OpenAI | https://platform.openai.com |
| 月之暗面 | https://platform.moonshot.cn |

## 🔒 安全说明

- API Key使用**加密存储**，不会以明文形式保存在配置文件中
- `.gitignore`已配置排除敏感配置文件（`data/models_config.json`、`data/model_usage.json`、`.env`）
- 提交代码前请确认不会泄露API Key

## 🎨 界面预览

### 主题颜色
支持 7 种主题颜色：紫色（默认）、蓝色、绿色、橙色、红色、青色、粉色

### 夜间模式
支持深色主题，保护眼睛，可在设置中切换

### 模型切换
顶部栏提供模型选择下拉框，可快速切换当前使用的AI模型

### 实时波形图
录音时显示实时音频波形和音量指示条

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
- [Material Design 3](https://m3.material.io/)

### 特别感谢

特别感谢 **小米 MiMo 模型** 的 [Orbit 百万亿 Token 计划](https://platform.xiaomimimo.com/docs/zh-CN/news/v2.5-open-sourced?target=%E5%88%9B%E9%80%A0%E8%80%85%E7%99%BE%E4%B8%87%E4%BA%BF-token-%E6%BF%80%E5%8A%B1%E8%AE%A1%E5%88%92)，赠送了 MAX 等级的模型额度，极大地帮助了本项目的开发！
