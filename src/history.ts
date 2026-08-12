import fs from 'fs';
import path from 'path';

interface Message {
    role: 'user' | 'assistant';
    sender?: string;
    name?: string;
    content: string | Array<any>;
}

const DIR = './history';

if (!fs.existsSync(DIR)) fs.mkdirSync(DIR);

function filePath(jid: string): string {
    const safe = jid.split('@')[0]
    return path.join(DIR, `${safe}.json`);
}

function membersPath(jid: string): string {
    const safe = jid.split('@')[0]
    return path.join(DIR, `${safe}.members.json`);
}

const membersCache = new Map<string, Record<string, string>>()

function loadMembers(jid: string): Record<string, string> {
    const cached = membersCache.get(jid)
    if (cached) return cached
    let map: Record<string, string> = {}
    const fp = membersPath(jid)
    if (fs.existsSync(fp)) {
        try { map = JSON.parse(fs.readFileSync(fp, 'utf-8')) as Record<string, string> } catch { }
    }
    membersCache.set(jid, map)
    return map
}

function saveMembers(jid: string, map: Record<string, string>): void {
    fs.writeFileSync(membersPath(jid), JSON.stringify(map, null, 2))
}

function resolveName(jid: string, sender?: string): string | undefined {
    if (!sender || sender === 'bot') return sender
    const map = loadMembers(jid)
    if (!map[sender]) {
        map[sender] = `Orang ${Object.keys(map).length + 1}`
        saveMembers(jid, map)
    }
    return map[sender]
}

export function loadHistory(jid: string): Message[] {
    const fp = filePath(jid);
    if (!fs.existsSync(fp)) return [];
    try {
        return JSON.parse(fs.readFileSync(fp, 'utf-8')) as Message[];
    } catch {
        return [];
    }
}

export function saveHistory(jid: string, history: Message[]): void {
    const trimmed = history.slice(-20)
    fs.writeFileSync(filePath(jid), JSON.stringify(trimmed, null, 2))
}

export function appendHistory(jid: string, role: 'user' | 'assistant', sender: string | undefined, content: string | Array<any>): Message[] {
    const history = loadHistory(jid)
    const name = resolveName(jid, sender)
    history.push(sender ? { role, sender, name, content } : { role, content })
    saveHistory(jid, history)
    return history
}

export function clearHistory(jid: string): void {
    const fp = filePath(jid)
    if (fs.existsSync(fp)) fs.unlinkSync(fp)
    const mfp = membersPath(jid)
    if (fs.existsSync(mfp)) fs.unlinkSync(mfp)
    membersCache.delete(jid)
}