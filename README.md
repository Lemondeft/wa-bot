# WhatsApp AI Bot

A personal WhatsApp bot powered by with per-chat conversation history.

## Features

- Chat with AI using `!ai <message>`
- Send an image with `!ai` to analyze it (multimodal)
- Generate images with `!img <description>`
- Per-chat conversation history
- Clear history with `!clear`

## Setup

1. Clone the repo
2. Install dependencies
```bash
npm install
```
3. Create a `.env` file
```
KEY=your_voidai_key_here
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
| `!clear` | Clear your conversation history |
