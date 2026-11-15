const tg = window.Telegram ? window.Telegram.WebApp : null;
if (tg) {
  tg.ready();
  tg.expand();
}

const STATUSES = ["В работе", "Сделана", "На проверке", "Зачтена"];
const DAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const MONTHS_RU = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

let appData = null;
let userProgress = { statuses: {}, scores: {} };
let selectedSubject = "ALL";
let selectedWeekType = 1;
let autoWeekType = 1;
let selectedDay = 1;

function haptic(type = "light") {
  if (tg && tg.HapticFeedback) {
    tg.HapticFeedback.impactOccurred(type);
  }
}

function showToast(text) {
  const el = document.getElementById("toast");
  el.textContent = text;
  el.classList.add("show");
  setTimeout(() => {
    el.classList.remove("show");
  }, 2200);
}

function loadProgress() {
  return new Promise((resolve) => {
    if (tg && tg.CloudStorage && tg.initData) {
      tg.CloudStorage.getItem("study_progress", (err, val) => {
        if (!err && val) {
          try {
            userProgress = JSON.parse(val);
          } catch (e) {}
        }
        resolve();
      });
    } else {
      const saved = localStorage.getItem("study_progress");
      if (saved) {
        try {
          userProgress = JSON.parse(saved);
        } catch (e) {}
      }
      resolve();
    }
  });
}

function saveProgress() {
  const raw = JSON.stringify(userProgress);
  if (tg && tg.CloudStorage && tg.initData) {
    tg.CloudStorage.setItem("study_progress", raw, () => {});
  } else {
    localStorage.setItem("study_progress", raw);
  }
}

function computeWeekType(semesterStartStr) {
  const start = new Date(semesterStartStr + "T00:00:00");
  const startDay = start.getDay() || 7;
  start.setDate(start.getDate() - startDay + 1);

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const nowDay = now.getDay() || 7;
  now.setDate(now.getDate() - nowDay + 1);

  const diffWeeks = Math.floor((now - start) / (7 * 24 * 60 * 60 * 1000));
  return Math.abs(diffWeeks) % 2 === 0 ? 1 : 2;
}

function formatDateRu(dateStr) {
  if (!dateStr) return "Без срока";
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getDate()} ${MONTHS_RU[d.getMonth()]}`;
}

function getDiffDays(dateStr) {
  if (!dateStr) return 999;
  const target = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (24 * 60 * 60 * 1000));
}

function openExternalLink(url) {
  if (!url) return;
  if (tg && tg.openLink) {
    tg.openLink(url);
  } else {
    window.open(url, "_blank");
  }
}

function renderSubjectFilters() {
  const container = document.getElementById("subject-filters");
  const subjects = ["ALL", ...appData.subjects.map((s) => s.name)];
  container.innerHTML = subjects
    .map((subj) => {
      const label = subj === "ALL" ? "Все предметы" : subj;
      const active = selectedSubject === subj ? "active" : "";
      return `<button class="chip ${active}" data-subj="${subj}">${label}</button>`;
    })
    .join("");

  container.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      haptic("light");
      selectedSubject = btn.dataset.subj;
      renderSubjectFilters();
      renderDeadlines();
    });
  });
}

function renderScores() {
  const container = document.getElementById("scores-container");
  container.innerHTML = appData.subjects
    .map((subj) => {
      const current = userProgress.scores[subj.name] || 0;
      return `
        <div class="score-card">
          <div class="score-subject">${subj.name}</div>
          <div class="score-controls">
            <span class="score-val">${current} / ${subj.max_points}</span>
            <div class="score-btns">
              <button class="mini-btn" data-action="dec" data-subj="${subj.name}">−</button>
              <button class="mini-btn" data-action="inc" data-subj="${subj.name}">+</button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  container.querySelectorAll(".mini-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      haptic("light");
      const name = btn.dataset.subj;
      const subjObj = appData.subjects.find((s) => s.name === name);
      const max = subjObj ? subjObj.max_points : 100;
      let val = userProgress.scores[name] || 0;
      if (btn.dataset.action === "inc" && val < max) val += 1;
      if (btn.dataset.action === "dec" && val > 0) val -= 1;
      userProgress.scores[name] = val;
      saveProgress();
      renderScores();
    });
  });
}

function renderDeadlines() {
  const container = document.getElementById("deadlines-container");
  const filtered = appData.tasks
    .filter((t) => selectedSubject === "ALL" || t.subject === selectedSubject)
    .sort((a, b) => (a.deadline || "9999-12-31").localeCompare(b.deadline || "9999-12-31"));

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state">Заданий по выбранному фильтру пока нет</div>`;
    return;
  }

  const groups = {
    urgent: { title: "Сегодня и завтра", items: [], isUrgent: true },
    week: { title: "На этой неделе", items: [], isUrgent: false },
    later: { title: "Позже", items: [], isUrgent: false }
  };

  filtered.forEach((task) => {
    const diff = getDiffDays(task.deadline);
    if (diff <= 1) {
      groups.urgent.items.push(task);
    } else if (diff <= 7) {
      groups.week.items.push(task);
    } else {
      groups.later.items.push(task);
    }
  });

  container.innerHTML = Object.values(groups)
    .filter((g) => g.items.length > 0)
    .map((group) => {
      const cardsHtml = group.items
        .map((task) => {
          const statusIdx = userProgress.statuses[task.id] || 0;
          const isDone = statusIdx === 3;
          const diff = getDiffDays(task.deadline);
          const overdueClass = diff < 0 && !isDone ? "overdue" : "";
          const dateLabel =
            diff < 0 && !isDone
              ? `Просрочено (${formatDateRu(task.deadline)})`
              : diff === 0
              ? "Сегодня"
              : diff === 1
              ? "Завтра"
              : formatDateRu(task.deadline);

          return `
            <div class="task-card ${isDone ? "done" : ""}">
              <div class="task-top">
                <span class="task-subject">${task.subject}</span>
                <span class="task-date ${overdueClass}">${dateLabel}</span>
              </div>
              <div class="task-title">${task.title}</div>
              ${task.description ? `<div class="task-desc">${task.description}</div>` : ""}
              <div class="task-footer">
                <span class="task-source">${task.source || ""}</span>
                <button class="status-btn status-${statusIdx}" data-id="${task.id}">
                  ${STATUSES[statusIdx]}
                </button>
              </div>
            </div>
          `;
        })
        .join("");

      return `
        <div class="group-block">
          <div class="group-title ${group.isUrgent ? "urgent" : ""}">${group.title}</div>
          ${cardsHtml}
        </div>
      `;
    })
    .join("");

  container.querySelectorAll(".status-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      haptic("medium");
      const id = btn.dataset.id;
      const next = ((userProgress.statuses[id] || 0) + 1) % STATUSES.length;
      userProgress.statuses[id] = next;
      saveProgress();
      renderDeadlines();
    });
  });
}

function copyWeeklySummary() {
  haptic("medium");
  const upcoming = appData.tasks
    .filter((t) => {
      const diff = getDiffDays(t.deadline);
      const statusIdx = userProgress.statuses[t.id] || 0;
      return diff <= 7 && statusIdx !== 3;
    })
    .sort((a, b) => (a.deadline || "9999-12-31").localeCompare(b.deadline || "9999-12-31"));

  if (upcoming.length === 0) {
    showToast("Горящих дедлайнов на неделю нет");
    return;
  }

  const lines = ["Актуальные дедлайны на неделю:", ""];
  upcoming.forEach((t) => {
    lines.push(`• [${formatDateRu(t.deadline)}] ${t.subject}: ${t.title}`);
  });
  const text = lines.join("\n");

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast("Сводка скопирована в буфер"));
  } else {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    document.body.removeChild(area);
    showToast("Сводка скопирована в буфер");
  }
}

function isLessonCurrent(timeRange, dayIdx) {
  const now = new Date();
  const todayIdx = now.getDay() || 7;
  if (todayIdx !== dayIdx || selectedWeekType !== autoWeekType) return false;

  const parts = timeRange.split("-");
  if (parts.length !== 2) return false;

  const [sh, sm] = parts[0].trim().split(":").map(Number);
  const [eh, em] = parts[1].trim().split(":").map(Number);
  const curMins = now.getHours() * 60 + now.getMinutes();
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;

  return curMins >= startMins - 15 && curMins <= endMins;
}

function renderSchedule() {
  document.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.week) === selectedWeekType);
  });

  const daysBar = document.getElementById("day-selector");
  daysBar.innerHTML = DAYS_SHORT.map((name, idx) => {
    const dayNum = idx + 1;
    const active = selectedDay === dayNum ? "active" : "";
    return `<button class="day-btn ${active}" data-day="${dayNum}">${name}</button>`;
  }).join("");

  daysBar.querySelectorAll(".day-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      haptic("light");
      selectedDay = Number(btn.dataset.day);
      renderSchedule();
    });
  });

  const weekKey = selectedWeekType === 1 ? "numerator" : "denominator";
  const lessons = (appData.schedule[weekKey] && appData.schedule[weekKey][String(selectedDay)]) || [];
  const container = document.getElementById("schedule-container");

  if (lessons.length === 0) {
    container.innerHTML = `<div class="empty-state">В этот день пар нет</div>`;
    return;
  }

  container.innerHTML = lessons
    .map((l) => {
      const currentClass = isLessonCurrent(l.time, selectedDay) ? "current" : "";
      const linkBtn = l.teams_url
        ? `<button class="teams-link" data-url="${l.teams_url}">Открыть в Teams</button>`
        : "";
      return `
        <div class="lesson-card ${currentClass}">
          <div class="lesson-header">
            <span class="lesson-time">${l.time}</span>
            <span class="lesson-type">${l.type}</span>
          </div>
          <div class="lesson-name">${l.subject}</div>
          <div class="lesson-meta">
            <span>${l.teacher || ""}</span>
            <span>${l.room || ""}</span>
          </div>
          ${linkBtn}
        </div>
      `;
    })
    .join("");

  container.querySelectorAll(".teams-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      haptic("light");
      openExternalLink(btn.dataset.url);
    });
  });
}

function renderSession() {
  const session = appData.session || {};
  const creditDays = Math.max(0, getDiffDays(session.credit_week_start));
  const examDays = Math.max(0, getDiffDays(session.exam_session_start));

  document.getElementById("countdown-container").innerHTML = `
    <div class="countdown-card">
      <div class="countdown-days">${creditDays} дн.</div>
      <div class="countdown-label">До зачетной недели</div>
      <div class="countdown-date">${formatDateRu(session.credit_week_start)}</div>
    </div>
    <div class="countdown-card">
      <div class="countdown-days">${examDays} дн.</div>
      <div class="countdown-label">До экзаменов</div>
      <div class="countdown-date">${formatDateRu(session.exam_session_start)}</div>
    </div>
  `;

  const exams = session.exams || [];
  document.getElementById("exams-container").innerHTML =
    exams.length === 0
      ? `<div class="empty-state">Расписание сессии еще не опубликовано</div>`
      : exams
          .map(
            (ex) => `
        <div class="lesson-card">
          <div class="lesson-header">
            <span class="lesson-time">${formatDateRu(ex.date)} • ${ex.time}</span>
            <span class="lesson-type">${ex.type}</span>
          </div>
          <div class="lesson-name">${ex.subject}</div>
          <div class="lesson-meta">
            <span>${ex.teacher || ""}</span>
            <span>${ex.room || ""}</span>
          </div>
        </div>
      `
          )
          .join("");

  document.getElementById("teachers-container").innerHTML = appData.subjects
    .map(
      (s) => `
      <div class="lesson-card">
        <div class="lesson-name">${s.name}</div>
        <div class="lesson-meta">
          <span>${s.teacher || "Преподаватель не указан"}</span>
          <span>${s.contact || ""}</span>
        </div>
        ${s.teams_url ? `<button class="teams-link" data-url="${s.teams_url}">Канал в Teams</button>` : ""}
      </div>
    `
    )
    .join("");

  document.querySelectorAll("#teachers-container .teams-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      haptic("light");
      openExternalLink(btn.dataset.url);
    });
  });
}

function setupNavigation() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      haptic("light");
      document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.target).classList.add("active");
    });
  });

  document.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      haptic("light");
      selectedWeekType = Number(btn.dataset.week);
      renderSchedule();
    });
  });

  document.getElementById("copy-summary-btn").addEventListener("click", copyWeeklySummary);
}

async function init() {
  setupNavigation();
  await loadProgress();

  const res = await fetch(`data.json?t=${Date.now()}`);
  appData = await res.json();

  autoWeekType = computeWeekType(appData.semester_start || "2026-09-01");
  selectedWeekType = autoWeekType;

  const todayDay = new Date().getDay();
  selectedDay = todayDay >= 1 && todayDay <= 6 ? todayDay : 1;

  document.getElementById("current-week-badge").textContent =
    autoWeekType === 1 ? "Сейчас: Числитель" : "Сейчас: Знаменатель";
  if (appData.updated_at) {
    document.getElementById("last-updated").textContent = `Обновлено: ${appData.updated_at}`;
  }

  renderSubjectFilters();
  renderScores();
  renderDeadlines();
  renderSchedule();
  renderSession();
}

init();