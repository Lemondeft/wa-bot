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
    let changed = false
    for (const key of Object.keys(map)) {
        if (map[key].startsWith('Orang ')) {
            map[key] = 'Person ' + map[key].slice('Orang '.length)
            changed = true
        }
    }
    if (changed) saveMembers(jid, map)
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
        map[sender] = `Person ${Object.keys(map).length + 1}`
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

const MAX_HISTORY_CHARS = 20000

function contentChars(content: string | Array<any>): number {
    if (typeof content === 'string') return content.length
    let n = 0
    for (const part of content as any[]) {
        if (part?.type === 'image_url') {
            n += 800
        } else {
            n += String(part?.text ?? '').length
        }
    }
    return n
}

export function saveHistory(jid: string, history: Message[]): void {
    let total = 0
    const kept: Message[] = []
    for (let i = history.length - 1; i >= 0; i--) {
        const chars = contentChars(history[i].content)
        if (kept.length > 0 && total + chars > MAX_HISTORY_CHARS) break
        total += chars
        kept.unshift(history[i])
    }
    fs.writeFileSync(filePath(jid), JSON.stringify(kept, null, 2))
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