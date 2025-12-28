// ==============================
// 일정 생성
// ==============================

export function createSchedule({ title, date, time }) {
  const normalizedTime = normalizeTime(time);
  const datetime = buildDateTime(date, normalizedTime);

  return {
    id: Date.now(),
    title,
    date,                 // 표시용
    time: normalizedTime, // 표시용
    datetime,             // 계산용 (핵심)
    completed: false,
    createdAt: new Date().toISOString()
  };
}

// ==============================
// 유효성 검사
// ==============================

export function isValidSchedule({ title, date }) {
  return Boolean(title && date);
}

// ==============================
// 시간 처리
// ==============================

export function normalizeTime(time) {
  if (!time) return "";
  return time.length >= 5 ? time.slice(0, 5) : time;
}

export function buildDateTime(date, time) {
  // 종일 일정은 00:00 기준
  return time ? `${date}T${time}` : `${date}T00:00`;
}

// ==============================
// 날짜 판별
// ==============================

export function isPastDate(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(date) < today;
}

export function isToday(date) {
  const today = new Date().toISOString().slice(0, 10);
  return date === today;
}

// ==============================
// 정렬
// ==============================

export function sortSchedules(schedules) {
  return [...schedules].sort((a, b) => {
    const aTime = new Date(a.datetime).getTime();
    const bTime = new Date(b.datetime).getTime();

    if (!isNaN(aTime) && !isNaN(bTime) && aTime !== bTime) {
      return aTime - bTime;
    }

    const aCreated = new Date(a.createdAt).getTime();
    const bCreated = new Date(b.createdAt).getTime();
    return aCreated - bCreated;
  });
}

// ==============================
// 🔔 알림 계산 (새 단계 핵심)
// ==============================

/**
 * 기준 시각에서 N분 전 알림 시각 계산
 * @param {string} datetime - "YYYY-MM-DDTHH:mm"
 * @param {number} minutesBefore - 예: 10 → 10분 전
 * @returns {Date|null}
 */
export function getNotifyTime(datetime, minutesBefore) {
  if (!datetime || minutesBefore == null) return null;

  const base = new Date(datetime);
  if (isNaN(base.getTime())) return null;

  return new Date(base.getTime() - minutesBefore * 60 * 1000);
}

/**
 * 지금 기준으로 알림 시각이 지났는지 판별
 * @param {Date} notifyTime
 * @returns {boolean}
 */
export function isNotifyExpired(notifyTime) {
  if (!(notifyTime instanceof Date)) return true;
  return notifyTime.getTime() <= Date.now();
}


// ==============================
// 📅 달력 계산
// ==============================

/**
 * 특정 연/월의 달력 데이터 생성
 * @param {number} year
 * @param {number} month - 0~11
 * @returns {Array<{ date: string|null, day: number|null }>}
 */
export function buildMonthCalendar(year, month) {
  const result = [];

  const firstDay = new Date(year, month, 1);
  const startDay = firstDay.getDay(); // 0(Sun) ~ 6(Sat)

  const lastDate = new Date(year, month + 1, 0).getDate();

  // 앞쪽 빈칸
  for (let i = 0; i < startDay; i++) {
    result.push({ date: null, day: null });
  }

  // 실제 날짜
  for (let d = 1; d <= lastDate; d++) {
    const yyyy = year;
    const mm = String(month + 1).padStart(2, "0");
   const dd = String(d).padStart(2, "0");

    const dateStr = `${yyyy}-${mm}-${dd}`;

    result.push({
      date: dateStr,
      day: d
    });
  }

  return result;
}
