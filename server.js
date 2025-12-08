const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

// --- OPENROUTER + SERPAPI SETUP (clean logs) ---
const hasOpenRouterKey = !!process.env.OPENROUTER_KEY;
const hasSerpApiKey = !!process.env.SERPAPI_KEY;

console.log("🔑 OpenRouter API key:", hasOpenRouterKey ? "Loaded" : "Missing");
console.log("🌐 Web search (SerpAPI):", hasSerpApiKey ? "Enabled" : "Disabled");

const app = express();
app.use(express.static("public"));
app.use(cors());
app.use(express.json());

// 📝 In-memory chat history for the UI
let chatHistory = [];
let nextId = 1;

// --- TOOL FUNCTIONS ---

// 🛠️ TOOL 1: simpleCalculator
function simpleCalculator(expr) {
  try {
    // WARNING: eval is dangerous in production! This is for demo only.
    // eslint-disable-next-line no-eval
    const result = eval(expr);
    return result.toString();
  } catch (e) {
    return "Error: Invalid mathematical expression.";
  }
}

// 🌐 TOOL 2: Web Search using SerpAPI (Google search)
// Requires: process.env.SERPAPI_KEY and Node 18+ for global fetch
async function webSearch(query) {
  if (!process.env.SERPAPI_KEY) {
    return `Error: SERPAPI_KEY is not set on the server. Cannot run web search for "${query}".`;
  }

  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(
    query
  )}&api_key=${process.env.SERPAPI_KEY}&num=5`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return `Error: SerpAPI request failed with status ${res.status}.`;
    }

    const data = await res.json();

    const results =
      data.organic_results ||
      data.news_results ||
      data.answer_box ||
      data.knowledge_graph ||
      [];

    if (!results || results.length === 0) {
      return `No web results found for: "${query}".`;
    }

    const top3 = (Array.isArray(results) ? results : [results]).slice(0, 3);

    const formatted = top3
      .map((r, i) => {
        const title = r.title || r.name || "No title";
        const snippet =
          r.snippet ||
          r.content ||
          r.description ||
          r.answer ||
          "No snippet available.";
        const link = r.link || r.url || r.source || "";
        return `(${i + 1}) **${title}**\n${snippet}\n${link}`;
      })
      .join("\n\n");

    return `Top web results for "${query}":\n\n${formatted}`;
  } catch (err) {
    console.error("❌ SerpAPI error:", err);
    return `Error: Failed to fetch web results for "${query}".`;
  }
}

// Simple heuristic: when should we auto-use web search?
function shouldUseWebSearch(message) {
  const lower = message.toLowerCase();
  const keywords = [
    "latest",
    "today",
    "yesterday",
    "this week",
    "this month",
    "current",
    "news",
    "score",
    "match",
    "live",
    "price",
    "stock",
    "share price",
    "weather",
    "forecast",
    "update",
    "who is the current",
    "who is the president",
    "who is the prime minister",
  ];
  return keywords.some((k) => lower.includes(k));
}

// --- OPENROUTER CHAT CALL ---

async function callOpenRouter(messages) {
  if (!process.env.OPENROUTER_KEY) {
    throw new Error(
      "OPENROUTER_KEY is not set on the server. Please add it to your .env file."
    );
  }

  const body = {
    model: "meta-llama/llama-3.1-70b-instruct",
    messages,
  };

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_KEY}`,
      "Content-Type": "application/json",
      // Optional but recommended headers for OpenRouter
      "HTTP-Referer": "https://myagent.example.com",
      "X-Title": "Dev AI Agent",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("❌ OpenRouter error:", data);
    throw new Error(
      data.error?.message || `OpenRouter request failed with ${res.status}`
    );
  }

  const content =
    data.choices?.[0]?.message?.content?.trim() ||
    "I couldn't generate a response.";
  return content;
}

// Build chat messages with history + optional web search results
async function runChat(userMessage, webResultsText = null) {
  const messages = [
    {
      role: "system",
      content:
        "You are a friendly and helpful AI assistant named DEV AI Agent. " +
        "You can answer any kind of question: explanations, how-to help, coding, writing, general knowledge, etc. " +
        "When you are given 'Web search results' from the system, use them as your main source for up-to-date facts, " +
        "but still explain answers in your own words.",
    },
  ];

  // Include recent history (last ~10 messages) for context
  const recent = chatHistory.slice(-10);
  for (const msg of recent) {
    if (msg.sender === "user") {
      messages.push({ role: "user", content: msg.text });
    } else {
      messages.push({ role: "assistant", content: msg.text });
    }
  }

  if (webResultsText) {
    messages.push({
      role: "system",
      content:
        "Here are some web search results to help answer the user's latest question:\n\n" +
        webResultsText,
    });
  }

  // Add the actual new question
  messages.push({ role: "user", content: userMessage });

  // Call OpenRouter
  return await callOpenRouter(messages);
}

// --- HTML & CSS UI (same UI as before, just text tweaks) ---
const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <!-- ✅ Mobile scaling -->
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Dev AI Agent - Secure Chat</title>

  <link rel="manifest" href="/manifest.json" />
  <meta name="theme-color" content="#020617" />
  <link rel="icon" type="image/png" href="/icons/icon-192.png" />

  <style>
    /* BASIC PAGE */
    html, body {
      height: 100%;
      margin: 0;
      padding: 0;
      background: #020617;
      font-family: system-ui, sans-serif;
      color: #e5e7eb;
    }

    /* MAIN APP ROOT */
    .app {
      width: 100%;
      height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    /* LOGIN CARD */
    .login-container {
      width: 100%;
      max-width: 420px;
      padding: 40px 36px;
      background: #020617;
      border-radius: 20px;
      border: 1px solid #1f2937;
      box-shadow: 0 24px 60px rgba(15, 23, 42, 0.9);
      text-align: left;
    }

    .login-container h1 {
      margin: 0 0 6px 0;
      text-align: center;
      font-size: 28px;
      color: #60a5fa;
    }

    .login-container .subtitle {
      text-align: center;
      margin-bottom: 28px;
      font-size: 14px;
      color: #9ca3af;
    }

    #login-form {
      margin-top: 12px;
    }

    label {
      font-size: 13px;
      color: #9ca3af;
      margin-bottom: 6px;
      display: block;
    }

    input[type="text"],
    input[type="password"] {
      width: 100%;
      padding: 12px 14px;
      margin-bottom: 18px;
      border-radius: 10px;
      background: #020617;
      border: 1px solid #374151;
      color: #e5e7eb;
      font-size: 14px;
      outline: none;
      transition: border 0.2s, box-shadow 0.2s;
    }

    input:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 1px #1d4ed8;
    }

    #login-form button[type="submit"] {
      width: 100%;
      padding: 12px 16px;
      border-radius: 999px;
      background: #e5e7eb;
      color: #111827;
      font-weight: 600;
      border: none;
      cursor: pointer;
      transition: background 0.2s, transform 0.1s;
      font-size: 15px;
    }

    #login-form button[type="submit"]:hover {
      background: #f3f4f6;
    }

    #login-form button[type="submit"]:active {
      transform: translateY(1px);
    }

    /* SHARED BUTTON STYLE */
    button {
      font-family: inherit;
    }

    .btn {
      padding: 8px 14px;
      border-radius: 999px;
      border: 1px solid #374151;
      background: #0b1120;
      color: #e5e7eb;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.2s, border-color 0.2s, transform 0.1s;
    }

    .btn:hover {
      background: #111827;
      border-color: #4b5563;
    }

    .btn-primary {
      background: #3b82f6;
      border-color: #3b82f6;
      color: #f9fafb;
    }

    .btn-primary:hover {
      background: #2563eb;
      border-color: #2563eb;
    }

    /* CHAT LAYOUT */
    .chat-container {
      width: 92%;
      max-width: 1100px;
      height: 80vh;
      background: #020617;
      border-radius: 24px;
      border: 1px solid #1f2937;
      box-shadow: 0 24px 60px rgba(15, 23, 42, 0.9);
      display: flex;
      overflow: hidden;
    }

    .hidden {
      display: none !important;
    }

    /* SIDEBAR */
    .sidebar {
      width: 260px;
      background: radial-gradient(circle at top left, #1e293b 0, #020617 55%);
      padding: 22px 20px;
      border-right: 1px solid #111827;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .sidebar h2 {
      margin: 0;
      font-size: 20px;
    }

    .history-list {
      margin-top: 4px;
      font-size: 14px;
    }

    .history-item {
      margin: 4px 0;
      opacity: 0.9;
      cursor: pointer;
      padding: 4px 0;
      border-radius: 8px;
      transition: background 0.15s, padding-left 0.15s;
    }

    .history-item:hover {
      background: #111827;
      padding-left: 6px;
    }

    .sidebar-footer {
      margin-top: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    /* CHAT MAIN */
    .chat-main {
      flex: 1;
      background: #020617;
      padding: 22px 22px 18px 22px;
      display: flex;
      flex-direction: column;
      min-height: 0; /* allow inner scroll */
    }

    .chat-header {
      margin-bottom: 14px;
    }

    .chat-header h1 {
      margin: 0;
      font-size: 26px;
    }

    .chat-header .subtitle {
      margin-top: 6px;
      font-size: 13px;
      color: #9ca3af;
    }

    #chat-window {
      flex: 1;
      overflow-y: auto;
      padding-right: 4px;
      padding-bottom: 10px;
      min-height: 0;
    }

    .message {
      margin: 8px 0;
      padding: 10px 12px;
      border-radius: 14px;
      max-width: 70%;
      white-space: pre-wrap;
      font-size: 14px;
    }

    .message.user {
      background: #1d4ed8;
      color: #e5e7eb;
      margin-left: auto;
    }

    .message.bot {
      background: #020617;
      border: 1px solid #1f2937;
      color: #e5e7eb;
      margin-right: auto;
    }

    /* INPUT AREA (BOTTOM BAR) */
    #chat-form {
      display: flex;
      gap: 8px;
      padding-top: 10px;
      margin-top: auto;
      flex-shrink: 0; /* keep bar visible */
    }

    #input-shell {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px 8px 14px;
      border-radius: 999px;
      background: #020617;
      border: 1px solid #1f2937;
    }

    #user-input {
      flex: 1;
      border: none;
      background: transparent;
      color: #e5e7eb;
      outline: none;
      font-size: 14px;
    }

    #user-input::placeholder {
      color: #6b7280;
    }

    #send-btn {
      padding: 8px 16px;
      border-radius: 999px;
      border: none;
      background: #3b82f6;
      color: white;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s, transform 0.1s;
    }

    #send-btn:hover {
      background: #2563eb;
    }

    #send-btn:active {
      transform: translateY(1px);
    }

    /* ✅ MOBILE RESPONSIVE FIX */
    @media (max-width: 600px) {
      html, body {
        height: 100%;
      }

      .app {
        height: 100vh;
        align-items: stretch;
      }

      .login-container {
        width: 90%;
        max-width: 360px;
        padding: 30px 24px;
        margin-top: 40px;
      }

      .login-container h1 {
        font-size: 24px;
      }

      .login-container .subtitle {
        font-size: 14px;
        margin-bottom: 24px;
      }

      input[type="text"],
      input[type="password"] {
        padding: 10px 12px;
        font-size: 15px;
      }

      #login-form button[type="submit"] {
        padding: 12px 16px;
        font-size: 15px;
      }

      /* 🔹 Chat layout tweaks on mobile */
      .chat-container {
        width: 100%;
        height: 100%;
        max-width: none;
        border-radius: 0;
        flex-direction: column;
        border-left: none;
        border-right: none;
      }

      .sidebar {
        width: 100%;
        padding: 12px 16px;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        border-right: none;
        border-bottom: 1px solid #111827;
      }

      .history-list {
        display: none; /* hide fake history to save space */
      }

      .sidebar-footer {
        flex-direction: row;
        gap: 6px;
        margin-top: 0;
      }

      .chat-main {
        padding: 14px 12px 12px 12px;
      }

      .chat-header h1 {
        font-size: 20px;
      }

      .chat-header .subtitle {
        font-size: 12px;
      }

      .message {
        max-width: 85%;
        font-size: 13px;
      }

      #chat-form {
        gap: 6px;
      }

      #input-shell {
        padding: 8px 10px;
      }

      #user-input {
        font-size: 13px;
      }

      #send-btn {
        padding: 8px 12px;
        font-size: 13px;
      }
    }
  </style>
</head>

<body>
  <div class="app" id="app-container">

    <!-- LOGIN SCREEN -->
    <div class="login-container" id="login-screen">
      <h1>Dev AI Agent 🤖</h1>
      <p class="subtitle">Securely access your personalized AI workspace.</p>

      <form id="login-form">
        <label for="username">Username</label>
        <input type="text" id="username" value="user" required />

        <label for="password">Password</label>
        <input type="password" id="password" value="password" required />

        <button type="submit">Login to Chat</button>

        <p id="login-message"
           style="display:none; margin-top:15px; text-align:center; color:#ef4444;">
           Invalid credentials.
        </p>
      </form>
    </div>

    <!-- CHAT SCREEN -->
    <div class="chat-container hidden" id="chat-screen">
      <div class="sidebar">
        <div>
          <h2>Chat History</h2>
          <div class="history-list">
            <div class="history-item">Current Session</div>
            <div class="history-item">Yesterday's Plan</div>
            <div class="history-item">Old Calc Queries</div>
          </div>
        </div>

        <div class="sidebar-footer">
          <span style="font-size:12px; color:#9ca3af;">Account</span>
          <button class="btn" onclick="logout()">Logout</button>
          <button class="btn" onclick="resetChat()">Reset Session</button>
        </div>
      </div>

      <div class="chat-main">
        <div class="chat-header">
          <h1>Dev AI Agent Console</h1>
          <p class="subtitle">
            Ask anything — latest news, general doubts, code, study help.  
            Try <code>calc: 5*2+10</code>, <code>study: Quantum Physics</code>, or <code>web: who won t20 world cup 2024</code>.
          </p>
        </div>

        <div id="chat-window"></div>

        <form id="chat-form">
          <div id="input-shell">
            <input id="user-input" placeholder="Ask the agent anything..." autocomplete="off" />
          </div>
          <button id="send-btn" type="submit">Send</button>
        </form>
      </div>
    </div>

  </div>

  <script>
    // --- PWA: Service Worker Registration ---
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .catch((err) => console.log("Service worker registration failed:", err));
      });
    }

    // --- UI/STATE ELEMENTS ---
    const loginScreen = document.getElementById("login-screen");
    const chatScreen = document.getElementById("chat-screen");
    const loginForm = document.getElementById("login-form");
    const loginMessage = document.getElementById("login-message");

    const chatWindow = document.getElementById("chat-window");
    const chatForm = document.getElementById("chat-form");
    const input = document.getElementById("user-input");

    let isAuthenticated = false;

    function addMessage(text, sender = "bot") {
      const div = document.createElement("div");
      div.classList.add("message", sender);
      div.innerHTML = text;
      chatWindow.appendChild(div);
      chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    // Render full history returned from backend
    function renderHistory(history) {
      chatWindow.innerHTML = "";
      if (!history || history.length === 0) {
        addMessage(
          "Hello! I'm DEV AI Agent. Ask me anything — I can also search the internet for latest info using SerpAPI + OpenRouter.",
          "bot"
        );
        return;
      }

      history.forEach((msg) => {
        const sender = msg.sender === "user" ? "user" : "bot";
        addMessage(msg.text, sender);
      });
    }

    function showChat() {
      loginScreen.classList.add("hidden");
      chatScreen.classList.remove("hidden");

      // Load existing history from backend when opening chat
      fetch("/api/history")
        .then((res) => res.json())
        .then((data) => {
          renderHistory(data.history || []);
        })
        .catch(() => {
          renderHistory([]);
        });
    }

    function showLogin() {
      isAuthenticated = false;
      loginScreen.classList.remove("hidden");
      chatScreen.classList.add("hidden");
      chatWindow.innerHTML = "";
      fetch("/api/reset", { method: "POST" });
    }

    window.logout = showLogin;

    window.resetChat = function () {
      if (
        confirm(
          "Are you sure you want to reset the current chat session? This will clear the AI's memory."
        )
      ) {
        chatWindow.innerHTML = "";
        addMessage(
          "Session reset! The AI no longer remembers previous messages.",
          "bot"
        );
        fetch("/api/reset", { method: "POST" });
      }
    };

    // Login handler
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const username = document.getElementById("username").value;
      const password = document.getElementById("password").value;

      if (username === "user" && password === "password") {
        isAuthenticated = true;
        loginMessage.style.display = "none";
        showChat();
      } else {
        loginMessage.style.display = "block";
      }
    });

    // Chat submit handler
    chatForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text || !isAuthenticated) return;

      // Show user's message immediately on UI
      addMessage(text, "user");
      input.value = "";

      // Temporary "Thinking..." bubble
      addMessage("Ruko jaraa, sabr karoo....", "bot");
      const loadingElem = chatWindow.lastChild;

      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        });

        const data = await res.json();
        if (loadingElem && loadingElem.parentNode === chatWindow) {
          chatWindow.removeChild(loadingElem);
        }

        if (data.error) {
          addMessage("⚠️ " + data.error, "bot");
        } else if (data.history) {
          renderHistory(data.history);
        } else {
          addMessage(data.result || "No response from agent.", "bot");
        }
      } catch (err) {
        console.error("❌ Fetch error:", err);
        if (loadingElem && loadingElem.parentNode === chatWindow) {
          chatWindow.removeChild(loadingElem);
        }
        addMessage("Network error hitting /api/agent", "bot");
      }
    });
  </script>
</body>
</html>
`;

// --- EXPRESS ROUTES ---

app.get("/", (req, res) => {
  res.send(html);
});

// Return full chat history for the frontend
app.get("/api/history", (req, res) => {
  res.json({ history: chatHistory });
});

app.post("/api/reset", (req, res) => {
  chatHistory = [];
  nextId = 1;
  console.log("Session reset command received. Chat history cleared.");
  res.status(200).json({ status: "ok", message: "Session reset." });
});

app.post("/api/agent", async (req, res) => {
  const { message } = req.body;
  console.log("📩 /api/agent body:", req.body);

  if (!message) {
    return res.status(400).json({ error: "No message provided from frontend" });
  }

  try {
    // Save user message into history
    chatHistory.push({
      id: nextId++,
      sender: "user",
      text: message,
      timestamp: new Date().toISOString(),
    });

    const lower = message.toLowerCase().trim();

    // --- Special modes: calc:, study:, web: ---

    // Calculator
    if (lower.startsWith("calc:")) {
      const expr = message.split(":").slice(1).join(":").trim();
      const result = simpleCalculator(expr);
      const reply = `The result of ${expr} is **${result}**.`;
      chatHistory.push({
        id: nextId++,
        sender: "agent",
        text: reply,
        timestamp: new Date().toISOString(),
      });
      return res.json({
        type: "agent",
        result: reply,
        history: chatHistory,
      });
    }

    // Study plan
    let webResults = null;
    let questionForModel = message;

    if (lower.startsWith("study:")) {
      const topic = message.split(":").slice(1).join(":").trim() || "General topic";
      questionForModel =
        `Create a clear, beginner-friendly **5-day study plan** for the topic: "${topic}". ` +
        `Use markdown headings and bullet points. Include daily goals and resources.`;
    }
    // Forced web search: web: / search:
    else if (lower.startsWith("web:") || lower.startsWith("search:")) {
      const query = message.split(":").slice(1).join(":").trim() || message;
      webResults = await webSearch(query);
      questionForModel =
        `Using the web search results provided, answer this question clearly and concisely:\n\nQuestion: ${query}`;
    }
    // Auto web-search based on keywords
    else if (shouldUseWebSearch(message)) {
      webResults = await webSearch(message);
    }

    const reply = await runChat(questionForModel, webResults);

    // Save agent reply into history
    chatHistory.push({
      id: nextId++,
      sender: "agent",
      text: reply,
      timestamp: new Date().toISOString(),
    });

    return res.json({
      type: "agent",
      result: reply,
      history: chatHistory,
    });
  } catch (err) {
    console.error("❌ SERVER ERROR:", err);

    const userMessage =
      err.message ||
      "Something went wrong while talking to the AI model or web search.";

    chatHistory.push({
      id: nextId++,
      sender: "agent",
      text: "⚠️ " + userMessage,
      timestamp: new Date().toISOString(),
    });

    return res.status(500).json({ error: userMessage, history: chatHistory });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(
    `🚀 Dev AI Agent running with OpenRouter + SerpAPI at http://localhost:${PORT}`
  );
});



