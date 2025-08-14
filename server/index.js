import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { openGeminiSession } from './geminiSession.js';
import { fromBase64, toBase64, ts } from './utils.js';
import { text } from 'stream/consumers';
import e from 'express';

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-preview-native-audio-dialog';

if(!GEMINI_API_KEY){
    console.error('[boot] Missing GEMINI_API_KEY in .env');
    process.exit(1);
}

const app = express();
app.use(express.static('public'));
app.get('/health', (_,res)=> res.json({ ok: true, t: Date.now()}));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', perMessageDeflate: false});

wss.on('connection', async(client)=>{
    const id = uuidv4();
    console.log(`[${ts()}] client connected ${id}`);

    let gemini;
    let speaking = false;

    function sentToClient(type, payload){
        try {
            client.send(JSON.stringify({type, ...payload}));
        } catch (error) {
            console.warn(`[${ts()}] ws send error`, error?.message);
        }
    }

    //Open a Live API session per client
    try {
        gemini = await openGeminiSession({
            apiKey : GEMINI_API_KEY,
            model : GEMINI_MODEL,
            systemInstruction : `You are "Rev", a friendly, concise showroom assistant for Revolt Motors in India. Only answer questions about Revolt products, pricing, availability, test rides, charging, EMI/finance, service, and dealership information. Politely redirect unrelated queries. Speak clearly, keep responses short, and adapt language to the user.`,
            onOpen: ()=>{
                sentToClient('ready', { model: GEMINI_MODEL});
            },
            onMessage: (message) =>{
                // 1) Streamed audio from Gemini -> forward as raw PCM bytes to client
                if( message?.data){
                    const raw = fromBase64(message.data); //16 bit PCM @ 24KHz
                    client.send(raw, {binary:true}); //lowest overhead path
                    speaking = true;
                    return
                }

                //2) Structured events (transcript, turn boundaries)
                const sc = message?.serverContent;
                if(sc?.modelTurn?.parts?.length){
                    const parts = sc.modelTurn.parts;
                    const textParts = parts
                    .filter((p)=> p?.text)
                    .map((p)=> p.text)
                    .join(' ');
                    if( textParts){
                        sentToClient('transcript', {text : textParts, partial : !sc.turnComplete });
                    }
                }

                if(sc?.turnComplete){
                    speaking = false;
                    sentToClient('turnComplete', {});
                }
            },
            onError: (e)=>{
                console.error(`[${ts()}] gemini error`, e?.message || e);
                sentToClient('error', { message : e?.message || 'Gemini error'});
            },
            onClose: (e) =>{
                console.log(`[${ts()}] gemini closed`, e?.reason || '');
                sentToClient('closed',{});
            },
        });
    } catch (error) {
        console.error(`[${ts()}] failed to open gemini session`, e?.message || e);
        sentToClient('error', { message: 'Failed to open Live API session' });
        client.close();
        return;
    }

    //Message from the browser
    client.on('message', async (data, isBinary)=>{
        try {
            if(isBinary){
                //Binary mic chunk (Int16 PCM @ 16kHz)
                const base64Audio = toBase64(data);
                await gemini.session.sendRealtimeInput({
                    audio: {
                        data: base64Audio,
                        mimeType: 'audio/pcm;rate=16000',
                    },
                });
                // Inform client to immediately pause any local playback (barge-in UX)
                if (speaking){
                    sentToClient('bargeIn', {});
                }
                return;
            }

            //JSON control message
            const msg = JSON.parse(data.toString('utf-8'));
            if(msg.type === 'text'){
                await gemini.session.sendRealtimeInput({ text: msg.text});

            }else if(msg.type === 'endTurn'){
                // optional marker if you implement push-to-talk
                await gemini.session.sendRealtimeInput({ action: 'finish'});
            }
        } catch (error) {
            console.warn(`[${ts()}] client -> server handling error`, e?.message);
        }
    });

    client.on('close', ()=>{
        console.log(`[${ts()}] client closed ${id}`);
        try{ gemini?.close();}catch{}
    })
});

server.listen(PORT, ()=>{
    console.log(`[boot] http://localhost:${PORT}`);
});