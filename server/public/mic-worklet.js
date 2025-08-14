class MicProcessor extends AudioWorkletProcessor{
    constructor(){
        super();
        this.decimator = 3;
    }

    static floatTo16BitPCM(float32){
        const out = new Int16Array(float32.length);
        for(let i=0; i < float32.length; i++){
            let s = Math.max(-1, Math.min(1, float32[i]));
            out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        return out;
    }
    process(inputs){
        const input = inputs[0];
        if(!input || !input[0]) return true;
        const ch0= input[0];
        const decimated = new Float32Array(Math.ceil(ch0.length / this.decimator));
        let j = 0;
        for (let i = 0; i < ch0.length; i += this.decimator) decimated[j++] = ch0[i];
        const pcm16 = MicProcessor.floatTo16BitPCM(decimated);
        this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
        return true;
    }
}
registerProcessor('mic-processor', MicProcessor);