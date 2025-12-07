const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { GoogleGenAI } = require("@google/genai");

dotenv.config();

// --- GEMINI SETUP ---
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const model = "gemini-2.5-flash";

console.log(
  "Environment Key Check:",
  process.env.GEMINI_API_KEY ? "Key Loaded!" : "Key FAILED to Load!"
);

const app = express();
app.use(express.static("public"));
app.use(cors());
app.use(express.json());

// Stores chat history in memory (single session for simplicity)
let chatSession = null;

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

// 📖 TOOL 2: Study Plan Generator (Simulated)
function studyPlanGenerator(topic) {
  return JSON.stringify({
    instruction: `Please generate a clear, concise 5-day study plan for a beginner on the topic: ${topic}. Format it using markdown headings and bullet points.`,
    topic: topic,
  });
}

// 💡 Centralized function to call Gemini (handles history and tool calling loop)
async function runChat(message) {
  // Initialize chat session if it doesn't exist
  if (!chatSession) {
    chatSession = ai.chats.create({
      model: model,
      config: {
        systemInstruction:
          "You are a friendly and helpful AI assistant named Fresh Agent. Explain things simply, remember the conversation history, and use your available tools (calculator and study_planner) whenever appropriate.",
        tools: [
          {
            functionDeclarations: [
              {
                name: "simpleCalculator",
                description:
                  "Performs basic mathematical calculations like addition, subtraction, multiplication, and division. Use this for all math-related requests (e.g., 'calc: 2+3*4', 'what is 100/5', etc.).",
                parameters: {
                  type: "object",
                  properties: {
                    expr: {
                      type: "string",
                      description:
                        "The mathematical expression to evaluate, e.g., '2+3*4'.",
                    },
                  },
                  required: ["expr"],
                },
              },
              {
                name: "studyPlanGenerator",
                description:
                  "Triggers the creation of a 5-day study plan for a beginner on a requested topic. Use this for all 'study:' or education-related requests.",
                parameters: {
                  type: "object",
                  properties: {
                    topic: {
                      type: "string",
                      description:
                        "The subject or topic for which the study plan should be generated, e.g., 'Operating System'.",
                    },
                  },
                  required: ["topic"],
                },
              },
            ],
          },
        ],
      },
    });
    console.log("✨ New chat session created with tools.");
  }

  let response = await chatSession.sendMessage({ message: message });
  let toolResponse = "";

  // Tool Calling Loop
  while (response.functionCalls && response.functionCalls.length > 0) {
    const call = response.functionCalls[0];
    const { name, args } = call;
    let toolResult = null;

    console.log(`\n\n🛠️ AI called tool: ${name} with args: ${JSON.stringify(args)}`);

    if (name === "simpleCalculator") {
      toolResult = simpleCalculator(args.expr);
      toolResponse = `The result of ${args.expr} is **${toolResult}**`;
    } else if (name === "studyPlanGenerator") {
      toolResult = studyPlanGenerator(args.topic);
    } else {
      toolResult = `Error: Unknown tool ${name}`;
    }

    // Send the tool's output back to the model
    response = await chatSession.sendMessage({
      message: `Tool ${name} executed. Result: ${toolResult}`,
      functionResponses: [
        {
          name: name,
          response: {
            content: toolResult,
          },
        },
      ],
    });

    // If the calculator ran, we return the result immediately
    if (toolResponse && name === "simpleCalculator") {
      return toolResponse;
    }
  }

  return response.text;
}

// --- HTML & CSS UI ---
const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Fresh AI Agent - Secure Chat</title>

  <link rel="manifest" href="/manifest.json" />
  <meta name="theme-color" content="#020617" />
  <link rel="icon" type="image/png" href="/icons/icon-192.png" />


  <style>
    html, body {
      height: 100%;
      margin: 0;
      padding: 0;
      background: #020617;
      font-family: system-ui, sans-serif;
      color: #e5e7eb;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    /* MAIN APP ROOT */
    .app {
      width: 100%;
      height: 100%;
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

  </style>
</head>

<body>
  <div class="app" id="app-container">

    <!-- LOGIN SCREEN -->
    <div class="login-container" id="login-screen">
      <h1>Fresh AI Agent 🤖</h1>
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
          <h1>Fresh AI Agent Console</h1>
          <p class="subtitle">
            Ask anything, or try <code>calc: 5*2+10</code> or <code>study: Quantum Physics</code>.
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

    function showChat() {
      loginScreen.classList.add("hidden");
      chatScreen.classList.remove("hidden");
      addMessage(
        "Hello! I'm Fresh Agent. How can I help you today? Try asking me to calculate '5*2+10' or 'study: Quantum Physics'.",
        "bot"
      );
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

      addMessage(text, "user");
      input.value = "";

      addMessage("Thinking...", "bot");
      const loadingElem = chatWindow.lastChild;

      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        });

        const data = await res.json();
        chatWindow.removeChild(loadingElem);

        if (data.error) {
          addMessage("Error: " + data.error, "bot");
        } else {
          addMessage(data.result, "bot");
        }
      } catch (err) {
        console.error("❌ Fetch error:", err);
        chatWindow.removeChild(loadingElem);
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

app.post("/api/reset", (req, res) => {
  chatSession = null;
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
    const reply = await runChat(message);
    return res.json({ type: "agent", result: reply });
  } catch (err) {
    console.error("❌ SERVER ERROR:", err);
    chatSession = null;
    return res
      .status(500)
      .json({ error: err.message || "Internal server error" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 AI Agent with Gemini running at http://localhost:${PORT}`);
});





