import {
  createSchedule,
  isValidSchedule,
  isPastDate,
  isToday,
  normalizeTime,
  sortSchedules,
  buildDateTime,
  getNotifyTime,
  buildMonthCalendar
} from "./logic.js";

// ==============================
// 상태
// ==============================

let showAllList = false;
let schedules = [];
let editingId = null;

let currentFilter = "all";
let searchQuery = "";

// 🔔 알림 타이머 관리(중복 방지)
const notifyTimers = new Map();

// 📅 달력 상태
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();

// 📅 달력 선택 날짜 (선택 시 today 영역에 그 날짜 일정 표시)
let selectedDate = null;

// ==============================
// DOM
// ==============================

const todayList = document.getElementById("today-list");
const allList = document.getElementById("all-list");

let emptyToday;
let emptyAll;



const form = document.getElementById("schedule-form");
const titleInput = document.getElementById("title-input");
const dateInput = document.getElementById("date-input");
const timeInput = document.getElementById("time-input");
const notifyInput = document.getElementById("notify-input");

const addButton = document.getElementById("add-btn");
const cancelButton = document.getElementById("cancel-btn");

const toggleAllBtn = document.getElementById("toggle-all-btn");
const filterBar = document.getElementById("filter-bar");
const searchInput = document.getElementById("search-input");

// 📅 달력 DOM
const calTitle = document.getElementById("cal-title");
const calGrid = document.getElementById("calendar-grid");
const calPrev = document.getElementById("cal-prev");
const calNext = document.getElementById("cal-next");

// ✅ "오늘의 일정" 제목 DOM (cal-title 제외한 section h2 중 첫 번째)
const todaySectionTitle = document.querySelector('section > h2:not(#cal-title)');



if (toggleAllBtn) {
  toggleAllBtn.addEventListener("click", () => {
    showAllList = !showAllList;
    toggleAllBtn.textContent = showAllList ? "−" : "+";
    render();
  });
}


// ==============================
// 저장 / 복원
// ==============================

function saveSchedules() {
  localStorage.setItem("schedules", JSON.stringify(schedules));
}

function loadSchedules() {
  const saved = localStorage.getItem("schedules");
  const raw = saved ? JSON.parse(saved) : [];

  schedules = raw
    .filter((s) => s && s.id && s.title && s.date)
    .map((s) => ({
      ...s,
      time: s.time ? normalizeTime(s.time) : "",
      datetime: s.datetime ?? buildDateTime(s.date, normalizeTime(s.time)),
      notifyBefore: typeof s.notifyBefore === "number" ? s.notifyBefore : null,
      completed: Boolean(s.completed),
      createdAt: s.createdAt ?? new Date().toISOString()
    }));
}

function saveFilter() {
  localStorage.setItem("currentFilter", currentFilter);
}
function loadFilter() {
  const v = localStorage.getItem("currentFilter");
  if (v) currentFilter = v;
}

function saveSearch() {
  localStorage.setItem("searchQuery", searchQuery);
}
function loadSearch() {
  const v = localStorage.getItem("searchQuery");
  if (v !== null) searchQuery = v;
}

// ==============================
// 상태 판별
// ==============================

function isEditing() {
  return editingId !== null;
}

// ==============================
// UI 헬퍼
// ==============================

function getTodayStr() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}



function clear(el) {
  el.innerHTML = "";
}

function makeLabel(s) {
  return s.time ? `${s.time} · ${s.title}` : `종일 · ${s.title}`;
}

function syncFilterUI() {
  if (!filterBar) return;
  [...filterBar.children].forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === currentFilter);
  });
}

// ==============================
// 시간 입력 UX
// ==============================

function updateTimeInputState() {
  if (!dateInput.value) {
    timeInput.disabled = true;
    timeInput.value = "";
  } else {
    timeInput.disabled = false;
  }
}

// ==============================
// 🔔 알림
// ==============================

async function ensureNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const res = await Notification.requestPermission();
  return res === "granted";
}

function clearAllNotifyTimers() {
  notifyTimers.forEach((id) => clearTimeout(id));
  notifyTimers.clear();
}

async function fireNotification(schedule) {
  const ok = await ensureNotificationPermission();
  if (!ok) return;

  if ("serviceWorker" in navigator) {
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    if (reg) {
      reg.showNotification("일정 알림", {
        body: schedule.title,
        tag: String(schedule.id)
      });
      return;
    }
  }

  new Notification("일정 알림", {
    body: schedule.title,
    tag: String(schedule.id)
  });
}

function scheduleNotifications() {
  clearAllNotifyTimers();

  const now = Date.now();

  schedules.forEach((s) => {
    if (s.notifyBefore == null) return;
    const notifyTime = getNotifyTime(s.datetime, s.notifyBefore);
    if (!notifyTime) return;

    const delay = notifyTime.getTime() - now;
    if (delay <= 0) return;

    const t = setTimeout(() => fireNotification(s), delay);
    notifyTimers.set(s.id, t);
  });
}

// ==============================
// 📅 달력 렌더
// ==============================

function renderCalendar() {
  calTitle.textContent = `${currentYear}년 ${currentMonth + 1}월`;

  // 기존 날짜칸 제거 (요일 제외)
  calGrid.querySelectorAll(".cal-cell").forEach((c) => c.remove());

  const cells = buildMonthCalendar(currentYear, currentMonth);

  const today = getTodayStr();
  const highlightDate = selectedDate ?? today;

  cells.forEach(({ date, day }) => {
    const div = document.createElement("div");

    if (!date) {
      div.className = "cal-cell empty";
    } else {
      div.className = "cal-cell";
      div.textContent = day;

      // ✅ 오늘/선택 날짜 강조 (배경 빨강은 당신 기본 전제)
      if (date === highlightDate) {
        div.style.background = "red";
        div.style.color = "#fff";
        div.style.fontWeight = "600";
      }

      // 일정 개수 표시(기존 유지)
      const count = schedules.filter((s) => s.date === date).length;
      if (count > 0) {
        const dot = document.createElement("div");
        dot.style.fontSize = "10px";
        dot.style.color = "#555";
        dot.textContent = `${count}개`;
        div.appendChild(dot);
      }

      // ✅ 달력 클릭: 폼 열지 않음 / 수정 모드 잠금
      div.addEventListener("click", () => {
        if (isEditing()) return;

        const today = getTodayStr();


        if (date === today) {
          selectedDate = null;
        } else {
          selectedDate = date;
        }

        // ✅ 달력 클릭 시: 오늘 영역(todayList)에 해당 날짜 일정 표시 + 제목 변경
        render();
      });
    }

    calGrid.appendChild(div);
  });
}

calPrev.addEventListener("click", () => {
  currentMonth--;
  if (currentMonth < 0) {
    currentMonth = 11;
    currentYear--;
  }
  renderCalendar();
});

calNext.addEventListener("click", () => {
  currentMonth++;
  if (currentMonth > 11) {
    currentMonth = 0;
    currentYear++;
  }
  renderCalendar();
});

// ==============================
// 리스트 렌더
// ==============================

function render() {

  if (emptyAll) emptyAll.style.display = "none";
  if (emptyToday) emptyToday.style.display = "none";

  syncFilterUI();
  if (filterBar) {
  filterBar.style.display = showAllList ? "flex" : "none";
  }

  if (searchInput) {
  searchInput.style.display = showAllList ? "block" : "none";
  }

  clear(todayList);
  clear(allList);

  const sorted = sortSchedules(schedules);

  // ------------------------------
  // 1) 오늘 영역(todayList): 선택 날짜 있으면 그 날짜 일정, 없으면 오늘 일정
  // ------------------------------
  const targetDate = selectedDate ?? getTodayStr();

  if (todaySectionTitle) {
    // 선택 날짜면 제목 바꾸기, 아니면 "오늘의 일정"
    todaySectionTitle.textContent = selectedDate ? `${selectedDate} 일정` : "오늘의 일정";
  }

  const daySchedules = sorted.filter((s) => s.date === targetDate);

  if (daySchedules.length === 0) {
  if (emptyToday) emptyToday.style.display = "block";
  } else {
  if (emptyToday) emptyToday.style.display = "none";
  daySchedules.forEach((s) => todayList.appendChild(createItem(s, true)));
  }


  // ------------------------------
  // 2) 전체 일정(allList): 기존 필터/검색 그대로 유지
  // ------------------------------
  let filtered = sorted;

  if (currentFilter === "active") {
    filtered = filtered.filter((s) => !s.completed);
  } else if (currentFilter === "completed") {
    filtered = filtered.filter((s) => s.completed);
  }

  if (searchQuery.trim() !== "") {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter((s) => s.title.toLowerCase().includes(q));
  }
  if (showAllList) {
  if (filtered.length === 0) {
    if (emptyAll) emptyAll.style.display = "block";
  } else {
    if (emptyAll) emptyAll.style.display = "none";
    filtered.forEach((s) => allList.appendChild(createItem(s)));
  }
  } else {
  if (emptyAll) emptyAll.style.display = "none";
  }

  // 🔔 알림/달력은 항상 실행
  scheduleNotifications();
  renderCalendar();
  }



// ==============================
// 일정 아이템
// ==============================

function createItem(schedule, isTodayView = false) {
  const li = document.createElement("li");

  if (isPastDate(schedule.date)) {
    li.classList.add("past");
  }

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = schedule.completed;

  // ✅ 기존 정책 유지: today 영역에서는 체크 잠금
  

  checkbox.addEventListener("change", () => toggleComplete(schedule.id));

  const text = document.createElement("span");
  text.textContent = makeLabel(schedule);

  if (schedule.completed) {
    text.style.textDecoration = "line-through";
    text.style.color = "#999";
  }

  li.appendChild(checkbox);
  li.appendChild(text);

  
  // ✅ 항상 수정 / 삭제 가능
  const editBtn = document.createElement("button");
  editBtn.textContent = "수정";
  editBtn.onclick = () => startEdit(schedule);

  const deleteBtn = document.createElement("button");
  deleteBtn.textContent = "삭제";
  deleteBtn.onclick = () => removeSchedule(schedule.id);

  li.appendChild(editBtn);
  li.appendChild(deleteBtn);


  return li;
}

// ==============================
// CRUD
// ==============================

form.addEventListener("submit", (e) => {
  e.preventDefault();

  const title = titleInput.value.trim();
  const date = dateInput.value;
  const time = normalizeTime(timeInput.value);
  const notifyBefore = notifyInput.value ? Number(notifyInput.value) : null;

  if (!isValidSchedule({ title, date })) {
    alert("제목과 날짜를 입력하세요.");
    return;
  }

  if (isPastDate(date)) {
    alert("과거 날짜는 등록할 수 없습니다.");
    return;
  }

  if (editingId) {
    const target = schedules.find((s) => s.id === editingId);
    if (!target) return;

    target.title = title;
    target.date = date;
    target.time = time;
    target.datetime = buildDateTime(date, time);
    target.notifyBefore = notifyBefore;
  } else {
    schedules.push({
      ...createSchedule({ title, date, time }),
      notifyBefore
    });
  }

  // ✅ 작업 완료 시 선택 날짜 초기화(오늘로 복귀)
  selectedDate = null;

  saveSchedules();
  resetForm();
  render();
});

function toggleComplete(id) {
  schedules = schedules.map((s) =>
    s.id === id ? { ...s, completed: !s.completed } : s
  );

  

  saveSchedules();
  render();
}

function removeSchedule(id) {
  schedules = schedules.filter((s) => s.id !== id);

  

  saveSchedules();
  render();
}

// ==============================
// 수정 모드
// ==============================

function startEdit(schedule) {
  editingId = schedule.id;

  titleInput.value = schedule.title;
  dateInput.value = schedule.date;
  timeInput.value = schedule.time || "";
  notifyInput.value = schedule.notifyBefore ?? "";

  addButton.textContent = "수정 중";
  form.style.display = "block";

  updateTimeInputState();
  titleInput.focus();
}

function resetForm() {
  editingId = null;
  form.reset();
  timeInput.value = "";
  notifyInput.value = "";

  addButton.textContent = "+ 일정 추가";
  form.style.display = "none";

  
  

  updateTimeInputState();
}

cancelButton.addEventListener("click", resetForm);

addButton.addEventListener("click", () => {
  
  form.style.display = "block";
  updateTimeInputState();
  titleInput.focus();
});

// ==============================
// 필터 / 검색 (수정 중 잠금)
// ==============================

if (filterBar) {
  filterBar.addEventListener("click", (e) => {
    if (isEditing()) return;

    const filter = e.target.dataset.filter;
    if (!filter) return;

    currentFilter = filter;
    saveFilter();
    render();
  });
}

if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    if (isEditing()) return;

    searchQuery = e.target.value;
    saveSearch();
    render();
  });
}

// ==============================
// 입력 이벤트
// ==============================

if (dateInput) {
  dateInput.addEventListener("input", updateTimeInputState);
  dateInput.addEventListener("change", updateTimeInputState);
}

// ==============================
// 시작
// ==============================

(async function init() {
  
  emptyToday = document.getElementById("empty-today");
  emptyAll = document.getElementById("empty-all");

  loadSchedules();
  loadFilter();
  loadSearch();

  if (searchInput) searchInput.value = searchQuery;

  updateTimeInputState();
  await ensureNotificationPermission();

  render();
})();

// ==============================
// 🕛 날짜 변경(자정) 자동 갱신
// - 새로고침 없이 "오늘" 관련 UI/달력 강조가 바뀌도록 함
// ==============================

let lastDayKey = getTodayStr();

setInterval(() => {
  const nowKey = getTodayStr();

  // 날짜가 바뀌었을 때만 처리
  if (nowKey !== lastDayKey) {
    lastDayKey = nowKey;

    // 어제 날짜를 보고 있었다면 오늘로 복귀
    if (selectedDate && selectedDate < nowKey) {
      selectedDate = null;
    }

    render();
  }
}, 30 * 1000); // 30초마다 체크


calTitle.addEventListener("click", () => {
  const input = prompt("이동할 연-월 입력 (예: 2026-03)");
  if (!input) return;

  const [y, m] = input.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) {
    alert("형식이 올바르지 않습니다.");
    return;
  }

  currentYear = y;
  currentMonth = m - 1;
  renderCalendar();
});


