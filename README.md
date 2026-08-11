# WhatsApp AI Bot

A personal WhatsApp bot powered by AI with per-chat conversation history. Listens to and records every message for context, but only replies on command.

## Features

- Listens to all messages and records them to a per-chat JSON history (no replies to plain messages)
- Chat with AI using `!ai <message>`
- Send an image with `!ai` to analyze it (multimodal)
- Generate images with `!img <description>`
- Summarize a chat's recorded history with `!summarize [extra context]`
- Clear history with `!clear`

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
4. Run
```bash
npm run dev
```
5. Scan the QR code with WhatsApp

## Usage

| Command | Description |
|---|---|
| `!ai <message>` | Chat with the AI |
| `!ai` _(with image)_ | Analyze an image |
| `!img <description>` | Generate an image |
| `!summarize [context]` | Summarize the recorded chat history |
| `!clear` | Clear your conversation history |
