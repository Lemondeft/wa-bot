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

export type DownloadMode = 'video' | 'audio'

export function download(url: string, mode: DownloadMode = 'video'): Promise<{ path: string, title: string }> {
    return new Promise((resolve, reject) => {
        const tmpBase = path.join(process.cwd(), 'tmp')
        if (!fs.existsSync(tmpBase)) fs.mkdirSync(tmpBase, { recursive: true })
        const tmpDir = fs.mkdtempSync(path.join(tmpBase, 'yt-'))
        const outTemplate = path.join(tmpDir, 'video.%(ext)s')

        const args = [
            '-o', outTemplate,
            '--no-playlist',
            '--js-runtimes', 'node',
            '--print', 'title',
        ]

        if (mode === 'audio') {
            args.push('-x', '--audio-format', 'mp3')
        } else {
            args.push('-f', 'bestvideo[height<=720]+bestaudio/best[height<=720]/best', '--merge-output-format', 'mp4')
        }

        args.push(url)

        execFile(YTDLP, args, { timeout: 300_000 }, (err, stdout, stderr) => {
            if (err) return reject(new Error(stderr || err.message))

            const title = stdout.trim().split('\n').pop() || 'video'
            const files = fs.readdirSync(tmpDir)
            const filePath = files.length > 0 ? path.join(tmpDir, files[0]) : null

            if (!filePath || !fs.existsSync(filePath)) {
                return reject(new Error('Downloaded file not found'))
            }

            resolve({ path: filePath, title })
        })
    })
}