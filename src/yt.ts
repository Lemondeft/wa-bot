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

const MAX_FILESIZE_MB = 100
const MAX_FILESIZE = MAX_FILESIZE_MB * 1024 * 1024

export type DownloadMode = 'video' | 'audio'

function getTmpDir(): string {
    const tmpBase = path.join(process.cwd(), 'tmp')
    if (!fs.existsSync(tmpBase)) fs.mkdirSync(tmpBase, { recursive: true })
    return fs.mkdtempSync(path.join(tmpBase, 'yt-'))
}

function downloadViaYtdlp(url: string, mode: DownloadMode): Promise<{ path: string, title: string }> {
    return new Promise((resolve, reject) => {
        const tmpDir = getTmpDir()
        const outTemplate = path.join(tmpDir, '%(title).60s.%(ext)s')

        const args = [
            '-o', outTemplate,
            '--no-playlist',
            '--max-filesize', String(MAX_FILESIZE_MB) + 'M',
        ]

        if (mode === 'audio') {
            args.push('-x', '--audio-format', 'mp3')
        } else {
            args.push('-f', 'bestvideo[height<=720][vcodec^=avc1]+bestaudio/best[height<=720]/best', '--merge-output-format', 'mp4', '--prefer-free-formats=false')
        }

        args.push(url)

        execFile(YTDLP, args, { timeout: 300_000 }, (err, _stdout, stderr) => {
            if (err) return reject(new Error(stderr || err.message))

            try {
                const files = fs.readdirSync(tmpDir)
                if (files.length === 0) return reject(new Error('Downloaded file not found'))
                const filePath = path.join(tmpDir, files[0])
                const stat = fs.statSync(filePath)
                if (stat.size > MAX_FILESIZE) {
                    fs.rmSync(tmpDir, { recursive: true, force: true })
                    return reject(new Error(`File too large (${(stat.size / 1024 / 1024).toFixed(0)}MB, max ${MAX_FILESIZE_MB}MB)`))
                }
                const title = path.parse(files[0]).name
                resolve({ path: filePath, title })
            } catch (e: any) {
                reject(e)
            }
        })
    })
}

function downloadGeneric(url: string, mode: DownloadMode): Promise<{ path: string, title: string }> {
    return new Promise((resolve, reject) => {
        const tmpDir = getTmpDir()

        const curlArgs = [
            '-sL',
            '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            url,
        ]

        execFile('curl', curlArgs, { timeout: 30_000 }, (err, stdout) => {
            if (err) return reject(new Error('Failed to fetch page'))

            const html = stdout
            const mediaUrls: string[] = []

            const patterns = [
                /(?:src|href|url)\s*[:=]\s*["']([^"']*\.(?:mp4|webm|mkv|m3u8|mp3|m4a|ogg|opus|wav|jpg|jpeg|png|gif|webp)(?:\?[^"']*)?)/gi,
                /(?:content)\s*=\s*["']([^"']*\.(?:mp4|webm|m3u8|mp3|m4a)(?:\?[^"']*)?)/gi,
                /(?:video|audio|source|media)\s*\{[^}]*url\s*:\s*["']([^"']+)/gi,
                /(?:file|source|src)\s*[:=]\s*["'](https?:\/\/[^"']*\.(?:mp4|webm|m3u8|mp3|m4a|ogg)(?:\?[^"']*)?)/gi,
                /https?:\/\/[^\s"'<>]*\.(?:mp4|webm|m3u8)(?:\?[^\s"'<>]*)?/gi,
            ]

            for (const pattern of patterns) {
                let match
                while ((match = pattern.exec(html)) !== null) {
                    let found = match[1] || match[0]
                    if (found.startsWith('//')) found = 'https:' + found
                    if (found.startsWith('http')) mediaUrls.push(found)
                }
            }

            const unique = [...new Set(mediaUrls)]

            if (unique.length === 0) {
                return reject(new Error('No media found on page'))
            }

            const isAudio = mode === 'audio'
            const ext = isAudio ? '.mp3' : '.mp4'
            const outFile = path.join(tmpDir, 'download' + ext)
            const mediaUrl = unique[0]

            const dlArgs = ['-sL', '-o', outFile, '--max-filesize', String(MAX_FILESIZE), '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36']

            dlArgs.push(mediaUrl)

            execFile('curl', dlArgs, { timeout: 300_000 }, (err2) => {
                if (err2) return reject(new Error('Failed to download media'))

                if (!fs.existsSync(outFile) || fs.statSync(outFile).size === 0) {
                    return reject(new Error('Downloaded file is empty'))
                }

                let finalFile = outFile

                if (isAudio && fs.existsSync(outFile)) {
                    const mp3File = path.join(tmpDir, 'audio.mp3')
                    try {
                        execFile('ffmpeg', ['-y', '-i', outFile, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', mp3File], { timeout: 120_000 }, (err3) => {
                            try { fs.unlinkSync(outFile) } catch {}
                            if (err3 || !fs.existsSync(mp3File)) {
                                resolve({ path: outFile, title: decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'download') })
                            } else {
                                resolve({ path: mp3File, title: decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'audio') })
                            }
                        })
                        return
                    } catch {
                        // ffmpeg not available, return as-is
                    }
                }

                resolve({ path: finalFile, title: decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'download') })
            })
        })
    })
}

export async function download(url: string, mode: DownloadMode = 'video'): Promise<{ path: string, title: string }> {
    try {
        return await downloadViaYtdlp(url, mode)
    } catch (err: any) {
        if (err.message?.includes('Unsupported URL') || err.message?.includes('is not a supported URL')) {
            console.log(`[DL] yt-dlp unsupported, trying generic fallback for: ${url}`)
            return await downloadGeneric(url, mode)
        }
        throw err
    }
}

export function cleanup(filePath: string) {
    try {
        const dir = path.dirname(filePath)
        fs.rmSync(dir, { recursive: true, force: true })
    } catch {}
}
