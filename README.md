# WhatsApp AI Bot

A personal WhatsApp bot powered by an AI API with per-user chat history.

## Features

- Reply to messages using `!ai <message>`
- Remembers conversation history per user
- Clear history with `!clear`

## Setup

1. Clone the repo
   ```bash
   you might want to change the default fetch link, since im using voidai im using voidai's endpoint.
   ```
2. Install dependencies
```bash
   npm install
```
3. Create a `.env` file
```
   KEY=your_key_here
```
4. Run
```bash
   npm run dev
```
5. Scan the QR code with WhatsApp

## Usage

| Command | Description |
|---|---|
| `!ai <message>` | Ask the AI anything |
| `!clear` | Clear your chat history |
