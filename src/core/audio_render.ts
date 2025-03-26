export interface AudioRenderer {
    render(data: number): void
}

export class WebAudioRenderer implements AudioRenderer {
    private audioContext: AudioContext;
    private readonly sampleRate: number;
    private bufferSize: number = 2048; // 缓冲区大小  
    private scriptNode: ScriptProcessorNode;
    private readonly audioBuffer: Float32Array;
    private bufferIndex: number = 0;
    private isPlaying: boolean = false;

    constructor() {
        // 创建音频上下文  
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.sampleRate = this.audioContext.sampleRate;

        // 创建缓冲区  
        this.audioBuffer = new Float32Array(this.bufferSize);

        // 创建脚本处理节点  
        this.scriptNode = this.audioContext.createScriptProcessor(
            this.bufferSize, 0, 1 // 缓冲大小，输入通道，输出通道  
        );

        // 设置音频处理回调  
        this.scriptNode.onaudioprocess = this.processAudio.bind(this);
    }

    /**
     * 渲染APU输出的采样数据
     * @param data 从FC/NES APU输出的PCM样本(-128到127范围)
     */
    render(data: number): void {
        console.log(data)
        // 确保我们正在播放  
        if (!this.isPlaying) {
            this.start();
        }

        // 转换样本为-1.0到1.0范围的float  
        // NES/FC APU通常输出-128到127范围的数据  
        const normalizedSample = data / 128.0;

        // 添加到缓冲区  
        this.audioBuffer[this.bufferIndex] = normalizedSample;
        this.bufferIndex = (this.bufferIndex + 1) % this.bufferSize;
    }

    /**
     * 处理音频回调
     */
    private processAudio(e: AudioProcessingEvent): void {
        const output = e.outputBuffer.getChannelData(0);

        // 填充输出缓冲区  
        for (let i = 0; i < output.length; i++) {
            // 简单地从我们的环形缓冲区复制，可能需要更复杂的重采样  
            const bufferPos = (this.bufferIndex + i) % this.bufferSize;
            output[i] = this.audioBuffer[bufferPos];
        }
    }

    /**
     * 开始音频渲染
     */
    start(): void {
        if (!this.isPlaying) {
            // 确保音频上下文处于运行状态  
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }

            // 连接脚本节点到目标  
            this.scriptNode.connect(this.audioContext.destination);
            this.isPlaying = true;

            // 清空缓冲区  
            this.audioBuffer.fill(0);
            this.bufferIndex = 0;
        }
    }

    /**
     * 停止音频渲染
     */
    stop(): void {
        if (this.isPlaying) {
            this.scriptNode.disconnect();
            this.isPlaying = false;
        }
    }

    /**
     * 设置音量 (0-1)
     */
    setVolume(volume: number): void {
        // 可以添加音量控制，例如使用GainNode  
        // 这里暂时省略  
    }

    /**
     * 确保音频上下文正在运行（由于自动播放策略需要）
     */
    resume(): Promise<void> {
        if (this.audioContext.state === 'suspended') {
            return this.audioContext.resume();
        }
        return Promise.resolve();
    }

    /**
     * 清理资源
     */
    dispose(): void {
        this.stop();
        if (this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
    }
}  