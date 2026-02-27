/* =========================
   Config & Utilities
========================= */
const SETTINGS_KEY = "quiz_settings_v1";
const WINNERS_KEY = "quiz_winners_v1";

const DIFFICULTIES = ["Easy", "Hard", "Expert"];

function loadSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (raw) {
    try {
      const s = JSON.parse(raw);
      return {
        timeLimitMin: clampInt(s.timeLimitMin, 1, 999, 5),
        minCorrectForForm: clampInt(s.minCorrectForForm, 0, 9999, 10)
      };
    } catch {}
  }
  return { timeLimitMin: 5, minCorrectForForm: 10 };
}

function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  return Math.min(max, Math.max(min, i));
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function mmss(totalSeconds) {
  const s = Math.max(0, Math.trunc(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function normalizeText(s) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function nowKSTISOString() {
  // 브라우저 로컬 시간이 KST(한국)라 가정(행사장 PC 기준)
  return new Date().toISOString();
}

/* =========================
   DOM
========================= */
const $ = (id) => document.getElementById(id);

const screenStart = $("screenStart");
const screenQuiz = $("screenQuiz");
const screenResult = $("screenResult");

const openSettingsBtn = $("openSettingsBtn");
const settingsModal = $("settingsModal");
const closeSettingsBtn = $("closeSettingsBtn");
const saveSettingsBtn = $("saveSettingsBtn");

const timeLimitMinInput = $("timeLimitMinInput");
const minCorrectForFormInput = $("minCorrectForFormInput");

const timerPill = $("timerPill");
const timerText = $("timerText");

const startBtn = $("startBtn");
const quitBtn = $("quitBtn");
const prevBtn = $("prevBtn");
const nextBtn = $("nextBtn");

const questionCountInput = $("questionCountInput");

const questionBox = $("questionBox");
const difficultyBadge = $("difficultyBadge");
const qIndexBadge = $("qIndexBadge");
const scoreBadge = $("scoreBadge");

const resultSummary = $("resultSummary");
const resultDifficulty = $("resultDifficulty");
const resultScore = $("resultScore");
const resultTime = $("resultTime");
const resultClear = $("resultClear");
const restartBtn = $("restartBtn");

const winnerFormBox = $("winnerFormBox");
const winnerForm = $("winnerForm");
const nameInput = $("nameInput");
const studentIdInput = $("studentIdInput");
const deptInput = $("deptInput");
const phoneInput = $("phoneInput");

const downloadCsvBtn = $("downloadCsvBtn");
const downloadJsonBtn = $("downloadJsonBtn");
const clearWinnersBtn = $("clearWinnersBtn");

/* =========================
   State
========================= */
let settings = loadSettings();

let allQuestions = [];
let quizQuestions = [];
let quizDifficulty = "Easy";
let currentIndex = 0;

// userAnswers: for mcq => number index, for short => string
let userAnswers = [];
let timer = {
  totalSec: settings.timeLimitMin * 60,
  remainSec: settings.timeLimitMin * 60,
  handle: null
};

/* =========================
   Load Questions
========================= */
async function loadQuestions() {
  const res = await fetch("./questions.json", { cache: "no-store" });
  if (!res.ok) throw new Error("questions.json 로드 실패");
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("questions.json 형식이 배열이 아님");
  return data;
}

/* =========================
   Screen Control
========================= */
function showScreen(which) {
  screenStart.classList.toggle("hidden", which !== "start");
  screenQuiz.classList.toggle("hidden", which !== "quiz");
  screenResult.classList.toggle("hidden", which !== "result");
}

function openSettings() {
  timeLimitMinInput.value = String(settings.timeLimitMin);
  minCorrectForFormInput.value = String(settings.minCorrectForForm);
  settingsModal.classList.remove("hidden");
}

function closeSettings() {
  settingsModal.classList.add("hidden");
}

/* =========================
   Quiz Setup
========================= */
function getSelectedDifficulty() {
  const el = document.querySelector('input[name="difficulty"]:checked');
  return el?.value ?? "Easy";
}

function pickQuestions(difficulty, count) {
  const pool = allQuestions.filter((q) => q.difficulty === difficulty);
  const shuffled = shuffle(pool);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

function resetTimer() {
  timer.totalSec = settings.timeLimitMin * 60;
  timer.remainSec = timer.totalSec;
  timerText.textContent = mmss(timer.remainSec);
  timerPill.classList.remove("hidden");
}

function stopTimer() {
  if (timer.handle) {
    clearInterval(timer.handle);
    timer.handle = null;
  }
}

function startTimer() {
  stopTimer();
  timerText.textContent = mmss(timer.remainSec);

  timer.handle = setInterval(() => {
    timer.remainSec -= 1;
    timerText.textContent = mmss(timer.remainSec);

    if (timer.remainSec <= 0) {
      stopTimer();
      finishQuiz(true);
    }
  }, 1000);
}

/* =========================
   Rendering
========================= */
function renderQuestion() {
  const q = quizQuestions[currentIndex];
  if (!q) return;

  difficultyBadge.textContent = quizDifficulty;
  qIndexBadge.textContent = `${currentIndex + 1} / ${quizQuestions.length}`;

  const currentScore = computeScore().correct;
  scoreBadge.textContent = `정답 ${currentScore}`;

  const answer = userAnswers[currentIndex];

  const meta = `
    <div class="q-meta">
      <div class="badge">${q.type === "mcq" ? "객관식" : "주관식"}</div>
    </div>
  `;

  const codeBlock = q.code?.text
    ? `
      <div class="code-wrap">
        <pre><code class="language-${escapeHtml(q.code.lang ?? "none")}">${escapeHtml(
        q.code.text
      )}</code></pre>
      </div>
    `
    : "";

  const prompt = `<h2 class="q-title">${escapeHtml(q.prompt)}</h2>`;

  let body = "";

  if (q.type === "mcq") {
    const choices = Array.isArray(q.choices) ? q.choices : [];
    body = `
      <div class="choice-list">
        ${choices
          .map((c, idx) => {
            const selected = Number(answer) === idx ? "selected" : "";
            return `<button type="button" class="choice-btn ${selected}" data-choice="${idx}">
              ${String.fromCharCode(65 + idx)}. ${escapeHtml(c)}
            </button>`;
          })
          .join("")}
      </div>
    `;
  } else {
    body = `
      <div class="answer-input">
        <input id="shortAnswerInput" class="input" placeholder="정답을 입력하세요" value="${escapeHtml(
          answer ?? ""
        )}" />
        <div class="small muted" style="margin-top:8px;">대소문자/공백은 자동으로 어느 정도 정규화해서 채점합니다.</div>
      </div>
    `;
  }

  questionBox.innerHTML = `${meta}${prompt}${codeBlock}${body}`;

  // Prism highlight
  if (window.Prism?.highlightAllUnder) {
    window.Prism.highlightAllUnder(questionBox);
  } else if (window.Prism?.highlightAll) {
    window.Prism.highlightAll();
  }

  // Bind events
  if (q.type === "mcq") {
    questionBox.querySelectorAll(".choice-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-choice"));
        userAnswers[currentIndex] = idx;
        renderQuestion();
      });
    });
  } else {
    const input = $("shortAnswerInput");
    input?.addEventListener("input", (e) => {
      userAnswers[currentIndex] = e.target.value;
    });
  }

  // Prev/Next 버튼 상태
  prevBtn.disabled = currentIndex === 0;
  nextBtn.textContent =
    currentIndex === quizQuestions.length - 1 ? "제출" : "다음";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   Scoring
========================= */
function isCorrect(q, userAnswer) {
  if (!q) return false;

  if (q.type === "mcq") {
    return Number(userAnswer) === Number(q.answer);
  }

  // short
  const ua = normalizeText(userAnswer);
  const ans = q.answer;

  if (Array.isArray(ans)) {
    return ans.some((a) => normalizeText(a) === ua);
  }
  return normalizeText(ans) === ua;
}

function computeScore() {
  let correct = 0;
  for (let i = 0; i < quizQuestions.length; i++) {
    if (isCorrect(quizQuestions[i], userAnswers[i])) correct += 1;
  }
  return { correct, total: quizQuestions.length };
}

/* =========================
   Finish & Winner Save
========================= */
function finishQuiz(byTimeout = false) {
  stopTimer();

  const { correct, total } = computeScore();
  const passed = correct >= settings.minCorrectForForm;

  const cleared = correct === total ? quizDifficulty : "None";

  showScreen("result");
  timerPill.classList.add("hidden");

  resultDifficulty.textContent = quizDifficulty;
  resultScore.textContent = `${correct} / ${total}`;
  resultTime.textContent = `${settings.timeLimitMin}분`;
  resultClear.textContent = cleared === "None" ? "미클리어" : `클리어(${cleared})`;

  resultSummary.textContent = byTimeout
    ? `시간 종료! ${correct}개 맞았습니다.`
    : `제출 완료! ${correct}개 맞았습니다.`;

  winnerFormBox.classList.toggle("hidden", !passed);

  // 폼이 뜨는 기준이면, 안내용으로 난이도/점수 정보를 폼 제출 데이터에 같이 저장
  winnerForm.dataset.correct = String(correct);
  winnerForm.dataset.total = String(total);
  winnerForm.dataset.difficulty = quizDifficulty;
  winnerForm.dataset.cleared = cleared;
}

function loadWinners() {
  const raw = localStorage.getItem(WINNERS_KEY);
  if (!raw) return [];
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

function saveWinners(list) {
  localStorage.setItem(WINNERS_KEY, JSON.stringify(list));
}

function addWinner(entry) {
  const list = loadWinners();
  list.push(entry);
  saveWinners(list);
}

function downloadText(filename, text, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function winnersToCSV(list) {
  const header = [
    "timestamp",
    "name",
    "studentId",
    "department",
    "phone",
    "difficulty",
    "score",
    "total",
    "clearedDifficulty"
  ];

  const lines = [header.join(",")];

  for (const w of list) {
    const row = [
      w.timestamp,
      w.name,
      w.studentId,
      w.department,
      w.phone,
      w.difficulty,
      String(w.score),
      String(w.total),
      w.clearedDifficulty
    ].map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`);
    lines.push(row.join(","));
  }
  return lines.join("\n");
}

/* =========================
   Events
========================= */
openSettingsBtn.addEventListener("click", openSettings);
closeSettingsBtn.addEventListener("click", closeSettings);
settingsModal.addEventListener("click", (e) => {
  if (e.target === settingsModal) closeSettings();
});

saveSettingsBtn.addEventListener("click", () => {
  const newSettings = {
    timeLimitMin: clampInt(timeLimitMinInput.value, 1, 999, 5),
    minCorrectForForm: clampInt(minCorrectForFormInput.value, 0, 9999, 10)
  };
  settings = newSettings;
  saveSettings(settings);
  closeSettings();
});

startBtn.addEventListener("click", () => {
  quizDifficulty = getSelectedDifficulty();
  const desiredCount = clampInt(questionCountInput.value, 1, 9999, 15);

  const picked = pickQuestions(quizDifficulty, desiredCount);
  if (picked.length === 0) {
    alert("해당 난이도 문제풀이용 문제가 없습니다. questions.json을 확인하세요.");
    return;
  }

  quizQuestions = shuffle(picked); // 최종 셔플
  currentIndex = 0;
  userAnswers = Array(quizQuestions.length).fill(null);

  resetTimer();
  startTimer();
  showScreen("quiz");
  renderQuestion();
});

quitBtn.addEventListener("click", () => {
  if (confirm("정말 종료할까요? (현재 진행상황은 저장되지 않습니다)")) {
    stopTimer();
    timerPill.classList.add("hidden");
    showScreen("start");
  }
});

prevBtn.addEventListener("click", () => {
  if (currentIndex > 0) {
    currentIndex -= 1;
    renderQuestion();
  }
});

nextBtn.addEventListener("click", () => {
  // 마지막이면 제출
  if (currentIndex === quizQuestions.length - 1) {
    finishQuiz(false);
    return;
  }
  currentIndex += 1;
  renderQuestion();
});

restartBtn.addEventListener("click", () => {
  showScreen("start");
});

winnerForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const correct = Number(winnerForm.dataset.correct ?? "0");
  const total = Number(winnerForm.dataset.total ?? "0");
  const difficulty = winnerForm.dataset.difficulty ?? "Easy";
  const clearedDifficulty = winnerForm.dataset.cleared ?? "None";

  const entry = {
    timestamp: nowKSTISOString(),
    name: nameInput.value.trim(),
    studentId: studentIdInput.value.trim(),
    department: deptInput.value.trim(),
    phone: phoneInput.value.trim(),
    difficulty,
    score: correct,
    total,
    clearedDifficulty
  };

  if (!entry.name || !entry.studentId || !entry.department || !entry.phone) {
    alert("모든 항목을 입력해주세요.");
    return;
  }

  addWinner(entry);
  alert("저장 완료!");

  // 다음 사람을 위해 폼 비우기
  nameInput.value = "";
  studentIdInput.value = "";
  deptInput.value = "";
  phoneInput.value = "";
});

downloadCsvBtn.addEventListener("click", () => {
  const list = loadWinners();
  const csv = winnersToCSV(list);
  downloadText("quiz_winners.csv", csv, "text/csv;charset=utf-8");
});

downloadJsonBtn.addEventListener("click", () => {
  const list = loadWinners();
  downloadText(
    "quiz_winners.json",
    JSON.stringify(list, null, 2),
    "application/json;charset=utf-8"
  );
});

clearWinnersBtn.addEventListener("click", () => {
  if (confirm("정말 저장된 기록을 초기화할까요?")) {
    localStorage.removeItem(WINNERS_KEY);
    alert("초기화 완료");
  }
});

/* =========================
   Init
========================= */
(async function init() {
  // Settings preload into modal inputs
  timeLimitMinInput.value = String(settings.timeLimitMin);
  minCorrectForFormInput.value = String(settings.minCorrectForForm);

  try {
    allQuestions = await loadQuestions();
  } catch (err) {
    console.error(err);
    alert(
      "questions.json 로드에 실패했습니다. 로컬 서버로 실행 중인지 확인하세요.\n(예: VSCode Live Server)"
    );
  }

  showScreen("start");
})();