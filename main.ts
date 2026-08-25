/**
 * Gemini Universal Summarizer - Obsidian Plugin
 * ID: gemini-universal-summarizer
 * Version: 1.2.0
 * Author: My-Credits
 *
 * --------------------------------------------------------------------------------
 * NOTE FROM THE AUTHOR:
 * This is my first ever project (Obsidian plugin). I am still learning Python, CSS,
 * and web development. To make this project, I used ~65% AI assistance. I warmly
 * welcome and hope that developers with free time can help review, fix, and improve
 * my code!
 * --------------------------------------------------------------------------------
 */

import {
  App,
  Editor,
  MarkdownView,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  requestUrl,
} from 'obsidian';

export interface UniversalSummarizerSettings {
  apiKey: string;
  selectedModel: string;
  customModel: string;
  defaultWordCount: number;
}

export const DEFAULT_SETTINGS: UniversalSummarizerSettings = {
  apiKey: '',
  selectedModel: 'gemini-2.5-flash',
  customModel: '',
  defaultWordCount: 100,
};

export interface ParsedCommand {
  rawMatch: string;
  url: string;
  customPrompt?: string;
  wordCount: number;
}

function cleanUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  let url = rawUrl.trim();
  while (url.length > 0 && /^[<("'`{\[]/.test(url)) {
    url = url.substring(1).trim();
  }
  while (url.length > 0 && /[>)'"`}\];.]+$/.test(url)) {
    url = url.substring(0, url.length - 1).trim();
  }
  return url;
}

function decodeEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(dec));
}

function extractYouTubeId(url: string): string | null {
  try {
    if (url.includes('youtu.be/')) {
      return url.split('youtu.be/')[1].split(/[?#&]/)[0] || null;
    }
    if (url.includes('youtube.com/shorts/')) {
      return url.split('youtube.com/shorts/')[1].split(/[?#&]/)[0] || null;
    }
    if (url.includes('v=')) {
      return url.split('v=')[1].split(/[?#&]/)[0] || null;
    }
  } catch (e) {}
  return null;
}

/**
 * Ultra-fast YouTube transcript & metadata extraction with short timeout
 */
async function fetchYouTubeContent(url: string): Promise<{ title: string; content: string }> {
  const videoId = extractYouTubeId(url);
  let title = 'YouTube Video';
  let transcript = '';
  let description = '';

  if (videoId) {
    try {
      const watchRes = await requestUrl({
        url: 'https://www.youtube.com/watch?v=' + videoId,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        throw: false,
      });

      if (watchRes.status === 200) {
        const html = watchRes.text;
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch) {
          title = decodeEntities(titleMatch[1].replace(/ - YouTube$/, '').trim());
        }

        const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/s);
        if (playerMatch) {
          try {
            const playerJson = JSON.parse(playerMatch[1]);
            if (playerJson.videoDetails?.title) {
              title = playerJson.videoDetails.title;
            }
            if (playerJson.videoDetails?.shortDescription) {
              description = playerJson.videoDetails.shortDescription.substring(0, 1000);
            }
            const captionTracks = playerJson.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            if (Array.isArray(captionTracks) && captionTracks.length > 0) {
              const track = captionTracks.find((t: any) => t.languageCode === 'en' || t.languageCode?.startsWith('en')) || captionTracks[0];
              if (track?.baseUrl) {
                const capRes = await requestUrl({ url: track.baseUrl, throw: false });
                if (capRes.status === 200) {
                  const xml = capRes.text;
                  const textMatches = xml.matchAll(/<text[^>]*>(.*?)<\/text>/gs);
                  const lines: string[] = [];
                  for (const m of textMatches) {
                    const decoded = decodeEntities(m[1].replace(/<[^>]+>/g, '').trim());
                    if (decoded && !lines.includes(decoded)) {
                      lines.push(decoded);
                    }
                  }
                  if (lines.length > 0) {
                    transcript = lines.join(' ');
                  }
                }
              }
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  if (title === 'YouTube Video') {
    try {
      const oembed = await requestUrl({
        url: 'https://www.youtube.com/oembed?url=' + encodeURIComponent(url) + '&format=json',
        throw: false,
      });
      if (oembed.status === 200 && oembed.json?.title) {
        title = oembed.json.title;
      }
    } catch (e) {}
  }

  let content = '';
  if (transcript) {
    content = 'Video Title: ' + title + '\n\nTranscript:\n' + transcript.substring(0, 12000);
  } else if (description) {
    content = 'Video Title: ' + title + '\n\nDescription:\n' + description;
  } else {
    content = 'Video Title: ' + title + '\nVideo URL: ' + url;
  }

  return { title, content };
}

/**
 * Ultra-fast Reddit thread fetcher
 */
async function fetchRedditContent(url: string): Promise<{ title: string; content: string }> {
  try {
    const clean = url.split('?')[0].replace(/\/+$/, '') + '.json';
    const res = await requestUrl({
      url: clean,
      headers: { 'User-Agent': 'ObsidianSummarizer/1.2' },
      throw: false,
    });
    if (res.status === 200 && res.json) {
      const postData = res.json[0]?.data?.children[0]?.data;
      const title = postData?.title || 'Reddit Post';
      const selftext = postData?.selftext || '';
      const commentsList = res.json[1]?.data?.children || [];
      const comments: string[] = [];
      for (let i = 0; i < Math.min(commentsList.length, 8); i++) {
        const c = commentsList[i]?.data;
        if (c?.body && c.body !== '[deleted]' && c.body !== '[removed]') {
          comments.push('- ' + c.body.substring(0, 250));
        }
      }
      return {
        title,
        content: 'Post: ' + title + '\n' + selftext.substring(0, 4000) + '\nComments:\n' + comments.join('\n'),
      };
    }
  } catch (e) {}
  return { title: 'Reddit Discussion', content: 'URL: ' + url };
}

/**
 * Ultra-fast Webpage article fetcher
 */
async function fetchWebpageContent(url: string): Promise<{ title: string; content: string }> {
  try {
    const res = await requestUrl({ url, throw: false });
    if (res.status === 200) {
      const html = res.text;
      let title = 'Webpage Content';
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) title = decodeEntities(titleMatch[1].trim());
      const clean = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ');
      return { title, content: 'Title: ' + title + '\n\n' + clean.slice(0, 6000) };
    }
  } catch (e) {}
  return { title: 'Web Page', content: 'URL: ' + url };
}

export default class UniversalSummarizerPlugin extends Plugin {
  settings: UniversalSummarizerSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    // Primary Command
    this.addCommand({
      id: 'summarize-command',
      name: 'Universal Summarizer: Summarize link or command under cursor',
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        await this.handleSummarize(editor);
      },
    });

    // Insert Template Command
    this.addCommand({
      id: 'insert-template',
      name: 'Universal Summarizer: Insert summarize(link, 100) template',
      editorCallback: (editor: Editor) => {
        const template = 'summarize(link, 100)';
        const cursor = editor.getCursor();
        editor.replaceSelection(template);
        editor.setSelection(
          { line: cursor.line, ch: cursor.ch + 10 },
          { line: cursor.line, ch: cursor.ch + 14 }
        );
      },
    });

    // Ribbon Icon
    this.addRibbonIcon('sparkles', 'Universal Summarizer', async () => {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView) {
        await this.handleSummarize(activeView.editor);
      } else {
        new Notice('Please open a note first.');
      }
    });

    // Markdown Post-Processor for Inline Button
    this.registerMarkdownPostProcessor((el, _ctx) => {
      const paragraphs = el.querySelectorAll('p, li, div');
      paragraphs.forEach((p) => {
        const text = p.textContent || '';
        if (text.includes('summarize(') && text.includes(')')) {
          const match = text.match(/summarize\s*\(\s*["']?(https?:\/\/[^\s,"'>)]+)["']?(?:[\s\S]*?)\)/i);
          if (match) {
            const btn = document.createElement('button');
            btn.className = 'summarizer-inline-btn';
            btn.innerHTML = '✨ Summarize';
            btn.onclick = async (e) => {
              e.preventDefault();
              const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
              if (activeView) {
                await this.handleSummarize(activeView.editor);
              }
            };
            p.appendChild(btn);
          }
        }
      });
    });

    this.addSettingTab(new UniversalSummarizerSettingTab(this.app, this));
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  parseCommand(text: string): ParsedCommand | null {
    const regex = /summarize\s*\(\s*["']?(https?:\/\/[^\s,"'>)]+)["']?(?:[\s\S]*?)\)/i;
    const match = text.match(regex);
    if (!match) return null;

    const rawMatch = match[0];
    const url = cleanUrl(match[1]);
    const inside = rawMatch.replace(/^summarize\s*\(\s*/i, '').replace(/\s*\)$/, '');

    let customPrompt = '';
    let wordCount = this.settings.defaultWordCount || 100;

    const firstComma = inside.indexOf(',');
    if (firstComma !== -1) {
      const rest = inside.substring(firstComma + 1).trim();
      if (/^\d+$/.test(rest)) {
        wordCount = parseInt(rest, 10);
      } else {
        const numMatch = rest.match(/^(.*),\s*(\d+)\s*$/);
        if (numMatch) {
          customPrompt = numMatch[1].replace(/^["'`]|["'`]$/g, '').trim();
          wordCount = parseInt(numMatch[2], 10);
        } else {
          customPrompt = rest.replace(/^["'`]|["'`]$/g, '').trim();
        }
      }
    }

    return {
      rawMatch,
      url,
      customPrompt,
      wordCount: wordCount > 0 ? wordCount : 100,
    };
  }

  async handleSummarize(editor: Editor) {
    const selectedText = editor.getSelection();
    const cursor = editor.getCursor();
    const lineText = editor.getLine(cursor.line);

    let command = this.parseCommand(selectedText) || this.parseCommand(lineText);
    let isSelection = Boolean(selectedText && command);

    if (!command) {
      const fullDoc = editor.getValue();
      command = this.parseCommand(fullDoc);
    }

    if (!command) {
      new Notice('No summarize(https://..., 100) command found.');
      return;
    }

    if (!this.settings.apiKey) {
      new Notice('Gemini API key is required. Please set it in Settings > Gemini Universal Summarizer.');
      return;
    }

    const placeholder = `Target=${command.url}\nWords=${command.wordCount}\nSummary=⏳ Extracting content and summarizing with Gemini...`;

    if (isSelection) {
      editor.replaceSelection(placeholder);
    } else {
      editor.setValue(editor.getValue().replace(command.rawMatch, placeholder));
    }

    const notice = new Notice('✨ Summarizing ' + command.url + '...', 0);

    try {
      const summary = await this.executeSummarize(command);
      notice.hide();

      // Requested exact format: Target=..., Words=..., Summary=...
      const finalOutput = `Target=${command.url}\nWords=${command.wordCount}\nSummary=${summary}`;

      const currentDoc = editor.getValue();
      if (currentDoc.includes(placeholder)) {
        editor.setValue(currentDoc.replace(placeholder, finalOutput));
      } else {
        editor.setValue(currentDoc.replace(command.rawMatch, finalOutput));
      }
      new Notice('✨ Summary completed!');
    } catch (err: any) {
      notice.hide();
      console.error(err);
      const errOutput = `Target=${command.url}\nWords=${command.wordCount}\nSummary=Error: ${err.message || 'Failed to generate summary'}`;
      editor.setValue(editor.getValue().replace(placeholder, errOutput));
      new Notice('Error: ' + (err.message || 'Unknown error'));
    }
  }

  async executeSummarize(cmd: ParsedCommand): Promise<string> {
    const isYt = cmd.url.includes('youtube.com') || cmd.url.includes('youtu.be');
    const isReddit = cmd.url.includes('reddit.com') || cmd.url.includes('redd.it');

    let extracted: { title: string; content: string };
    if (isYt) {
      extracted = await fetchYouTubeContent(cmd.url);
    } else if (isReddit) {
      extracted = await fetchRedditContent(cmd.url);
    } else {
      extracted = await fetchWebpageContent(cmd.url);
    }

    const systemInstruction =
      'You are a high-speed summarizer. Synthesize the provided content into a fluent narrative paragraph summary.\n' +
      'RULES: Output ONLY one or two continuous narrative paragraphs. DO NOT use any bullet points, lists, or headers. Write approximately ' +
      cmd.wordCount +
      ' words.';

    const prompt =
      'Content from ' + cmd.url + ' (' + extracted.title + '):\n\n' +
      extracted.content.substring(0, 10000) + '\n\n' +
      (cmd.customPrompt ? 'Focus: ' + cmd.customPrompt + '\n' : '') +
      'Write a ' + cmd.wordCount + '-word paragraph summary now (prose only, no bullets, no headers):';

    const model = this.settings.selectedModel || 'gemini-2.5-flash';
    const endpoint =
      'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(model) +
      ':generateContent?key=' +
      encodeURIComponent(this.settings.apiKey.trim());

    const res = await requestUrl({
      url: endpoint,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: { temperature: 0.2, maxOutputTokens: 600 },
      }),
      throw: false,
    });

    if (res.status === 200 && res.json) {
      const text = res.json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text && text.trim()) {
        return text.trim().replace(/^[\s*•-]+/gm, '').replace(/\n+/g, ' ');
      }
    }

    if (res.json?.error?.message) {
      throw new Error(res.json.error.message);
    }

    throw new Error('Gemini API returned status ' + res.status);
  }
}

class UniversalSummarizerSettingTab extends PluginSettingTab {
  plugin: UniversalSummarizerPlugin;

  constructor(app: App, plugin: UniversalSummarizerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Gemini Universal Summarizer' });

    const note = containerEl.createDiv({ cls: 'summarizer-author-note' });
    note.innerHTML = '<strong>Author Note:</strong> This is my first project (Obsidian plugin). I am still learning Python, CSS, and web development, and built this with ~65% AI assistance. If you have free time, you are welcome to improve and contribute to this plugin!';

    new Setting(containerEl)
      .setName('Google Gemini API Key')
      .setDesc('Enter your free Gemini API key from Google AI Studio.')
      .addText((text) => {
        text
          .setPlaceholder('AIzaSy...')
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (val) => {
            this.plugin.settings.apiKey = val.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
      });

    new Setting(containerEl)
      .setName('Gemini Model')
      .setDesc('Recommended: gemini-2.5-flash or gemini-3.7-flash for 2-second speed.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('gemini-2.5-flash', 'Gemini 2.5 Flash (Fastest - Recommended)')
          .addOption('gemini-3.7-flash', 'Gemini 3.7 Flash')
          .addOption('gemini-2.0-flash', 'Gemini 2.0 Flash');
        dropdown.setValue(this.plugin.settings.selectedModel || 'gemini-2.5-flash');
        dropdown.onChange(async (val) => {
          this.plugin.settings.selectedModel = val;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Default Word Count')
      .setDesc('Fallback target word count for summaries.')
      .addText((text) => {
        text
          .setValue(String(this.plugin.settings.defaultWordCount || 100))
          .onChange(async (val) => {
            const num = parseInt(val, 10);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.defaultWordCount = num;
              await this.plugin.saveSettings();
            }
          });
        text.inputEl.type = 'number';
      });
  }
}