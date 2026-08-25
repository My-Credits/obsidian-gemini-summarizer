/* THIS IS A COMPILED OBSIDIAN RUNTIME PLUGIN BUNDLE
 * ID: gemini-universal-summarizer
 * Version: 1.2.0
 * Author: My-Credits
 *
 * NOTE FROM THE AUTHOR:
 * This is my first ever project (Obsidian plugin). I am still learning Python, CSS,
 * and web development. To make this project, I used ~65% AI assistance. I warmly
 * welcome and hope that developers with free time can help review, fix, and improve
 * my code!
 */
"use strict";

var obsidian = require("obsidian");

var DEFAULT_SETTINGS = {
  apiKey: "",
  selectedModel: "gemini-2.5-flash",
  customModel: "",
  defaultWordCount: 100
};

function cleanUrl(rawUrl) {
  if (!rawUrl) return "";
  var url = ("" + rawUrl).trim();
  while (url.length > 0 && /^[<("'`{\[]/.test(url)) {
    url = url.substring(1).trim();
  }
  while (url.length > 0 && /[>)"'`}\];.]+$/.test(url)) {
    url = url.substring(0, url.length - 1).trim();
  }
  return url;
}

function decodeEntities(str) {
  if (!str) return "";
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, function(_m, dec) { return String.fromCharCode(dec); });
}

function extractYouTubeId(url) {
  try {
    if (url.indexOf("youtu.be/") !== -1) {
      return url.split("youtu.be/")[1].split(/[?#&]/)[0] || null;
    }
    if (url.indexOf("youtube.com/shorts/") !== -1) {
      return url.split("youtube.com/shorts/")[1].split(/[?#&]/)[0] || null;
    }
    if (url.indexOf("v=") !== -1) {
      return url.split("v=")[1].split(/[?#&]/)[0] || null;
    }
  } catch (e) {}
  return null;
}

async function fetchYouTubeContent(url) {
  var videoId = extractYouTubeId(url);
  var title = "YouTube Video";
  var transcript = "";
  var description = "";

  if (videoId) {
    try {
      var watchRes = await obsidian.requestUrl({
        url: "https://www.youtube.com/watch?v=" + videoId,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9"
        },
        throw: false
      });

      if (watchRes.status === 200) {
        var html = watchRes.text;
        var titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch) {
          title = decodeEntities(titleMatch[1].replace(/ - YouTube$/, "").trim());
        }

        var playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/s);
        if (playerMatch) {
          try {
            var playerJson = JSON.parse(playerMatch[1]);
            if (playerJson.videoDetails && playerJson.videoDetails.title) {
              title = playerJson.videoDetails.title;
            }
            if (playerJson.videoDetails && playerJson.videoDetails.shortDescription) {
              description = playerJson.videoDetails.shortDescription.substring(0, 1000);
            }
            var captionTracks = playerJson.captions && playerJson.captions.playerCaptionsTracklistRenderer && playerJson.captions.playerCaptionsTracklistRenderer.captionTracks;
            if (Array.isArray(captionTracks) && captionTracks.length > 0) {
              var track = captionTracks.find(function(t) { return t.languageCode === 'en' || (t.languageCode && t.languageCode.indexOf('en') === 0); }) || captionTracks[0];
              if (track && track.baseUrl) {
                var capRes = await obsidian.requestUrl({ url: track.baseUrl, throw: false });
                if (capRes.status === 200) {
                  var xml = capRes.text;
                  var lines = [];
                  var textMatches = xml.matchAll(/<text[^>]*>(.*?)<\/text>/gs);
                  for (var m of textMatches) {
                    var decoded = decodeEntities(m[1].replace(/<[^>]+>/g, "").trim());
                    if (decoded && lines.indexOf(decoded) === -1) {
                      lines.push(decoded);
                    }
                  }
                  if (lines.length > 0) {
                    transcript = lines.join(" ");
                  }
                }
              }
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  if (title === "YouTube Video") {
    try {
      var oembed = await obsidian.requestUrl({
        url: "https://www.youtube.com/oembed?url=" + encodeURIComponent(url) + "&format=json",
        throw: false
      });
      if (oembed.status === 200 && oembed.json && oembed.json.title) {
        title = oembed.json.title;
      }
    } catch (e) {}
  }

  var content = "";
  if (transcript) {
    content = "Video Title: " + title + "\n\nTranscript:\n" + transcript.substring(0, 12000);
  } else if (description) {
    content = "Video Title: " + title + "\n\nDescription:\n" + description;
  } else {
    content = "Video Title: " + title + "\nVideo URL: " + url;
  }

  return { title: title, content: content };
}

async function fetchRedditContent(url) {
  try {
    var clean = url.split("?")[0].replace(/\/+$/, "") + ".json";
    var res = await obsidian.requestUrl({
      url: clean,
      headers: { "User-Agent": "ObsidianSummarizer/1.2" },
      throw: false
    });
    if (res.status === 200 && res.json) {
      var postData = res.json[0] && res.json[0].data && res.json[0].data.children[0] && res.json[0].data.children[0].data;
      var title = (postData && postData.title) || "Reddit Post";
      var selftext = (postData && postData.selftext) || "";
      var commentsList = (res.json[1] && res.json[1].data && res.json[1].data.children) || [];
      var comments = [];
      for (var i = 0; i < Math.min(commentsList.length, 8); i++) {
        var c = commentsList[i] && commentsList[i].data;
        if (c && c.body && c.body !== "[deleted]" && c.body !== "[removed]") {
          comments.push("- " + c.body.substring(0, 250));
        }
      }
      return {
        title: title,
        content: "Post: " + title + "\n" + selftext.substring(0, 4000) + "\nComments:\n" + comments.join("\n")
      };
    }
  } catch (e) {}
  return { title: "Reddit Discussion", content: "URL: " + url };
}

async function fetchWebpageContent(url) {
  try {
    var res = await obsidian.requestUrl({ url: url, throw: false });
    if (res.status === 200) {
      var html = res.text;
      var title = "Webpage Content";
      var titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) title = decodeEntities(titleMatch[1].trim());
      var clean = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ");
      return { title: title, content: "Title: " + title + "\n\n" + clean.slice(0, 6000) };
    }
  } catch (e) {}
  return { title: "Web Page", content: "URL: " + url };
}

class UniversalSummarizerPlugin extends obsidian.Plugin {
  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "summarize-command",
      name: "Universal Summarizer: Summarize link or command under cursor",
      editorCallback: async (editor) => {
        await this.handleSummarize(editor);
      }
    });

    this.addCommand({
      id: "insert-template",
      name: "Universal Summarizer: Insert summarize(link, 100) template",
      editorCallback: (editor) => {
        var template = "summarize(link, 100)";
        var cursor = editor.getCursor();
        editor.replaceSelection(template);
        editor.setSelection(
          { line: cursor.line, ch: cursor.ch + 10 },
          { line: cursor.line, ch: cursor.ch + 14 }
        );
      }
    });

    this.addRibbonIcon("sparkles", "Universal Summarizer", async () => {
      var activeView = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (activeView) {
        await this.handleSummarize(activeView.editor);
      } else {
        new obsidian.Notice("Please open a note first.");
      }
    });

    this.registerMarkdownPostProcessor((el) => {
      var paragraphs = el.querySelectorAll("p, li, div");
      paragraphs.forEach((p) => {
        var text = p.textContent || "";
        if (text.indexOf("summarize(") !== -1 && text.indexOf(")") !== -1) {
          var match = text.match(/summarize\s*\(\s*["\']?(https?:\/\/[^\s,"\'>)]+)["\']?(?:[\s\S]*?)\)/i);
          if (match) {
            var btn = document.createElement("button");
            btn.className = "summarizer-inline-btn";
            btn.innerHTML = "✨ Summarize";
            btn.onclick = async (e) => {
              e.preventDefault();
              var activeView = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
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

  parseCommand(text) {
    if (!text) return null;
    var regex = /summarize\s*\(\s*["\']?(https?:\/\/[^\s,"\'>)]+)["\']?(?:[\s\S]*?)\)/i;
    var match = text.match(regex);
    if (!match) return null;

    var rawMatch = match[0];
    var url = cleanUrl(match[1]);
    var inside = rawMatch.replace(/^summarize\s*\(\s*/i, "").replace(/\s*\)$/, "");

    var customPrompt = "";
    var wordCount = this.settings.defaultWordCount || 100;

    var firstComma = inside.indexOf(",");
    if (firstComma !== -1) {
      var rest = inside.substring(firstComma + 1).trim();
      if (/^\d+$/.test(rest)) {
        wordCount = parseInt(rest, 10);
      } else {
        var numMatch = rest.match(/^(.*),\s*(\d+)\s*$/);
        if (numMatch) {
          customPrompt = numMatch[1].replace(/^["'`]|["'`]$/g, "").trim();
          wordCount = parseInt(numMatch[2], 10);
        } else {
          customPrompt = rest.replace(/^["'`]|["'`]$/g, "").trim();
        }
      }
    }

    return {
      rawMatch: rawMatch,
      url: url,
      customPrompt: customPrompt,
      wordCount: wordCount > 0 ? wordCount : 100
    };
  }

  async handleSummarize(editor) {
    var selectedText = editor.getSelection();
    var cursor = editor.getCursor();
    var lineText = editor.getLine(cursor.line);

    var command = this.parseCommand(selectedText) || this.parseCommand(lineText);
    var isSelection = Boolean(selectedText && command);

    if (!command) {
      var fullDoc = editor.getValue();
      command = this.parseCommand(fullDoc);
    }

    if (!command) {
      new obsidian.Notice("No summarize(https://..., 100) command found.");
      return;
    }

    if (!this.settings.apiKey) {
      new obsidian.Notice("Gemini API key is required. Please set it in Settings > Gemini Universal Summarizer.");
      return;
    }

    var placeholder = "Target=" + command.url + "\nWords=" + command.wordCount + "\nSummary=⏳ Extracting content and summarizing with Gemini...";

    if (isSelection) {
      editor.replaceSelection(placeholder);
    } else {
      editor.setValue(editor.getValue().replace(command.rawMatch, placeholder));
    }

    var notice = new obsidian.Notice("✨ Summarizing " + command.url + "...", 0);

    try {
      var summary = await this.executeSummarize(command);
      notice.hide();

      var finalOutput = "Target=" + command.url + "\nWords=" + command.wordCount + "\nSummary=" + summary;

      var currentDoc = editor.getValue();
      if (currentDoc.indexOf(placeholder) !== -1) {
        editor.setValue(currentDoc.replace(placeholder, finalOutput));
      } else {
        editor.setValue(currentDoc.replace(command.rawMatch, finalOutput));
      }
      new obsidian.Notice("✨ Summary completed!");
    } catch (err) {
      notice.hide();
      console.error(err);
      var errOutput = "Target=" + command.url + "\nWords=" + command.wordCount + "\nSummary=Error: " + (err.message || "Failed to generate summary");
      editor.setValue(editor.getValue().replace(placeholder, errOutput));
      new obsidian.Notice("Error: " + (err.message || "Unknown error"));
    }
  }

  async executeSummarize(cmd) {
    var isYt = cmd.url.indexOf("youtube.com") !== -1 || cmd.url.indexOf("youtu.be") !== -1;
    var isReddit = cmd.url.indexOf("reddit.com") !== -1 || cmd.url.indexOf("redd.it") !== -1;

    var extracted;
    if (isYt) {
      extracted = await fetchYouTubeContent(cmd.url);
    } else if (isReddit) {
      extracted = await fetchRedditContent(cmd.url);
    } else {
      extracted = await fetchWebpageContent(cmd.url);
    }

    var systemInstruction =
      "You are a high-speed summarizer. Synthesize the provided content into a fluent narrative paragraph summary.\n" +
      "RULES: Output ONLY one or two continuous narrative paragraphs. DO NOT use any bullet points, lists, or headers. Write approximately " +
      cmd.wordCount +
      " words.";

    var prompt =
      "Content from " + cmd.url + " (" + extracted.title + "):\n\n" +
      extracted.content.substring(0, 10000) +
      "\n\n" +
      (cmd.customPrompt ? "Focus: " + cmd.customPrompt + "\n" : "") +
      "Write a " + cmd.wordCount + "-word paragraph summary now (prose only, no bullets, no headers):";

    var model = this.settings.selectedModel || "gemini-2.5-flash";
    var endpoint =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(model) +
      ":generateContent?key=" +
      encodeURIComponent(this.settings.apiKey.trim());

    var res = await obsidian.requestUrl({
      url: endpoint,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: { temperature: 0.2, maxOutputTokens: 600 }
      }),
      throw: false
    });

    if (res.status === 200 && res.json) {
      var cand = res.json.candidates && res.json.candidates[0];
      var text = cand && cand.content && cand.content.parts && cand.content.parts[0] && cand.content.parts[0].text;
      if (text && text.trim()) {
        return text.trim().replace(/^[\s*•-]+/gm, "").replace(/\n+/g, " ");
      }
    }

    if (res.json && res.json.error && res.json.error.message) {
      throw new Error(res.json.error.message);
    }

    throw new Error("Gemini API returned status " + res.status);
  }
}

class UniversalSummarizerSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    var containerEl = this.containerEl;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Gemini Universal Summarizer" });

    var note = containerEl.createDiv({ cls: "summarizer-author-note" });
    note.innerHTML = "<strong>Author Note:</strong> This is my first project (Obsidian plugin). I am still learning Python, CSS, and web development, and built this with ~65% AI assistance. If you have free time, you are welcome to improve and contribute to this plugin!";

    new obsidian.Setting(containerEl)
      .setName("Google Gemini API Key")
      .setDesc("Enter your free Gemini API key from Google AI Studio.")
      .addText((text) => {
        text
          .setPlaceholder("AIzaSy...")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (val) => {
            this.plugin.settings.apiKey = val.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.type = "password";
      });

    new obsidian.Setting(containerEl)
      .setName("Gemini Model")
      .setDesc("Recommended: gemini-2.5-flash or gemini-3.7-flash for 2-second speed.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("gemini-2.5-flash", "Gemini 2.5 Flash (Fastest - Recommended)")
          .addOption("gemini-3.7-flash", "Gemini 3.7 Flash")
          .addOption("gemini-2.0-flash", "Gemini 2.0 Flash");
        dropdown.setValue(this.plugin.settings.selectedModel || "gemini-2.5-flash");
        dropdown.onChange(async (val) => {
          this.plugin.settings.selectedModel = val;
          await this.plugin.saveSettings();
        });
      });

    new obsidian.Setting(containerEl)
      .setName("Default Word Count")
      .setDesc("Fallback target word count for summaries.")
      .addText((text) => {
        text
          .setValue(String(this.plugin.settings.defaultWordCount || 100))
          .onChange(async (val) => {
            var num = parseInt(val, 10);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.defaultWordCount = num;
              await this.plugin.saveSettings();
            }
          });
        text.inputEl.type = "number";
      });
  }
}

module.exports = UniversalSummarizerPlugin;
module.exports.default = UniversalSummarizerPlugin;