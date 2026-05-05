/**
 * 录音模块
 */

class AudioRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.startTime = null;
        this.timerInterval = null;
        this.stream = null;
        
        // 波形图相关
        this.audioContext = null;
        this.analyser = null;
        this.canvas = null;
        this.canvasCtx = null;
        this.animationId = null;
        this.debug = false; // 关闭调试
    }

    /**
     * 调试日志
     */
    log(msg) {
        if (this.debug) {
            console.log('[Recorder]', msg);
        }
    }

    /**
     * 初始化波形图Canvas
     */
    initWaveform(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.log('初始化Canvas: ' + canvasId + ', 找到: ' + !!this.canvas);
        
        if (this.canvas) {
            this.canvasCtx = this.canvas.getContext('2d');
            this.log('获取Context: ' + !!this.canvasCtx);
            this.setupCanvas();
            this.drawIdleWaveform();
        }
    }

    /**
     * 设置Canvas尺寸（支持高DPI屏幕）
     */
    setupCanvas() {
        if (!this.canvas) return;
        
        // 获取父容器的宽度
        const parent = this.canvas.parentElement;
        const width = parent ? parent.clientWidth : 300;
        const height = 80;
        
        // 高DPI适配
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';
        
        // 缩放Canvas上下文以匹配DPR
        if (this.canvasCtx) {
            this.canvasCtx.scale(dpr, dpr);
        }
        
        this.log('Canvas尺寸设置: ' + width + 'x' + height + ', DPR: ' + dpr);
    }

    /**
     * 绘制空闲状态波形
     */
    drawIdleWaveform() {
        if (!this.canvas || !this.canvasCtx) {
            this.log('绘制空闲波形失败: canvas或ctx不存在');
            return;
        }
        
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        this.log('绘制空闲波形: ' + width + 'x' + height);
        
        // 清除画布
        this.canvasCtx.clearRect(0, 0, width, height);
        
        // 绘制背景
        this.canvasCtx.fillStyle = '#f5f5f5';
        this.canvasCtx.fillRect(0, 0, width, height);
        
        // 绘制中心线
        this.canvasCtx.strokeStyle = '#cccccc';
        this.canvasCtx.lineWidth = 1;
        this.canvasCtx.setLineDash([5, 5]);
        this.canvasCtx.beginPath();
        this.canvasCtx.moveTo(0, height / 2);
        this.canvasCtx.lineTo(width, height / 2);
        this.canvasCtx.stroke();
        this.canvasCtx.setLineDash([]);
        
        // 绘制提示文字
        this.canvasCtx.fillStyle = '#999999';
        this.canvasCtx.font = '12px sans-serif';
        this.canvasCtx.textAlign = 'center';
        this.canvasCtx.fillText('等待录音...', width / 2, height / 2 - 10);
    }

    /**
     * 开始录音
     */
    async start() {
        this.log('开始录音...');
        
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true
                } 
            });
            
            this.log('获取到麦克风权限');
            
            // 初始化Web Audio API用于波形分析
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.log('AudioContext状态: ' + this.audioContext.state);
            
            const source = this.audioContext.createMediaStreamSource(this.stream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            source.connect(this.analyser);
            
            this.log('音频节点已连接, fftSize: ' + this.analyser.fftSize);
            this.log('frequencyBinCount: ' + this.analyser.frequencyBinCount);
            
            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            
            this.audioChunks = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.start(100);
            this.isRecording = true;
            this.startTime = Date.now();
            this.startTimer();
            this.startWaveformAnimation();
            
            this.log('录音已启动');
            return true;
        } catch (error) {
            console.error('录音启动失败:', error);
            this.log('录音启动失败: ' + error.message);
            showToast('无法启动录音，请检查麦克风权限', 'error');
            return false;
        }
    }

    /**
     * 停止录音
     */
    async stop() {
        return new Promise((resolve) => {
            if (!this.mediaRecorder || !this.isRecording) {
                resolve(null);
                return;
            }

            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                this.isRecording = false;
                this.stopTimer();
                this.stopWaveformAnimation();
                this.stopStream();
                
                setTimeout(() => this.drawIdleWaveform(), 100);
                
                resolve(audioBlob);
            };

            this.mediaRecorder.stop();
        });
    }

    /**
     * 停止媒体流
     */
    stopStream() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }

    /**
     * 开始计时
     */
    startTimer() {
        const timeElement = document.getElementById('recording-time');
        this.timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
            const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const seconds = (elapsed % 60).toString().padStart(2, '0');
            timeElement.textContent = `录音中: ${minutes}:${seconds}`;
        }, 1000);
    }

    /**
     * 停止计时
     */
    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    /**
     * 获取录音时长（秒）
     */
    getDuration() {
        if (!this.startTime) return 0;
        return Math.floor((Date.now() - this.startTime) / 1000);
    }

    /**
     * 开始波形动画
     */
    startWaveformAnimation() {
        if (!this.canvas || !this.analyser) {
            this.log('无法启动波形动画: canvas=' + !!this.canvas + ', analyser=' + !!this.analyser);
            return;
        }
        
        this.log('启动波形动画');
        
        let frameCount = 0;
        
        const draw = () => {
            this.animationId = requestAnimationFrame(draw);
            
            const bufferLength = this.analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            this.analyser.getByteTimeDomainData(dataArray);
            
            // 每100帧记录一次
            frameCount++;
            if (frameCount % 100 === 0) {
                this.log('波形帧: ' + frameCount + ', 数据示例: ' + dataArray[0] + ',' + dataArray[100] + ',' + dataArray[200]);
            }
            
            const width = this.canvas.width;
            const height = this.canvas.height;
            
            // 清除画布
            this.canvasCtx.fillStyle = '#f5f5f5';
            this.canvasCtx.fillRect(0, 0, width, height);
            
            // 绘制波形 - 使用醒目的颜色
            this.canvasCtx.lineWidth = 3;
            this.canvasCtx.strokeStyle = '#6750A4'; // 紫色主题色
            
            this.canvasCtx.beginPath();
            
            const sliceWidth = width / bufferLength;
            let x = 0;
            
            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = v * height / 2;
                
                if (i === 0) {
                    this.canvasCtx.moveTo(x, y);
                } else {
                    this.canvasCtx.lineTo(x, y);
                }
                
                x += sliceWidth;
            }
            
            this.canvasCtx.lineTo(width, height / 2);
            this.canvasCtx.stroke();
            
            // 绘制音量指示条
            this.drawVolumeMeter(dataArray, width, height);
        };
        
        draw();
    }

    /**
     * 绘制音量指示条
     */
    drawVolumeMeter(dataArray, width, height) {
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            const v = (dataArray[i] - 128) / 128;
            sum += v * v;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const volume = Math.min(1, rms * 5); // 放大音量显示
        
        const meterWidth = 8;
        const meterX = width - meterWidth - 10;
        const meterPadding = 5;
        
        // 背景
        this.canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        this.canvasCtx.fillRect(meterX, meterPadding, meterWidth, height - meterPadding * 2);
        
        // 音量条
        const filledHeight = volume * (height - meterPadding * 2);
        
        // 颜色根据音量变化
        let color = '#4CAF50'; // 绿色
        if (volume > 0.7) {
            color = '#F44336'; // 红色
        } else if (volume > 0.4) {
            color = '#FFC107'; // 黄色
        }
        
        this.canvasCtx.fillStyle = color;
        this.canvasCtx.fillRect(
            meterX, 
            height - meterPadding - filledHeight, 
            meterWidth, 
            filledHeight
        );
    }

    /**
     * 停止波形动画
     */
    stopWaveformAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
            this.log('波形动画已停止');
        }
    }
}

// 全局录音器实例
const recorder = new AudioRecorder();
