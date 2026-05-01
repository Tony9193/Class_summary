/**
 * API调用模块
 */

const API = {
    /**
     * 上传音频文件
     */
    async uploadAudio(file, enableDenoise = false) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('enable_denoise', enableDenoise);
        
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
        // 使用fetch实现POST SSE
        fetch('/api/asr/transcribe/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                file_path: filePath,
                chunks: chunks
            })
        }).then(response => {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            function read() {
                reader.read().then(({ done, value }) => {
                    if (done) return;
                    
                    const text = decoder.decode(value);
                    const lines = text.split('\n');
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                if (data.type === 'delta') {
                                    onDelta(data.text);
                                } else if (data.type === 'progress') {
                                    if (onProgress) onProgress(data);
                                } else if (data.type === 'done') {
                                    onDone(data);
                                } else if (data.type === 'error') {
                                    onError(new Error(data.message));
                                }
                            } catch (e) {}
                        }
                    }
                    
                    read();
                });
            }
            
            read();
        }).catch(onError);
    },

    /**
     * 生成总结
     */
    async generateSummary(text, taskId = null) {
        const response = await fetch('/api/summary/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, task_id: taskId })
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
    generateSummaryStream(text, taskId, onChunk, onDone, onError) {
        fetch('/api/summary/generate/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, task_id: taskId })
        }).then(response => {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            function read() {
                reader.read().then(({ done, value }) => {
                    if (done) return;
                    
                    const text = decoder.decode(value);
                    const lines = text.split('\n');
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                if (data.type === 'chunk') {
                                    onChunk(data.text);
                                } else if (data.type === 'done') {
                                    onDone(data);
                                } else if (data.type === 'error') {
                                    onError(new Error(data.message));
                                }
                            } catch (e) {}
                        }
                    }
                    
                    read();
                });
            }
            
            read();
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
     * 测试ASR连接
     */
    async testAsrConnection() {
        const response = await fetch('/api/config/test/asr', {
            method: 'POST'
        });
        return await response.json();
    },

    /**
     * 测试LLM连接
     */
    async testLlmConnection() {
        const response = await fetch('/api/config/test/llm', {
            method: 'POST'
        });
        return await response.json();
    }
};
