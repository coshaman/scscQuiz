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
        minCorrectForForm: clampInt(s.minCorrectForForm, 0, 9999, 10),
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
function normalizeMultilineText(s) {
  const raw = String(s ?? "").replace(/\r\n?/g, "\n");

  // 전체 trim 후 줄 단위로 공백 정리(줄바꿈은 유지)
  const lines = raw
    .trim()
    .split("\n")
    .map((line) => line.trim().replace(/[ \t]+/g, " ").toLowerCase());

  // 맨 끝/처음 빈 줄은 제거되도록 위에서 trim 처리됨
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
const minCorrectForFormInput = $("minCorrectForFormInput");

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
const scoreBadge = $("scoreBadge"); // 이제 점수 배지가 아니라 "정답/오답 팝업"으로 사용

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

let userAnswers = [];
let timer = {
  totalSec: settings.timeLimitMin * 60,
  remainSec: settings.timeLimitMin * 60,
  handle: null,
};

let isTransitioning = false;

/* =========================
   Feedback (Popup)
========================= */
function setupFeedbackPopup() {
  // HTML에 이미 badge 클래스로 들어가 있으니, 배지 느낌 제거하고 팝업 클래스로 교체
  scoreBadge.classList.remove("badge");
  scoreBadge.classList.add("feedback-pop", "hidden");
  scoreBadge.textContent = "";
}

function clearFeedback() {
  scoreBadge.classList.remove("correct", "wrong", "show");
  scoreBadge.classList.add("hidden");
  scoreBadge.textContent = "";
}

function showFeedback(isCorrectAnswer) {
  scoreBadge.classList.remove("hidden");
  scoreBadge.classList.toggle("correct", !!isCorrectAnswer);
  scoreBadge.classList.toggle("wrong", !isCorrectAnswer);
  scoreBadge.textContent = isCorrectAnswer ? "정답입니다" : "오답입니다";

  // 애니메이션 트리거
  scoreBadge.classList.remove("show");
  void scoreBadge.offsetWidth;
  scoreBadge.classList.add("show");
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

  // 퀴즈 화면에서 "이전"은 항상 숨김
  prevBtn.classList.add("hidden");

  winnerFormBox.classList.add("hidden");
  resultClear.textContent = "-";

  winnerForm.dataset.correct = "0";
  winnerForm.dataset.total = "0";
  winnerForm.dataset.difficulty = "";
  winnerForm.dataset.cleared = "false";

  isTransitioning = false;
}

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
const DIFFICULTY_DESC = {
  Easy: "비전공자도 컴퓨터에 관심이 있다면 풀 수 있습니다!",
  Hard: "컴퓨터 관련 학부 저학년이나 컴퓨터에 관심이 많다면 풀 수 있는 난이도입니다.",
  Expert: "컴퓨터공학부 고학년 수준의 문제입니다. 여러분이 똑똑하다면 풀 수 있을지도 모릅니다.",
};

function updateDifficultyDesc() {
  if (!difficultyDesc) return;
  const d = getSelectedDifficulty();
  difficultyDesc.textContent = DIFFICULTY_DESC[d] ?? "";
}

// 시작 화면 난이도 라디오 변경 시 즉시 갱신
document.querySelectorAll('input[name="difficulty"]').forEach((el) => {
  el.addEventListener("change", updateDifficultyDesc);
});
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

  // 문제 바뀔 때마다 피드백 팝업은 지움
  clearFeedback();

  // 퀴즈 화면에서 "이전"은 항상 숨김
  prevBtn.classList.add("hidden");

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
    <textarea id="shortAnswerInput" class="input" placeholder="정답을 입력하세요" rows="4">${escapeHtml(
      answer ?? ""
    )}</textarea>
    <div class="small muted" style="margin-top:8px;">대소문자/공백은 자동으로 어느 정도 정규화해서 채점합니다.</div>
  </div>
`;
  }

  questionBox.innerHTML = `${meta}${prompt}${codeBlock}${body}`;

  if (window.Prism?.highlightAllUnder) {
    window.Prism.highlightAllUnder(questionBox);
  } else if (window.Prism?.highlightAll) {
    window.Prism.highlightAll();
  }

  if (q.type === "mcq") {
    questionBox.querySelectorAll(".choice-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-choice"));
        userAnswers[currentIndex] = idx;
        // 선택만으로 채점/피드백은 안 함
        renderQuestion();
      });
    });
  } else {
    const input = $("shortAnswerInput");
    input?.addEventListener("input", (e) => {
      userAnswers[currentIndex] = e.target.value;
    });
  }

  nextBtn.textContent =
    currentIndex === quizQuestions.length - 1 ? "제출" : "다음";
}

/* =========================
   Scoring
========================= */
function isCorrect(q, userAnswer) {
  if (!q) return false;

  if (q.type === "mcq") {
    if (userAnswer === null || userAnswer === undefined) return false;
    const ua = Number(userAnswer);
    if (!Number.isFinite(ua)) return false;
    return ua === Number(q.answer);
  }

  if (userAnswer === null || userAnswer === undefined) return false;
  if (String(userAnswer).trim() === "") return false;

  const ua = normalizeMultilineText(userAnswer);
  const ans = q.answer;

  if (Array.isArray(ans)) {
    return ans.some((a) => normalizeMultilineText(a) === ua);
  }
  return normalizeMultilineText(ans) === ua;
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

  showScreen("result");
  timerPill.classList.add("hidden");

  resultDifficulty.textContent = quizDifficulty;
  resultScore.textContent = `${correct} / ${total}`;
  resultTime.textContent = `${settings.timeLimitMin}분`;
  resultClear.textContent = passed ? "클리어" : "미클리어";

  resultSummary.textContent = byTimeout
    ? `시간 종료! ${correct}개 맞았습니다.`
    : `제출 완료! ${correct}개 맞았습니다.`;

  winnerFormBox.classList.toggle("hidden", !passed);

  winnerForm.dataset.correct = String(correct);
  winnerForm.dataset.total = String(total);
  winnerForm.dataset.difficulty = quizDifficulty;
  winnerForm.dataset.cleared = passed ? "true" : "false";
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
    "cleared",
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
      String(w.cleared ?? ""),
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
    minCorrectForForm: clampInt(minCorrectForFormInput.value, 0, 9999, 10),
  };
  settings = newSettings;
  saveSettings(settings);
  closeSettings();
});

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
// (안전하게 noop 처리)
prevBtn.addEventListener("click", () => {});

nextBtn.addEventListener("click", () => {
  if (isTransitioning) return;

  const q = quizQuestions[currentIndex];
  const a = userAnswers[currentIndex];

  // '다음' 누르는 순간에만 채점 + 팝업 표시
  const ok = isCorrect(q, a);
  showFeedback(ok);

  isTransitioning = true;
  nextBtn.disabled = true;

  setTimeout(() => {
    clearFeedback();
    isTransitioning = false;
    nextBtn.disabled = false;

    if (currentIndex === quizQuestions.length - 1) {
      finishQuiz(false);
      return;
    }
    currentIndex += 1;
    renderQuestion();
  }, 600);
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
  const cleared = winnerForm.dataset.cleared === "true";

  const entry = {
    timestamp: nowKSTISOString(),
    name: nameInput.value.trim(),
    studentId: studentIdInput.value.trim(),
    department: deptInput.value.trim(),
    phone: phoneInput.value.trim(),
    difficulty,
    score: correct,
    total,
    cleared,
  };

  if (!entry.name || !entry.studentId || !entry.department || !entry.phone) {
    alert("모든 항목을 입력해주세요.");
    return;
  }

  addWinner(entry);
  alert("저장 완료!");

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
  timeLimitMinInput.value = String(settings.timeLimitMin);
  minCorrectForFormInput.value = String(settings.minCorrectForForm);

  setupFeedbackPopup();

  try {
    allQuestions = await loadQuestions();
  } catch (err) {
    console.error(err);
    alert(
      "questions.json 로드에 실패했습니다. 로컬 서버로 실행 중인지 확인하세요.\n(예: VSCode Live Server)"
    );
  }
  updateDifficultyDesc();
  resetRunState();
  showScreen("start");
  updateDifficultyDesc();
})();