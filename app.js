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
        topN: clampInt(s.topN, 1, 9999, 10),
      };
    } catch {}
  }
  return { timeLimitMin: 5, topN: 10 };
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

function normalizeAnswerText(s) {
  const t = String(s ?? "");
  const lines = t.replaceAll("\r\n", "\n").replaceAll("\r", "\n").trim().split("\n");
  return lines.join("\n");
}

function nowKSTISOString() {
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
const topNInput = $("topNInput");

const timerPill = $("timerPill");
const timerText = $("timerText");
const difficultyDesc = $("difficultyDesc");
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
const resultElapsed = $("resultElapsed");
const resultDetailList = $("resultDetailList");
const restartBtn = $("restartBtn");

const winnerFormBox = $("winnerFormBox");
const winnerForm = $("winnerForm");
const nameInput = $("nameInput");
const studentIdInput = $("studentIdInput");
const deptInput = $("deptInput");
const phoneInput = $("phoneInput");
const nicknameInput = $("nicknameInput");
const formDifficulty = $("formDifficulty");
const formScore = $("formScore");
const formElapsed = $("formElapsed");

const topNLabelExpert = $("topNLabelExpert");
const topNLabelHard = $("topNLabelHard");
const topNLabelEasy = $("topNLabelEasy");
const sbBodyExpert = $("sbBodyExpert");
const sbBodyHard = $("sbBodyHard");
const sbBodyEasy = $("sbBodyEasy");

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

let userAnswers = [];
let timer = {
  totalSec: settings.timeLimitMin * 60,
  remainSec: settings.timeLimitMin * 60,
  handle: null,
};

let isTransitioning = false;
let lastElapsedSec = 0;

/* =========================
   Feedback (Popup)
========================= */
function setupFeedbackPopup() {
  scoreBadge.classList.remove("badge");
  scoreBadge.classList.add("feedback-popup");
}

function showFeedback(isCorrect, text) {
  scoreBadge.textContent = text;
  scoreBadge.classList.remove("feedback-correct", "feedback-wrong", "show");

  if (isCorrect) scoreBadge.classList.add("feedback-correct");
  else scoreBadge.classList.add("feedback-wrong");

  void scoreBadge.offsetWidth;
  scoreBadge.classList.add("show");

  setTimeout(() => {
    scoreBadge.classList.remove("show");
  }, 1200);
}

function clearFeedback() {
  scoreBadge.textContent = "";
  scoreBadge.classList.remove("feedback-correct", "feedback-wrong", "show");
}

/* =========================
   Screen Navigation
========================= */
function showScreen(which) {
  screenStart.classList.toggle("hidden", which !== "start");
  screenQuiz.classList.toggle("hidden", which !== "quiz");
  screenResult.classList.toggle("hidden", which !== "result");
}

/* =========================
   Settings Modal
========================= */
function openSettings() {
  timeLimitMinInput.value = String(settings.timeLimitMin);
  topNInput.value = String(settings.topN);
  settingsModal.classList.remove("hidden");
}

function closeSettings() {
  settingsModal.classList.add("hidden");
}

openSettingsBtn.addEventListener("click", () => openSettings());
closeSettingsBtn.addEventListener("click", () => closeSettings());
settingsModal.addEventListener("click", (e) => {
  if (e.target === settingsModal) closeSettings();
});

saveSettingsBtn.addEventListener("click", () => {
  const newSettings = {
    timeLimitMin: clampInt(timeLimitMinInput.value, 1, 999, 5),
    topN: clampInt(topNInput.value, 1, 9999, 10),
  };
  settings = newSettings;
  saveSettings(settings);
  closeSettings();
  renderScoreboard();
});

/* =========================
   Timer
========================= */
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
  timerPill.classList.remove("hidden");

  timer.handle = setInterval(() => {
    timer.remainSec -= 1;
    timerText.textContent = mmss(timer.remainSec);

    if (timer.remainSec <= 0) {
      timer.remainSec = 0;
      timerText.textContent = mmss(timer.remainSec);
      stopTimer();
      finishQuiz(true);
    }
  }, 1000);
}

/* =========================
   Difficulty
========================= */
function getSelectedDifficulty() {
  const checked = document.querySelector('input[name="difficulty"]:checked');
  return checked ? checked.value : "Easy";
}

function updateDifficultyDesc() {
  const d = getSelectedDifficulty();
  const map = {
    Easy: "비전공자도 컴퓨터에 관심있다면 풀 수 있습니다",
    Hard: "알고리즘/CS 기초가 있다면 도전해볼 만합니다",
    Expert: "당신이CS의신이라는것을증명하세요",
  };
  if (difficultyDesc) difficultyDesc.textContent = map[d] ?? "";
}

document.querySelectorAll('input[name="difficulty"]').forEach((el) => {
  el.addEventListener("change", updateDifficultyDesc);
});

/* =========================
   Questions
========================= */
async function loadQuestions() {
  try {
    const res = await fetch("questions.json", { cache: "no-store" });
    if (!res.ok) throw new Error("questions.json load failed");
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("questions.json must be an array");
    allQuestions = data;
  } catch (e) {
    console.error(e);
    alert("questions.json을 불러오지 못했습니다. 콘솔을 확인하세요.");
    allQuestions = [];
  }
}

function pickQuestions(difficulty, count) {
  const pool = allQuestions.filter((q) => q.difficulty === difficulty);
  return shuffle(pool).slice(0, count);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderQuestion() {
  const q = quizQuestions[currentIndex];
  if (!q) return;

  difficultyBadge.textContent = quizDifficulty;
  qIndexBadge.textContent = `${currentIndex + 1} / ${quizQuestions.length}`;

  const userAnswer = userAnswers[currentIndex];

  const parts = [];
  parts.push(`<div class="q-prompt">${escapeHtml(q.prompt)}</div>`);

  if (q.code && q.code.lang && q.code.text) {
  parts.push(`
    <div class="code-wrap">
      <pre class="language-${escapeHtml(q.code.lang)}"><code class="language-${escapeHtml(
    q.code.lang
  )}">${escapeHtml(q.code.text)}</code></pre>
    </div>
  `);
}

  if (q.type === "mcq") {
  const choices = Array.isArray(q.choices) ? q.choices : []; // ✅ options -> choices
  const selected = typeof userAnswer === "number" ? userAnswer : -1;

  parts.push(`<div class="choice-list" role="group" aria-label="선택지">`);
  choices.forEach((opt, i) => {
    const label = String.fromCharCode(65 + i);
    const isSelected = selected === i;
    parts.push(`
      <button type="button"
        class="choice-btn ${isSelected ? "selected" : ""}"
        data-choice="${i}">
        ${label}. ${escapeHtml(opt)}
      </button>
    `);
  });
  parts.push(`</div>`);
  } else {
    const v = typeof userAnswer === "string" ? userAnswer : "";
    parts.push(`
  <div class="short-wrap">
    <textarea id="shortAnswerInput" class="input" placeholder="정답을 입력하세요">${escapeHtml(
      v
    )}</textarea>
    <div class="hint small muted">줄바꿈 입력 가능</div>
  </div>
`);
  }

  questionBox.innerHTML = parts.join("\n");
  if (window.Prism) Prism.highlightAll();

  if (q.type === "mcq") {
  questionBox.querySelectorAll(".choice-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.getAttribute("data-choice"));
      userAnswers[currentIndex] = Number.isFinite(i) ? i : null;
      renderQuestion(); // ✅ 선택 표시(selected) 갱신
    });
  });
  } else {
    const ta = $("shortAnswerInput");
    if (ta) {
      ta.addEventListener("input", () => {
        userAnswers[currentIndex] = ta.value;
      });
    }
  }

  nextBtn.textContent = currentIndex === quizQuestions.length - 1 ? "제출" : "다음";
}

/* =========================
   Scoring
========================= */
function computeScore() {
  let correct = 0;
  const total = quizQuestions.length;

  for (let i = 0; i < quizQuestions.length; i++) {
    const q = quizQuestions[i];
    const ans = userAnswers[i];

    if (q.type === "mcq") {
      const selected = typeof ans === "number" ? ans : -1;
      if (selected === Number(q.answer)) correct++;
    } else {
      const input = normalizeAnswerText(ans ?? "");
      const target = normalizeAnswerText(q.answer ?? "");
      if (input === target) correct++;
    }
  }
  return { correct, total };
}

/* =========================
   Result Details
========================= */
function renderResultDetails() {
  if (!resultDetailList) return;
  resultDetailList.innerHTML = "";

  const items = [];
  for (let i = 0; i < quizQuestions.length; i++) {
    const q = quizQuestions[i];
    const ans = userAnswers[i];

    let isCorrect = false;
    let your = "";
    let correctAns = "";

    if (q.type === "mcq") {
      const opts = Array.isArray(q.options) ? q.options : [];
      const selected = typeof ans === "number" ? ans : -1;
      your = selected >= 0 && selected < opts.length ? opts[selected] : "(미선택)";
      const ci = Number(q.answer);
      correctAns = ci >= 0 && ci < opts.length ? opts[ci] : String(q.answer);
      isCorrect = selected === ci;
    } else {
      your = normalizeAnswerText(ans ?? "");
      correctAns = normalizeAnswerText(q.answer ?? "");
      isCorrect = your === correctAns;
      if (!your) your = "(미입력)";
    }

    items.push(`
  <div class="rd-item ${isCorrect ? "ok" : "bad"}">
    <div class="rd-q">
      <div class="rd-idx">${i + 1}</div>
      <div class="rd-prompt">${escapeHtml(q.prompt)}</div>
    </div>
    <div class="rd-flag-only">${isCorrect ? "정답" : "오답"}</div>
  </div>
`);
  }

  resultDetailList.innerHTML = items.join("\n");
}

/* =========================
   Run Reset
========================= */
function resetRunState() {
  stopTimer();
  timerPill.classList.add("hidden");

  quizQuestions = [];
  currentIndex = 0;
  userAnswers = [];

  questionBox.innerHTML = "";
  qIndexBadge.textContent = "- / -";
  clearFeedback();

  prevBtn.classList.add("hidden");

  winnerFormBox.classList.add("hidden");
  if (resultElapsed) resultElapsed.textContent = "-";
  if (resultDetailList) resultDetailList.innerHTML = "";

  winnerForm.dataset.correct = "0";
  winnerForm.dataset.total = "0";
  winnerForm.dataset.difficulty = "";
  winnerForm.dataset.elapsedSec = "0";
  winnerForm.dataset.byTimeout = "false";

  isTransitioning = false;
  lastElapsedSec = 0;
}

/* =========================
   Leaderboard (Top N)
========================= */
function compareLeaderboard(a, b) {
  if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
  if ((a.elapsedSec ?? Infinity) !== (b.elapsedSec ?? Infinity))
    return (a.elapsedSec ?? Infinity) - (b.elapsedSec ?? Infinity);
  return String(a.timestamp ?? "").localeCompare(String(b.timestamp ?? ""));
}

function getDifficultyList(list, difficulty) {
  return list.filter((x) => x.difficulty === difficulty);
}

function getTopNForDifficulty(list, difficulty, topN) {
  return getDifficultyList(list, difficulty).slice().sort(compareLeaderboard).slice(0, topN);
}

function wouldBeInTopN(list, candidate, topN) {
  const merged = list.concat([candidate]);
  const top = getTopNForDifficulty(merged, candidate.difficulty, topN);
  return top.some((x) => x === candidate);
}

function renderScoreboard() {
  const list = loadWinners();
  const n = settings.topN;

  if (topNLabelExpert) topNLabelExpert.textContent = String(n);
  if (topNLabelHard) topNLabelHard.textContent = String(n);
  if (topNLabelEasy) topNLabelEasy.textContent = String(n);

  const renderBody = (tbody, difficulty) => {
    if (!tbody) return;
    const top = getTopNForDifficulty(list, difficulty, n);
    if (top.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="small muted">기록 없음</td></tr>`;
      return;
    }
    tbody.innerHTML = top
      .map((x, i) => {
        const nick = (x.nickname ?? "").trim() || "(익명)";
        return `<tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(nick)}</td>
          <td>${mmss(Number(x.elapsedSec ?? 0))}</td>
          <td style="text-align:right">${Number(x.score ?? 0)}</td>
        </tr>`;
      })
      .join("");
  };

  renderBody(sbBodyExpert, "Expert");
  renderBody(sbBodyHard, "Hard");
  renderBody(sbBodyEasy, "Easy");
}

/* =========================
   Finish & Winners
========================= */
function finishQuiz(byTimeout = false) {
  stopTimer();

  const { correct, total } = computeScore();

  // ✅ 경과시간(초): 제한시간 - 남은시간
  const elapsedSec = Math.max(0, timer.totalSec - timer.remainSec);
  lastElapsedSec = byTimeout ? timer.totalSec : elapsedSec;

  showScreen("result");
  timerPill.classList.add("hidden");

  resultDifficulty.textContent = quizDifficulty;
  resultScore.textContent = `${correct} / ${total}`;
  resultTime.textContent = `${settings.timeLimitMin}분`;
  if (resultElapsed) resultElapsed.textContent = mmss(lastElapsedSec);

  resultSummary.textContent = byTimeout
    ? `시간 종료! ${correct}개 맞았습니다.`
    : `제출 완료! ${correct}개 맞았습니다.`;

  // ✅ topN 조건: "제한시간 안에 제출" AND "현재 기준 상위 N명"
  const baseCandidate = {
    timestamp: nowKSTISOString(),
    difficulty: quizDifficulty,
    score: correct,
    total,
    elapsedSec: lastElapsedSec,
  };

  const list = loadWinners();
  const qualifies = !byTimeout && wouldBeInTopN(list, baseCandidate, settings.topN);

  winnerFormBox.classList.toggle("hidden", !qualifies);

  if (formDifficulty) formDifficulty.textContent = quizDifficulty;
  if (formScore) formScore.textContent = `${correct} / ${total}`;
  if (formElapsed) formElapsed.textContent = mmss(lastElapsedSec);

  renderResultDetails();

  winnerForm.dataset.correct = String(correct);
  winnerForm.dataset.total = String(total);
  winnerForm.dataset.difficulty = quizDifficulty;
  winnerForm.dataset.elapsedSec = String(lastElapsedSec);
  winnerForm.dataset.byTimeout = byTimeout ? "true" : "false";

  renderScoreboard();
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
    "nickname",
    "name",
    "studentId",
    "department",
    "phone",
    "difficulty",
    "score",
    "total",
    "elapsedSec",
  ];

  const lines = [];
  lines.push(header.join(","));

  for (const w of list) {
    const row = [
      w.timestamp,
      w.nickname,
      w.name,
      w.studentId,
      w.department,
      w.phone,
      w.difficulty,
      String(w.score),
      String(w.total),
      String(w.elapsedSec ?? ""),
    ].map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`);
    lines.push(row.join(","));
  }

  return lines.join("\n");
}

/* =========================
   Events
========================= */
startBtn.addEventListener("click", () => {
  resetRunState();

  quizDifficulty = getSelectedDifficulty();
  const desiredCount = clampInt(questionCountInput.value, 1, 9999, 15);

  const picked = pickQuestions(quizDifficulty, desiredCount);
  if (picked.length === 0) {
    alert("해당 난이도 문제풀이용 문제가 없습니다. questions.json을 확인하세요.");
    return;
  }

  quizQuestions = shuffle(picked);
  currentIndex = 0;
  userAnswers = Array(quizQuestions.length).fill(null);

  resetTimer();
  startTimer();
  showScreen("quiz");

  // 퀴즈 화면에서 "이전"은 항상 숨김
  prevBtn.classList.add("hidden");

  renderQuestion();
});

quitBtn.addEventListener("click", () => {
  if (confirm("정말 종료할까요? (현재 진행상황은 저장되지 않습니다)")) {
    resetRunState();
    showScreen("start");
  }
});

// prevBtn 이벤트는 남겨둬도 되지만, 버튼이 안 보이므로 실사용 불가.
prevBtn.addEventListener("click", () => {});

nextBtn.addEventListener("click", () => {
  if (currentIndex === quizQuestions.length - 1) {
    finishQuiz(false);
    return;
  }
  currentIndex += 1;
  renderQuestion();
});

restartBtn.addEventListener("click", () => {
  resetRunState();
  showScreen("start");
});

winnerForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const correct = Number(winnerForm.dataset.correct ?? "0");
  const total = Number(winnerForm.dataset.total ?? "0");
  const difficulty = winnerForm.dataset.difficulty ?? "Easy";
  const elapsedSec = Number(winnerForm.dataset.elapsedSec ?? "0");
  const byTimeout = winnerForm.dataset.byTimeout === "true";

  if (byTimeout) {
    alert("시간 종료 제출은 기록 대상이 아닙니다.");
    return;
  }

  const entry = {
    timestamp: nowKSTISOString(),
    nickname: nicknameInput.value.trim(),
    name: nameInput.value.trim(),
    studentId: studentIdInput.value.trim(),
    department: deptInput.value.trim(),
    phone: phoneInput.value.trim(),
    difficulty,
    score: correct,
    total,
    elapsedSec,
  };

  if (!entry.nickname || !entry.name || !entry.studentId || !entry.department || !entry.phone) {
    alert("모든 항목을 입력해주세요.");
    return;
  }

  // ✅ 저장 직전에도 "여전히 Top N인지" 재검증
  const list = loadWinners();
  const candidateForCheck = {
    timestamp: entry.timestamp,
    difficulty: entry.difficulty,
    score: entry.score,
    total: entry.total,
    elapsedSec: entry.elapsedSec,
  };
  const stillQualifies = wouldBeInTopN(list, candidateForCheck, settings.topN);

  if (!stillQualifies) {
    alert("아쉽지만 현재 기준 Top N 밖으로 밀렸습니다. (저장되지 않음)");
    winnerFormBox.classList.add("hidden");
    renderScoreboard();
    return;
  }

  addWinner(entry);
  alert("저장 완료!");

  nicknameInput.value = "";
  nameInput.value = "";
  studentIdInput.value = "";
  deptInput.value = "";
  phoneInput.value = "";

  renderScoreboard();
});

downloadCsvBtn.addEventListener("click", () => {
  const list = loadWinners();
  const csv = winnersToCSV(list);
  downloadText("winners.csv", csv, "text/csv");
});

downloadJsonBtn.addEventListener("click", () => {
  const list = loadWinners();
  downloadText("winners.json", JSON.stringify(list, null, 2), "application/json");
});

clearWinnersBtn.addEventListener("click", () => {
  if (confirm("정말 저장된 기록을 초기화할까요?")) {
    localStorage.removeItem(WINNERS_KEY);
    alert("초기화 완료");
    renderScoreboard();
  }
});

/* =========================
   Init
========================= */
(async function init() {
  timeLimitMinInput.value = String(settings.timeLimitMin);
  topNInput.value = String(settings.topN);

  renderScoreboard();

  updateDifficultyDesc();
  setupFeedbackPopup();
  showScreen("start");

  await loadQuestions();
})();