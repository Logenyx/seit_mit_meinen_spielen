// =====================================================================
// 1. СПИСОК ИГР
// Как добавить игру:
//   1) Создай папку games/имя_игры/ и положи туда игру (главный файл — index.html)
//   2) Скопируй один блок { ... } ниже вместе с запятой после него
//   3) Вставь его перед строкой "];" и поменяй данные
// Порядок блоков = порядок карточек в меню.
//   emoji  — значок на карточке
//   color  — цвет карточки
//   image  — путь к картинке-обложке (если пусто — будет emoji и цвет)
//   link   — путь к файлу игры
// =====================================================================
const games = [
  {
    emoji: "🖱️",
    color: "#f5a623",
    image: "",
    link: "games/clicker/cliker.html",
    title: { en: "Clicker", de: "Klicker", ru: "Кликер" },
    description: {
      en: "Click, earn points and buy upgrades and new designs in the shop!",
      de: "Klicke, sammle Punkte und kaufe Upgrades und neue Designs im Shop!",
      ru: "Кликай, собирай очки и покупай улучшения и новые дизайны в магазине!",
    },
  },
  {
    emoji: "🐍",
    color: "#4caf50",
    image: "",
    link: "games/snake/snake.html",
    title: { en: "Snake", de: "Schlange", ru: "Змейка" },
    description: {
      en: "Eat apples, grow longer and don't bite your own tail.",
      de: "Friss Äpfel, werde länger und beiß dir nicht in den Schwanz.",
      ru: "Ешь яблоки, становись длиннее и не укуси свой хвост.",
    },
  },
];

// =====================================================================
// 2. ТЕКСТЫ ИНТЕРФЕЙСА НА РАЗНЫХ ЯЗЫКАХ
// =====================================================================
const texts = {
  en: { siteTitle: "My Games",     play: "▶ Play",    hint: "← → / A D select · Enter / Space play" },
  de: { siteTitle: "Meine Spiele", play: "▶ Spielen", hint: "← → / A D auswählen · Enter / Leertaste spielen" },
  ru: { siteTitle: "Мои игры",     play: "▶ Играть",  hint: "← → / A D выбрать · Enter / Пробел играть" },
};

// Сохранение настроек в браузере (может не работать — тогда просто не запомнит)
function loadSetting(name, defaultValue) {
  try {
    return localStorage.getItem(name) || defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

function saveSetting(name, value) {
  try {
    localStorage.setItem(name, value);
  } catch (e) {}
}

// =====================================================================
// 3. ЛОГИКА МЕНЮ
// =====================================================================
let selected = 0;                                // номер выбранной игры
let lang = loadSetting("lang", "ru");            // текущий язык
let soundOn = loadSetting("sound", "on") === "on";

const gamesRow = document.getElementById("games");

// --- Звук «бип» без файлов (Web Audio API) ---
let audio = null;

function beep(frequency, duration) {
  if (!soundOn) return;
  if (!audio) audio = new AudioContext();

  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.1, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + duration);
}

// --- Создаём карточки ---
function drawCards() {
  gamesRow.innerHTML = "";

  games.forEach(function (game, index) {
    const card = document.createElement("div");
    card.className = "card";
    card.style.backgroundColor = game.color;

    if (game.image) {
      card.style.backgroundImage = "url(" + game.image + ")";
    } else {
      card.textContent = game.emoji;
    }

    // Клик: первый — выбрать, второй по выбранной — запустить
    card.addEventListener("click", function () {
      if (index === selected) {
        startGame();
      } else {
        select(index);
      }
    });

    gamesRow.appendChild(card);
  });
}

// --- Выбрать игру номер index ---
function select(index) {
  if (index < 0 || index >= games.length) return;
  if (index !== selected) beep(600, 0.08);
  selected = index;

  const cards = gamesRow.children;
  for (let i = 0; i < cards.length; i++) {
    cards[i].classList.toggle("selected", i === selected);
  }
  centerSelected();
  showInfo();
}

// --- Сдвинуть ленту так, чтобы выбранная карточка была ровно по центру ---
function centerSelected() {
  const card = gamesRow.children[selected];
  const viewportCenter = gamesRow.parentElement.clientWidth / 2;
  const cardCenter = card.offsetLeft + card.offsetWidth / 2;
  gamesRow.style.transform = "translateX(" + (viewportCenter - cardCenter) + "px)";
}

// Если меняется размер окна — снова ставим карточку по центру
window.addEventListener("resize", centerSelected);

// --- Показать название и описание выбранной игры ---
function showInfo() {
  const game = games[selected];
  document.getElementById("game-title").textContent = game.title[lang];
  document.getElementById("game-description").textContent = game.description[lang];
}

// --- Запустить выбранную игру ---
function startGame() {
  beep(900, 0.15);
  const link = games[selected].link;
  setTimeout(function () {
    window.location.href = link;
  }, 150); // маленькая пауза, чтобы был слышен звук
}

// --- Сменить язык ---
function setLanguage(newLang) {
  lang = newLang;
  saveSetting("lang", lang);

  document.documentElement.lang = lang;
  document.title = texts[lang].siteTitle;
  document.getElementById("site-title").textContent = texts[lang].siteTitle;
  document.getElementById("play-btn").textContent = texts[lang].play;
  document.getElementById("hint").textContent = texts[lang].hint;

  document.querySelectorAll("[data-lang]").forEach(function (btn) {
    btn.classList.toggle("active", btn.dataset.lang === lang);
  });

  showInfo();
}

// --- Включить / выключить звук ---
function updateSoundButton() {
  document.getElementById("sound-btn").textContent = soundOn ? "🔊" : "🔇";
}

document.getElementById("sound-btn").addEventListener("click", function () {
  soundOn = !soundOn;
  saveSetting("sound", soundOn ? "on" : "off");
  updateSoundButton();
});

// --- Кнопки языка ---
document.querySelectorAll("[data-lang]").forEach(function (btn) {
  btn.addEventListener("click", function () {
    setLanguage(btn.dataset.lang);
  });
});

// --- Кнопка «Играть» ---
document.getElementById("play-btn").addEventListener("click", startGame);

// --- Управление с клавиатуры ---
// event.code — это физическая клавиша, а не буква. Поэтому "KeyA" срабатывает
// и на английской раскладке (A), и на русской (Ф). То же для D / В.
document.addEventListener("keydown", function (event) {
  // Вправо: стрелка → или D (В)
  if (event.code === "ArrowRight" || event.code === "KeyD") {
    select(selected + 1);
  }

  // Влево: стрелка ← или A (Ф)
  if (event.code === "ArrowLeft" || event.code === "KeyA") {
    select(selected - 1);
  }

  // Запустить игру: Enter или Пробел
  if (event.code === "Enter" || event.code === "NumpadEnter" || event.code === "Space") {
    event.preventDefault(); // чтобы пробел не прокручивал страницу и не нажимал кнопку в фокусе
    startGame();
  }
});

// --- Часы в углу, как на консоли ---
function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  document.getElementById("clock").textContent = h + ":" + m;
}

// =====================================================================
// ЗАПУСК
// =====================================================================
drawCards();
setLanguage(lang);
updateSoundButton();
select(0);
updateClock();
setInterval(updateClock, 10000);
