const tg = window.Telegram && window.Telegram.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const WEEKDAYS_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const WEEKDAYS_FULL = [
  "Воскресенье",
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота"
];
const MONTHS_GEN = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря"
];

let appData = {
  updated_at: "",
  subjects: [],
  tasks: [],
  schedule: {},
  session: {}
};

function toIsoDate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatShortDate(dateObj) {
  const d = String(dateObj.getDate()).padStart(2, "0");
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  return `${d}.${m}`;
}

const todayObj = new Date();
todayObj.setHours(0, 0, 0, 0);
const todayIso = toIsoDate(todayObj);
let selectedIso = todayIso;

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getLessonsForDate(isoStr) {
  const sched = appData.schedule || {};
  if (Array.isArray(sched[isoStr])) {
    return sched[isoStr];
  }
  return [];
}

function renderCalendarStrip() {
  const strip = document.getElementById("calendar-strip");
  strip.innerHTML = "";

  const sched = appData.schedule || {};
  const dates = Object.keys(sched).filter((iso) => Array.isArray(sched[iso]) && sched[iso].length > 0).sort();

  if (!dates.includes(todayIso)) {
    dates.push(todayIso);
    dates.sort();
  }

  if (dates.length === 0) {
    dates.push(todayIso);
  }

  dates.forEach((iso) => {
    const d = new Date(iso + "T00:00:00");
    const lessons = getLessonsForDate(iso);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day-card";
    btn.dataset.iso = iso;
    if (iso === todayIso) btn.classList.add("today");
    if (iso === selectedIso) btn.classList.add("active");

    btn.innerHTML = `
      <span class="day-weekday">${WEEKDAYS_SHORT[d.getDay()]}</span>
      <span class="day-date">${formatShortDate(d)}</span>
      <span class="day-dot ${lessons.length > 0 ? "" : "hidden"}"></span>
    `;

    btn.addEventListener("click", () => {
      selectedIso = iso;
      document.querySelectorAll(".day-card").forEach((el) => {
        el.classList.toggle("active", el.dataset.iso === selectedIso);
      });
      renderScheduleForSelectedDate();
    });

    strip.appendChild(btn);
  });
}

function scrollToDate(isoStr) {
  const strip = document.getElementById("calendar-strip");
  const target = strip.querySelector(`[data-iso="${isoStr}"]`);
  if (target) {
    const left = target.offsetLeft - strip.clientWidth / 2 + target.clientWidth / 2;
    strip.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }
}

function renderScheduleForSelectedDate() {
  const [y, m, d] = selectedIso.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  const label = document.getElementById("selected-date-label");
  label.textContent = `${WEEKDAYS_FULL[dateObj.getDay()]}, ${d} ${MONTHS_GEN[m - 1]}`;

  const container = document.getElementById("schedule-list");
  const lessons = getLessonsForDate(selectedIso, dateObj);

  if (!lessons.length) {
    container.innerHTML = `<div class="empty">На этот день пар нет</div>`;
    return;
  }

  container.innerHTML = lessons
    .map((item) => {
      const linkHtml = item.teams_url
        ? `<a class="link-btn" href="${escapeHtml(item.teams_url)}" target="_blank" rel="noopener">Открыть Teams</a>`
        : "";
      return `
        <div class="card">
          <div class="card-top">
            <span class="badge">${escapeHtml(item.time || "Время не указано")}</span>
            ${item.type ? `<span class="badge">${escapeHtml(item.type)}</span>` : ""}
          </div>
          <div class="card-title">${escapeHtml(item.subject)}</div>
          <div class="card-meta">
            ${item.teacher ? `<span>Преподаватель: ${escapeHtml(item.teacher)}</span>` : ""}
            ${item.room ? `<span>Аудитория: ${escapeHtml(item.room)}</span>` : ""}
          </div>
          ${linkHtml}
        </div>
      `;
    })
    .join("");
}

function renderTasks() {
  const container = document.getElementById("tasks-list");
  const tasks = Array.isArray(appData.tasks) ? appData.tasks : [];

  if (!tasks.length) {
    container.innerHTML = `<div class="empty">Активных дедлайнов пока нет</div>`;
    return;
  }

  container.innerHTML = tasks
    .map((t) => {
      return `
        <div class="card">
          <div class="card-top">
            <span class="badge">${escapeHtml(t.subject || "Предмет")}</span>
            ${t.deadline ? `<span class="badge">До ${escapeHtml(t.deadline)}</span>` : ""}
          </div>
          <div class="card-title">${escapeHtml(t.title || t.description || "Задание")}</div>
          <div class="card-meta">
            ${t.description && t.title ? `<span>${escapeHtml(t.description)}</span>` : ""}
            ${t.points ? `<span>Макс. балл: ${escapeHtml(t.points)}</span>` : ""}
          </div>
        </div>
      `;
    })
    .join("");
}

function renderSubjects() {
  const container = document.getElementById("subjects-list");
  const subjects = Array.isArray(appData.subjects) ? appData.subjects : [];

  if (!subjects.length) {
    container.innerHTML = `<div class="empty">Список предметов пуст</div>`;
    return;
  }

  container.innerHTML = subjects
    .map((s) => {
      const linkHtml = s.teams_url
        ? `<a class="link-btn" href="${escapeHtml(s.teams_url)}" target="_blank" rel="noopener">Канал Teams</a>`
        : "";
      return `
        <div class="card">
          <div class="card-top">
            <span class="badge">Макс: ${escapeHtml(s.max_points || 100)} б.</span>
          </div>
          <div class="card-title">${escapeHtml(s.name)}</div>
          <div class="card-meta">
            ${s.teacher ? `<span>Преподаватель: ${escapeHtml(s.teacher)}</span>` : ""}
            ${s.contact ? `<span>Контакт: ${escapeHtml(s.contact)}</span>` : ""}
          </div>
          ${linkHtml}
        </div>
      `;
    })
    .join("");
}

function renderSession() {
  const summary = document.getElementById("session-summary");
  const examsContainer = document.getElementById("exams-list");
  const session = appData.session || {};

  summary.innerHTML = `
    <div class="card">
      <div class="card-meta">Зачётная неделя</div>
      <div class="card-title">${escapeHtml(session.credit_week_start || "Не указано")}</div>
    </div>
    <div class="card">
      <div class="card-meta">Экзамены</div>
      <div class="card-title">${escapeHtml(session.exam_session_start || "Не указано")}</div>
    </div>
  `;

  const exams = Array.isArray(session.exams) ? session.exams : [];
  if (!exams.length) {
    examsContainer.innerHTML = `<div class="empty">Расписание экзаменов ещё не добавлено</div>`;
    return;
  }

  examsContainer.innerHTML = exams
    .map((e) => {
      return `
        <div class="card">
          <div class="card-top">
            <span class="badge">${escapeHtml(e.date || "")} ${escapeHtml(e.time || "")}</span>
          </div>
          <div class="card-title">${escapeHtml(e.subject || "")}</div>
          <div class="card-meta">
            ${e.teacher ? `<span>Преподаватель: ${escapeHtml(e.teacher)}</span>` : ""}
            ${e.room ? `<span>Место: ${escapeHtml(e.room)}</span>` : ""}
          </div>
        </div>
      `;
    })
    .join("");
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`panel-${target}`).classList.add("active");
  });
});

document.getElementById("today-btn").addEventListener("click", () => {
  selectedIso = todayIso;
  document.querySelectorAll(".day-card").forEach((el) => {
    el.classList.toggle("active", el.dataset.iso === todayIso);
  });
  renderScheduleForSelectedDate();
  scrollToDate(todayIso);
});

async function init() {
  try {
    const res = await fetch(`./data.json?t=${Date.now()}`);
    if (res.ok) {
      appData = await res.json();
    }
  } catch (err) {
    console.error(err);
  }

  const updatedEl = document.getElementById("updated-at");
  updatedEl.textContent = appData.updated_at
    ? `Обновлено: ${appData.updated_at}`
    : "Актуальное расписание";

  renderCalendarStrip();
  renderScheduleForSelectedDate();
  renderTasks();
  renderSubjects();
  renderSession();
  requestAnimationFrame(() => scrollToDate(todayIso));
}

init();

(function () {
  function enhance(strip) {
    if (!strip || strip.dataset.scrollReady) return;
    strip.dataset.scrollReady = "1";
    strip.style.overflowX = "auto";
    strip.style.scrollBehavior = "smooth";
    strip.style.cursor = "grab";
    strip.style.userSelect = "none";

    strip.addEventListener("wheel", function (e) {
      if (e.deltaY !== 0) {
        e.preventDefault();
        strip.scrollLeft += e.deltaY;
      }
    }, { passive: false });

    let isDown = false;
    let startX = 0;
    let startScroll = 0;
    let dragged = false;

    strip.addEventListener("mousedown", function (e) {
      isDown = true;
      dragged = false;
      startX = e.pageX;
      startScroll = strip.scrollLeft;
      strip.style.cursor = "grabbing";
    });

    window.addEventListener("mouseup", function () {
      isDown = false;
      strip.style.cursor = "grab";
    });

    strip.addEventListener("mousemove", function (e) {
      if (!isDown) return;
      const dx = e.pageX - startX;
      if (Math.abs(dx) > 5) {
        dragged = true;
        e.preventDefault();
        strip.scrollLeft = startScroll - dx;
      }
    });

    strip.addEventListener("click", function (e) {
      if (dragged) {
        e.stopPropagation();
        e.preventDefault();
        dragged = false;
      }
    }, true);

    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;align-items:center;gap:6px;width:100%;";
    strip.parentNode.insertBefore(wrap, strip);

    function makeBtn(txt, step) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = txt;
      b.style.cssText = "flex:0 0 auto;width:28px;height:52px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:inherit;font-size:18px;cursor:pointer;";
      b.addEventListener("click", function () {
        strip.scrollBy({ left: step, behavior: "smooth" });
      });
      return b;
    }

    strip.style.flex = "1 1 auto";
    strip.style.minWidth = "0";
    wrap.appendChild(makeBtn("‹", -260));
    wrap.appendChild(strip);
    wrap.appendChild(makeBtn("›", 260));
  }

  const timer = setInterval(function () {
    const cards = Array.from(document.querySelectorAll("button, div")).filter(function (el) {
      return el.children.length <= 3 && /^(Пн|Вт|Ср|Чт|Пт|Сб|Вс|Нд)\s*\d{2}\.\d{2}$/i.test(el.textContent.trim());
    });
    if (cards.length >= 4 && cards[0].parentElement) {
      enhance(cards[0].parentElement);
      clearInterval(timer);
    }
  }, 200);

  setTimeout(function () {
    clearInterval(timer);
  }, 15000);
})();