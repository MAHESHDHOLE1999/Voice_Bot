export function toBase64(buffer){
    return Buffer.from(buffer).toString('base64');
}

export function fromBase64(b64){
    return Buffer.from(b64, 'base64');
}

export function ts(){
    return new Date().toISOString();
}