# Gemini Universal Summarizer for Obsidian

> 💡 **Author Note & Community Message:**
> This is my first ever project (Obsidian community plugin). I am currently still learning Python, CSS, and web development. To build this project, I have used around 65% AI assistance. I warmly welcome and hope that developers who have free time can review my code, fix issues, optimize it, and make it even better!

---

## 🌟 Overview

**Gemini Universal Summarizer** is a fast, lightweight, and reliable Obsidian plugin that summarizes YouTube videos, Reddit threads, and web articles directly inside your Obsidian notes using the Google Gemini API.

It automatically extracts YouTube captions/transcripts and page contents in seconds, generates a continuous paragraph summary without unwanted bullet points, and outputs the result in clean, direct key-value format:

```text
Target=https://www.youtube.com/watch?v=dQw4w9WgXcQ
Words=100
Summary=This video features Rick Astley performing his iconic 1987 hit song 'Never Gonna Give You Up'. The music video is set in various urban locations including London streets, a rehearsal hall, and a rooftop, accompanied by synchronized choreography and upbeat pop production that solidified the track as an enduring cultural phenomenon.
```

## ✨ Features

- **⚡ Ultra-Fast Execution (2-4 seconds)**: Direct, parallelized transcript extraction and fast token generation with Gemini Flash.
- **🎬 Real YouTube Transcript Fetching**: Solves the common "AI cannot access URL" refusal by downloading the real video captions before summarizing.
- **📝 Clean Paragraph Summaries**: Pure narrative prose without unwanted bullet points, topic lists, or header clutter.
- **🎯 Simple Output Format**: Direct `Target=...`, `Words=...`, and `Summary=...` output.
- **📱 Full Cross-Platform Support**: Tested for Obsidian Desktop (macOS, Windows, Linux) and Obsidian Mobile (iOS, Android).
- **🛡️ Zero External Dependencies**: 100% native Obsidian `requestUrl` implementation.

## 🚀 Quick Start & Installation

### Manual Installation
1. Download `gemini-universal-summarizer.zip` from Releases (or download the files `main.js`, `manifest.json`, `styles.css`).
2. In your Obsidian vault, navigate to `.obsidian/plugins/` and create a folder named `gemini-universal-summarizer`.
3. Extract or place the 3 files inside `.obsidian/plugins/gemini-universal-summarizer/`.
4. Open Obsidian -> **Settings** -> **Community plugins** -> Enable **Gemini Universal Summarizer**.
5. Open **Settings -> Gemini Universal Summarizer** and paste your free Gemini API key from [Google AI Studio](https://aistudio.google.com/).

## ✍️ Usage Syntax

In any note, write the `summarize(...)` command:

```markdown
summarize(https://www.youtube.com/watch?v=dQw4w9WgXcQ, 100)
```

With an optional focus instruction / custom prompt:
```markdown
summarize(https://www.youtube.com/watch?v=dQw4w9WgXcQ, "Focus on key message and takeaways", 120)
```

Press `Ctrl/Cmd + P` and run **"Universal Summarizer: Summarize link or command under cursor"** (or click the ✨ ribbon icon).

## ⚙️ Settings

- **Google Gemini API Key**: Your personal API key (stored securely and locally in your vault).
- **Gemini Model**: Choose between `gemini-2.5-flash`, `gemini-3.7-flash`, or `gemini-2.0-flash`.
- **Default Word Count**: Fallback target summary length (default: 100 words).

## 📄 License

MIT License (c) 2026 My-Credits.