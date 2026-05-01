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
    }

    /**
     * 开始录音
     */
    async start() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true
                } 
            });
            
            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            
            this.audioChunks = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.start(100); // 每100ms收集一次数据
            this.isRecording = true;
            this.startTime = Date.now();
            this.startTimer();
            
            return true;
        } catch (error) {
            console.error('录音启动失败:', error);
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
                this.stopStream();
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
}

// 全局录音器实例
const recorder = new AudioRecorder();
