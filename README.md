# WhatsApp AI Bot

A personal WhatsApp bot powered by AI with per-chat conversation history. Listens to and records every message for context, but only replies on command.

## Features

- Listens to all messages and records them to a per-chat JSON history (no replies to plain messages)
- Chat with AI using `!ai <message>`
- Send an image with `!ai` to analyze it (multimodal)
- Generate images with `!img <description>`
- Convert images to stickers with `!sticker`
- Reveal view-once messages with `!reveal`
- Summarize a chat's recorded history with `!summarize [extra context]`
- Download videos/audio from any supported URL with `!dl` / `!dla`
- Clear history with `!clear`
- Check bot status with `!status`
- List all commands with `!help`

## Setup

1. Clone the repo
2. Install dependencies
```bash
npm install
```
3. Create a `.env` file
```
KEY=key
```
4. Download the yt-dlp binary (required for `!dl`/`!dla`)
```bash
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o yt-dlp
chmod +x yt-dlp
```
5. Run
```bash
npm run dev
```
6. Scan the QR code with WhatsApp

## Usage

| Command | Description |
|---|---|
| `!ai <message>` | Chat with the AI |
| `!ai` _(with image)_ | Analyze an image |
| `!img <description>` | Generate an image |
| `!sticker` | Convert an image to a sticker |
| `!reveal` | Reveal a view-once message _(reply to it)_ |
| `!dl [-doc] <url>` | Download video _(default: plays in chat)_ |
| `!dla [-doc] <url>` | Download audio as mp3 _(default: plays in chat)_ |
| `!summarize [context]` | Summarize the recorded chat history |
| `!clear` | Clear your conversation history |
| `!status` | Check if the bot is running |
| `!help` | List all commands |
