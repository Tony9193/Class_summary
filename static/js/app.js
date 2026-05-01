/**
 * 主应用逻辑
 */

// 状态管理
let currentFile = null;
let currentFilePath = null;
let currentChunks = null;  // 分段文件列表
let currentTaskId = null;
let currentTranscription = '';

/**
 * 切换Tab
 */
function switchTab(tabName) {
    // 隐藏所有tab内容
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.add('hidden');
    });
    
    // 取消所有tab按钮激活状态
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // 显示选中的tab
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // 如果切换到历史记录，加载数据
    if (tabName === 'history') {
        loadHistory();
    }
}

/**
 * 处理文件选择
 */
function handleFileSelect(input) {
    const file = input.files[0];
    if (!file) return;
    
    currentFile = file;
    document.getElementById('file-info').classList.remove('hidden');
    document.getElementById('file-name').textContent = `${file.name} (${formatFileSize(file.size)})`;
    document.getElementById('file-duration').textContent = '';
    document.getElementById('btn-transcribe').disabled = false;
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * 格式化时长
 */
function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins > 0) {
        return `${mins}分${secs}秒`;
    }
    return `${secs}秒`;
}

/**
 * 开始转写
 */
async function startTranscribe() {
    if (!currentFile) {
        showToast('请先选择音频文件', 'error');
        return;
    }
    
    const enableDenoise = document.getElementById('enable-denoise').checked;
    
    showLoading('正在上传文件...');
    if (enableDenoise) {
        document.getElementById('loading-text').textContent = '正在上传并降噪处理中，请稍候...';
    }
    
    try {
        // 上传文件（含降噪处理）
        const uploadResult = await API.uploadAudio(currentFile, enableDenoise);
        currentFilePath = uploadResult.file_path;
        currentChunks = uploadResult.chunks;
        
        // 显示文件信息
        if (uploadResult.duration) {
            document.getElementById('file-duration').textContent = 
                `时长: ${formatDuration(uploadResult.duration)}` + 
                (uploadResult.denoised ? ' · 已降噪' : '') +
                (uploadResult.need_split ? ` · 分${uploadResult.chunks.length}段处理` : '');
        }
        
        // 大文件分段提示
        if (uploadResult.need_split) {
            showLoading(`正在分${uploadResult.chunks.length}段转写中，请稍候...`);
        } else {
            showLoading('正在转写中，请稍候...');
        }
        
        // 使用普通转写
        const result = await API.transcribe(currentFilePath, currentChunks);
        
        currentTaskId = result.task_id;
        currentTranscription = result.text;
        
        // 显示转写结果
        document.getElementById('transcription-result').textContent = currentTranscription;
        
        // 启用总结按钮
        document.getElementById('btn-summary').disabled = false;
        
        hideLoading();
        const chunkInfo = result.chunks_count > 1 ? `（共${result.chunks_count}段）` : '';
        showToast(`转写完成${chunkInfo}！`, 'success');
    } catch (error) {
        hideLoading();
        showToast('转写失败: ' + error.message, 'error');
    }
}

/**
 * 生成AI总结
 */
async function generateSummary() {
    if (!currentTranscription) {
        showToast('请先完成转写', 'error');
        return;
    }
    
    showLoading('正在生成AI总结...');
    
    try {
        const result = await API.generateSummary(currentTranscription, currentTaskId);
        
        // 渲染Markdown内容
        const summaryHtml = renderMarkdown(result.summary);
        document.getElementById('summary-result').innerHTML = summaryHtml;
        
        hideLoading();
        showToast('总结生成完成！', 'success');
    } catch (error) {
        hideLoading();
        showToast('生成总结失败: ' + error.message, 'error');
    }
}

/**
 * 简单的Markdown渲染
 */
function renderMarkdown(text) {
    // 转义HTML
    text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // 标题
    text = text.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    text = text.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    text = text.replace(/^# (.*$)/gm, '<h1>$1</h1>');
    
    // 列表
    text = text.replace(/^\- (.*$)/gm, '<li>$1</li>');
    text = text.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    // 粗体
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // 段落
    text = text.replace(/\n\n/g, '</p><p>');
    text = '<p>' + text + '</p>';
    
    return text;
}

/**
 * 切换录音状态
 */
async function toggleRecording() {
    const btn = document.getElementById('btn-record');
    const status = document.getElementById('recording-status');
    const icon = document.getElementById('record-icon');
    const text = document.getElementById('record-text');
    
    if (recorder.isRecording) {
        // 停止录音
        const audioBlob = await recorder.stop();
        
        icon.textContent = '●';
        text.textContent = '开始录音';
        btn.classList.remove('bg-gray-500');
        btn.classList.add('bg-red-500');
        status.classList.add('hidden');
        
        if (audioBlob) {
            const enableDenoise = document.getElementById('enable-denoise').checked;
            showLoading('正在上传录音...');
            
            try {
                // 将Blob转换为File
                const file = new File([audioBlob], 'recording.webm', { type: 'audio/webm' });
                const uploadResult = await API.uploadAudio(file, enableDenoise);
                currentFilePath = uploadResult.file_path;
                currentChunks = uploadResult.chunks;
                
                if (enableDenoise) {
                    showLoading('正在降噪并转写中...');
                } else {
                    showLoading('正在转写中...');
                }
                
                const result = await API.transcribe(currentFilePath, currentChunks);
                
                currentTaskId = result.task_id;
                currentTranscription = result.text;
                
                document.getElementById('transcription-result').textContent = currentTranscription;
                document.getElementById('btn-summary').disabled = false;
                
                hideLoading();
                showToast('录音转写完成！', 'success');
            } catch (error) {
                hideLoading();
                showToast('转写失败: ' + error.message, 'error');
            }
        }
    } else {
        // 开始录音
        const started = await recorder.start();
        if (started) {
            icon.textContent = '■';
            text.textContent = '停止录音';
            btn.classList.remove('bg-red-500');
            btn.classList.add('bg-gray-500');
            status.classList.remove('hidden');
        }
    }
}

/**
 * 复制文本
 */
function copyText(elementId) {
    const element = document.getElementById(elementId);
    const text = element.textContent;
    
    navigator.clipboard.writeText(text).then(() => {
        showToast('已复制到剪贴板', 'success');
    }).catch(() => {
        showToast('复制失败', 'error');
    });
}

/**
 * 加载历史记录
 */
async function loadHistory(keyword = '') {
    const container = document.getElementById('history-list');
    
    try {
        const result = await API.getHistory(keyword);
        
        if (result.records.length === 0) {
            container.innerHTML = `
                <div class="p-8 text-center text-gray-400">
                    暂无记录
                </div>
            `;
            return;
        }
        
        container.innerHTML = result.records.map(record => `
            <div class="history-item p-4 flex justify-between items-center">
                <div class="flex-1">
                    <h3 class="font-medium text-gray-900">${escapeHtml(record.filename)}</h3>
                    <p class="text-sm text-gray-500 mt-1">
                        ${record.created_at}
                        ${record.duration ? ' · ' + Math.floor(record.duration) + '秒' : ''}
                    </p>
                    <p class="text-sm text-gray-600 mt-1 line-clamp-2">
                        ${escapeHtml(record.transcription.substring(0, 100))}...
                    </p>
                </div>
                <div class="flex space-x-2 ml-4">
                    <button onclick="viewRecord('${record.id}')" 
                            class="text-indigo-600 hover:text-indigo-800 text-sm">
                        查看
                    </button>
                    <button onclick="exportRecord('${record.id}')" 
                            class="text-green-600 hover:text-green-800 text-sm">
                        导出
                    </button>
                    <button onclick="deleteRecord('${record.id}')" 
                            class="text-red-600 hover:text-red-800 text-sm">
                        删除
                    </button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        container.innerHTML = `
            <div class="p-8 text-center text-red-400">
                加载失败: ${error.message}
            </div>
        `;
    }
}

/**
 * 搜索历史记录
 */
function searchHistory() {
    const keyword = document.getElementById('search-keyword').value;
    loadHistory(keyword);
}

/**
 * 查看记录详情
 */
async function viewRecord(recordId) {
    try {
        const result = await API.getRecord(recordId);
        const record = result.record;
        
        // 切换到转写tab并显示
        switchTab('transcribe');
        
        currentTaskId = record.id;
        currentTranscription = record.transcription;
        
        document.getElementById('transcription-result').textContent = record.transcription;
        document.getElementById('btn-summary').disabled = false;
        
        if (record.summary) {
            document.getElementById('summary-result').innerHTML = renderMarkdown(record.summary);
        }
        
        showToast('已加载记录', 'success');
    } catch (error) {
        showToast('加载失败: ' + error.message, 'error');
    }
}

/**
 * 导出记录
 */
async function exportRecord(recordId) {
    try {
        await API.exportRecord(recordId);
        showToast('导出成功', 'success');
    } catch (error) {
        showToast('导出失败: ' + error.message, 'error');
    }
}

/**
 * 删除记录
 */
async function deleteRecord(recordId) {
    if (!confirm('确定要删除这条记录吗？')) {
        return;
    }
    
    try {
        await API.deleteRecord(recordId);
        showToast('删除成功', 'success');
        loadHistory();
    } catch (error) {
        showToast('删除失败: ' + error.message, 'error');
    }
}

/**
 * HTML转义
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 显示加载提示
 */
function showLoading(text = '处理中...') {
    document.getElementById('loading-text').textContent = text;
    document.getElementById('loading').classList.remove('hidden');
}

/**
 * 隐藏加载提示
 */
function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
}

/**
 * 显示Toast提示
 */
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    
    // 根据类型设置颜色
    toast.className = 'fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50';
    if (type === 'error') {
        toast.classList.add('bg-red-600', 'text-white');
    } else if (type === 'success') {
        toast.classList.add('bg-green-600', 'text-white');
    } else {
        toast.classList.add('bg-gray-800', 'text-white');
    }
    
    toast.classList.remove('hidden');
    
    // 3秒后自动隐藏
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// 拖拽上传支持
document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const fileInput = document.getElementById('audio-file');
            fileInput.files = files;
            handleFileSelect(fileInput);
        }
    });
    
    // 回车搜索
    document.getElementById('search-keyword').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchHistory();
        }
    });
    
    // 加载配置
    loadConfig();
});

/**
 * 打开设置弹窗
 */
async function openSettings() {
    document.getElementById('settings-modal').classList.remove('hidden');
    await loadConfig();
}

/**
 * 关闭设置弹窗
 */
function closeSettings() {
    document.getElementById('settings-modal').classList.add('hidden');
}

/**
 * 加载配置
 */
async function loadConfig() {
    try {
        const result = await API.getConfig();
        const config = result.config;
        
        // 填充表单（显示掩码后的Key）
        document.getElementById('step-api-key').placeholder = config.step_api_key || 'sk-...';
        document.getElementById('llm-api-key').placeholder = config.llm_api_key || 'sk-...';
        document.getElementById('llm-base-url').value = config.llm_base_url || '';
        document.getElementById('llm-model').value = config.llm_model || '';
        
        // 显示Key状态
        const stepStatus = document.getElementById('step-key-status');
        stepStatus.textContent = config.step_api_key_set ? '✓ 已配置' : '✗ 未配置';
        stepStatus.className = `ml-2 text-xs ${config.step_api_key_set ? 'text-green-500' : 'text-red-500'}`;
        
        const llmStatus = document.getElementById('llm-key-status');
        llmStatus.textContent = config.llm_api_key_set ? '✓ 已配置' : '✗ 未配置';
        llmStatus.className = `ml-2 text-xs ${config.llm_api_key_set ? 'text-green-500' : 'text-red-500'}`;
    } catch (error) {
        showToast('加载配置失败: ' + error.message, 'error');
    }
}

/**
 * 保存设置
 */
async function saveSettings() {
    const config = {};
    
    // 只保存用户输入的值
    const stepKey = document.getElementById('step-api-key').value;
    const llmKey = document.getElementById('llm-api-key').value;
    const llmBaseUrl = document.getElementById('llm-base-url').value;
    const llmModel = document.getElementById('llm-model').value;
    
    if (stepKey) config.step_api_key = stepKey;
    if (llmKey) config.llm_api_key = llmKey;
    if (llmBaseUrl) config.llm_base_url = llmBaseUrl;
    if (llmModel) config.llm_model = llmModel;
    
    try {
        await API.saveConfig(config);
        showToast('配置保存成功！', 'success');
        closeSettings();
        // 重新加载配置显示
        await loadConfig();
    } catch (error) {
        showToast('保存失败: ' + error.message, 'error');
    }
}

/**
 * 测试ASR连接
 */
async function testAsrConnection() {
    try {
        const result = await API.testAsrConnection();
        showToast(result.message, result.success ? 'success' : 'error');
    } catch (error) {
        showToast('测试失败: ' + error.message, 'error');
    }
}

/**
 * 测试LLM连接
 */
async function testLlmConnection() {
    showLoading('正在测试AI连接...');
    try {
        const result = await API.testLlmConnection();
        hideLoading();
        showToast(result.message, result.success ? 'success' : 'error');
    } catch (error) {
        hideLoading();
        showToast('测试失败: ' + error.message, 'error');
    }
}
