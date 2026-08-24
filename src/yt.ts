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
        if (fs.existsSync(p)) return p
    }
    return 'yt-dlp'
}

const YTDLP = findYtDlp()

export type DownloadMode = 'video' | 'audio'

export function download(url: string, mode: DownloadMode = 'video'): Promise<{ path: string, title: string }> {
    return new Promise((resolve, reject) => {
        const tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp', 'yt-'))
        const outTemplate = path.join(tmpDir, '%(title)s.%(ext)s')

        const args = [
            '-o', outTemplate,
            '--no-playlist',
            '--impersonate', 'chrome',
            '--js-runtimes', 'node',
            '--print', 'after_move:filepath',
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
            const lines = stdout.trim().split('\n')
            const filePath = lines[0]
            const title = lines[1] || 'video'
            resolve({ path: filePath, title })
        })
    })
}