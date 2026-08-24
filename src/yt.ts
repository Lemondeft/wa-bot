import { execFile } from "child_process";
import path from "path";
import fs from "fs";

function findYtDlp(): string {
    const candidates = [
        path.join(process.cwd(), 'yt-dlp'),
        path.join(process.cwd(), 'server-data', 'yt-dlp'),
        '/usr/bin/yt-dlp',
        '/usr/local/bin/yt-dlp',
    ]
    for (const p of candidates) {
        if (fs.existsSync(p) && fs.statSync(p).isFile()) return p
    }
    return 'yt-dlp'
}

const YTDLP = findYtDlp()
try { fs.chmodSync(YTDLP, 0o755) } catch {}

export type DownloadMode = 'video' | 'audio'

export function download(url: string, mode: DownloadMode = 'video'): Promise<{ path: string, title: string }> {
    return new Promise((resolve, reject) => {
        const tmpBase = path.join(process.cwd(), 'tmp')
        if (!fs.existsSync(tmpBase)) fs.mkdirSync(tmpBase, { recursive: true })
        const tmpDir = fs.mkdtempSync(path.join(tmpBase, 'yt-'))
        const outTemplate = path.join(tmpDir, '%(title).60s.%(ext)s')

        const args = [
            '-o', outTemplate,
            '--no-playlist',
        ]

        if (mode === 'audio') {
            args.push('-x', '--audio-format', 'mp3')
        } else {
            args.push('-f', 'bestvideo[height<=720]+bestaudio/best[height<=720]/best', '--merge-output-format', 'mp4')
        }

        args.push(url)

        execFile(YTDLP, args, { timeout: 300_000 }, (err, _stdout, stderr) => {
            if (err) return reject(new Error(stderr || err.message))

            try {
                const files = fs.readdirSync(tmpDir)
                if (files.length === 0) return reject(new Error('Downloaded file not found'))
                const filePath = path.join(tmpDir, files[0])
                const title = path.parse(files[0]).name
                resolve({ path: filePath, title })
            } catch (e: any) {
                reject(e)
            }
        })
    })
}