/**
 * 主应用逻辑
 */

// 状态管理
let currentFile = null;
let currentFilePath = null;
let currentChunks = null;  // 分段文件列表
let currentTaskId = null;
let currentTranscription = '';
let currentPolishedText = '';  // 优化后的文本
let isShowingPolished = false;  // 当前是否显示优化后的文本

/**
 * 切换Tab
 */
function switchTab(tabName) {
    // 隐藏所有tab内容
    document.querySelectorAll('.tab-content').forEach(el => {
        el.style.display = 'none';
    });
    
    // 取消所有tab按钮激活状态
    document.querySelectorAll('.md-tab').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // 显示选中的tab
    document.getElementById(`tab-${tabName}`).style.display = 'block';
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
    document.getElementById('file-info').style.display = 'block';
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
        const uploadResult = await API.uploadAudio(currentFile, enableDenoise, currentDenoiseMethod);
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
        
        // 启用口语优化按钮
        document.getElementById('btn-polish').disabled = false;
        
        // 重置切换按钮状态
        isShowingPolished = false;
        currentPolishedText = '';
        document.getElementById('view-toggle').style.display = 'none';
        
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
    // 使用当前显示的文本（优化后或原文）
    const textToSummarize = isShowingPolished ? currentPolishedText : currentTranscription;
    
    if (!textToSummarize) {
        showToast('请先完成转写', 'error');
        return;
    }
    
    showLoading('正在生成AI总结...');
    
    try {
        const result = await API.generateSummary(textToSummarize, currentTaskId);
        
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
        btn.className = 'md-btn md-btn-danger';
        btn.style.borderRadius = '28px';
        btn.style.padding = '16px 32px';
        status.style.display = 'none';
        
        if (audioBlob) {
            const enableDenoise = document.getElementById('enable-denoise').checked;
            showLoading('正在上传录音...');
            
            try {
                // 将Blob转换为File
                const file = new File([audioBlob], 'recording.webm', { type: 'audio/webm' });
                const uploadResult = await API.uploadAudio(file, enableDenoise, currentDenoiseMethod);
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
                
                // 启用口语优化按钮
                document.getElementById('btn-polish').disabled = false;
                
                // 重置切换按钮状态
                isShowingPolished = false;
                currentPolishedText = '';
                document.getElementById('view-toggle').style.display = 'none';
                
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
            btn.className = 'md-btn md-btn-tonal';
            btn.style.borderRadius = '28px';
            btn.style.padding = '16px 32px';
            status.style.display = 'block';
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
 * 口语优化
 */
async function polishTranscription() {
    if (!currentTranscription) {
        showToast('请先完成转写', 'error');
        return;
    }
    
    showLoading('正在优化口语表达...');
    
    try {
        const result = await API.polishText(currentTranscription, currentTaskId);
        
        currentPolishedText = result.polished;
        
        // 显示切换按钮
        document.getElementById('view-toggle').style.display = 'inline-flex';
        
        // 切换到优化后视图
        toggleTranscriptionView('polished');
        
        hideLoading();
        showToast('口语优化完成！', 'success');
    } catch (error) {
        hideLoading();
        showToast('优化失败: ' + error.message, 'error');
    }
}

/**
 * 切换转写结果视图
 */
function toggleTranscriptionView(view) {
    const originalBtn = document.getElementById('btn-view-original');
    const polishedBtn = document.getElementById('btn-view-polished');
    const resultDiv = document.getElementById('transcription-result');
    
    if (view === 'original') {
        resultDiv.textContent = currentTranscription;
        isShowingPolished = false;
        
        // 更新按钮样式
        originalBtn.classList.add('active');
        polishedBtn.classList.remove('active');
    } else {
        resultDiv.textContent = currentPolishedText;
        isShowingPolished = true;
        
        // 更新按钮样式
        originalBtn.classList.remove('active');
        polishedBtn.classList.add('active');
    }
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
                <div style="padding: 32px; text-align: center; color: var(--md-outline);">
                    <div style="font-size: 48px; margin-bottom: 8px;">📭</div>
                    暂无记录
                </div>
            `;
            return;
        }
        
        container.innerHTML = result.records.map(record => `
            <div class="history-item" style="display: flex; align-items: center; padding: 16px; border-bottom: 1px solid var(--md-outline-variant); gap: 16px;">
                <div style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--md-primary-container); color: var(--md-on-primary-container); font-size: 18px;">
                    🎵
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 15px; font-weight: 500; color: var(--md-on-surface); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(record.filename)}</div>
                    <div style="font-size: 13px; color: var(--md-on-surface-variant); margin-top: 2px;">
                        ${record.created_at}
                        ${record.duration ? ' · ' + Math.floor(record.duration) + '秒' : ''}
                    </div>
                    <div style="font-size: 13px; color: var(--md-on-surface-variant); margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${escapeHtml(record.transcription.substring(0, 80))}...
                    </div>
                </div>
                <div style="display: flex; gap: 8px; flex-shrink: 0;">
                    <button onclick="viewRecord('${record.id}')" class="md-btn md-btn-text md-btn-sm" title="查看">
                        👁️ 查看
                    </button>
                    <button onclick="exportRecord('${record.id}')" class="md-btn md-btn-text md-btn-sm" title="导出">
                        📥 导出
                    </button>
                    <button onclick="deleteRecord('${record.id}')" class="md-btn md-btn-text md-btn-sm" style="color: var(--md-error);" title="删除">
                        🗑️ 删除
                    </button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        container.innerHTML = `
            <div style="padding: 32px; text-align: center; color: var(--md-error);">
                <div style="font-size: 48px; margin-bottom: 8px;">❌</div>
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
        currentPolishedText = record.polished_text || '';
        isShowingPolished = false;
        
        document.getElementById('transcription-result').textContent = record.transcription;
        document.getElementById('btn-summary').disabled = false;
        document.getElementById('btn-polish').disabled = false;
        
        // 如果有优化后的文本，显示切换按钮
        if (currentPolishedText) {
            document.getElementById('view-toggle').style.display = 'inline-flex';
        } else {
            document.getElementById('view-toggle').style.display = 'none';
        }
        
        // 重置视图切换按钮状态
        const originalBtn = document.getElementById('btn-view-original');
        const polishedBtn = document.getElementById('btn-view-polished');
        originalBtn.classList.add('active');
        polishedBtn.classList.remove('active');
        
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
function deleteRecord(recordId) {
    pendingDeleteId = recordId;
    document.getElementById('confirm-title').textContent = '删除记录';
    document.getElementById('confirm-message').textContent = '确定要删除这条记录吗？此操作不可恢复。';
    document.getElementById('confirm-modal').style.display = 'flex';
}

let pendingDeleteId = null;

async function executeDeleteRecord() {
    if (!pendingDeleteId) return;
    
    closeConfirm();
    
    try {
        await API.deleteRecord(pendingDeleteId);
        showToast('删除成功', 'success');
        loadHistory();
    } catch (error) {
        showToast('删除失败: ' + error.message, 'error');
    }
    
    pendingDeleteId = null;
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
    document.getElementById('loading').style.display = 'flex';
}

/**
 * 隐藏加载提示
 */
function hideLoading() {
    document.getElementById('loading').style.display = 'none';
}

/**
 * 显示Material Design风格的Toast
 */
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    
    // 根据类型设置样式
    toast.className = 'md-snackbar';
    if (type === 'error') {
        toast.classList.add('error');
    } else if (type === 'success') {
        toast.classList.add('success');
    }
    
    toast.style.display = 'flex';
    
    // 3秒后自动隐藏
    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}

// 拖拽上传支持
document.addEventListener('DOMContentLoaded', () => {
    // 初始化主题
    initTheme();
    
    const dropZone = document.getElementById('drop-zone');
    
    if (dropZone) {
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
    }
    
    // 回车搜索
    const searchInput = document.getElementById('search-keyword');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                searchHistory();
            }
        });
    }
    
    // 加载配置
    loadConfig();
});

/**
 * 打开设置弹窗
 */
async function openSettings() {
    document.getElementById('settings-modal').style.display = 'flex';
    await loadConfig();
    await loadCacheInfo();
}

/**
 * 关闭设置弹窗
 */
function closeSettings() {
    document.getElementById('settings-modal').style.display = 'none';
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
        stepStatus.style.color = config.step_api_key_set ? '#4CAF50' : '#F44336';
        
        const llmStatus = document.getElementById('llm-key-status');
        llmStatus.textContent = config.llm_api_key_set ? '✓ 已配置' : '✗ 未配置';
        llmStatus.style.color = config.llm_api_key_set ? '#4CAF50' : '#F44336';
        
        // 同步降噪方法（服务器配置优先）
        if (config.denoise_method) {
            currentDenoiseMethod = config.denoise_method;
            localStorage.setItem('denoiseMethod', currentDenoiseMethod);
            setDenoiseMethodUI(currentDenoiseMethod);
        }
    } catch (error) {
        showToast('加载配置失败: ' + error.message, 'error');
    }
}

/**
 * 加载缓存信息
 */
async function loadCacheInfo() {
    try {
        const result = await API.getCacheInfo();
        const info = result.cache_info;
        
        document.getElementById('uploads-size').textContent = info.uploads.size_formatted;
        document.getElementById('history-size').textContent = info.history.size_formatted;
        document.getElementById('all-size').textContent = info.all.size_formatted;
    } catch (error) {
        console.error('加载缓存信息失败:', error);
        document.getElementById('uploads-size').textContent = '获取失败';
        document.getElementById('history-size').textContent = '获取失败';
        document.getElementById('all-size').textContent = '获取失败';
    }
}

/**
 * 清除缓存
 */
let pendingCacheType = null;

function clearCache(cacheType) {
    const messages = {
        'uploads': '确定要清除所有上传的音频文件吗？此操作不可恢复。',
        'history': '确定要清除所有历史记录吗？此操作不可恢复。',
        'all': '确定要清除所有缓存数据吗？包括音频文件和历史记录，此操作不可恢复。'
    };
    
    const titles = {
        'uploads': '清除音频文件',
        'history': '清除历史记录',
        'all': '清除所有缓存'
    };
    
    pendingCacheType = cacheType;
    document.getElementById('confirm-title').textContent = titles[cacheType];
    document.getElementById('confirm-message').textContent = messages[cacheType];
    document.getElementById('confirm-modal').style.display = 'flex';
}

function closeConfirm() {
    document.getElementById('confirm-modal').style.display = 'none';
    pendingCacheType = null;
}

async function executeConfirmAction() {
    // 检查是否是删除记录操作
    if (pendingDeleteId) {
        const deleteId = pendingDeleteId;
        pendingDeleteId = null;
        closeConfirm();
        
        try {
            await API.deleteRecord(deleteId);
            showToast('删除成功', 'success');
            loadHistory();
        } catch (error) {
            showToast('删除失败: ' + error.message, 'error');
        }
        return;
    }
    
    if (!pendingCacheType) return;
    
    const cacheType = pendingCacheType;
    pendingCacheType = null;
    closeConfirm();
    showLoading('正在清除缓存...');
    
    try {
        await API.clearCache(cacheType);
        hideLoading();
        showToast('缓存清除成功', 'success');
        await loadCacheInfo();
        
        // 如果清除了历史记录，重新加载历史列表
        if (cacheType === 'history' || cacheType === 'all') {
            loadHistory();
        }
    } catch (error) {
        hideLoading();
        showToast('清除缓存失败: ' + error.message, 'error');
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
    
    // 降噪方法
    config.denoise_method = currentDenoiseMethod;
    
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

// 主题和外观设置
let currentTheme = localStorage.getItem('theme') || 'purple';
let isDarkMode = localStorage.getItem('darkMode') === 'true';
let currentDenoiseMethod = localStorage.getItem('denoiseMethod') || 'afftdn';

/**
 * 初始化主题设置
 */
function initTheme() {
    // 应用保存的主题
    setTheme(currentTheme, false);
    
    // 应用保存的暗黑模式
    if (isDarkMode) {
        document.documentElement.setAttribute('data-mode', 'dark');
        const darkToggle = document.getElementById('dark-mode-toggle');
        if (darkToggle) darkToggle.checked = true;
        const darkIcon = document.getElementById('dark-mode-icon');
        if (darkIcon) darkIcon.textContent = '☀️';
    }
    
    // 初始化降噪方法UI
    setDenoiseMethodUI(currentDenoiseMethod);
}

/**
 * 设置降噪方法UI状态（不触发保存）
 */
function setDenoiseMethodUI(method) {
    const afftdnBtn = document.getElementById('btn-denoise-afftdn');
    const nrBtn = document.getElementById('btn-denoise-noisereduce');
    const desc = document.getElementById('denoise-method-desc');
    
    if (!afftdnBtn || !nrBtn) return;
    
    afftdnBtn.classList.toggle('active', method === 'afftdn');
    nrBtn.classList.toggle('active', method === 'noisereduce');
    
    if (desc) {
        if (method === 'noisereduce') {
            desc.textContent = 'AI频谱降噪：基于深度学习，效果更好，处理稍慢';
        } else {
            desc.textContent = 'FFmpeg afftdn：速度快，适合一般噪声环境';
        }
    }
}

/**
 * 设置主题颜色
 */
function setTheme(theme, save = true) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    
    // 更新选中状态
    document.querySelectorAll('.color-option').forEach(opt => {
        opt.classList.remove('active');
        if (opt.getAttribute('data-color') === theme) {
            opt.classList.add('active');
        }
    });
    
    // 保存到本地存储
    if (save) {
        localStorage.setItem('theme', theme);
    }
}

/**
 * 切换夜间模式
 */
function toggleDarkMode() {
    isDarkMode = !isDarkMode;
    
    if (isDarkMode) {
        document.documentElement.setAttribute('data-mode', 'dark');
        document.getElementById('dark-mode-icon').textContent = '☀️';
    } else {
        document.documentElement.removeAttribute('data-mode');
        document.getElementById('dark-mode-icon').textContent = '🌙';
    }
    
    // 保存到本地存储
    localStorage.setItem('darkMode', isDarkMode.toString());
}

/**
 * 设置降噪方法
 */
function setDenoiseMethod(method) {
    currentDenoiseMethod = method;
    
    // 更新按钮样式
    document.getElementById('btn-denoise-afftdn').classList.toggle('active', method === 'afftdn');
    document.getElementById('btn-denoise-noisereduce').classList.toggle('active', method === 'noisereduce');
    
    // 更新描述
    const desc = document.getElementById('denoise-method-desc');
    if (method === 'noisereduce') {
        desc.textContent = 'AI频谱降噪：基于深度学习，效果更好，处理稍慢';
    } else {
        desc.textContent = 'FFmpeg afftdn：速度快，适合一般噪声环境';
    }
    
    // 保存到本地存储
    localStorage.setItem('denoiseMethod', method);
}
