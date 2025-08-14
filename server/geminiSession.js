import { GoogleGenAI,Modality } from "@google/genai";

/**
 * Opens a Live Api session and wires callbacks.
 * Return { session, close }.
 */

export async function openGeminiSession({
    apiKey,
    model,
    systemInstruction,
    onMessage,
    onOpen,
    onError,
    onClose,
}){
    const ai = new GoogleGenAI({ apiKey});

    const session = await ai.live.connect({
        model,
        config:{
            responseModalities: [Modality.AUDIO],
            systemInstruction,
            //Defaults enable VAD/barge-in for native audio dialog.
        },
        callbacks: {
            onopen : ()=> onOpen?.(),
            onmessage: (msg) => onMessage?.(msg),
            onerror: (e)=> onError?.(e),
            onclose: (e)=> onClose?.(e),
        },
    });

    return {
        session,
        close : ()=> session.close(),
    };
}