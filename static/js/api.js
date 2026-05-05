/**
 * API调用模块
 */

const API = {
    /**
     * 通用SSE流式解析器（处理跨块数据拼接）
     * @param {Response} response - fetch响应对象
     * @param {Object} handlers - 事件处理器 { onDelta, onChunk, onDone, onError, onProgress, eventTypeMap }
     */
    _parseSSEStream(response, handlers) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';  // 缓冲区，处理跨块数据
        
        function processLine(line) {
            if (!line.startsWith('data: ')) return;
            
            try {
                const data = JSON.parse(line.slice(6));
                const type = data.type;
                
                // 根据事件类型分发
                if (type === 'delta' && handlers.onDelta) {
                    handlers.onDelta(data.text);
                } else if (type === 'chunk' && handlers.onChunk) {
                    handlers.onChunk(data.text);
                } else if (type === 'progress' && handlers.onProgress) {
                    handlers.onProgress(data);
                } else if (type === 'done' && handlers.onDone) {
                    handlers.onDone(data);
                } else if (type === 'error' && handlers.onError) {
                    handlers.onError(new Error(data.message));
                }
            } catch (e) {
                console.error('解析SSE数据失败:', e, line);
            }
        }
        
        function read() {
            reader.read().then(({ done, value }) => {
                if (done) {
                    // 处理缓冲区中剩余的数据
                    if (buffer.trim()) {
                        const lines = buffer.split('\n');
                        lines.forEach(processLine);
                    }
                    return;
                }
                
                // 将新数据追加到缓冲区
                buffer += decoder.decode(value, { stream: true });
                
                // 按换行分割，最后一行可能不完整，保留在缓冲区
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';  // 最后一行可能不完整
                
                // 处理完整的行
                lines.forEach(processLine);
                
                // 继续读取
                read();
            }).catch(error => {
                if (handlers.onError) {
                    handlers.onError(error);
                }
            });
        }
        
        read();
    },

    /**
     * 上传音频文件
     */
    async uploadAudio(file, enableDenoise = false, denoiseMethod = 'afftdn') {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('enable_denoise', enableDenoise);
        formData.append('denoise_method', denoiseMethod);
        
        const response = await fetch('/api/audio/upload', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '上传失败');
        }
        
        return await response.json();
    },

    /**
     * 转写音频（完整返回）
     */
    async transcribe(filePath, chunks = null) {
        const response = await fetch('/api/asr/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                file_path: filePath,
                chunks: chunks
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '转写失败');
        }
        
        return await response.json();
    },

    /**
     * 转写音频（SSE流式）
     */
    transcribeStream(filePath, chunks, onDelta, onDone, onError, onProgress) {
        fetch('/api/asr/transcribe/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                file_path: filePath,
                chunks: chunks
            })
        }).then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            this._parseSSEStream(response, { onDelta, onDone, onError, onProgress });
        }).catch(onError);
    },

    /**
     * 生成总结
     */
    async generateSummary(text, taskId = null, modelId = null) {
        const body = { text, task_id: taskId };
        if (modelId) body.model_id = modelId;

        const response = await fetch('/api/summary/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '生成总结失败');
        }
        
        return await response.json();
    },

    /**
     * 流式生成总结
     */
    generateSummaryStream(text, taskId, onChunk, onDone, onError, modelId = null) {
        const body = { text, task_id: taskId };
        if (modelId) body.model_id = modelId;

        fetch('/api/summary/generate/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            this._parseSSEStream(response, { onChunk, onDone, onError });
        }).catch(onError);
    },

    /**
     * 获取历史记录列表
     */
    async getHistory(keyword = '', page = 1) {
        const params = new URLSearchParams({ page });
        if (keyword) params.append('keyword', keyword);
        
        const response = await fetch(`/api/history/list?${params}`);
        if (!response.ok) {
            throw new Error('获取历史记录失败');
        }
        
        return await response.json();
    },

    /**
     * 获取单条记录
     */
    async getRecord(recordId) {
        const response = await fetch(`/api/history/${recordId}`);
        if (!response.ok) {
            throw new Error('记录不存在');
        }
        
        return await response.json();
    },

    /**
     * 删除记录
     */
    async deleteRecord(recordId) {
        const response = await fetch(`/api/history/${recordId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('删除失败');
        }
        
        return await response.json();
    },

    /**
     * 导出记录
     */
    async exportRecord(recordId) {
        const response = await fetch(`/api/history/export/${recordId}`);
        if (!response.ok) {
            throw new Error('导出失败');
        }
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `record_${recordId}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    },

    /**
     * 获取配置
     */
    async getConfig() {
        const response = await fetch('/api/config');
        if (!response.ok) {
            throw new Error('获取配置失败');
        }
        return await response.json();
    },

    /**
     * 保存配置
     */
    async saveConfig(config) {
        const response = await fetch('/api/config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '保存配置失败');
        }
        
        return await response.json();
    },

    /**
     * 获取缓存信息
     */
    async getCacheInfo() {
        const response = await fetch('/api/config/cache/info');
        if (!response.ok) {
            throw new Error('获取缓存信息失败');
        }
        return await response.json();
    },

    /**
     * 清除缓存
     */
    async clearCache(cacheType) {
        const response = await fetch(`/api/config/cache/${cacheType}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '清除缓存失败');
        }
        
        return await response.json();
    },

    /**
     * 测试ASR连接
     */
    async testAsrConnection() {
        const response = await fetch('/api/config/test/asr', {
            method: 'POST'
        });
        if (!response.ok) {
            throw new Error('测试ASR连接失败');
        }
        return await response.json();
    },

    /**
     * 测试LLM连接
     */
    async testLlmConnection() {
        const response = await fetch('/api/config/test/llm', {
            method: 'POST'
        });
        if (!response.ok) {
            throw new Error('测试LLM连接失败');
        }
        return await response.json();
    },

    /**
     * 优化口语化文本
     */
    async polishText(text, taskId = null, modelId = null) {
        const body = { text, task_id: taskId };
        if (modelId) body.model_id = modelId;

        const response = await fetch('/api/polish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '优化失败');
        }
        
        return await response.json();
    },

    /**
     * 流式优化口语化文本
     */
    polishTextStream(text, taskId, onChunk, onDone, onError, modelId = null) {
        const body = { text, task_id: taskId };
        if (modelId) body.model_id = modelId;

        fetch('/api/polish/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            this._parseSSEStream(response, { onChunk, onDone, onError });
        }).catch(onError);
    },

    // ========== 模型配置管理 ==========

    /**
     * 获取所有模型配置
     */
    async getModels() {
        const response = await fetch('/api/models');
        if (!response.ok) {
            throw new Error('获取模型列表失败');
        }
        return await response.json();
    },

    /**
     * 获取当前激活模型
     */
    async getActiveModel() {
        const response = await fetch('/api/models/active');
        if (!response.ok) {
            throw new Error('获取激活模型失败');
        }
        return await response.json();
    },

    /**
     * 获取单个模型配置
     */
    async getModel(modelId) {
        const response = await fetch(`/api/models/${modelId}`);
        if (!response.ok) {
            throw new Error('获取模型配置失败');
        }
        return await response.json();
    },

    /**
     * 创建模型配置
     */
    async createModel(data) {
        const response = await fetch('/api/models', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '创建模型配置失败');
        }

        return await response.json();
    },

    /**
     * 更新模型配置
     */
    async updateModel(modelId, data) {
        const response = await fetch(`/api/models/${modelId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '更新模型配置失败');
        }

        return await response.json();
    },

    /**
     * 删除模型配置
     */
    async deleteModel(modelId) {
        const response = await fetch(`/api/models/${modelId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '删除模型配置失败');
        }

        return await response.json();
    },

    /**
     * 激活模型
     */
    async activateModel(modelId) {
        const response = await fetch(`/api/models/${modelId}/activate`, {
            method: 'POST'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '切换模型失败');
        }

        return await response.json();
    },

    /**
     * 测试模型连接
     */
    async testModelConnection(modelId) {
        const response = await fetch(`/api/models/test/${modelId}`, {
            method: 'POST'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '测试连接失败');
        }

        return await response.json();
    },

    /**
     * 从环境变量导入模型配置
     */
    async importModelFromEnv() {
        const response = await fetch('/api/models/import-env', {
            method: 'POST'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '导入失败');
        }

        return await response.json();
    },

    /**
     * 获取模型用量统计
     */
    async getModelUsageStats() {
        const response = await fetch('/api/models/usage');
        if (!response.ok) {
            throw new Error('获取用量统计失败');
        }
        return await response.json();
    },

    // ========== 批量处理 ==========

    /**
     * 批量上传音频文件
     */
    async batchUpload(files, enableDenoise = false, denoiseMethod = 'afftdn') {
        const formData = new FormData();
        for (const file of files) {
            formData.append('files', file);
        }
        formData.append('enable_denoise', enableDenoise);
        formData.append('denoise_method', denoiseMethod);

        const response = await fetch('/api/batch/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '批量上传失败');
        }

        return await response.json();
    },

    /**
     * 启动批量处理任务
     */
    async startBatch(files, autoSummary = false) {
        const response = await fetch('/api/batch/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: files, auto_summary: autoSummary })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '启动批量任务失败');
        }

        return await response.json();
    },

    /**
     * 获取批量任务状态
     */
    async getBatchStatus(taskId) {
        const response = await fetch(`/api/batch/status/${taskId}`);
        if (!response.ok) {
            throw new Error('获取任务状态失败');
        }
        return await response.json();
    },

    /**
     * 获取所有批量任务
     */
    async getBatchList() {
        const response = await fetch('/api/batch/list');
        if (!response.ok) {
            throw new Error('获取任务列表失败');
        }
        return await response.json();
    },

    // ========== 思维导图 ==========

    /**
     * 生成思维导图
     */
    async generateMindmap(text, recordId = null, modelId = null) {
        const body = { text };
        if (recordId) body.record_id = recordId;
        if (modelId) body.model_id = modelId;

        const response = await fetch('/api/summary/mindmap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '生成思维导图失败');
        }

        return await response.json();
    },

    /**
     * 流式生成思维导图
     */
    generateMindmapStream(text, recordId, onChunk, onDone, onError, modelId = null) {
        const body = { text };
        if (recordId) body.record_id = recordId;
        if (modelId) body.model_id = modelId;

        fetch('/api/summary/mindmap/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            this._parseSSEStream(response, { onChunk, onDone, onError });
        }).catch(onError);
    },

    /**
     * 知识点AI解析
     */
    async explainKeyword(keyword, context, modelId = null) {
        const body = { keyword, context };
        if (modelId) body.model_id = modelId;

        const response = await fetch('/api/summary/explain', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '知识点解析失败');
        }

        return await response.json();
    },

    /**
     * 流式知识点AI解析
     */
    explainKeywordStream(keyword, context, onChunk, onDone, onError, modelId = null) {
        const body = { keyword, context };
        if (modelId) body.model_id = modelId;

        fetch('/api/summary/explain/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            this._parseSSEStream(response, { onChunk, onDone, onError });
        }).catch(onError);
    },

    /**
     * 知识点追问（多轮对话）
     */
    explainFollowupStream(keyword, context, history, question, onChunk, onDone, onError, modelId = null) {
        const body = { keyword, context, history, question };
        if (modelId) body.model_id = modelId;

        fetch('/api/summary/explain/followup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            this._parseSSEStream(response, { onChunk, onDone, onError });
        }).catch(onError);
    }
};
