export class WavRecorder {
    private readonly BUFFER_SIZE = 4096;
    private audioContext: AudioContext;
    private localMediaStream?: MediaStream;
    private mediaStreamSource?: MediaStreamAudioSourceNode;
    private scriptProcessor?: ScriptProcessorNode;
    private audioBufferArray: Array<Float32Array> = [];

    constructor() {
        this.audioContext = new AudioContext();
    }

    requestPermission() {
        return new Promise((resolve, reject) => {
            navigator.getUserMedia({
                audio: true
            }, (_localMediaStream) => {
                this.localMediaStream = _localMediaStream;
                this.mediaStreamSource = this.audioContext.createMediaStreamSource(this.localMediaStream!);
                resolve();
            }, (err) => {
                reject(err);
            });

        })
    }

    start(): void {
        if (!this.mediaStreamSource) {
            throw new Error("MediaStreamSource is null")
        }
        this.scriptProcessor = this.audioContext.createScriptProcessor(this.BUFFER_SIZE, 1, 1);
        this.mediaStreamSource.connect(this.scriptProcessor);
        this.scriptProcessor.onaudioprocess = (event) => {
            const channel = event.inputBuffer.getChannelData(0);
            this.audioBufferArray.push(new Float32Array(channel))
        };
        this.scriptProcessor.connect(this.audioContext.destination);
    }

    stopAndGetWav(): Blob {
        if (this.scriptProcessor === undefined) {
            throw new Error("startRecord()の前に呼ぶな");
        }

        this.scriptProcessor.disconnect();
        if (this.localMediaStream) {
            const stop = this.localMediaStream.stop;
            stop && stop();
            this.localMediaStream = undefined;
        }

        return this.exportBlob()
    }

    encodeWAV(samples: Float32Array, sampleRate: number): DataView {
        const buffer = new ArrayBuffer(44 + samples.length * 2);
        const view = new DataView(buffer);
        const writeString = function (view: DataView, offset: number, string: string) {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i))
            }
        };
        const floatTo16BitPCM = function (output: DataView, offset: number, input: Float32Array) {
            for (let i = 0; i < input.length; i++, offset = offset + 2) {
                const s = Math.max(-1, Math.min(1, input[i]));
                output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
            }
        };
        writeString(view, 0, 'RIFF'); // RIFF header
        view.setUint32(4, 32 + samples.length * 2, true); // file size
        writeString(view, 8, 'WAVE'); // WAVE header
        writeString(view, 12, 'fmt '); // fmt chunk
        view.setUint32(16, 16, true); // bytes of fmt chunk
        view.setUint16(20, 1, true); // format ID
        view.setUint16(22, 1, true); // channels
        view.setUint32(24, sampleRate, true); // sampling late
        view.setUint32(28, sampleRate * 2, true); // data speed
        view.setUint16(32, 2, true); // block size
        view.setUint16(34, 16, true); // bits per sample
        writeString(view, 36, 'data'); // data chunk
        view.setUint32(40, samples.length * 2, true); // bytes of samples
        floatTo16BitPCM(view, 44, samples); // samples
        return view
    }

    mergeBuffers(): Float32Array {
        const buffer = this.audioBufferArray;
        let i, j;
        let sampleLength = 0;
        for (i = 0; i < buffer.length; i++) {
            sampleLength = (sampleLength + buffer[i].length)
        }
        const samples = new Float32Array(sampleLength);
        let sampleIdx = 0;
        for (i = 0; i < buffer.length; i++) {
            for (j = 0; j < buffer[i].length; j++) {
                samples[sampleIdx] = buffer[i][j];
                sampleIdx = (sampleIdx + 1);
            }
        }
        return samples
    }

    exportBlob(): Blob {
        const dataview = this.encodeWAV(this.mergeBuffers(), this.audioContext.sampleRate);
        return new Blob([dataview], {
            type: 'audio/wav'
        })
    }
}
