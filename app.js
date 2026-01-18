/* ==========
  小工具
========== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const storage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  },
  remove(key) {
    localStorage.removeItem(key);
  },
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function debounce(fn, wait = 300) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/* ==========
  主题切换
========== */
const THEME_KEY = "review.theme";
const root = document.documentElement;
const themeBtn = $("#themeBtn");

function applyTheme(theme) {
  root.dataset.theme = theme;
  themeBtn.textContent = theme === "light" ? "🌞 亮色主题" : "🌙 暗色主题";
  storage.set(THEME_KEY, theme);
}

applyTheme(storage.get(THEME_KEY, "dark"));

themeBtn.addEventListener("click", () => {
  const next = root.dataset.theme === "light" ? "dark" : "light";
  applyTheme(next);
});

/* ==========
  待办（CRUD + 过滤 + 编辑 + 持久化）
========== */
const TODO_KEY = "review.todos";
const todoForm = $("#todoForm");
const todoInput = $("#todoInput");
const todoList = $("#todoList");
const todoCount = $("#todoCount");
const clearDoneBtn = $("#clearDoneBtn");

let filter = "all";
let todos = storage.get(TODO_KEY, [
  { id: uid(), text: "复习 DOM 事件委托", done: false, createdAt: Date.now() },
  { id: uid(), text: "写一个 localStorage 持久化", done: true, createdAt: Date.now() - 3600_000 },
]);

function persistTodos() {
  storage.set(TODO_KEY, todos);
}

function getFilteredTodos() {
  if (filter === "active") return todos.filter((t) => !t.done);
  if (filter === "done") return todos.filter((t) => t.done);
  return todos;
}

function renderTodos() {
  const visible = getFilteredTodos();

  todoCount.textContent = `${todos.filter((t) => !t.done).length}`;

  todoList.innerHTML = "";
  if (visible.length === 0) {
    const li = document.createElement("li");
    li.className = "hint";
    li.textContent = "暂无内容，添加一个待办开始复习吧。";
    todoList.appendChild(li);
    return;
  }

  for (const t of visible) {
    const li = document.createElement("li");
    li.className = `item ${t.done ? "done" : ""}`;
    li.dataset.id = t.id;

    li.innerHTML = `
      <div class="check" role="button" tabindex="0" aria-label="切换完成">${t.done ? "✓" : "•"}</div>
      <div class="title">
        <span class="text" title="双击编辑">${escapeHtml(t.text)}</span>
      </div>
      <button class="icon-btn" data-action="delete" title="删除">🗑️</button>
    `;

    todoList.appendChild(li);
  }
}

function escapeHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

todoForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = todoInput.value.trim();
  if (!text) return;

  todos.unshift({ id: uid(), text, done: false, createdAt: Date.now() });
  todoInput.value = "";
  persistTodos();
  renderTodos();
});

// 事件委托：点击完成、删除、双击编辑
todoList.addEventListener("click", (e) => {
  const item = e.target.closest(".item");
  if (!item) return;
  const id = item.dataset.id;

  if (e.target.classList.contains("check")) {
    todos = todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
    persistTodos();
    renderTodos();
    return;
  }

  if (e.target.dataset.action === "delete") {
    todos = todos.filter((t) => t.id !== id);
    persistTodos();
    renderTodos();
    return;
  }
});

// 双击编辑（Enter 保存，Esc 取消）
todoList.addEventListener("dblclick", (e) => {
  const item = e.target.closest(".item");
  if (!item) return;
  const textEl = item.querySelector(".text");
  if (!textEl) return;

  const id = item.dataset.id;
  const oldText = todos.find((t) => t.id === id)?.text ?? "";

  const input = document.createElement("input");
  input.className = "edit";
  input.value = oldText;

  textEl.replaceWith(input);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  const finish = (mode) => {
    const newText = input.value.trim();
    if (mode === "save" && newText) {
      todos = todos.map((t) => (t.id === id ? { ...t, text: newText } : t));
      persistTodos();
    }
    renderTodos();
  };

  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") finish("save");
    if (ev.key === "Escape") finish("cancel");
  });

  input.addEventListener("blur", () => finish("save"));
});

// 筛选按钮
$$(".chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".chip").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    filter = btn.dataset.filter;
    renderTodos();
  });
});

clearDoneBtn.addEventListener("click", () => {
  todos = todos.filter((t) => !t.done);
  persistTodos();
  renderTodos();
});

/* ==========
  番茄钟（状态 + interval）
========== */
const pomodoroState = $("#pomodoroState");
const timeText = $("#timeText");
const startBtn = $("#startBtn");
const pauseBtn = $("#pauseBtn");
const stopBtn = $("#stopBtn");
const focusMin = $("#focusMin");
const breakMin = $("#breakMin");
const applyTimerBtn = $("#applyTimerBtn");

const TIMER_KEY = "review.timer";
let timer = storage.get(TIMER_KEY, { focus: 25, break: 5 });

focusMin.value = timer.focus;
breakMin.value = timer.break;

let mode = "focus"; // focus | break
let remainingSec = timer.focus * 60;
let ticking = false;
let intervalId = null;

function setMode(nextMode) {
  mode = nextMode;
  pomodoroState.textContent = nextMode === "focus" ? "专注" : "休息";
  pomodoroState.style.opacity = "0.9";
}

function updateTimeUI() {
  const m = Math.floor(remainingSec / 60);
  const s = remainingSec % 60;
  timeText.textContent = `${pad2(m)}:${pad2(s)}`;
  document.title = `${timeText.textContent} · ${mode === "focus" ? "专注" : "休息"}`;
}

function startTick() {
  if (ticking) return;
  ticking = true;
  startBtn.disabled = true;
  pauseBtn.disabled = false;

  intervalId = setInterval(() => {
    remainingSec -= 1;
    if (remainingSec <= 0) {
      // 切换模式
      if (mode === "focus") {
        setMode("break");
        remainingSec = timer.break * 60;
      } else {
        setMode("focus");
        remainingSec = timer.focus * 60;
      }
      // 小提示音（很轻量，不依赖文件）
      tryBeep();
    }
    updateTimeUI();
  }, 1000);
}

function pauseTick() {
  if (!ticking) return;
  ticking = false;
  startBtn.disabled = false;
  pauseBtn.disabled = true;
  clearInterval(intervalId);
  intervalId = null;
}

function stopTick() {
  pauseTick();
  setMode("focus");
  remainingSec = timer.focus * 60;
  updateTimeUI();
}

function tryBeep() {
  // 复习点：Web Audio API（可删）
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 660;
    gain.gain.value = 0.03;
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, 120);
  } catch {}
}

applyTimerBtn.addEventListener("click", () => {
  const f = Math.max(1, Math.min(180, Number(focusMin.value || 25)));
  const b = Math.max(1, Math.min(60, Number(breakMin.value || 5)));
  timer = { focus: f, break: b };
  storage.set(TIMER_KEY, timer);
  stopTick();
});

startBtn.addEventListener("click", startTick);
pauseBtn.addEventListener("click", pauseTick);
stopBtn.addEventListener("click", stopTick);

setMode("focus");
updateTimeUI();

/* ==========
  表单校验 + 异步请求（fetch）
========== */
const contactForm = $("#contactForm");
const email = $("#email");
const msg = $("#msg");
const emailErr = $("#emailErr");
const msgErr = $("#msgErr");
const formResult = $("#formResult");
const fillBtn = $("#fillBtn");

function validateEmail(v) {
  // 复习点：正则（简单版）
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function setError(el, errEl, text) {
  if (!text) {
    errEl.textContent = "";
    el.style.borderColor = "";
    return;
  }
  errEl.textContent = text;
  el.style.borderColor = "rgba(255, 77, 109, 0.85)";
}

const liveValidate = debounce(() => {
  const e = email.value.trim();
  const m = msg.value.trim();
  setError(email, emailErr, e && !validateEmail(e) ? "邮箱格式不正确" : "");
  setError(msg, msgErr, m.length > 0 && m.length < 5 ? "留言至少 5 个字" : "");
}, 250);

email.addEventListener("input", liveValidate);
msg.addEventListener("input", liveValidate);

fillBtn.addEventListener("click", () => {
  email.value = "forrest@example.com";
  msg.value = "今天复习：DOM 事件委托、localStorage、fetch、定时器。";
  liveValidate();
});

contactForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  formResult.textContent = "";
  const eVal = email.value.trim();
  const mVal = msg.value.trim();

  let ok = true;
  if (!eVal) { setError(email, emailErr, "请输入邮箱"); ok = false; }
  else if (!validateEmail(eVal)) { setError(email, emailErr, "邮箱格式不正确"); ok = false; }
  else setError(email, emailErr, "");

  if (!mVal) { setError(msg, msgErr, "请输入留言"); ok = false; }
  else if (mVal.length < 5) { setError(msg, msgErr, "留言至少 5 个字"); ok = false; }
  else setError(msg, msgErr, "");

  if (!ok) return;

  // UI 状态
  const submitBtn = contactForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = "提交中...";

  try {
    // 用公开测试接口模拟提交（返回 JSON）
    const res = await fetch("https://jsonplaceholder.typicode.com/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: eVal, message: mVal, createdAt: new Date().toISOString() }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    formResult.textContent = `✅ 提交成功！服务器返回 id=${data.id}（模拟接口）`;
    contactForm.reset();
  } catch (err) {
    formResult.textContent = `❌ 提交失败：${String(err.message || err)}`;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "提交";
  }
});

/* ==========
  快捷键
========== */
window.addEventListener("keydown", (e) => {
  if (e.key === "/") {
    e.preventDefault();
    todoInput.focus();
  }
});

/* ==========
  全局重置
========== */
$("#resetBtn").addEventListener("click", () => {
  storage.remove(TODO_KEY);
  storage.remove(THEME_KEY);
  storage.remove(TIMER_KEY);
  location.reload();
});

/* 初始渲染 */
renderTodos();

/*
  可选增强：拖拽排序（复习 Drag & Drop API / pointer events）
  - 你可以自己加：给 li 设置 draggable=true，
  - 监听 dragstart / dragover / drop 来更新 todos 的顺序后 persist+render
*/
