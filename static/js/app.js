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
let pendingDeleteId = null;
let pendingCacheType = null;

// 批量处理状态
let batchFiles = [];  // 已选择的批量文件列表
let currentBatchTaskId = null;
let batchPollTimer = null;

// 思维导图状态
let currentMindmapData = null;
let isShowingMindmap = false;

// 主题和外观设置
let currentTheme = localStorage.getItem('theme') || 'purple';
let isDarkMode = localStorage.getItem('darkMode') === 'true';
let currentDenoiseMethod = localStorage.getItem('denoiseMethod') || 'afftdn';

// 模型管理状态
let currentActiveModelId = localStorage.getItem('activeModelId') || null;
let pendingModelDeleteId = null;

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
    
    // 如果切换到批量处理，初始化拖拽
    if (tabName === 'batch') {
        initBatchDropZone();
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
        
        // 使用流式转写，显示实时进度
        currentTranscription = '';
        const transcriptionResult = document.getElementById('transcription-result');
        transcriptionResult.textContent = '';
        
        await API.transcribeStream(
            currentFilePath,
            currentChunks,
            // onDelta: 实时显示转写文本
            (delta) => {
                currentTranscription += delta;
                transcriptionResult.textContent = currentTranscription;
                // 自动滚动到底部
                transcriptionResult.scrollTop = transcriptionResult.scrollHeight;
            },
            // onDone: 转写完成
            (data) => {
                currentTaskId = data.task_id;
                
                // 启用总结按钮
                document.getElementById('btn-summary').disabled = false;
                
                // 启用口语优化按钮
                document.getElementById('btn-polish').disabled = false;

                // 显示思维导图按钮
                document.getElementById('btn-mindmap').style.display = 'inline-flex';
                
                // 重置切换按钮状态
                isShowingPolished = false;
                currentPolishedText = '';
                document.getElementById('view-toggle').style.display = 'none';

                // 重置思维导图状态
                currentMindmapData = null;
                isShowingMindmap = false;
                document.getElementById('summary-view-toggle').style.display = 'none';
                document.getElementById('summary-result').style.display = 'block';
                document.getElementById('mindmap-container').style.display = 'none';
                
                hideLoading();
                const chunkInfo = data.chunks_count > 1 ? `（共${data.chunks_count}段）` : '';
                showToast(`转写完成${chunkInfo}！`, 'success');
            },
            // onError: 错误处理
            (error) => {
                hideLoading();
                showToast('转写失败: ' + error.message, 'error');
            },
            // onProgress: 进度提示
            (progress) => {
                document.getElementById('loading-text').textContent = progress.message;
            }
        );
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
    
    // 获取当前选择的模型ID
    const modelId = document.getElementById('model-select')?.value || null;
    
    showLoading('正在生成AI总结...');
    
    try {
        let summaryText = '';
        const summaryResult = document.getElementById('summary-result');
        summaryResult.innerHTML = '';
        
        await API.generateSummaryStream(
            textToSummarize,
            currentTaskId,
            // onChunk: 实时渲染Markdown
            (chunk) => {
                summaryText += chunk;
                summaryResult.innerHTML = renderMarkdown(summaryText);
            },
            // onDone: 完成
            (data) => {
                hideLoading();
                showToast('总结生成完成！', 'success');
            },
            // onError: 错误
            (error) => {
                hideLoading();
                showToast('生成总结失败: ' + error.message, 'error');
            },
            modelId
        );
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
    
    // 列表 - 将连续的li标签合并到一个ul中
    text = text.replace(/^\- (.*$)/gm, '<li>$1</li>');
    text = text.replace(/((?:<li>.*?<\/li>\n?)+)/g, '<ul>$1</ul>');
    
    // 粗体
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // 段落
    text = text.replace(/\n\n/g, '</p><p>');
    text = '<p>' + text + '</p>';
    
    return text;
}

/**
 * 生成思维导图
 */
async function generateMindmap() {
    const textToUse = isShowingPolished ? currentPolishedText : currentTranscription;
    if (!textToUse) {
        showToast('请先完成转写', 'error');
        return;
    }

    const modelId = document.getElementById('model-select')?.value || null;

    showLoading('正在生成思维导图...');

    try {
        const result = await API.generateMindmap(textToUse, currentTaskId, modelId);
        if (result.success) {
            currentMindmapData = result.mindmap;
            showToast('思维导图生成完成！', 'success');

            // 显示思维导图视图切换按钮
            document.getElementById('summary-view-toggle').style.display = 'inline-flex';

            // 切换到思维导图视图
            toggleSummaryView('mindmap');
        }
    } catch (error) {
        showToast('生成思维导图失败: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * 切换总结视图（列表/思维导图）
 */
function toggleSummaryView(view) {
    const listBtn = document.getElementById('btn-view-list');
    const mindmapBtn = document.getElementById('btn-view-mindmap');
    const summaryResult = document.getElementById('summary-result');
    const mindmapContainer = document.getElementById('mindmap-container');

    if (view === 'list') {
        summaryResult.style.display = 'block';
        mindmapContainer.style.display = 'none';
        listBtn.classList.add('active');
        mindmapBtn.classList.remove('active');
        isShowingMindmap = false;
    } else {
        summaryResult.style.display = 'none';
        mindmapContainer.style.display = 'block';
        listBtn.classList.remove('active');
        mindmapBtn.classList.add('active');
        isShowingMindmap = true;

        // 渲染思维导图
        if (currentMindmapData) {
            Mindmap.init('mindmap-canvas');
            Mindmap._currentData = currentMindmapData;
            Mindmap.render(currentMindmapData);
        }
    }
}

// ========== 知识点解析 ==========

// 解析对话状态
let explainKeyword = '';
let explainContext = '';
let explainHistory = [];  // [{role, content}]
let explainBusy = false;

/**
 * 打开知识点解析弹窗
 */
function openExplainDialog(keyword) {
    explainKeyword = keyword;
    explainContext = isShowingPolished ? currentPolishedText : currentTranscription;
    explainHistory = [];
    explainBusy = false;

    document.getElementById('explain-keyword').textContent = keyword;
    document.getElementById('explain-messages').innerHTML = '';
    document.getElementById('explain-input').value = '';
    document.getElementById('explain-modal').style.display = 'flex';

    // 自动开始首次解析
    startExplain();
}

/**
 * 关闭知识点解析弹窗
 */
function closeExplainDialog() {
    document.getElementById('explain-modal').style.display = 'none';
}

/**
 * 开始首次知识点解析
 */
async function startExplain() {
    if (!explainContext) {
        appendExplainMessage('assistant', '没有可用的课程文本，请先完成转写。');
        return;
    }

    const modelId = document.getElementById('model-select')?.value || null;

    // 添加用户消息
    appendExplainMessage('user', `请帮我详细解析「${explainKeyword}」这个知识点`);

    // 添加AI消息占位
    const aiMsgEl = appendExplainMessage('assistant', '', true);
    const contentEl = aiMsgEl.querySelector('.msg-content');
    explainBusy = true;

    let fullText = '';

    try {
        await API.explainKeywordStream(
            explainKeyword,
            explainContext,
            (chunk) => {
                fullText += chunk;
                contentEl.innerHTML = renderMarkdown(fullText);
                scrollExplainToBottom();
            },
            () => {
                explainBusy = false;
                contentEl.innerHTML = renderMarkdown(fullText);
                explainHistory.push({ role: 'user', content: `请帮我详细解析「${explainKeyword}」这个知识点` });
                explainHistory.push({ role: 'assistant', content: fullText });
                hideExplainTyping();
                scrollExplainToBottom();
            },
            (error) => {
                explainBusy = false;
                contentEl.innerHTML = `<p style="color: var(--md-error);">解析失败: ${error.message}</p>`;
                hideExplainTyping();
            },
            modelId
        );
    } catch (error) {
        explainBusy = false;
        contentEl.innerHTML = `<p style="color: var(--md-error);">解析失败: ${error.message}</p>`;
        hideExplainTyping();
    }
}

/**
 * 发送追问
 */
async function sendExplainFollowup() {
    if (explainBusy) return;

    const input = document.getElementById('explain-input');
    const question = input.value.trim();
    if (!question) return;

    input.value = '';
    input.style.height = 'auto';

    const modelId = document.getElementById('model-select')?.value || null;

    // 添加用户消息
    appendExplainMessage('user', question);

    // 添加AI消息占位
    const aiMsgEl = appendExplainMessage('assistant', '', true);
    const contentEl = aiMsgEl.querySelector('.msg-content');
    explainBusy = true;

    let fullText = '';

    try {
        await API.explainFollowupStream(
            explainKeyword,
            explainContext,
            explainHistory,
            question,
            (chunk) => {
                fullText += chunk;
                contentEl.innerHTML = renderMarkdown(fullText);
                scrollExplainToBottom();
            },
            () => {
                explainBusy = false;
                contentEl.innerHTML = renderMarkdown(fullText);
                explainHistory.push({ role: 'user', content: question });
                explainHistory.push({ role: 'assistant', content: fullText });
                hideExplainTyping();
                scrollExplainToBottom();
            },
            (error) => {
                explainBusy = false;
                contentEl.innerHTML = `<p style="color: var(--md-error);">回答失败: ${error.message}</p>`;
                hideExplainTyping();
            },
            modelId
        );
    } catch (error) {
        explainBusy = false;
        contentEl.innerHTML = `<p style="color: var(--md-error);">回答失败: ${error.message}</p>`;
        hideExplainTyping();
    }
}

/**
 * 追加消息到对话区
 * @param {string} role - 'user' 或 'assistant'
 * @param {string} content - 消息内容
 * @param {boolean} isStreaming - 是否为流式消息（显示光标）
 */
function appendExplainMessage(role, content, isStreaming = false) {
    const container = document.getElementById('explain-messages');

    const msgEl = document.createElement('div');
    msgEl.className = `explain-msg explain-msg-${role}`;

    if (role === 'user') {
        msgEl.innerHTML = `
            <div class="msg-bubble msg-bubble-user">
                <div class="msg-content">${escapeHtml(content)}</div>
            </div>
        `;
    } else {
        msgEl.innerHTML = `
            <div class="msg-avatar">
                <span class="material-icons-outlined">smart_toy</span>
            </div>
            <div class="msg-bubble msg-bubble-ai">
                <div class="msg-content">${isStreaming ? '<span class="typing-cursor"></span>' : renderMarkdown(content)}</div>
            </div>
        `;
    }

    container.appendChild(msgEl);
    scrollExplainToBottom();

    return msgEl;
}

/**
 * 隐藏输入中的光标
 */
function hideExplainTyping() {
    const cursors = document.querySelectorAll('#explain-messages .typing-cursor');
    cursors.forEach(c => c.remove());
}

/**
 * 滚动到底部
 */
function scrollExplainToBottom() {
    const container = document.getElementById('explain-messages');
    container.scrollTop = container.scrollHeight;
}

// ========== 批量处理功能 ==========

/**
 * 初始化批量拖拽区域
 */
function initBatchDropZone() {
    const dropZone = document.getElementById('batch-drop-zone');
    if (!dropZone || dropZone._initialized) return;
    dropZone._initialized = true;

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

        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            addBatchFiles(files);
        }
    });
}

/**
 * 处理批量文件选择
 */
function handleBatchFileSelect(input) {
    const files = Array.from(input.files);
    if (files.length > 0) {
        addBatchFiles(files);
    }
    input.value = '';  // 重置input以便重复选择
}

/**
 * 添加文件到批量列表
 */
function addBatchFiles(files) {
    for (const file of files) {
        // 检查是否已存在
        if (batchFiles.some(f => f.name === file.name && f.size === file.size)) {
            continue;
        }
        batchFiles.push(file);
    }

    // 限制最多20个
    if (batchFiles.length > 20) {
        batchFiles = batchFiles.slice(0, 20);
        showToast('最多支持20个文件，已截取前20个', 'warning');
    }

    renderBatchFileList();
    document.getElementById('btn-batch-start').disabled = batchFiles.length === 0;
}

/**
 * 从批量列表移除文件
 */
function removeBatchFile(index) {
    batchFiles.splice(index, 1);
    renderBatchFileList();
    document.getElementById('btn-batch-start').disabled = batchFiles.length === 0;
}

/**
 * 渲染批量文件列表
 */
function renderBatchFileList() {
    const container = document.getElementById('batch-files-container');
    const fileList = document.getElementById('batch-file-list');

    if (batchFiles.length === 0) {
        fileList.style.display = 'none';
        return;
    }

    fileList.style.display = 'block';

    container.innerHTML = batchFiles.map((file, index) => `
        <div class="batch-file-item">
            <div class="file-icon">🎵</div>
            <div class="file-info">
                <div class="file-name">${escapeHtml(file.name)}</div>
                <div class="file-size">${formatFileSize(file.size)}</div>
            </div>
            <button class="file-remove" onclick="removeBatchFile(${index})" title="移除">
                <span class="material-icons-outlined" style="font-size: 16px;">close</span>
            </button>
        </div>
    `).join('');
}

/**
 * 开始批量处理
 */
async function startBatchProcess() {
    if (batchFiles.length === 0) {
        showToast('请先选择文件', 'error');
        return;
    }

    const enableDenoise = document.getElementById('batch-enable-denoise').checked;
    const autoSummary = document.getElementById('batch-auto-summary').checked;

    showLoading(`正在上传 ${batchFiles.length} 个文件...`);

    try {
        // 1. 批量上传
        const uploadResult = await API.batchUpload(batchFiles, enableDenoise, currentDenoiseMethod);

        if (!uploadResult.success) {
            throw new Error('上传失败');
        }

        // 2. 过滤成功的文件
        const successFiles = uploadResult.files.filter(f => f.success);
        if (successFiles.length === 0) {
            throw new Error('没有成功上传的文件');
        }

        // 3. 启动批量处理
        showLoading('正在启动批量处理...');
        const batchResult = await API.startBatch(
            successFiles.map(f => ({
                filename: f.filename,
                file_path: f.file_path,
                chunks: f.chunks
            })),
            autoSummary
        );

        currentBatchTaskId = batchResult.task_id;

        // 4. 清空文件列表
        batchFiles = [];
        renderBatchFileList();
        document.getElementById('btn-batch-start').disabled = true;

        hideLoading();
        showToast(`批量任务已启动，共 ${batchResult.total} 个文件`, 'success');

        // 5. 开始轮询状态
        startBatchPolling();

    } catch (error) {
        hideLoading();
        showToast('批量处理失败: ' + error.message, 'error');
    }
}

/**
 * 开始轮询批量任务状态
 */
function startBatchPolling() {
    if (batchPollTimer) {
        clearInterval(batchPollTimer);
    }

    updateBatchStatus();  // 立即执行一次

    batchPollTimer = setInterval(async () => {
        await updateBatchStatus();
    }, 2000);
}

/**
 * 更新批量任务状态
 */
async function updateBatchStatus() {
    if (!currentBatchTaskId) return;

    try {
        const result = await API.getBatchStatus(currentBatchTaskId);
        const task = result.task;

        // 更新进度信息
        const taskInfo = document.getElementById('batch-task-info');
        taskInfo.style.display = 'block';

        const statusText = document.getElementById('batch-task-status');
        const countText = document.getElementById('batch-task-count');
        const progressBar = document.getElementById('batch-progress-bar');

        statusText.textContent = getStatusText(task.status);
        countText.textContent = `${task.completed + task.failed}/${task.total}`;
        progressBar.style.width = `${((task.completed + task.failed) / task.total) * 100}%`;

        // 渲染任务列表
        renderBatchTaskList(task.items);

        // 如果任务完成，停止轮询
        if (task.status === 'done' || task.status === 'partial_error') {
            clearInterval(batchPollTimer);
            batchPollTimer = null;

            if (task.failed === 0) {
                showToast(`批量处理完成！共 ${task.completed} 个文件`, 'success');
            } else {
                showToast(`批量处理完成，${task.completed} 成功，${task.failed} 失败`, 'warning');
            }
        }
    } catch (error) {
        console.error('获取批量状态失败:', error);
    }
}

/**
 * 渲染批量任务列表
 */
function renderBatchTaskList(items) {
    const container = document.getElementById('batch-task-list');

    container.innerHTML = items.map(item => {
        const iconClass = item.status;
        const iconMap = {
            'pending': 'hourglass_empty',
            'transcribing': 'mic',
            'summarizing': 'auto_awesome',
            'done': 'check_circle',
            'error': 'error'
        };

        return `
            <div class="batch-task-item task-${item.status}">
                <div class="task-icon ${iconClass}">
                    <span class="material-icons-outlined">${iconMap[item.status] || 'hourglass_empty'}</span>
                </div>
                <div class="task-info">
                    <div class="task-filename">${escapeHtml(item.filename)}</div>
                    <div class="task-status">${item.progress_message || getStatusText(item.status)}</div>
                </div>
                <div class="task-actions">
                    ${item.status === 'done' && item.record_id ? `
                        <button onclick="viewRecord('${item.record_id}')" class="md-btn md-btn-text md-btn-sm" title="查看">
                            <span class="material-icons-outlined" style="font-size: 16px;">visibility</span>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * 获取状态文本
 */
function getStatusText(status) {
    const map = {
        'pending': '等待中',
        'processing': '处理中',
        'done': '已完成',
        'partial_error': '部分失败'
    };
    return map[status] || status;
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
                document.getElementById('btn-polish').disabled = false;

                // 显示思维导图按钮
                document.getElementById('btn-mindmap').style.display = 'inline-flex';
                
                // 重置切换按钮状态
                isShowingPolished = false;
                currentPolishedText = '';
                document.getElementById('view-toggle').style.display = 'none';

                // 重置思维导图状态
                currentMindmapData = null;
                isShowingMindmap = false;
                document.getElementById('summary-view-toggle').style.display = 'none';
                document.getElementById('summary-result').style.display = 'block';
                document.getElementById('mindmap-container').style.display = 'none';
                
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
            btn.className = 'md-btn md-btn-tonal recording-active';
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
    
    // 获取当前选择的模型ID
    const modelId = document.getElementById('model-select')?.value || null;
    
    showLoading('正在优化口语表达...');
    
    try {
        currentPolishedText = '';
        const polishedResult = document.getElementById('transcription-result');
        
        await API.polishTextStream(
            currentTranscription,
            currentTaskId,
            // onChunk: 实时显示优化文本
            (chunk) => {
                currentPolishedText += chunk;
                polishedResult.textContent = currentPolishedText;
            },
            // onDone: 完成
            (data) => {
                // 显示切换按钮
                document.getElementById('view-toggle').style.display = 'inline-flex';
                
                // 切换到优化后视图
                toggleTranscriptionView('polished');
                
                hideLoading();
                showToast('口语优化完成！', 'success');
            },
            // onError: 错误
            (error) => {
                hideLoading();
                showToast('优化失败: ' + error.message, 'error');
            },
            modelId
        );
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

        // 显示思维导图按钮
        document.getElementById('btn-mindmap').style.display = 'inline-flex';
        
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

        // 重置思维导图状态
        currentMindmapData = null;
        isShowingMindmap = false;
        document.getElementById('summary-view-toggle').style.display = 'none';
        document.getElementById('summary-result').style.display = 'block';
        document.getElementById('mindmap-container').style.display = 'none';

        if (record.summary) {
            document.getElementById('summary-result').innerHTML = renderMarkdown(record.summary);
        } else {
            document.getElementById('summary-result').innerHTML = '<p style="color: var(--md-outline); font-style: italic;">等待生成总结...</p>';
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
    
    // 加载模型列表
    loadModelList();
});

// 窗口完全加载后初始化波形图（确保canvas尺寸正确）
window.addEventListener('load', () => {
    console.log('Window loaded, initializing waveform...');
    // 延迟确保DOM完全渲染
    setTimeout(() => {
        recorder.initWaveform('waveform-canvas');
    }, 200);
});

/**
 * 打开设置弹窗
 */
async function openSettings() {
    document.getElementById('settings-modal').style.display = 'flex';
    await loadConfig();
    await loadCacheInfo();
    await loadModelListForSettings();
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
        
        // 填充ASR配置
        document.getElementById('step-api-key').placeholder = config.step_api_key || 'sk-...';
        
        // 显示Key状态
        const stepStatus = document.getElementById('step-key-status');
        stepStatus.textContent = config.step_api_key_set ? '✓ 已配置' : '✗ 未配置';
        stepStatus.style.color = config.step_api_key_set ? '#4CAF50' : '#F44336';
        
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
    // 检查是否是删除模型操作
    if (pendingModelDeleteId) {
        const deleteId = pendingModelDeleteId;
        pendingModelDeleteId = null;
        closeConfirm();
        
        try {
            await API.deleteModel(deleteId);
            showToast('模型已删除', 'success');
            await loadModelListForSettings();
            await loadModelList();
        } catch (error) {
            showToast('删除失败: ' + error.message, 'error');
        }
        return;
    }
    
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
    
    // 只保存ASR配置
    const stepKey = document.getElementById('step-api-key').value;
    if (stepKey) config.step_api_key = stepKey;
    
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

// ========== 模型管理功能 ==========

/**
 * 加载模型列表（顶部下拉框）
 */
async function loadModelList() {
    try {
        const result = await API.getModels();
        const models = result.models || [];
        const activeId = result.active_model_id;
        
        const select = document.getElementById('model-select');
        if (!select) return;
        
        if (models.length === 0) {
            select.innerHTML = '<option value="">未配置模型</option>';
            return;
        }
        
        // 保存激活模型ID
        currentActiveModelId = activeId;
        localStorage.setItem('activeModelId', activeId || '');
        
        // 渲染下拉选项
        select.innerHTML = models.map(m => {
            const isDefault = m.is_default ? ' (默认)' : '';
            const isActive = m.id === activeId ? ' ✓' : '';
            return `<option value="${m.id}" ${m.id === activeId ? 'selected' : ''}>${escapeHtml(m.display_name)}${isDefault}${isActive}</option>`;
        }).join('');
        
    } catch (error) {
        console.error('加载模型列表失败:', error);
    }
}

/**
 * 切换模型
 */
async function switchModel(modelId) {
    if (!modelId) return;
    
    try {
        await API.activateModel(modelId);
        currentActiveModelId = modelId;
        localStorage.setItem('activeModelId', modelId);
        showToast('模型已切换', 'success');
        
        // 重新加载列表更新状态
        await loadModelList();
    } catch (error) {
        showToast('切换模型失败: ' + error.message, 'error');
    }
}

/**
 * 加载设置页面的模型列表
 */
async function loadModelListForSettings() {
    try {
        const result = await API.getModels();
        const models = result.models || [];
        const activeId = result.active_model_id;
        
        const container = document.getElementById('model-list-container');
        if (!container) return;
        
        if (models.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 16px; color: var(--md-outline);">
                    <p>暂未配置任何模型</p>
                    <p style="font-size: 12px; margin-top: 8px;">点击下方按钮添加模型或从环境变量导入</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = models.map(m => {
            const isActive = m.id === activeId;
            const defaultBadge = m.is_default ? '<span style="font-size: 11px; padding: 2px 6px; background: var(--md-primary-container); color: var(--md-on-primary-container); border-radius: 4px;">默认</span>' : '';
            const activeBadge = isActive ? '<span style="font-size: 11px; padding: 2px 6px; background: var(--md-tertiary-container); color: var(--md-on-tertiary-container); border-radius: 4px;">当前使用</span>' : '';
            
            return `
                <div style="display: flex; align-items: center; padding: 12px; border: 1px solid ${isActive ? 'var(--md-primary)' : 'var(--md-outline-variant)'}; border-radius: 8px; margin-bottom: 8px; background: ${isActive ? 'var(--md-primary-container)' : 'var(--md-surface)'};">
                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                            <span style="font-weight: 500; color: var(--md-on-surface);">${escapeHtml(m.display_name)}</span>
                            ${defaultBadge}
                            ${activeBadge}
                        </div>
                        <div style="font-size: 12px; color: var(--md-on-surface-variant);">
                            ${escapeHtml(m.base_url)} · ${escapeHtml(m.model)}
                            ${m.usage_count > 0 ? ` · 调用${m.usage_count}次` : ''}
                        </div>
                    </div>
                    <div style="display: flex; gap: 4px; flex-shrink: 0;">
                        <button onclick="editModel('${m.id}')" class="md-btn md-btn-text md-btn-sm" title="编辑">
                            <span class="material-icons-outlined" style="font-size: 18px;">edit</span>
                        </button>
                        <button onclick="testModel('${m.id}')" class="md-btn md-btn-text md-btn-sm" title="测试连接">
                            <span class="material-icons-outlined" style="font-size: 18px;">wifi_tethering</span>
                        </button>
                        <button onclick="confirmDeleteModel('${m.id}', '${escapeHtml(m.display_name)}')" class="md-btn md-btn-text md-btn-sm" style="color: var(--md-error);" title="删除">
                            <span class="material-icons-outlined" style="font-size: 18px;">delete</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        // 加载用量统计
        await loadModelUsageStats();
        
    } catch (error) {
        console.error('加载模型列表失败:', error);
    }
}

/**
 * 加载模型用量统计
 */
async function loadModelUsageStats() {
    try {
        const result = await API.getModelUsageStats();
        const stats = result.stats || [];
        
        const container = document.getElementById('model-usage-container');
        const statsDiv = document.getElementById('model-usage-stats');
        
        if (!stats.some(s => s.call_count > 0)) {
            container.style.display = 'none';
            return;
        }
        
        container.style.display = 'block';
        statsDiv.innerHTML = stats.filter(s => s.call_count > 0).map(s => `
            <div style="display: flex; justify-content: space-between; padding: 8px; font-size: 12px; border-bottom: 1px solid var(--md-outline-variant);">
                <span style="color: var(--md-on-surface);">${escapeHtml(s.display_name)}</span>
                <span style="color: var(--md-on-surface-variant);">
                    ${s.call_count}次 · ${s.total_tokens.toLocaleString()} tokens
                </span>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('加载用量统计失败:', error);
    }
}

/**
 * 打开添加模型对话框
 */
function openAddModelDialog() {
    document.getElementById('model-edit-title').textContent = '添加模型';
    document.getElementById('model-edit-id').value = '';
    document.getElementById('model-edit-name').value = '';
    document.getElementById('model-edit-display-name').value = '';
    document.getElementById('model-edit-api-key').value = '';
    document.getElementById('model-edit-base-url').value = 'https://api.deepseek.com';
    document.getElementById('model-edit-model').value = 'deepseek-chat';
    document.getElementById('model-edit-description').value = '';
    document.getElementById('model-edit-is-default').checked = false;
    
    document.getElementById('model-edit-modal').style.display = 'flex';
}

/**
 * 编辑模型
 */
async function editModel(modelId) {
    try {
        const result = await API.getModel(modelId);
        const model = result.model;
        
        document.getElementById('model-edit-title').textContent = '编辑模型';
        document.getElementById('model-edit-id').value = model.id;
        document.getElementById('model-edit-name').value = model.name;
        document.getElementById('model-edit-display-name').value = model.display_name;
        document.getElementById('model-edit-api-key').value = '';
        document.getElementById('model-edit-api-key').placeholder = model.api_key_masked || '请输入新的API Key';
        document.getElementById('model-edit-base-url').value = model.base_url;
        document.getElementById('model-edit-model').value = model.model;
        document.getElementById('model-edit-description').value = model.description || '';
        document.getElementById('model-edit-is-default').checked = model.is_default;
        
        document.getElementById('model-edit-modal').style.display = 'flex';
    } catch (error) {
        showToast('获取模型信息失败: ' + error.message, 'error');
    }
}

/**
 * 关闭模型编辑对话框
 */
function closeModelEdit() {
    document.getElementById('model-edit-modal').style.display = 'none';
}

/**
 * 保存模型编辑
 */
async function saveModelEdit() {
    const modelId = document.getElementById('model-edit-id').value;
    const name = document.getElementById('model-edit-name').value.trim();
    const displayName = document.getElementById('model-edit-display-name').value.trim();
    const apiKey = document.getElementById('model-edit-api-key').value;
    const baseUrl = document.getElementById('model-edit-base-url').value.trim();
    const model = document.getElementById('model-edit-model').value.trim();
    const description = document.getElementById('model-edit-description').value.trim();
    const isDefault = document.getElementById('model-edit-is-default').checked;
    
    // 验证必填字段
    if (!name || !displayName || !baseUrl || !model) {
        showToast('请填写所有必填字段', 'error');
        return;
    }
    
    if (!modelId && !apiKey) {
        showToast('请输入API Key', 'error');
        return;
    }
    
    try {
        if (modelId) {
            // 更新模型
            const data = {
                display_name: displayName,
                base_url: baseUrl,
                model: model,
                description: description || null,
                is_default: isDefault
            };
            if (apiKey) {
                data.api_key = apiKey;
            }
            
            await API.updateModel(modelId, data);
            showToast('模型配置已更新', 'success');
        } else {
            // 创建模型
            await API.createModel({
                name: name,
                display_name: displayName,
                api_key: apiKey,
                base_url: baseUrl,
                model: model,
                description: description || null,
                is_default: isDefault
            });
            showToast('模型配置已创建', 'success');
        }
        
        closeModelEdit();
        
        // 刷新列表
        await loadModelListForSettings();
        await loadModelList();
        
    } catch (error) {
        showToast('保存失败: ' + error.message, 'error');
    }
}

/**
 * 测试模型编辑对话框中的连接
 */
async function testModelEditConnection() {
    const modelId = document.getElementById('model-edit-id').value;
    const apiKey = document.getElementById('model-edit-api-key').value;
    const baseUrl = document.getElementById('model-edit-base-url').value.trim();
    const model = document.getElementById('model-edit-model').value.trim();
    
    if (!baseUrl || !model) {
        showToast('请填写Base URL和模型名称', 'error');
        return;
    }
    
    if (modelId) {
        // 测试已保存的模型
        showLoading('正在测试连接...');
        try {
            const result = await API.testModelConnection(modelId);
            hideLoading();
            showToast(result.message, result.success ? 'success' : 'error');
        } catch (error) {
            hideLoading();
            showToast('测试失败: ' + error.message, 'error');
        }
    } else if (apiKey) {
        // 新模型需要先保存才能测试
        showToast('请先保存模型配置后再测试', 'info');
    } else {
        showToast('请输入API Key', 'error');
    }
}

/**
 * 测试已保存的模型
 */
async function testModel(modelId) {
    showLoading('正在测试连接...');
    try {
        const result = await API.testModelConnection(modelId);
        hideLoading();
        showToast(result.message, result.success ? 'success' : 'error');
    } catch (error) {
        hideLoading();
        showToast('测试失败: ' + error.message, 'error');
    }
}

/**
 * 确认删除模型
 */
function confirmDeleteModel(modelId, modelName) {
    pendingModelDeleteId = modelId;
    document.getElementById('confirm-title').textContent = '删除模型';
    document.getElementById('confirm-message').textContent = `确定要删除模型 "${modelName}" 吗？此操作不可恢复。`;
    document.getElementById('confirm-modal').style.display = 'flex';
}

/**
 * 从环境变量导入模型
 */
async function importModelFromEnv() {
    showLoading('正在从环境变量导入...');
    try {
        const result = await API.importModelFromEnv();
        hideLoading();
        
        if (result.success) {
            showToast(result.message, 'success');
            await loadModelListForSettings();
            await loadModelList();
        } else {
            showToast(result.message, 'info');
        }
    } catch (error) {
        hideLoading();
        showToast('导入失败: ' + error.message, 'error');
    }
}
