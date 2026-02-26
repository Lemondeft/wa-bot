import fs from 'fs';
import path from 'path';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

const DIR = './history';

if (!fs.existsSync(DIR)) fs.mkdirSync(DIR);

function filePath(jid: string): string {
    const safe = jid.split('@')[0]
    return path.join(DIR, `${safe}.json`);
}

export function loadHistory(jid: string): Message[] {
    const fp = filePath(jid);
    if (!fs.existsSync(fp)) return [];
    return JSON.parse(fs.readFileSync(fp, 'utf-8')) as Message[];
}

export function saveHistory(jid: string, history: Message[]): void {
    const trimmed = history.slice(-20)
    fs.writeFileSync(filePath(jid), JSON.stringify(trimmed, null, 2))
}

export function appendHistory(jid: string, role: 'user' | 'assistant', content: string): Message[] {
    const history = loadHistory(jid)
    history.push({ role, content })
    saveHistory(jid, history)
    return history
}

export function clearHistory(jid: string): void {
    const fp = filePath(jid)
    if (fs.existsSync(fp)) fs.unlinkSync(fp)
}