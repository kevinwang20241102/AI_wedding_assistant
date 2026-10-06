const STAGES = [
  { id: "start", name: "备婚启动期" },
  { id: "mid", name: "正式筹备期" },
  { id: "rush", name: "婚前冲刺期" },
  { id: "month", name: "婚礼月" },
  { id: "week", name: "婚礼周" }
];
function defaultStages() {
  return STAGES.map((stage) => ({ id: stage.id, name: stage.name }));
}
function stageNo(index) {
  return "STAGE-" + String(index + 1).padStart(2, "0");
}
function stageLabel(index, name) {
  return stageNo(index) + "【" + name + "】";
}
const TEMPLATE = {
  start: ["确定婚礼日期", "选择婚礼策划师", "制定婚礼预算及预算划分", "估算宾客人数", "选择婚礼场地", "预定婚礼场地", "选择四大专业人员（摄影、摄像、主持、化妆）", "搜集婚礼灵感", "测量婚礼场地"],
  mid: ["制定婚宴设计初稿", "确定婚宴设计终稿", "租赁 / 定做新娘婚纱", "租赁 / 定制新郎西装", "确定伴郎 / 伴娘服饰", "购买 / 定制父母服饰", "拍摄婚纱照", "购买婚礼对戒", "甜品方案确定"],
  rush: ["设计婚礼邀请函", "发邀请函正式邀请宾客", "购买 / 定制婚礼纸品（誓言本 / 桌号牌 / 宾客名牌 / 菜单 / 感谢卡等）", "购买喜糖盒", "购买 / 定制伴手礼", "购买新人物品（签到本、签到笔、新娘房装饰物品、堵门道具、烟酒茶糖等）", "确定婚宴菜单和试菜"],
  month: ["见主持人确定婚礼流程", "选择婚礼暖场 / 仪式 / 用餐音乐", "与摄影师沟通拍摄方案", "与摄像师沟通拍摄方案", "确定婚礼当日流程", "写誓词", "确定宾客名单", "安排宾客交通 / 住宿", "安排宾客座位"],
  week: ["新娘试妆", "新娘做指甲 / 染发", "新郎修剪头发", "确定现场工作人员的工作职责", "取婚纱礼服西装", "运送新人方物料到酒店", "彩排"]
};
const PRESET_GROUPS = ["新郎", "新娘", "男方亲属", "女方亲属", "男方朋友", "女方朋友", "男方同事", "女方同事"];
function guestSeq(value) {
  if (value === "" || value == null) return 0;
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}
function compareGuestSeq(a, b) {
  return guestSeq(a.seq) - guestSeq(b.seq);
}
const CAT_COLORS = ["#D43774", "#3F6F5C", "#C4924A", "#8E4E86", "#E07A9A", "#B4234A", "#D4A0A8", "#6E8F78", "#A67C6D", "#8A756E"];
const PRESET_CATS = ["婚礼场地费", "婚宴餐费", "策划设计费", "四大-摄影师费", "四大-摄像师费", "四大-主持人费", "四大-化妆师费", "甜品台费", "现场布置费", "新娘婚纱费", "新娘婚鞋费", "新郎西服费", "新郎皮鞋费", "宾客伴手礼费", "宾客邀请函费", "烟/酒/茶/喜糖费", "宾客住宿费"];
const OLD_PRESET_CATS = ["婚宴场地", "餐饮", "婚礼策划", "四大人员", "婚纱礼服", "珠宝三金", "婚纱照", "纸品喜糖", "伴手礼", "其他"];
const STATUSES = ["未开始", "进行中", "已完成", "已超期"];
const CAT_STATUS = ["未确定", "已确定", "已支付"];
const ATTEND = ["待定", "已确认", "已婉拒"];

const app = document.getElementById("app");
const ui = { msg: "", saving: false, editTask: null, editStage: null, confirmDelete: null, confirmStage: null, confirmPhoto: null, photoNotice: "", replacePhoto: null, drawerShown: false, archiveFocused: false, openCat: null, addCat: false, paste: false, newGroup: false, addGuest: false, addDraft: "", addGroup: "", addAttend: "待定", addSeq: "", editGuest: null, editDraft: "", editGroup: "", editAttend: "待定", editSeq: "", editNewGroup: false, roster: false, rosterQuery: "", rosterType: "", rosterAttendFilter: "", rosterDraftQuery: "", rosterDraftType: "", rosterDraftAttend: "", collapsed: {}, navFolded: false, codeUntil: 0, chatImages: [], chatDraft: "", chatNotice: "", chatFiles: [], draftModel: "deepseek-flash", modelMenu: false, plusMenu: false, chatMenu: null, renameChat: null, confirmChat: null, confirmLogout: false, editUserMsg: null, expandUser: {}, pinChat: false, chatTimer: 0 };
const CHAT_LIMIT = 4000;
const TITLE_CUSTOM_LIMIT = 200;
const IMAGE_LIMIT = 5 * 1024 * 1024;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function pad(n) { return String(n).padStart(2, "0"); }
function fmt(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function todayStr() { return fmt(new Date()); }
function localDateLabel() {
  const d = new Date();
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
function avatarInitial(username) {
  const ch = Array.from(String(username || "").trim())[0] || "";
  if (!ch) return "";
  if (/^[A-Za-z]$/.test(ch)) return ch.toUpperCase();
  if (ch >= "\u4e00" && ch <= "\u9fff") {
    const letters = "ABCDEFGHJKLMNOPQRSTWXYZ";
    const bounds = Array.from("啊芭擦搭蛾发噶哈击喀垃妈拿哦啪期然撒塌挖昔压匝");
    let index = 0;
    for (let i = 0; i < bounds.length; i += 1) {
      if (ch.localeCompare(bounds[i], "zh-CN") >= 0) index = i;
      else break;
    }
    return letters[index];
  }
  return ch;
}
function toolSvg(kind) {
  const marks = {
    settings: `<path fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round" d="M12 3 L19.79 7.5 L19.79 16.5 L12 21 L4.21 16.5 L4.21 7.5 Z"/><circle cx="12" cy="12" r="3.05" fill="none" stroke="currentColor" stroke-width="2.1"/>`,
    edit: `<path fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round" d="M15.15 4.35 L19.65 8.85 L8.9 19.6 H4.4 V15.1 Z"/><path fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" d="M13.2 6.3 L17.7 10.8"/>`,
    logout: `<path fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round" d="M9.2 5 H6.4 A1.9 1.9 0 0 0 4.5 6.9 v10.2 A1.9 1.9 0 0 0 6.4 19 h2.8"/><path fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round" d="M10.2 12 H19.5 M16.1 8.4 L19.5 12 L16.1 15.6"/>`
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${marks[kind]}</svg>`;
}
function settingsMark() {
  return `<span class="me-setting" aria-hidden="true">${toolSvg("settings")}</span>`;
}
function profileBlock(username) {
  if (!username) return "";
  return `<div class="me"><span class="me-avatar">${esc(avatarInitial(username))}</span><span class="me-copy"><span class="me-name">${esc(username)}</span><span class="me-date">${localDateLabel()}</span></span>${settingsMark()}</div>`;
}
function parseISO(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function addMonths(iso, delta) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1 + delta, 1);
  const last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
  dt.setDate(Math.min(d, last));
  return fmt(dt);
}
function addDays(iso, days) { const d = parseISO(iso); d.setDate(d.getDate() + days); return fmt(d); }
function daysBetween(from, to) { return Math.round((parseISO(to) - parseISO(from)) / 86400000); }
function slashDate(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y || !m || !d) return "";
  return `${y}/${m}/${d}`;
}
function uid() { return Math.random().toString(36).slice(2, 9); }
function yuan(fen) { return (fen / 100).toFixed(2); }
function toFen(text) {
  const n = Number(String(text).replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
function validPassword(p) { return p.length >= 8 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p); }
function dueFor(stage, wedding) {
  if (stage === "start") return addMonths(wedding, -6);
  if (stage === "mid") return addMonths(wedding, -3);
  if (stage === "rush") return addMonths(wedding, -1);
  if (stage === "month") return addDays(wedding, -7);
  return wedding;
}
function currentStage(wedding, today) {
  if (today > wedding) return null;
  const weekStart = addDays(wedding, -7);
  if (today >= weekStart) return "week";
  const [wy, wm] = wedding.split("-");
  const [ty, tm] = today.split("-");
  if (wy === ty && wm === tm) return "month";
  const m3 = addMonths(wedding, -3);
  const m6 = addMonths(wedding, -6);
  if (today >= m3) return "rush";
  if (today >= m6) return "mid";
  return "start";
}
function tagClass(status) {
  if (status === "进行中" || status === "已支付") return "doing";
  if (status === "已完成" || status === "已确定") return "done";
  if (status === "已超期") return "expired";
  if (status === "已确认") return "yes";
  if (status === "已婉拒") return "no";
  return "";
}

let memory = null;
function loadStore() {
  if (memory) return memory;
  try { memory = JSON.parse(localStorage.getItem("wm-proto-v1")) || { users: [], data: {} }; }
  catch { memory = { users: [], data: {} }; }
  return memory;
}
function saveStore(store) {
  memory = store;
  localStorage.setItem("wm-proto-v1", JSON.stringify(store));
}
function sessionUser() {
  return sessionStorage.getItem("wm-session") || localStorage.getItem("wm-remember") || "";
}
function setSession(username, remember) {
  sessionStorage.removeItem("wm-session");
  localStorage.removeItem("wm-remember");
  if (!username) return;
  if (remember) localStorage.setItem("wm-remember", username);
  else sessionStorage.setItem("wm-session", username);
}
function presetCategories() {
  return PRESET_CATS.map((name, i) => ({ id: uid(), name, amountFen: 0, note: "", status: "未确定", colorIndex: i % CAT_COLORS.length }));
}
function syncCategories(data) {
  if (!data || !Array.isArray(data.categories)) return false;
  const names = data.categories.map((c) => c.name);
  const sameNew = names.length === PRESET_CATS.length && names.every((name, i) => name === PRESET_CATS[i]);
  if (sameNew) return false;
  const sameOld = names.length === OLD_PRESET_CATS.length && names.every((name, i) => name === OLD_PRESET_CATS[i]);
  if (!sameOld) return false;
  data.categories = presetCategories();
  return true;
}
function syncCategoryStatus(data) {
  if (!data || !Array.isArray(data.categories)) return false;
  const oldStatus = { "规划中": "未确定", "已定": "已确定", "已超": "未确定" };
  let dirty = false;
  data.categories.forEach((cat) => {
    if (CAT_STATUS.includes(cat.status)) return;
    cat.status = oldStatus[cat.status] || "未确定";
    dirty = true;
  });
  return dirty;
}
function syncCatColors(data) {
  if (!data || !Array.isArray(data.categories)) return false;
  let dirty = false;
  data.categories.forEach((cat, i) => {
    if (typeof cat.colorIndex === "number") return;
    cat.colorIndex = i % CAT_COLORS.length;
    dirty = true;
  });
  return dirty;
}
function syncGroups(data) {
  if (!data || !Array.isArray(data.groups)) return false;
  const custom = data.groups.filter((g) => g && !PRESET_GROUPS.includes(g) && g !== "其他");
  const next = PRESET_GROUPS.concat(custom);
  const same = next.length === data.groups.length && next.every((g, i) => data.groups[i] === g);
  if (same) return false;
  data.groups = next;
  return true;
}
function syncTaskStatus(data) {
  if (!data || !Array.isArray(data.tasks)) return false;
  const today = todayStr();
  let dirty = false;
  data.tasks.forEach((task) => {
    if (task.status === "已过期") {
      task.status = "已超期";
      dirty = true;
    }
    if (task.due && task.due < today && task.status !== "已完成" && task.status !== "已超期") {
      task.status = "已超期";
      dirty = true;
    }
  });
  return dirty;
}
function syncStages(data) {
  if (!data || Array.isArray(data.stages)) return false;
  data.stages = defaultStages();
  return true;
}
function pack() {
  const store = loadStore();
  const username = sessionUser();
  const user = store.users.find((u) => u.username === username) || null;
  const data = username ? store.data[username] : null;
  let dirty = false;
  if (data && Array.isArray(data.tasks) && data.tasks.some((t) => t.status === "已跳过")) {
    data.tasks.forEach((t) => { if (t.status === "已跳过") t.status = "未开始"; });
    dirty = true;
  }
  if (syncStages(data)) dirty = true;
  if (syncTaskStatus(data)) dirty = true;
  if (syncCategories(data)) dirty = true;
  if (syncCategoryStatus(data)) dirty = true;
  if (syncCatColors(data)) dirty = true;
  if (syncGroups(data)) dirty = true;
  if (syncPhotos(data)) dirty = true;
  if (dirty) {
    store.data[username] = data;
    saveStore(store);
  }
  return { store, username, user, data };
}
function writeData(data) {
  const store = loadStore();
  const username = sessionUser();
  store.data[username] = data;
  saveStore(store);
}
function go(path) { location.hash = "#" + path; }
let archiveClosing = false;
let drawerFrame = 0;
function drawerEase(t) {
  return 1 - Math.pow(1 - t, 4);
}
function placeDrawer(sheet, offset, width) {
  const dpr = window.devicePixelRatio || 1;
  const px = Math.round(width * offset * dpr) / dpr;
  sheet.style.transform = px ? "translate3d(" + px + "px,0,0)" : "translate3d(0,0,0)";
}
function animateDrawer(sheet, from, to, done) {
  if (drawerFrame) cancelAnimationFrame(drawerFrame);
  drawerFrame = 0;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!sheet || reduce) {
    if (sheet) {
      sheet.classList.add("is-shown");
      sheet.style.transform = "";
    }
    if (done) done();
    return;
  }
  const width = sheet.offsetWidth;
  const t0 = performance.now();
  placeDrawer(sheet, from, width);
  const tick = (now) => {
    if (!sheet.isConnected) { drawerFrame = 0; archiveClosing = false; return; }
    const t = Math.min(1, (now - t0) / 560);
    placeDrawer(sheet, from + (to - from) * drawerEase(t), width);
    if (t < 1) drawerFrame = requestAnimationFrame(tick);
    else {
      drawerFrame = 0;
      if (to === 0) {
        sheet.classList.add("is-shown");
        sheet.style.transform = "";
      }
      if (done) done();
    }
  };
  drawerFrame = requestAnimationFrame(tick);
}
function drawerOffset(sheet) {
  const width = sheet.offsetWidth;
  if (!width) return 0;
  const tf = getComputedStyle(sheet).transform;
  if (!tf || tf === "none") return 0;
  const parts = tf.slice(tf.indexOf("(") + 1, -1).split(",").map((n) => parseFloat(n));
  const tx = tf.indexOf("matrix3d") === 0 ? parts[12] : parts[4];
  if (!Number.isFinite(tx)) return 0;
  return Math.min(1, Math.max(0, tx / width));
}
function closeArchive() {
  if (archiveClosing) return;
  const from = queryNow().from;
  const dest = from === "budget" ? "/budget" : from === "seating" ? "/seating" : from === "xiaobei" ? "/xiaobei" : "/plan";
  const sheet = document.querySelector(".drawer-sheet");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const offset = sheet ? drawerOffset(sheet) : 1;
  if (!sheet || reduce || offset > 0.98) { go(dest); return; }
  archiveClosing = true;
  animateDrawer(sheet, offset, 1, () => {
    archiveClosing = false;
    if (pathNow() === "/wedding") go(dest);
  });
}
function pathNow() { return decodeURIComponent(location.hash.replace(/^#/, "") || "/login").split("?")[0]; }
function queryNow() {
  const q = (location.hash.split("?")[1] || "");
  return Object.fromEntries(new URLSearchParams(q));
}

function buildTasks(wedding) {
  const tasks = [];
  STAGES.forEach((stage) => {
    TEMPLATE[stage.id].forEach((name) => {
      tasks.push({ id: uid(), name, stage: stage.id, due: dueFor(stage.id, wedding), status: "未开始", note: "", lockedDue: false });
    });
  });
  return tasks;
}
function syncPhotos(data) {
  if (!data || Array.isArray(data.photos)) return false;
  data.photos = [];
  return true;
}
function isWeddingPhoto(bytes) {
  if (bytes.length < 12) return false;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const gif = bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38;
  const webp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  return jpeg || png || gif || webp;
}
function fitWeddingPhoto(file) {
  return file.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    if (!isWeddingPhoto(bytes)) return { error: "请上传 JPEG、PNG、GIF 或 WebP 图片。" };
    if (!file.size) return { error: "请上传 JPEG、PNG、GIF 或 WebP 图片。" };
    if (file.size > IMAGE_LIMIT) return { error: "这张照片超过 5MB，请压缩后再上传。" };
    const url = URL.createObjectURL(new Blob([buf]));
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const max = 960;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve({ src: canvas.toDataURL("image/jpeg", 0.85) });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ error: "请上传 JPEG、PNG、GIF 或 WebP 图片。" });
      };
      img.src = url;
    });
  });
}
function storeWeddingPhoto(data, src, replaceId) {
  const prev = data.photos.map((photo) => ({ id: photo.id, src: photo.src }));
  if (replaceId) {
    const photo = data.photos.find((item) => item.id === replaceId);
    if (!photo) return "这张照片没有保存上，请再试一次。";
    photo.src = src;
    data.photos = [photo];
  } else {
    data.photos = [{ id: uid(), src }];
  }
  try {
    writeData(data);
    return "";
  } catch (e) {
    data.photos = prev;
    return "这张照片没有保存上，请再试一次。";
  }
}
function emptyData() {
  return {
    wedding: null,
    tasks: [],
    categories: presetCategories(),
    groups: PRESET_GROUPS.slice(),
    guests: [],
    tables: [],
    canvas: { scale: 1, x: 0, y: 0 },
    chats: [],
    photos: []
  };
}
function recalcTasks(data) {
  data.tasks.forEach((task) => {
    if (!task.lockedDue) task.due = dueFor(task.stage, data.wedding.weddingDate);
  });
}

function demoBar() {
  return `<div class="demo"><button type="button" data-act="reset-demo">清空原型数据</button></div>`;
}
function productLogo() {
  const rows = ["01100110", "11111111", "11111111", "11111111", "01111110", "00111100", "00011000"];
  const tile = 4;
  const gap = 1;
  const step = tile + gap;
  const tiles = [];
  rows.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      if (cell === "1") tiles.push(`<rect x="${x * step}" y="${y * step}" width="${tile}" height="${tile}"/>`);
    });
  });
  return `<svg class="logo" viewBox="0 0 ${8 * step - gap} ${7 * step - gap}" aria-hidden="true" focusable="false">${tiles.join("")}</svg>`;
}
function field(name, label, type, value, extra) {
  return `<div class="field"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${esc(value || "")}" ${extra || ""}></div>`;
}
function primary(label, act) {
  return `<button class="btn primary" type="submit" data-act="${act}" ${ui.saving ? "disabled" : ""}>${ui.saving ? "正在保存" : label}</button>`;
}
function moduleLogo(kind) {
  const mark = `<g transform="translate(16 16) scale(1.3333) translate(-16 -16)">`;
  const open = `<svg class="mod-logo" viewBox="0 0 32 32" aria-hidden="true" focusable="false">${mark}`;
  if (kind === "xiaobei") {
    return `<svg class="mod-logo" viewBox="0 0 33 33" aria-hidden="true" focusable="false"><path d="M12.2 23.03A9.25 7.5 0 1 0 9.6 21.26L10.7 26Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="13" cy="16.5" r="1.05" fill="currentColor"/><circle cx="17" cy="16.5" r="1.05" fill="currentColor"/><circle cx="21" cy="16.5" r="1.05" fill="currentColor"/></svg>`;
  }
  if (kind === "plan") {
    return `${open}<rect x="12.2" y="11.2" width="7.6" height="10.2" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M14.4 10.2h3.2M14.2 14.4h3.6M14.2 17h3.6M14.2 19.4h2.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></g></svg>`;
  }
  if (kind === "budget") {
    return `${open}<path d="M16 11.2 A4.8 4.8 0 0 0 16 20.8 Z" fill="currentColor"/><circle cx="16" cy="16" r="4.8" fill="none" stroke="currentColor" stroke-width="1.5"/></g></svg>`;
  }
  const dots = [10.8, 16, 21.2].flatMap((y) => [10.8, 16, 21.2].map((x) => `<circle cx="${x}" cy="${y}" r="1.7" fill="currentColor"/>`)).join("");
  const seating = `<svg class="mod-logo" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><g transform="translate(16 16) scale(1.072) translate(-16 -16)">`;
  return `${seating}${dots}</g></svg>`;
}
function foldIcon(folded) {
  const bar = folded
    ? `<rect x="10.15" y="4.15" width="3.15" height="7.7" rx="0.7" fill="currentColor"/>`
    : `<rect x="2.7" y="4.15" width="3.15" height="7.7" rx="0.7" fill="currentColor"/>`;
  return `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="1.25" y="2.5" width="13.5" height="11" rx="2" fill="#FFFFFF" stroke="currentColor" stroke-width="1.25"/>${bar}</svg>`;
}
function metric(label, value, extra) {
  return `<div class="metric"><span class="metric-label">${label}</span><span class="metric-value${extra ? " " + extra : ""}">${value}</span></div>`;
}
function chatList(data) {
  if (!data.chats) data.chats = [];
  return data.chats;
}
function chatStamp() { return Date.now(); }
function clearChatTimer() {
  if (ui.chatTimer) { clearInterval(ui.chatTimer); ui.chatTimer = 0; }
}
function chatHistory(chats, activeId) {
  const moreIcon = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="4" cy="8" r="1.2" fill="currentColor"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="12" cy="8" r="1.2" fill="currentColor"/></svg>`;
  const editIcon = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.2 11.8 11.4 3.6l1 1-8.2 8.2H3.2zM12.1 2.9l1 1 1.1-1.1-1-1z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
  const trashIcon = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 4.5h9M6 4.5V3.4h4v1.1M5 4.5l.5 8.2h5l.5-8.2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
  const items = chats.slice().sort((a, b) => b.updated - a.updated).map((chat) => {
    const current = chat.id === activeId ? " current" : "";
    const open = ui.chatMenu === chat.id;
    const menu = open ? `<div class="chat-more-menu" role="menu"><button type="button" data-act="rename-chat" data-id="${chat.id}">${editIcon}<span>重命名</span></button><button class="is-danger" type="button" data-act="ask-delete-chat" data-id="${chat.id}">${trashIcon}<span>删除</span></button></div>` : "";
    return `<div class="chat-row${current}${open ? " is-menu" : ""}"><a href="#/xiaobei?c=${chat.id}">${esc(chat.title)}</a><button class="chat-more" type="button" data-act="toggle-chat-menu" data-id="${chat.id}" aria-label="对话操作" aria-expanded="${open ? "true" : "false"}">${moreIcon}</button>${menu}</div>`;
  }).join("");
  return `<div class="chat-side"><div class="chat-recent">最近</div><div class="chat-side-list">${items}</div></div>`;
}
function renameChatDialog() {
  if (!ui.renameChat) return "";
  const { data } = pack();
  const conv = chatList(data).find((item) => item.id === ui.renameChat);
  if (!conv) return "";
  const cap = conv.titleLocked || [...conv.title].length <= TITLE_CUSTOM_LIMIT ? TITLE_CUSTOM_LIMIT : [...conv.title].length;
  return `<div class="modal-back is-front" role="presentation"><form class="modal rename-dialog" data-form="rename-chat" data-id="${conv.id}" data-original="${esc(conv.title)}" data-locked="${conv.titleLocked ? "1" : "0"}" role="dialog" aria-modal="true" aria-labelledby="rename-chat-title"><div class="rename-head"><div class="modal-title" id="rename-chat-title">编辑对话名称</div><button class="rename-close" type="button" data-act="cancel-rename" aria-label="关闭">×</button></div><div class="rename-field"><textarea name="title" rows="3" maxlength="${cap}" aria-label="对话名称">${esc(conv.title)}</textarea></div><div class="modal-actions rename-actions"><button class="btn rename-cancel" type="button" data-act="cancel-rename">取消</button><button class="btn rename-confirm" type="submit">确认</button></div></form></div>`;
}
function shell(body, current, board) {
  const folded = ui.navFolded;
  const { data, username } = pack();
  const chatSelected = current === "/xiaobei" && !!queryNow().c;
  const nav = [
    ["/xiaobei?new=1", "新建对话", "xiaobei"],
    ["/plan", "备婚计划书", "plan"],
    ["/budget", "预算管理本", "budget"],
    ["/seating", "婚宴座位表", "seating"]
  ].map(([href, name, kind]) => {
    const on = kind === "xiaobei" ? current === "/xiaobei" && !queryNow().c : current === href;
    const extra = kind === "xiaobei" ? ` data-act="new-chat"` : "";
    return `<a href="#${href}" class="${on ? "current" : ""}" aria-label="${name}"${extra}>${moduleLogo(kind)}<span>${name}</span></a>`;
  }).join("");
  const navMark = `<div class="nav-indicator${chatSelected ? " is-off" : ""}" aria-hidden="true"></div>${nav}`;
  const origin = current === "/budget" ? "budget" : current === "/seating" ? "seating" : current === "/xiaobei" ? "xiaobei" : "plan";
  const focus = current === "/budget" ? "&focus=budget" : "";
  const activeId = current === "/xiaobei" ? (queryNow().c || "") : "";
  const quiet = folded ? ' aria-hidden="true" inert' : "";
  const history = !data ? "" : chatHistory(chatList(data), activeId).replace('class="chat-side"', `class="chat-side"${quiet}`);
  const profile = !username ? "" : profileBlock(username).replace('class="me"', `class="me"${quiet}`);
  const openDrawer = pathNow() === "/wedding";
  const archiveCaret = `<span class="archive-caret" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="M8.6 2.8 L3.8 6 L8.6 9.2 Z" fill="currentColor"/></svg></span>`;
  const archiveHref = `#/wedding?from=${origin}${focus}`;
  const foot = `<div class="side-foot"${quiet}><a class="btn primary${openDrawer ? " is-open" : ""}" href="${archiveHref}" data-act="toggle-archive" aria-expanded="${openDrawer ? "true" : "false"}">编辑婚礼档案${archiveCaret}</a><button class="logout" type="button" data-act="logout">退出登录</button></div>`;
  const toolsQuiet = folded ? "" : ' aria-hidden="true" inert';
  const tools = `<div class="side-tools"${toolsQuiet}><span class="side-tool is-mark" aria-hidden="true">${toolSvg("settings")}</span><a class="side-tool${openDrawer ? " is-open" : ""}" href="${archiveHref}" data-act="toggle-archive" aria-label="编辑婚礼档案" aria-expanded="${openDrawer ? "true" : "false"}">${toolSvg("edit")}</a><button class="side-tool" type="button" data-act="logout" aria-label="退出登录">${toolSvg("logout")}</button></div>`;
  const ask = ui.confirmChat ? `<div class="modal-back" role="presentation"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="delete-chat"><div class="modal-title" id="delete-chat">您是否确认删除？</div><div class="modal-actions"><button class="btn secondary" type="button" data-act="cancel-chat">取消</button><button class="btn primary" type="button" data-act="confirm-chat">确认</button></div></div></div>` : "";
  const logoutAsk = ui.confirmLogout ? `<div class="modal-back is-front" role="presentation"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="logout-ask"><div class="modal-title" id="logout-ask">是否确认退出登录</div><div class="modal-actions"><button class="btn secondary" type="button" data-act="cancel-logout">取消</button><button class="btn primary" type="button" data-act="confirm-logout">确认</button></div></div></div>` : "";
  const head = board ? `<header class="head-board">${board}</header>` : "";
  const drawer = openDrawer ? archiveDrawer(!ui.drawerShown) : "";
  if (openDrawer) ui.drawerShown = true;
  const page = `${demoBar()}${head}<div class="content-scroll">${body}</div>`;
  const main = openDrawer ? `<div class="content-under" inert>${page}</div>${drawer}` : page;
  return `<div class="shell"><aside class="side${folded ? " is-folded" : ""}"><div class="side-head"><div class="brand">${productLogo()}<span>备备</span></div><button class="nav-fold" type="button" data-act="fold-nav" aria-expanded="${folded ? "false" : "true"}" aria-label="${folded ? "展开侧栏" : "折叠侧栏"}">${foldIcon(folded)}</button></div><nav class="nav">${navMark}</nav>${history}${profile}${foot}${tools}</aside><main class="content">${main}</main>${ask}${logoutAsk}${renameChatDialog()}</div>`;
}

function passwordField() {
  return `<div class="field"><label for="password">密码</label><div class="password-line"><input id="password" name="password" type="password" autocomplete="current-password"><button class="reveal" type="button" data-act="toggle-password" aria-pressed="false" aria-label="显示密码">显示</button></div></div>`;
}
function renderLogin() {
  app.innerHTML = `<div class="auth-wrap has-hearts">${demoBar()}<form class="card" data-form="login"><h1 class="brand-lockup">${productLogo()}<span>备备</span></h1>${ui.msg ? `<div class="banner">${esc(ui.msg)}</div>` : ""}${field("username", "用户名", "text")}${passwordField()}<label class="check"><input type="checkbox" name="remember">记住用户名和密码</label>${primary("登录", "login")}<div class="links"><a href="#/register">注册</a><a href="#/reset-password">找回密码</a></div></form></div>`;
}
function renderRegister() {
  app.innerHTML = `<div class="auth-wrap has-hearts">${demoBar()}<form class="card" data-form="register"><h1>注册</h1>${field("username", "用户名", "text")}<div class="field"><label for="password">密码</label><input id="password" name="password" type="password"><div class="hint">至少 8 位，需包含大写字母、小写字母和数字</div></div>${field("phone", "手机号", "text")}${primary("注册", "register")}<div class="links"><a href="#/login">已有账号，去登录</a></div></form></div>`;
}
function renderReset() {
  const wait = Math.max(0, Math.ceil((ui.codeUntil - Date.now()) / 1000));
  app.innerHTML = `<div class="auth-wrap">${demoBar()}<form class="card" data-form="reset"><h1>找回密码</h1>${ui.msg ? `<div class="${ui.msgOk ? "ok" : "banner"}">${esc(ui.msg)}</div>` : ""}<div class="field"><label for="phone">手机号</label><div class="row"><input id="phone" name="phone" type="text"><button class="btn secondary" type="button" data-act="send-code" ${wait ? "disabled" : ""}>${wait ? wait + " 秒后可重发" : "获取验证码"}</button></div></div>${field("code", "验证码", "text")}${field("password", "新密码", "password")}<div class="hint">至少 8 位，需包含大写字母、小写字母和数字</div>${primary("重置密码", "reset")}<div class="links"><a href="#/login">返回登录</a></div></form></div>`;
  if (wait) setTimeout(() => { if (pathNow() === "/reset-password") render(); }, 1000);
}
function coupleFields(data) {
  const w = data || {};
  return `<div class="couple-row">${field("groomName", "新郎昵称", "text", w.groomName || "")}${field("groomBirthday", "新郎生日", "date", w.groomBirthday || "")}</div><div class="couple-row">${field("brideName", "新娘昵称", "text", w.brideName || "")}${field("brideBirthday", "新娘生日", "date", w.brideBirthday || "")}</div>`;
}
function preferenceField(data) {
  const w = data || {};
  return `<div class="field field-preference"><label for="preference">其他婚礼偏好</label><textarea id="preference" name="preference" rows="4">${esc(w.preference || "")}</textarea></div>`;
}
function weddingFields(data, focus) {
  const w = data || {};
  return `${field("startDate", "开始备婚日期", "date", w.startDate)}${field("weddingDate", "婚礼日期", "date", w.weddingDate)}${field("city", "城市", "text", w.city)}${field("budget", "总预算（元）", "text", w.budgetFen != null ? yuan(w.budgetFen) : "", 'inputmode="decimal"')}${field("headcount", "总人数", "number", w.headcount ?? "", 'min="0"')}`;
}
function renderCreate() {
  const { data } = pack();
  if (data && data.wedding) {
    app.innerHTML = `<div class="auth-wrap">${demoBar()}<div class="card"><h1>创建婚礼项目</h1><p>你已经有一个婚礼项目</p><a class="btn secondary" href="#/plan">返回备婚计划书</a></div></div>`;
    return;
  }
  app.innerHTML = `<div class="auth-wrap">${demoBar()}<form class="card wide" data-form="create"><h1>创建婚礼项目</h1>${weddingFields()}${primary("创建项目", "create")}</form></div>`;
}
function archiveDrawer(animate) {
  const { data } = pack();
  const photos = data.photos || [];
  const photo = photos.length ? photos[photos.length - 1] : null;
  const notice = ui.photoNotice ? `<p class="error">${esc(ui.photoNotice)}</p>` : "";
  const upload = `<button class="btn secondary photo-upload" type="button" data-act="pick-photo">上传照片</button>`;
  const picker = `<input id="archive-photo" type="file" accept="image/*">`;
  const body = photo
    ? `<div class="photo-fill"><img src="${photo.src}" alt="婚礼档案照片"><button class="btn secondary photo-replace" type="button" data-act="replace-photo" data-id="${photo.id}">更换合影</button></div>`
    : `<div class="photo-empty">${upload}</div>`;
  const ask = ui.confirmPhoto ? `<div class="modal-back" role="presentation"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="delete-photo"><div class="modal-title" id="delete-photo">您是否确认删除？</div><div class="modal-actions"><button class="btn secondary" type="button" data-act="cancel-photo">取消</button><button class="btn primary" type="button" data-act="confirm-photo">确认</button></div></div></div>` : "";
  const motion = animate ? "" : " is-shown";
  return `<div class="drawer-layer"><div class="drawer-sheet${motion}" role="dialog" aria-modal="true" aria-labelledby="archive-title"><div class="archive-page"><div class="archive-head"><h1 id="archive-title">婚礼档案</h1><button class="btn secondary" type="button" data-act="back">返回</button></div><div class="archive-cols"><form class="archive-col" data-form="archive" novalidate><div class="archive-fields">${coupleFields(data.wedding)}${weddingFields(data.wedding, queryNow().focus)}${preferenceField(data.wedding)}</div><div class="archive-save">${primary("保存", "save-wedding")}</div></form><section class="archive-col photo-col${photo ? " has-photo" : ""}">${photo ? "" : "<h2>上传婚纱照/新人合照</h2>"}${notice}${body}${picker}</section></div></div></div>${ask}</div></div>`;
}
function renderArchiveHost() {
  const from = queryNow().from;
  if (from === "budget") renderBudget();
  else if (from === "seating") renderSeating();
  else if (from === "xiaobei") renderXiaoBei();
  else renderPlan();
}

function dueField(task) {
  return `<div class="due-line"><span class="due-label">截止日期</span><label class="due-chip"><span>${esc(task.due)}</span><input type="date" data-act="due" data-id="${task.id}" value="${esc(task.due)}" aria-label="修改截止日期"></label></div>`;
}
function taskRow(task, extraClass) {
  if (ui.editTask === task.id) {
    return `<div class="task ${extraClass || ""}" data-task="${task.id}"><span class="task-dot" aria-hidden="true"></span><form class="edit-name" data-form="task" data-id="${task.id}"><input name="name" value="${esc(task.name)}" aria-label="任务名称"><button class="btn secondary" type="submit">保存</button></form>${dueField(task)}<div class="note-clip">${esc(task.note || "")}</div><span class="status-wrap ${tagClass(task.status)}"><select class="status-pick ${tagClass(task.status)}" data-act="status" data-id="${task.id}" aria-label="状态">${STATUSES.map((s) => `<option value="${s}" ${s === task.status ? "selected" : ""}>${s}</option>`).join("")}</select></span><span class="row"><button class="btn danger" type="button" data-act="edit-task" data-id="${task.id}">编辑</button><button class="btn danger" type="button" data-act="delete-task" data-id="${task.id}">删除</button></span></div>`;
  }
  const statusOptions = STATUSES.map((s) => `<option value="${s}" ${s === task.status ? "selected" : ""}>${s}</option>`).join("");
  const tone = tagClass(task.status);
  return `<div class="task ${extraClass || ""}" data-task="${task.id}"><span class="task-dot" aria-hidden="true"></span><div class="name">${esc(task.name)}</div>${dueField(task)}<div class="note-clip">${esc(task.note || "")}</div><span class="status-wrap ${tone}"><select class="status-pick ${tone}" data-act="status" data-id="${task.id}" aria-label="状态">${statusOptions}</select></span><span class="row"><button class="btn danger" type="button" data-act="edit-task" data-id="${task.id}">编辑</button><button class="btn danger" type="button" data-act="delete-task" data-id="${task.id}">删除</button></span></div>`;
}
function stageArrow(stage, collapsed) {
  return `<button class="fold-arrow" type="button" data-act="fold" data-id="${stage.id}" aria-expanded="${collapsed ? "false" : "true"}" aria-label="${collapsed ? "展开" : "收起"}"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.2 4.2 L6 8 L9.8 4.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
}
function stageHead(stage, index, collapsed) {
  const arrow = stageArrow(stage, collapsed);
  const remove = `<button class="btn stage-act" type="button" data-act="delete-stage" data-id="${stage.id}">删除</button>`;
  if (ui.editStage === stage.id) {
    const title = `<div class="stage-title"><span class="stage-tag">${stageNo(index)}</span><span>【</span><form class="stage-rename" data-form="stage" data-id="${stage.id}"><input name="name" value="${esc(stage.name)}" aria-label="阶段名称"><button class="btn stage-act" type="submit">保存</button></form><span>】</span></div>`;
    return `<div class="section-head" data-id="${stage.id}">${title}<span class="stage-tools">${remove}${arrow}</span></div>`;
  }
  const edit = `<button class="btn stage-act" type="button" data-act="edit-stage" data-id="${stage.id}">编辑</button>`;
  return `<div class="section-head" data-id="${stage.id}"><h2><span class="stage-tag">${stageNo(index)}</span><span>【${esc(stage.name)}】</span></h2><span class="stage-tools">${edit}${remove}${arrow}</span></div>`;
}
function renderPlan() {
  const { data } = pack();
  const today = todayStr();
  const wedding = data.wedding.weddingDate;
  const days = daysBetween(today, wedding);
  const countLabel = days > 0 ? "距离婚礼" : days === 0 ? "婚礼日期" : "婚礼已过";
  const countValue = days === 0 ? "就是婚礼当天" : `<b class="count-num">${days > 0 ? days : -days}</b> 天`;
  const done = data.tasks.filter((t) => t.status === "已完成").length;
  const doing = data.tasks.filter((t) => t.status === "进行中").length;
  const total = data.tasks.length;
  const ratio = (count) => total ? Math.round(count / total * 100) : 0;
  const open = (t) => t.status !== "已完成";
  const current = currentStage(wedding, today);
  const groups = (data.stages || []).map((stage, index) => {
    const collapsed = ui.collapsed[stage.id] !== undefined ? ui.collapsed[stage.id] : stage.id !== current;
    const items = data.tasks.filter((t) => t.stage === stage.id);
    const add = `<div class="stage-add"><button class="btn secondary" type="button" data-act="add-task" data-id="${stage.id}">新增任务</button></div>`;
    const rows = items.map((t) => taskRow(t, t.due === today ? "today" : t.due < today && open(t) ? "overdue" : "")).join("");
    return `<section class="section${collapsed ? " is-collapsed" : ""}" data-stage="${stage.id}">${stageHead(stage, index, collapsed)}<div class="stage-body"${collapsed ? " inert" : ""}><div class="stage-body-inner">${add}${rows}</div></div></section>`;
  }).join("");
  const progressCell = (label, count) => `<div class="metric"><span class="metric-label">${label}</span><span class="metric-value">${count} / ${total}</span><div class="progress-track"><div class="progress-fill" style="width:${ratio(count)}%"></div></div></div>`;
  const dateCell = metric("婚礼日期", `<b class="count-num">${esc(slashDate(wedding))}</b>`, "hero");
  const board = `${dateCell}${metric(countLabel, countValue, days === 0 ? "" : "hero")}${progressCell("已完成", done)}${progressCell("进行中", doing)}`;
  const confirm = (ui.confirmDelete || ui.confirmStage) ? `<div class="modal-back" role="presentation"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="delete-ask"><div class="modal-title" id="delete-ask">您是否确认删除？</div><div class="modal-actions"><button class="btn secondary" type="button" data-act="cancel-delete">取消</button><button class="btn primary" type="button" data-act="confirm-delete">确认</button></div></div></div>` : "";
  const addStage = `<div class="stage-add-bar"><p class="stage-hint">* 温馨提示：点击长按拖动可调换阶段/任务位置哦~</p><button class="btn primary" type="button" data-act="add-stage">新增阶段</button></div>`;
  app.innerHTML = shell(`${addStage}<div class="stage-list">${groups}</div>`, "/plan", board) + confirm;
  if (ui.editStage) {
    const input = document.querySelector(`form[data-form="stage"][data-id="${ui.editStage}"] input[name="name"]`);
    if (input) { input.focus(); input.select(); }
  }
}

function catColor(i) { return CAT_COLORS[i % CAT_COLORS.length]; }
function budgetShare(amountFen, totalFen) {
  if (!totalFen) return "0.00%";
  return (amountFen / totalFen * 100).toFixed(2) + "%";
}
function renderBudget() {
  const { data } = pack();
  const total = data.wedding.budgetFen;
  const used = data.categories.reduce((s, c) => s + c.amountFen, 0);
  const left = total - used;
  const over = used > total;
  const rows = data.categories.map((c, i) => {
    const open = ui.openCat === c.id;
    const color = CAT_COLORS[(typeof c.colorIndex === "number" ? c.colorIndex : i) % CAT_COLORS.length];
    const detail = open ? `<form class="detail" data-form="cat" data-id="${c.id}"><div class="field"><label>金额（元）</label><input name="amount" value="${yuan(c.amountFen)}"></div><div class="field"><label>状态</label><select name="status">${CAT_STATUS.map((s) => `<option ${s === c.status ? "selected" : ""}>${s}</option>`).join("")}</select></div><div class="field"><label>预算备注</label><input name="note" value="${esc(c.note || "")}"></div><button class="btn primary" type="submit">保存</button></form>` : "";
    return `<div class="cat-item" data-cat="${c.id}"><div class="cat"><span class="swatch" style="background:${color}"></span><span class="name">${esc(c.name)}</span><span class="money">¥${yuan(c.amountFen)}</span><span class="tag share">${budgetShare(c.amountFen, total)}</span><span class="budget-note">${esc((String(c.note || "").trim()) ? "备注：" + String(c.note).trim() : "备注：暂无")}</span><span class="tag ${tagClass(c.status)}">${esc(c.status)}</span><button class="btn danger" type="button" data-act="open-cat" data-id="${c.id}">编辑</button><button class="btn danger" type="button" data-act="delete-cat" data-id="${c.id}">删除</button></div>${detail}</div>`;
  }).join("");
  const board = `${metric("总预算", `<b class="count-num">¥${yuan(total)}</b>`, "hero")}${metric("已分配", "¥" + yuan(used))}<div class="metric"><span class="metric-label">未分配</span><span class="metric-value${over ? " danger" : ""}">¥${yuan(left)}</span>${over ? `<span class="danger-text">已超出总预算</span>` : ""}</div>`;
  const addDialog = ui.addCat ? `<div class="modal-back" role="presentation"><form class="modal" data-form="new-cat" role="dialog" aria-modal="true" aria-labelledby="new-budget"><div class="modal-title" id="new-budget">新增预算</div><div class="field"><label>预算名称</label><input name="name"></div><div class="field"><label>预算金额</label><input name="amount" inputmode="decimal" value="0.00"></div><div class="field"><label>预算状态</label><select name="status">${CAT_STATUS.map((s) => `<option ${s === "未确定" ? "selected" : ""}>${s}</option>`).join("")}</select></div><div class="field"><label>预算备注</label><input name="note"></div><div class="modal-actions"><button class="btn secondary" type="button" data-act="close-new-cat">取消</button><button class="btn primary" type="submit">保存</button></div></form></div>` : "";
  app.innerHTML = shell(`<div class="budget-body"><div class="cat-tools"><p class="stage-hint">* 温馨提示：点击长按拖动可调换预算位置哦~</p><button class="btn primary" type="button" data-act="open-new-cat">新增预算</button></div><div class="cat-list">${rows}</div></div>${addDialog}`, "/budget", board);
}

function renderSeating() {
  const { data } = pack();
  const confirmed = data.guests.filter((g) => g.attendance === "已确认").length;
  const seated = data.guests.filter((g) => g.tableId).length;
  const q = (ui.search || "").trim();
  const filter = ui.filter || "";
  const matchGuest = (g) => (!q || g.name.includes(q)) && (!filter || g.group === filter);
  const seatedGuests = data.guests.filter((g) => g.tableId && matchGuest(g)).sort(compareGuestSeq);
  const waitingGuests = data.guests.filter((g) => !g.tableId && matchGuest(g)).sort(compareGuestSeq);
  const pickedGroup = ui.newGroup ? "__new" : (data.groups.includes(ui.addGroup) ? ui.addGroup : data.groups[0]);
  const groupOptions = data.groups.map((g) => `<option ${g === pickedGroup ? "selected" : ""}>${esc(g)}</option>`).join("");
  const guestChip = (g, waiting) => `<button class="chip${waiting ? " waiting" : " placed"}" type="button" data-guest="${g.id}"><span class="chip-name">${esc(g.name)}</span><span class="chip-x" data-act="delete-guest" data-id="${g.id}" aria-label="删除${esc(g.name)}">×</span></button>`;
  const guestSection = (title, people, emptyText, waiting) => `<section class="guest-section"><div class="section-label">${title}</div><div class="pool-list">${people.map((g) => guestChip(g, waiting)).join("") || `<div class="empty">${emptyText}</div>`}</div></section>`;
  const sections = `${guestSection("已排座", seatedGuests, "已排座是空的", false)}${guestSection("未排座", waitingGuests, "未排座是空的", true)}`;
  const attendOptions = (current) => ATTEND.map((a) => `<option ${a === current ? "selected" : ""}>${a}</option>`).join("");
  const addDialog = ui.addGuest ? `<div class="modal-back"><form class="modal" data-form="guest"><div class="modal-title">添加宾客</div><div class="field"><label>姓名</label><input name="name" value="${esc(ui.addDraft || "")}"></div><div class="field"><label>分组</label><select name="group">${groupOptions}<option value="__new" ${ui.newGroup ? "selected" : ""}>新建分组</option></select></div><div class="field" data-new-group ${ui.newGroup ? "" : "hidden"}><label>新分组名称</label><input name="newGroup"></div><div class="field"><label>出席</label><select name="attendance">${attendOptions(ui.addAttend || "待定")}</select></div><div class="field"><label>宾客序号</label><input name="seq" inputmode="numeric" value="${esc(ui.addSeq || "")}" placeholder="0"></div><div class="modal-actions"><button class="btn secondary" type="button" data-act="close-add">取消</button><button class="btn primary" type="submit">添加宾客</button></div></form></div>` : "";
  const rosterQuery = (ui.rosterQuery || "").trim();
  const rosterListed = data.guests.filter((g) => {
    if (rosterQuery && !g.name.includes(rosterQuery)) return false;
    if (ui.rosterType && g.group !== ui.rosterType) return false;
    if (ui.rosterAttendFilter && (g.attendance || "待定") !== ui.rosterAttendFilter) return false;
    return true;
  });
  rosterListed.sort(compareGuestSeq);
  const attendTag = (value) => {
    const name = ATTEND.includes(value) ? value : "待定";
    const kind = name === "已确认" ? "yes" : name === "已婉拒" ? "no" : "wait";
    return `<span class="attend-tag ${kind}">${esc(name)}</span>`;
  };
  const rosterRows = rosterListed.map((g) => `<div class="roster-row"><span>${guestSeq(g.seq)}</span><span>${esc(g.name)}</span><span>${esc(g.group)}</span><span class="roster-attend">${attendTag(g.attendance)}</span><span class="roster-actions"><button class="btn danger" type="button" data-act="edit-guest" data-id="${g.id}" aria-label="编辑${esc(g.name)}">编辑</button><button class="btn danger" type="button" data-act="delete-guest" data-id="${g.id}" aria-label="删除${esc(g.name)}">删除</button></span></div>`).join("") || `<div class="empty">${data.guests.length ? "没有符合条件的宾客" : "还没有宾客"}</div>`;
  const typeOptions = `<option value="">全部类型</option>${data.groups.map((g) => `<option value="${esc(g)}" ${ui.rosterDraftType === g ? "selected" : ""}>${esc(g)}</option>`).join("")}`;
  const attendFilter = `<option value="">全部出席</option>${ATTEND.map((a) => `<option ${ui.rosterDraftAttend === a ? "selected" : ""}>${a}</option>`).join("")}`;
  const rosterDialog = ui.roster ? `<div class="modal-back"><div class="modal roster"><div class="roster-head-bar"><div class="modal-title">全部宾客名单</div><button class="btn secondary" type="button" data-act="close-roster">关闭</button></div><div class="roster-tools"><input data-act="roster-search" placeholder="搜索姓名" aria-label="搜索姓名" value="${esc(ui.rosterDraftQuery || "")}"><select data-act="roster-type" aria-label="宾客类型筛选">${typeOptions}</select><select data-act="roster-attend" aria-label="出席状态筛选">${attendFilter}</select><button class="btn roster-reset" type="button" data-act="roster-reset">重置</button><button class="btn roster-apply" type="button" data-act="roster-apply">搜索</button></div><div class="roster-table"><div class="roster-head"><span>宾客序号</span><span>姓名</span><span>宾客类型</span><span>出席状态</span><span></span></div><div class="roster-list">${rosterRows}</div></div></div></div>` : "";
  const editTarget = ui.editGuest ? data.guests.find((g) => g.id === ui.editGuest) : null;
  const editNames = editTarget ? data.groups.concat(editTarget.group && !data.groups.includes(editTarget.group) ? [editTarget.group] : []) : [];
  const editSelected = ui.editNewGroup ? "__new" : (editNames.includes(ui.editGroup) ? ui.editGroup : (editTarget && editTarget.group));
  const editOptions = editNames.map((g) => `<option ${g === editSelected ? "selected" : ""}>${esc(g)}</option>`).join("");
  const editDialog = editTarget ? `<div class="modal-back" data-layer="edit"><form class="modal" data-form="edit-guest"><div class="modal-title">编辑宾客</div><div class="field"><label>姓名</label><input name="name" value="${esc(ui.editDraft)}"></div><div class="field"><label>分组</label><select name="group">${editOptions}<option value="__new" ${ui.editNewGroup ? "selected" : ""}>新建分组</option></select></div><div class="field" data-new-group ${ui.editNewGroup ? "" : "hidden"}><label>新分组名称</label><input name="newGroup"></div><div class="field"><label>出席</label><select name="attendance">${attendOptions(ui.editAttend || "待定")}</select></div><div class="field"><label>宾客序号</label><input name="seq" inputmode="numeric" value="${esc(ui.editSeq)}"></div><div class="modal-actions"><button class="btn secondary" type="button" data-act="close-edit">取消</button><button class="btn primary" type="submit">保存</button></div></form></div>` : "";
  const dialog = `${addDialog}${rosterDialog}${editDialog}`;
  const tables = data.tables.map((t) => {
    const people = data.guests.filter((g) => g.tableId === t.id).sort(compareGuestSeq);
    const full = people.length >= t.capacity;
    return `<article class="table ${t.main ? "main" : ""}" data-table="${t.id}" style="left:${t.x}px;top:${t.y}px;z-index:${t.main ? 2 : 1}"><div class="handle" data-handle="${t.id}">拖动桌位${t.main ? " · 主桌" : ""}</div><div class="table-name">${esc(t.name)}</div><div>已坐 ${people.length} / 容量 ${t.capacity}</div>${full ? `<div class="full">已满，仍可入座</div>` : ""}<div class="chips">${people.map((g) => `<button class="chip" type="button" data-guest="${g.id}">${esc(g.name)} <span data-act="unseat" data-id="${g.id}">×</span></button>`).join("")}</div><div class="table-actions"><input data-act="rename" data-id="${t.id}" value="${esc(t.name)}" aria-label="桌名"><input data-act="capacity" data-id="${t.id}" type="number" min="1" value="${t.capacity}" aria-label="容量"><button class="btn danger" type="button" data-act="main" data-id="${t.id}">设为主桌</button><button class="btn danger" type="button" data-act="delete-table" data-id="${t.id}">删除</button></div></article>`;
  }).join("");
  const board = `${metric("宾客总数", `<b class="count-num">${data.guests.length}</b>`, "hero")}${metric("已确认", confirmed)}${metric("已排座", seated)}${metric("未排座", data.guests.length - seated)}`;
  app.innerHTML = shell(`<div class="seat"><aside class="pool" data-pool="1"><button class="btn primary" type="button" data-act="open-add">添加宾客</button><button class="btn secondary" type="button" data-act="open-roster">全部宾客名单</button><div class="guest-sections">${sections}</div></aside><div class="board" data-pan="1"><div class="board-tools"><button class="btn secondary" type="button" data-act="zoom" data-dir="1">放大</button><button class="btn secondary" type="button" data-act="zoom" data-dir="-1">缩小</button><button class="btn secondary" type="button" data-act="add-table">新增桌子</button></div><div class="canvas" style="transform:translate(${data.canvas.x}px,${data.canvas.y}px) scale(${data.canvas.scale})">${tables}</div></div></div>${dialog}`, "/seating", board);
}

let paintedPath = "";
let navIndex = -1;
const MODEL_OPTIONS = [
  { id: "deepseek-flash", name: "Deepseek-flash", note: "适合快速输出" },
  { id: "deepseek-v4-pro", name: "Deepseek-v4-pro", note: "适合深度思考" }
];
function chatModel(conv) {
  return (conv && conv.model) || ui.draftModel || "deepseek-flash";
}
function modelName(id) {
  const found = MODEL_OPTIONS.find((item) => item.id === id);
  return found ? found.name : MODEL_OPTIONS[0].name;
}
function chatPayload(typed, files) {
  const body = (files || []).map((file) => String(file.text || "")).join("\n");
  return [String(typed || ""), body].filter((part) => part.length).join("\n");
}
function chatReply(text, data, hasImage) {
  const city = data.wedding.city || "";
  const budget = yuan(data.wedding.budgetFen);
  const date = slashDate(data.wedding.weddingDate);
  const people = data.wedding.headcount;
  if (text === "演示超时") return { fail: "timeout" };
  if (text === "演示繁忙") return { fail: "busy" };
  if (text === "演示失败") return { fail: "other" };
  if (text === "演示长文") return { text: "备婚这件事，建议你先把三块地基打牢：日期、场地、总预算。日期不是越早越好，而是要同时看双方家里的空档、亲友能不能到场，以及场地那天有没有档期。场地先问清能摆几桌、进场时间、是否含桌椅餐具和音响，再去现场走一遍宾客动线、化妆间和洗手间。总预算先按你们能接受的上限写死，再拆到场地餐饮、人员、礼服、摄影摄像、布置和纸品伴手礼，每项先询价再付钱，避免先付了定金才发现不包含服务。\n\n人员这块，司仪、跟妆、摄影摄像最好各看两家，对比同一天的档期和成片标准。礼服按试纱次数和改衣是否收费来问。宾客名单尽早收齐，主桌留给双方父母和证婚人，老人小孩靠近通道和洗手间，同事朋友按熟悉程度分桌，不要把不熟的人硬凑一桌。请柬发出去之后，确认出席的人再排座，待定的人先留空位。\n\n当天流程可以按迎接、仪式、用餐、敬酒、送客来排。仪式环节把证婚、交换戒指、改口的顺序提前写在司仪本上。用餐时主桌先动筷，敬酒按桌走，避免来回穿插。布置和灯光尽量提前一天进场彩排，当天只做微调。请柬、席位卡和伴手礼可以同一家做，减少对接次数。合同里写清延期、改期和不可抗力怎么处理，这一点务必当面确认。这些都是参考思路，具体以商家合同和当地习俗为准。" };
  const outside = "对不起，您的问题在我的知识库之外，我只能回答结婚、婚礼、备婚、礼仪、流程、预算思路，以及宾客和座位思路相关问题。";
  const inScope = hasImage || /结婚|婚礼|备婚|礼仪|流程|预算|宾客|座位|婚宴|场地|彩礼|定金|法律|吉日|任务|酒店|婚纱|新郎|新娘|蜜月|请柬|司仪|伴郎|伴娘|证婚|敬酒|改口|宴席|主桌|档期|婚庆|伴手礼|喜糖|迎亲|仪式|展开|写详细|不确定/.test(text) || /wedding|bride|groom|ceremony|guest|venue|budget/i.test(text);
  if (!inScope) return { text: outside };
  let link = "";
  if (/任务|做到哪|下一步/.test(text)) link = "plan";
  else if (/分类|已分配|还剩多少|餐饮现在/.test(text)) link = "budget";
  else if (/谁还没|我的宾客|排座名单/.test(text)) link = "seat";
  const wan = String(text).match(/(\d+(?:\.\d+)?)\s*万/);
  let budgetNote = "";
  if (wan) {
    const stated = Number(wan[1]) * 10000;
    const mine = data.wedding.budgetFen / 100;
    if (stated >= mine * 2) budgetNote = `\n按您提问的标准，您档案中的总预算是 ${budget}，远低于这个标准。`;
  }
  let body = "先把日期、场地和总预算定下来，再往下排人员、礼服和宾客。";
  if (/我的婚礼|档案|总预算是多少|多少人/.test(text)) body = `你的婚礼定在 ${date}，${city}，总预算 ${budget} 元，档案人数 ${people}。`;
  if (hasImage) body = "我看到你发来的图片。先核对三件事：能容纳的人数、交通是否方便、报价里包含哪些项目。";
  if (/场地/.test(text)) body = `选${/北京/.test(text) ? "北京" : city || "当地"}的场地，先问清桌数、档期和报价包含什么，再去现场看动线。`;
  if (/几月|最佳/.test(text) && /婚礼|时间/.test(text)) body = "没有唯一的最佳月份。先看你们的档期、场地空档和亲友是否方便到场。";
  if (/预算一般包含/.test(text)) body = "婚礼预算通常包括场地、餐饮、人员、礼服、摄影摄像、布置和纸品伴手礼。具体金额要向商家逐项询价。";
  if (/座位应该如何/.test(text)) body = "婚宴座位先定主桌，再按亲属和朋友分桌，并留出老人和小孩的位置。";
  if (/加一条任务/.test(text)) { body = "我不能直接改计划书。你可以自己加一条任务，写上名称和截止日期。"; link = "plan"; }
  if (/预算改成/.test(text)) { body = "我不能直接改预算。你可以到预算管理本里改这一项的金额。"; link = "budget"; }
  if (/彩礼/.test(text)) body = "彩礼包含哪些、各地差多少，没有一个可以照搬的金额。\n以上回答仅提供参考，不作为专业意见，建议咨询对应的专业人士。";
  if (/定金|法律/.test(text)) body = "合同和定金是否有效，要看你们签的具体条款。建议咨询律师。\n以上回答仅提供参考，不作为专业意见，建议咨询对应的专业人士。";
  if (/不确定|吉日一定/.test(text)) body = "这一点我不能确定。你可以先问两家场地同一天的空档，再决定。";
  if (/^[A-Za-z0-9\s?,.'!]{8,}$/.test(text)) body = "你可以先列出婚礼当天的顺序：迎接、仪式、用餐、送客。需要的话我再展开每一步。";
  if (/展开|写详细/.test(text)) body = "先定日期和场地，再分预算，然后确定人员、礼服和宾客。每一步都先问清包含的项目，再付钱。";
  if (link === "plan" && !/加一条任务/.test(text)) body = "我看不到你的任务清单。打开备婚计划书就能看到当前阶段和每一项。";
  if (link === "budget" && !/预算改成/.test(text)) body = "我看不到各分类分了多少。打开预算管理本可以看已分配和未分配。";
  if (link === "seat") body = "我看不到宾客名单。打开婚宴座位表可以看谁还没入座。";
  return { text: body + budgetNote, link };
}
function failCopy(kind) {
  if (kind === "timeout") return "对不起，本次回答超时了，请您重试。";
  if (kind === "busy") return "对不起，当前暂时无法回答，请稍后重试。";
  return "对不起，这次没有得到回答，请您重试。";
}
function setChatFeedback(id, value) {
  const { data } = pack();
  const conv = chatList(data).find((item) => item.id === queryNow().c);
  const msg = conv && conv.messages.find((item) => item.id === id);
  if (!msg) return;
  msg.feedback = msg.feedback === value ? "" : value;
  writeData(data);
  render();
}
function openChat(id) {
  ui.pinChat = true;
  ui.editUserMsg = null;
  go("/xiaobei?c=" + id);
}
function beginStream(conv, message) {
  clearChatTimer();
  const { data } = pack();
  const result = chatReply(message.source || "", data, message.hasImage);
  if (result.fail) {
    message.status = "error";
    message.text = failCopy(result.fail);
    message.fail = result.fail;
    conv.updated = chatStamp();
    writeData(data);
    ui.pinChat = true;
    render();
    return;
  }
  const full = result.text;
  let i = 0;
  message.status = "streaming";
  message.text = "";
  message.link = result.link || "";
  writeData(data);
  ui.pinChat = true;
  render();
  ui.chatTimer = setInterval(() => {
    const node = document.querySelector(`[data-msg="${message.id}"] .chat-text`);
    i = Math.min(full.length, i + 2);
    message.text = full.slice(0, i);
    if (node) node.textContent = message.text;
    const stream = document.querySelector(".chat-log");
    if (stream) stream.scrollTop = stream.scrollHeight;
    if (i < full.length) return;
    clearChatTimer();
    message.status = "done";
    const fresh = pack().data;
    const saved = chatList(fresh).find((item) => item.id === conv.id);
    const savedMsg = saved && saved.messages.find((item) => item.id === message.id);
    if (savedMsg) {
      savedMsg.text = full;
      savedMsg.status = "done";
      savedMsg.link = message.link;
      saved.updated = chatStamp();
      writeData(fresh);
    }
    ui.pinChat = true;
    render();
  }, 28);
}
function sendChat(text, images, opts) {
  const { data } = pack();
  const chats = chatList(data);
  const q = queryNow();
  let conv = q.c ? chats.find((item) => item.id === q.c) : null;
  const model = chatModel(conv);
  const trimmed = String(text || "");
  const files = (opts && opts.files) || [];
  const modelText = chatPayload(trimmed, files);
  ui.chatNotice = "";
  if (model === "deepseek-v4-pro" && images.length) {
    ui.chatNotice = "当前模型看不了图片，请改用 Flash 后再发送图片。";
    ui.chatImages = [];
    render();
    return;
  }
  if (![...modelText].length && !images.length) return;
  if ([...modelText].length > CHAT_LIMIT) {
    ui.chatNotice = "您输入的文案太长了，请您缩减后再次发送。";
    render();
    return;
  }
  const titleSeed = trimmed || (files[0] && files[0].name) || "图片";
  if (!conv) {
    conv = { id: uid(), title: titleSeed, titleLocked: false, model: ui.draftModel || "deepseek-flash", updated: chatStamp(), messages: [] };
    chats.unshift(conv);
  }
  conv.model = model;
  let userMsg = opts && opts.replaceUser;
  if (userMsg) {
    userMsg.text = trimmed;
    userMsg.images = images.map((img) => ({ name: img.name }));
    userMsg.files = files.map((file) => ({ name: file.name, text: file.text }));
    const at = conv.messages.findIndex((item) => item.id === userMsg.id);
    conv.messages = conv.messages.slice(0, at + 1);
  } else if (!(opts && opts.retry)) {
    userMsg = { id: uid(), role: "user", text: trimmed, images: images.map((img) => ({ name: img.name })), files: files.map((file) => ({ name: file.name, text: file.text })) };
    conv.messages.push(userMsg);
    if (!conv.titleLocked && conv.messages.filter((item) => item.role === "user").length === 1) conv.title = titleSeed;
  }
  const prior = conv.messages.filter((item) => item.role === "assistant" && item.status === "done").length;
  const assistant = { id: uid(), role: "assistant", text: "", status: "streaming", link: "", earlier: prior >= 4, feedback: "", source: modelText, hasImage: images.length > 0 };
  conv.messages.push(assistant);
  conv.updated = chatStamp();
  ui.chatImages = [];
  ui.chatFiles = [];
  ui.chatDraft = "";
  ui.editUserMsg = null;
  ui.draftModel = conv.model;
  writeData(data);
  if (pathNow() !== "/xiaobei" || queryNow().c !== conv.id) openChat(conv.id);
  beginStream(conv, assistant);
}
function userMessageLong(text) {
  const t = String(text || "");
  return [...t].length > 160 || t.split("\n").length > 4;
}
function chatGlyph(kind) {
  const common = `viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"`;
  if (kind === "copy") return `<svg ${common}><rect x="8" y="8" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M14 8V6.2A2.2 2.2 0 0 0 11.8 4H6.2A2.2 2.2 0 0 0 4 6.2v5.6A2.2 2.2 0 0 0 6.2 14H8" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
  if (kind === "edit") return `<svg ${common}><path d="M4 17.5 14.2 7.3l2.5 2.5L6.5 20H4zM15.4 6.1l2.5 2.5 1.3-1.3-2.5-2.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  if (kind === "like") return `<svg ${common}><path d="M7 11v9H4.8A1.8 1.8 0 0 1 3 18.2V12.8A1.8 1.8 0 0 1 4.8 11H7zm0 0 3.2-6.2A2.2 2.2 0 0 1 12.2 3.6c.9 0 1.6.8 1.6 1.7V8h4.3a2 2 0 0 1 2 2.3l-1.1 7A2 2 0 0 1 17 19H7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  if (kind === "dislike") return `<svg ${common}><path d="M17 13V4h2.2A1.8 1.8 0 0 1 21 5.8v5.4A1.8 1.8 0 0 1 19.2 13H17zm0 0-3.2 6.2A2.2 2.2 0 0 1 11.8 20.4c-.9 0-1.6-.8-1.6-1.7V16H5.9a2 2 0 0 1-2-2.3l1.1-7A2 2 0 0 1 7 5h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  if (kind === "regen") return `<svg ${common}><path d="M4.6 12a7.4 7.4 0 0 1 12.5-5.3L19 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M19 4.8V9h-4.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.4 12a7.4 7.4 0 0 1-12.5 5.3L5 15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M5 19.2V15h4.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if (kind === "down") return `<svg ${common}><path d="M6.5 10.2 12 15.5l5.5-5.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return "";
}
function chatToolBtn(act, id, label, glyph, extra = "") {
  return `<button type="button" data-act="${act}" data-id="${id}" aria-label="${label}" ${extra}>${glyph}<span class="chat-tip">${label}</span></button>`;
}
function bindChatJump() {
  const log = document.querySelector(".chat-log");
  const jump = document.querySelector(".chat-jump-latest");
  const thumb = document.querySelector(".chat-scroll-thumb");
  if (!log || !jump) return;
  const sync = () => {
    jump.hidden = log.scrollHeight - log.scrollTop - log.clientHeight < 56;
    if (!thumb) return;
    const overflow = log.scrollHeight - log.clientHeight;
    if (overflow <= 1) {
      thumb.hidden = true;
      return;
    }
    const track = log.clientHeight;
    const size = Math.max(48, Math.round(track * (log.clientHeight / log.scrollHeight)));
    const travel = Math.max(1, track - size);
    thumb.hidden = false;
    thumb.style.height = size + "px";
    thumb.style.transform = `translateY(${Math.round((log.scrollTop / overflow) * travel)}px)`;
  };
  log.addEventListener("scroll", sync, { passive: true });
  if (thumb) {
    thumb.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const startY = event.clientY;
      const startTop = log.scrollTop;
      const move = (ev) => {
        const overflow = log.scrollHeight - log.clientHeight;
        const travel = Math.max(1, log.clientHeight - thumb.offsetHeight);
        log.scrollTop = startTop + ((ev.clientY - startY) / travel) * overflow;
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
  }
  sync();
}
function renderXiaoBei() {
  const { data } = pack();
  const chats = chatList(data);
  const q = queryNow();
  const conv = q.c ? chats.find((item) => item.id === q.c) : null;
  const messages = conv ? conv.messages : [];
  const empty = messages.length === 0;
  const streaming = messages.some((item) => item.status === "streaming");
  const model = chatModel(conv);
  const ready = ui.chatImages.length > 0 || ui.chatFiles.length > 0 || String(ui.chatDraft || "").trim().length > 0;
  const lastAssistant = [...messages].reverse().find((item) => item.role === "assistant" && item.status === "done");
  const lastUser = [...messages].reverse().find((item) => item.role === "user");
  const linkName = { plan: "备婚计划书", budget: "预算管理本", seat: "婚宴座位表" };
  const linkHref = { plan: "#/plan", budget: "#/budget", seat: "#/seating" };
  const rows = messages.map((item) => {
    if (item.role === "user") {
      const editing = ui.editUserMsg === item.id;
      const pics = (item.images || []).map((img) => `<span class="chat-pic">${esc(img.name || "图片")}</span>`).join("") + (item.files || []).map((file) => `<span class="chat-pic">${esc(file.name || "文件")}</span>`).join("");
      if (editing) {
        const hasMedia = (item.images || []).length || (item.files || []).length;
        return `<form class="chat-turn is-editing" data-form="edit-chat" data-id="${item.id}" data-media="${hasMedia ? "1" : "0"}"><div class="chat-user"><textarea name="chat" aria-label="编辑消息">${esc(item.text)}</textarea><span class="chat-edit-actions"><button class="btn secondary" type="button" data-act="cancel-edit-chat">取消</button><button class="btn primary" type="submit">重新发送</button></span></div></form>`;
      }
      const canEdit = lastUser && lastUser.id === item.id && !streaming;
      const long = userMessageLong(item.text);
      const open = !!(ui.expandUser && ui.expandUser[item.id]);
      const ops = `<span class="chat-turn-ops">${canEdit ? chatToolBtn("edit-chat", item.id, "编辑", chatGlyph("edit")) : ""}${chatToolBtn("copy-chat", item.id, "复制", chatGlyph("copy"))}</span>`;
      const more = long ? `<button class="chat-expand" type="button" data-act="expand-user" data-id="${item.id}">${open ? "收起" : "展开"}</button>` : "";
      return `<div class="chat-turn" data-msg="${item.id}"><div class="chat-user${long && !open ? " is-clip" : ""}"><div class="chat-user-body">${esc(item.text)}</div>${pics}${more}</div>${ops}</div>`;
    }
    if (item.status === "error") {
      return `<div class="chat-bot" data-msg="${item.id}"><p class="chat-text">${esc(item.text)}</p><button class="btn secondary" type="button" data-act="retry-chat" data-id="${item.id}">重试</button></div>`;
    }
    const regen = lastAssistant && lastAssistant.id === item.id ? chatToolBtn("regen-chat", item.id, "重新生成", chatGlyph("regen")) : "";
    const tools = item.status === "done" ? `<span class="chat-tools">${chatToolBtn("like-chat", item.id, "点赞", chatGlyph("like"), `aria-pressed="${item.feedback === "up"}"`)}${chatToolBtn("dislike-chat", item.id, "点踩", chatGlyph("dislike"), `aria-pressed="${item.feedback === "down"}"`)}${chatToolBtn("copy-chat", item.id, "复制", chatGlyph("copy"))}${regen}</span>` : "";
    const jump = item.link ? `<a class="chat-jump" href="${linkHref[item.link]}">${linkName[item.link]}</a>` : "";
    const early = item.earlier ? `<p class="chat-early">更早的内容可能没被这次回答用到</p>` : "";
    return `<div class="chat-bot" data-msg="${item.id}"><p class="chat-text">${esc(item.text)}</p>${jump}${early}${tools}</div>`;
  }).join("");
  const welcome = empty ? `<div class="chat-welcome"><h1>${productLogo()}<span>备备能帮您做什么？</span></h1></div>` : `<div class="chat-log"><div class="chat-stream">${rows}</div></div><div class="chat-scroll-thumb" hidden></div>`;
  const imageShots = ui.chatImages.map((img, index) => `<span class="chat-shot">${img.src ? `<img src="${esc(img.src)}" alt="${esc(img.name || "图片")}">` : `<span class="chat-shot-fallback">${esc(img.name || "图片")}</span>`}<button class="chat-shot-x" type="button" data-act="remove-image" data-index="${index}" aria-label="移除图片">×</button></span>`).join("");
  const fileShots = ui.chatFiles.map((file, index) => `<span class="chat-doc"><span>${esc(file.name || "文件")}</span><button class="chat-shot-x" type="button" data-act="remove-file" data-index="${index}" aria-label="移除文件">×</button></span>`).join("");
  const shots = imageShots + fileShots;
  const plus = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" fill="currentColor"/></svg>`;
  const imageIcon = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="10" r="1.3" fill="currentColor"/><path d="M7 16l3.2-3.2 2.2 2.2L16 11.2 19 15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  const fileIcon = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 3.5h7.2L19 8.2V20.5H7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M14 3.5V8.2H19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  const plusMenu = ui.plusMenu ? `<div class="chat-plus-menu" role="menu"><button type="button" data-act="pick-image">${imageIcon}<span>上传图片</span></button><button type="button" data-act="pick-file">${fileIcon}<span>上传文件</span></button></div>` : "";
  const plusBtn = `<div class="chat-plus-wrap"><button class="chat-plus" type="button" data-act="toggle-plus" aria-label="添加图片、文件等" aria-expanded="${ui.plusMenu ? "true" : "false"}" ${streaming ? "disabled" : ""}>${plus}</button><span class="chat-plus-tip" aria-hidden="true">添加图片、文件等</span>${plusMenu}<input id="chat-file" type="file" accept="image/*,video/*,audio/*" tabindex="-1" ${streaming ? "disabled" : ""}><input id="chat-md" type="file" accept=".md" tabindex="-1" ${streaming ? "disabled" : ""}></div>`;
  const arrow = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 18.5V6.5M7 11.2 12 6.5l5 4.7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const send = streaming
    ? `<button class="chat-send is-stop" type="button" data-act="stop-chat" aria-label="停止"><span></span></button>`
    : `<button class="chat-send" type="submit" aria-label="发送" ${ready ? "" : "disabled"}>${arrow}</button>`;
  const chevron = `<svg class="chat-model-chevron" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2.2 4.2L6 8l3.8-3.8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const check = `<svg class="chat-model-check" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.2 8.2l3 3 6.6-6.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const modelRows = MODEL_OPTIONS.map((item) => `<button class="chat-model-option" type="button" data-act="pick-model" data-model="${item.id}" aria-pressed="${model === item.id}"><span class="chat-model-copy"><span class="chat-model-name">${item.name}</span><span class="chat-model-note">${item.note}</span></span>${model === item.id ? check : ""}</button>`).join("");
  const modelMenu = ui.modelMenu ? `<div class="chat-model-menu" role="listbox">${modelRows}</div>` : "";
  const modelBtn = `<div class="chat-model${ui.modelMenu ? " is-open" : ""}"><button class="chat-model-btn" type="button" data-act="toggle-model" aria-label="切换模型" aria-expanded="${ui.modelMenu ? "true" : "false"}" ${streaming ? "disabled" : ""}><span>${esc(modelName(model))}</span>${chevron}</button><span class="chat-model-tip" aria-hidden="true">切换模型</span>${modelMenu}</div>`;
  const dock = `<form class="chat-dock" data-form="chat"><div class="chat-box">${shots ? `<div class="chat-shots">${shots}</div>` : ""}<textarea name="chat" aria-label="发送给备备" placeholder="向备备提问" ${streaming ? "disabled" : ""}>${esc(ui.chatDraft || "")}</textarea><div class="chat-bar">${plusBtn}<span class="chat-bar-split"></span>${modelBtn}${send}</div></div>${ui.chatNotice ? `<p class="chat-notice">${esc(ui.chatNotice)}</p>` : ""}<p class="chat-note">回答仅供备婚参考，具体以商家合同和当地习俗为准。</p></form>`;
  const jumpLatest = empty ? "" : `<button class="chat-jump-latest" type="button" data-act="jump-latest" aria-label="回到最新" hidden>${chatGlyph("down")}</button>`;
  app.innerHTML = shell(`<div class="chat-page${empty ? " is-empty" : ""}">${welcome}<div class="chat-foot">${jumpLatest}${dock}</div></div>`, "/xiaobei");
  const field = document.querySelector("form[data-form=chat] textarea");
  if (field) sizeChatField(field);
  bindChatJump();
}
function sizeEditField(el) {
  const line = 22;
  const max = line * 10;
  el.style.height = "0px";
  const needed = el.scrollHeight;
  el.style.height = Math.min(max, Math.max(line, needed)) + "px";
  el.style.overflowY = needed > max ? "auto" : "hidden";
}
function sizeChatField(el) {
  const line = 24;
  const min = line * 2;
  const max = line * 7;
  el.style.height = "0px";
  const needed = el.scrollHeight;
  el.style.height = Math.min(max, Math.max(min, needed)) + "px";
  el.style.overflowY = needed > max ? "auto" : "hidden";
}
function scrollKey(node) {
  if (node === document.scrollingElement) return "page";
  if (node.classList.contains("content-scroll")) return "content";
  if (node.classList.contains("chat-log")) return "chat";
  if (node.classList.contains("guest-sections")) return "guests";
  if (node.classList.contains("roster-table")) return "roster";
  if (node.classList.contains("drawer-sheet")) return "drawer";
  return "";
}
function scrollNodes() {
  return [document.scrollingElement, document.querySelector(".content-scroll"), document.querySelector(".chat-log"), document.querySelector(".drawer-sheet"), document.querySelector(".guest-sections"), document.querySelector(".roster-table")].filter((node) => node && scrollKey(node));
}
function captureScroll() {
  return scrollNodes().map((node) => ({ key: scrollKey(node), top: node.scrollTop, left: node.scrollLeft }));
}
function restoreScroll(saved) {
  const nodes = scrollNodes();
  saved.forEach((item) => {
    const node = nodes.find((n) => scrollKey(n) === item.key);
    if (!node) return;
    node.scrollTop = item.top;
    node.scrollLeft = item.left;
  });
}
function render() {
  const path = pathNow();
  const { user, data } = pack();
  const pub = ["/login", "/register", "/reset-password"].includes(path);
  if (!user && !pub) { go("/login"); return; }
  if (user && !data.wedding && path !== "/wedding/new" && path !== "/login") { go("/wedding/new"); return; }
  if (user && data.wedding && (path === "/login" || path === "/register")) { go("/plan"); return; }
  ui.msgOk = path === "/login" && ui.msgOk;
  if (path !== "/plan") {
    ui.confirmDelete = null;
    ui.confirmStage = null;
    ui.editStage = null;
  }
  if (path !== "/wedding") {
    ui.confirmPhoto = null;
    ui.photoNotice = "";
    ui.replacePhoto = null;
    ui.drawerShown = false;
    ui.archiveFocused = false;
    archiveClosing = false;
  }
  if (path !== "/budget") ui.addCat = false;
  if (path !== "/xiaobei") { ui.modelMenu = false; ui.plusMenu = false; }
  const paintKey = path === "/xiaobei" ? location.hash : path;
  const saved = paintedPath === paintKey ? captureScroll() : null;
  if (path === "/login") renderLogin();
  else if (path === "/register") renderRegister();
  else if (path === "/reset-password") renderReset();
  else if (path === "/wedding/new") renderCreate();
  else if (path === "/wedding") renderArchiveHost();
  else if (path === "/plan") renderPlan();
  else if (path === "/budget") renderBudget();
  else if (path === "/seating") renderSeating();
  else if (path === "/xiaobei") renderXiaoBei();
  else { go(user ? "/plan" : "/login"); return; }
  paintedPath = paintKey;
  if (path === "/wedding" && !ui.archiveFocused && queryNow().focus === "budget") {
    ui.archiveFocused = true;
    const budget = document.getElementById("budget");
    if (budget) budget.focus({ preventScroll: true });
  }
  if (path === "/wedding" && !archiveClosing) {
    const sheet = document.querySelector(".drawer-sheet");
    if (sheet && !sheet.classList.contains("is-shown")) animateDrawer(sheet, 1, 0);
  }
  if (ui.pinChat) {
    ui.pinChat = false;
    const stream = document.querySelector(".chat-stream, .chat-log");
    if (stream) stream.scrollTop = stream.scrollHeight;
  } else if (saved) restoreScroll(saved);
  else if (path === "/xiaobei") {
    const stream = document.querySelector(".chat-log");
    if (stream) stream.scrollTop = stream.scrollHeight;
  }
  if (ui.renameChat) {
    const input = document.querySelector('form[data-form="rename-chat"] textarea[name="title"]');
    if (input) { input.focus(); input.select(); }
  }
  const editBox = document.querySelector('form[data-form="edit-chat"] textarea[name="chat"]');
  if (editBox) {
    sizeEditField(editBox);
    editBox.focus();
    const end = editBox.value.length;
    editBox.setSelectionRange(end, end);
  }
  if (document.querySelector(".nav")) slideNavIndicator();
  else navIndex = -1;
}

function slideNavIndicator() {
  const nav = document.querySelector(".nav");
  const indicator = nav && nav.querySelector(".nav-indicator");
  const current = nav && nav.querySelector("a.current");
  if (!indicator) return;
  if (!current) {
    indicator.classList.add("is-off");
    navIndex = -1;
    return;
  }
  indicator.classList.remove("is-off");
  const links = [...nav.querySelectorAll("a")];
  const next = links.indexOf(current);
  const y = current.offsetTop;
  const from = navIndex;
  navIndex = next;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || from < 0 || from === next) {
    indicator.style.transition = "none";
    indicator.style.transform = `translateY(${y}px)`;
    return;
  }
  const fromY = links[from] ? links[from].offsetTop : y;
  indicator.style.transition = "none";
  indicator.style.transform = `translateY(${fromY}px)`;
  indicator.getBoundingClientRect();
  indicator.style.transition = "";
  indicator.style.transform = `translateY(${y}px)`;
}

function showError(form, name, text) {
  const input = form.elements[name];
  if (!input) return;
  input.classList.add("invalid");
  const host = input.closest(".field") || input.parentElement;
  let node = host.querySelector(".error");
  if (!node) {
    node = document.createElement("div");
    node.className = "error";
    host.appendChild(node);
  }
  node.textContent = text;
}
function clearErrors(form) {
  form.querySelectorAll(".error").forEach((n) => n.remove());
  form.querySelectorAll(".invalid").forEach((n) => n.classList.remove("invalid"));
}
async function pause(btn) {
  ui.saving = true;
  if (btn) { btn.disabled = true; btn.textContent = "正在保存"; }
  await new Promise((r) => setTimeout(r, 250));
  ui.saving = false;
}

function readWedding(form) {
  const fd = new FormData(form);
  const values = {
    startDate: String(fd.get("startDate") || ""),
    weddingDate: String(fd.get("weddingDate") || ""),
    city: String(fd.get("city") || "").trim(),
    budget: String(fd.get("budget") || "").trim(),
    headcount: String(fd.get("headcount") || "").trim()
  };
  const missing = [];
  if (!values.startDate) missing.push(["startDate", "请填写开始备婚日期"]);
  if (!values.weddingDate) missing.push(["weddingDate", "请填写婚礼日期"]);
  if (!values.city) missing.push(["city", "请填写城市"]);
  const fen = toFen(values.budget);
  if (fen == null || values.budget === "") missing.push(["budget", "请填写总预算"]);
  if (values.headcount === "" || Number.isNaN(Number(values.headcount))) missing.push(["headcount", "请填写总人数"]);
  return { values, fen, missing };
}
function readCouple(form) {
  if (!form.elements.groomName) return { couple: null, missing: [] };
  return {
    couple: {
      groomName: String(form.elements.groomName.value || "").trim(),
      brideName: String(form.elements.brideName.value || "").trim(),
      groomBirthday: String(form.elements.groomBirthday.value || ""),
      brideBirthday: String(form.elements.brideBirthday.value || "")
    },
    missing: []
  };
}

const actions = {
  "fold-nav"() {
    ui.navFolded = !ui.navFolded;
    const side = document.querySelector(".side");
    if (!side) { render(); return; }
    const btn = side.querySelector(".nav-fold");
    if (btn) {
      btn.setAttribute("aria-expanded", ui.navFolded ? "false" : "true");
      btn.setAttribute("aria-label", ui.navFolded ? "展开侧栏" : "折叠侧栏");
      btn.innerHTML = foldIcon(ui.navFolded);
    }
    side.querySelectorAll(".chat-side, .me, .side-foot").forEach((node) => {
      if (ui.navFolded) {
        node.setAttribute("aria-hidden", "true");
        node.setAttribute("inert", "");
      } else {
        node.removeAttribute("aria-hidden");
        node.removeAttribute("inert");
      }
    });
    const tools = side.querySelector(".side-tools");
    if (tools) {
      if (ui.navFolded) {
        tools.removeAttribute("aria-hidden");
        tools.removeAttribute("inert");
      } else {
        tools.setAttribute("aria-hidden", "true");
        tools.setAttribute("inert", "");
      }
    }
    side.classList.toggle("is-folded", ui.navFolded);
  },
  "toggle-password"(btn) {
    const input = btn.parentElement.querySelector("input");
    if (!input) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.textContent = show ? "隐藏" : "显示";
    btn.setAttribute("aria-pressed", show ? "true" : "false");
    btn.setAttribute("aria-label", show ? "隐藏密码" : "显示密码");
    input.focus();
  },
  "reset-demo"() {
    memory = { users: [], data: {} };
    localStorage.removeItem("wm-proto-v1");
    localStorage.removeItem("wm-remember");
    sessionStorage.removeItem("wm-session");
    ui.msg = "";
    go("/login");
  },
  logout() {
    ui.confirmLogout = true;
    render();
  },
  "cancel-logout"() {
    ui.confirmLogout = false;
    render();
  },
  "confirm-logout"() {
    ui.confirmLogout = false;
    setSession("", false);
    ui.msg = "";
    go("/login");
  },
  "send-code"(btn) {
    const form = btn.closest("form");
    const phone = form.elements.phone.value.trim();
    clearErrors(form);
    if (!phone) { showError(form, "phone", "请填写手机号"); return; }
    const store = loadStore();
    if (!store.users.some((u) => u.phone === phone)) { showError(form, "phone", "没有找到绑定这个手机号的账号"); return; }
    ui.codeUntil = Date.now() + 60000;
    ui.msg = "";
    render();
  },
  back() {
    closeArchive();
  },
  "toggle-archive"(btn) {
    if (pathNow() === "/wedding") { closeArchive(); return; }
    go((btn.getAttribute("href") || "#/plan").replace(/^#/, ""));
  },
  "delete-photo"(btn) {
    ui.confirmPhoto = btn.dataset.id;
    render();
  },
  "cancel-photo"() {
    ui.confirmPhoto = null;
    render();
  },
  "confirm-photo"() {
    const id = ui.confirmPhoto;
    ui.confirmPhoto = null;
    const { data } = pack();
    data.photos = (data.photos || []).filter((photo) => photo.id !== id);
    ui.photoNotice = "";
    writeData(data);
    render();
  },
  "replace-photo"(btn) {
    ui.replacePhoto = btn.dataset.id;
    const input = document.getElementById("archive-photo");
    if (input) input.click();
  },
  "pick-photo"() {
    ui.replacePhoto = null;
    const input = document.getElementById("archive-photo");
    if (input) input.click();
  },
  "new-chat"() {
    clearChatTimer();
    ui.chatImages = [];
    ui.chatFiles = [];
    ui.chatNotice = "";
    ui.editUserMsg = null;
    ui.draftModel = "deepseek-flash";
    ui.modelMenu = false;
    ui.plusMenu = false;
    ui.chatDraft = "";
    ui.chatMenu = null;
    if (pathNow() === "/xiaobei" && queryNow().new) render();
    else go("/xiaobei?new=1");
  },
  "toggle-chat-menu"(btn) {
    ui.chatMenu = ui.chatMenu === btn.dataset.id ? null : btn.dataset.id;
    ui.renameChat = ui.chatMenu ? null : ui.renameChat;
    render();
  },
  "rename-chat"(btn) { ui.renameChat = btn.dataset.id; ui.chatMenu = null; render(); },
  "cancel-rename"() { ui.renameChat = null; render(); },
  "ask-delete-chat"(btn) { ui.confirmChat = btn.dataset.id; ui.chatMenu = null; render(); },
  "cancel-chat"() { ui.confirmChat = null; render(); },
  "confirm-chat"() {
    const id = ui.confirmChat;
    ui.confirmChat = null;
    const { data } = pack();
    const chats = chatList(data);
    const wasCurrent = queryNow().c === id;
    data.chats = chats.filter((item) => item.id !== id);
    writeData(data);
    if (wasCurrent) go("/xiaobei?new=1");
    else render();
  },
  "toggle-model"() {
    ui.modelMenu = !ui.modelMenu;
    if (ui.modelMenu) ui.plusMenu = false;
    render();
  },
  "toggle-plus"() {
    ui.plusMenu = !ui.plusMenu;
    if (ui.plusMenu) ui.modelMenu = false;
    render();
  },
  "pick-image"() {
    ui.plusMenu = false;
    render();
    const input = document.getElementById("chat-file");
    if (input) input.click();
  },
  "pick-file"() {
    ui.plusMenu = false;
    render();
    const input = document.getElementById("chat-md");
    if (input) input.click();
  },
  "remove-file"(btn) {
    ui.chatFiles.splice(Number(btn.dataset.index), 1);
    render();
  },
  "pick-model"(btn) {
    const value = btn.dataset.model;
    const { data } = pack();
    const conv = chatList(data).find((item) => item.id === queryNow().c);
    if (conv) { conv.model = value; writeData(data); }
    else ui.draftModel = value;
    ui.modelMenu = false;
    if (value === "deepseek-v4-pro" && ui.chatImages.length) {
      ui.chatImages = [];
      ui.chatNotice = "当前模型看不了图片，请改用 Flash 后再发送图片。";
    }
    render();
  },
  "remove-image"(btn) {
    ui.chatImages.splice(Number(btn.dataset.index), 1);
    render();
  },
  "stop-chat"() {
    clearChatTimer();
    const { data } = pack();
    const conv = chatList(data).find((item) => item.id === queryNow().c);
    if (!conv) return;
    const msg = conv.messages.find((item) => item.status === "streaming");
    if (!msg) return;
    if (!msg.text) conv.messages = conv.messages.filter((item) => item.id !== msg.id);
    else msg.status = "done";
    conv.updated = chatStamp();
    writeData(data);
    ui.pinChat = true;
    render();
  },
  "retry-chat"(btn) {
    const { data } = pack();
    const conv = chatList(data).find((item) => item.messages.some((msg) => msg.id === btn.dataset.id));
    if (!conv) return;
    const at = conv.messages.findIndex((msg) => msg.id === btn.dataset.id);
    const prev = conv.messages[at - 1];
    conv.messages.splice(at, 1);
    writeData(data);
    sendChat(prev ? prev.text : "", (prev && prev.images) || [], { retry: true, files: (prev && prev.files) || [] });
  },
  "regen-chat"(btn) {
    const { data } = pack();
    const conv = chatList(data).find((item) => item.messages.some((msg) => msg.id === btn.dataset.id));
    if (!conv) return;
    const at = conv.messages.findIndex((msg) => msg.id === btn.dataset.id);
    const prev = conv.messages[at - 1];
    conv.messages.splice(at, 1);
    writeData(data);
    sendChat(prev ? prev.text : "", (prev && prev.images) || [], { retry: true, files: (prev && prev.files) || [] });
  },
  "edit-chat"(btn) { ui.editUserMsg = btn.dataset.id; render(); },
  "cancel-edit-chat"() { ui.editUserMsg = null; render(); },
  "copy-chat"(btn) {
    const { data } = pack();
    const conv = chatList(data).find((item) => item.id === queryNow().c);
    const msg = conv && conv.messages.find((item) => item.id === btn.dataset.id);
    if (msg && navigator.clipboard) navigator.clipboard.writeText(msg.text);
  },
  "expand-user"(btn) {
    ui.expandUser[btn.dataset.id] = !ui.expandUser[btn.dataset.id];
    render();
  },
  "jump-latest"() {
    const log = document.querySelector(".chat-log");
    if (log) log.scrollTop = log.scrollHeight;
  },
  "like-chat"(btn) { setChatFeedback(btn.dataset.id, "up"); },
  "dislike-chat"(btn) { setChatFeedback(btn.dataset.id, "down"); },
  fold(btn) {
    const id = btn.dataset.id;
    const { data } = pack();
    const current = currentStage(data.wedding.weddingDate, todayStr());
    const collapsed = ui.collapsed[id] !== undefined ? ui.collapsed[id] : id !== current;
    const next = !collapsed;
    ui.collapsed[id] = next;
    const section = btn.closest(".section");
    if (!section) { render(); return; }
    section.classList.remove("no-motion");
    void section.offsetWidth;
    section.classList.toggle("is-collapsed", next);
    btn.setAttribute("aria-expanded", next ? "false" : "true");
    const arrow = section.querySelector(".fold-arrow");
    if (arrow) {
      arrow.setAttribute("aria-expanded", next ? "false" : "true");
      arrow.setAttribute("aria-label", next ? "展开" : "收起");
    }
    const body = section.querySelector(".stage-body");
    if (body) body.inert = next;
  },
  "add-task"(btn) {
    const stageId = btn.dataset.id;
    const { data } = pack();
    const task = { id: uid(), name: "新任务", stage: stageId, due: todayStr(), status: "未开始", note: "", lockedDue: true };
    const at = data.tasks.findIndex((t) => t.stage === stageId);
    if (at >= 0) data.tasks.splice(at, 0, task);
    else data.tasks.push(task);
    writeData(data);
    ui.editTask = task.id;
    ui.collapsed[stageId] = false;
    render();
  },
  "edit-task"(btn) { ui.editTask = btn.dataset.id; render(); },
  "edit-stage"(btn) { ui.editStage = btn.dataset.id; render(); },
  "add-stage"() {
    const { data } = pack();
    const stage = { id: uid(), name: "新阶段" };
    data.stages.push(stage);
    writeData(data);
    ui.editStage = stage.id;
    ui.collapsed[stage.id] = false;
    render();
  },
  "delete-stage"(btn) {
    ui.confirmStage = btn.dataset.id;
    render();
  },
  "delete-task"(btn) {
    ui.confirmDelete = btn.dataset.id;
    render();
  },
  "cancel-delete"() {
    ui.confirmDelete = null;
    ui.confirmStage = null;
    render();
  },
  "confirm-delete"() {
    const taskId = ui.confirmDelete;
    const stageId = ui.confirmStage;
    ui.confirmDelete = null;
    ui.confirmStage = null;
    const { data } = pack();
    if (stageId) {
      data.stages = data.stages.filter((stage) => stage.id !== stageId);
      data.tasks = data.tasks.filter((task) => task.stage !== stageId);
      if (ui.editStage === stageId) ui.editStage = null;
      writeData(data);
      render();
      return;
    }
    if (!taskId) { render(); return; }
    data.tasks = data.tasks.filter((t) => t.id !== taskId);
    writeData(data);
    render();
  },
  status(btn) {
    const { data } = pack();
    const task = data.tasks.find((t) => t.id === btn.dataset.id);
    task.status = btn.value;
    writeData(data);
    render();
  },
  "open-new-cat"() { ui.addCat = true; render(); },
  "close-new-cat"() { ui.addCat = false; render(); },
  "open-cat"(btn) { ui.openCat = ui.openCat === btn.dataset.id ? null : btn.dataset.id; render(); },
  "delete-cat"(btn) {
    const { data } = pack();
    data.categories = data.categories.filter((c) => c.id !== btn.dataset.id);
    if (ui.openCat === btn.dataset.id) ui.openCat = null;
    writeData(data);
    render();
  },
  "toggle-paste"() { ui.paste = !ui.paste; render(); },
  "open-add"() { ui.addGuest = true; ui.roster = false; ui.addDraft = ""; ui.addGroup = ""; ui.addAttend = "待定"; ui.addSeq = ""; ui.newGroup = false; render(); },
  "close-add"() { ui.addGuest = false; ui.addDraft = ""; ui.addGroup = ""; ui.addAttend = "待定"; ui.addSeq = ""; ui.newGroup = false; render(); },
  "open-roster"() { ui.roster = true; ui.addGuest = false; render(); },
  "close-roster"() { ui.roster = false; ui.editGuest = null; ui.rosterQuery = ""; ui.rosterType = ""; ui.rosterAttendFilter = ""; ui.rosterDraftQuery = ""; ui.rosterDraftType = ""; ui.rosterDraftAttend = ""; render(); },
  "roster-apply"() {
    ui.rosterQuery = ui.rosterDraftQuery;
    ui.rosterType = ui.rosterDraftType;
    ui.rosterAttendFilter = ui.rosterDraftAttend;
    render();
  },
  "roster-reset"() {
    ui.rosterQuery = "";
    ui.rosterType = "";
    ui.rosterAttendFilter = "";
    ui.rosterDraftQuery = "";
    ui.rosterDraftType = "";
    ui.rosterDraftAttend = "";
    render();
  },
  "do-paste"() {
    const text = document.querySelector("textarea[name=paste]").value;
    const { data } = pack();
    text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
      const parts = line.split(/[\s,，]+/);
      const name = parts[0];
      const group = data.groups.includes(parts[1]) ? parts[1] : PRESET_GROUPS[0];
      data.guests.push({ id: uid(), name, group, attendance: "待定", note: "", tableId: null, seq: 0 });
    });
    writeData(data);
    ui.paste = false;
    render();
  },
  search(el) { ui.search = el.value; const list = document.querySelector(".pool-list"); if (!list) return; render(); const again = document.querySelector("[data-act=search]"); if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); } },
  filter(el) { ui.filter = el.value; render(); },
  zoom(btn) {
    const { data } = pack();
    const next = Math.min(2, Math.max(0.5, data.canvas.scale + Number(btn.dataset.dir) * 0.1));
    data.canvas.scale = Math.round(next * 100) / 100;
    writeData(data);
    render();
  },
  "add-table"() {
    const { data } = pack();
    const n = data.tables.length + 1;
    data.tables.push({ id: uid(), name: `第 ${n} 桌`, capacity: 10, x: 40 + (n % 4) * 200, y: 40 + Math.floor(n / 4) * 180, main: false });
    writeData(data);
    render();
  },
  main(btn) {
    const { data } = pack();
    data.tables.forEach((t) => { t.main = t.id === btn.dataset.id; });
    writeData(data);
    render();
  },
  "delete-table"(btn) {
    const { data } = pack();
    data.guests.forEach((g) => { if (g.tableId === btn.dataset.id) g.tableId = null; });
    data.tables = data.tables.filter((t) => t.id !== btn.dataset.id);
    writeData(data);
    render();
  },
  unseat(btn) {
    const { data } = pack();
    const guest = data.guests.find((g) => g.id === btn.dataset.id);
    if (guest) guest.tableId = null;
    writeData(data);
    render();
  },
  "delete-guest"(btn) {
    const { data } = pack();
    const before = data.guests.length;
    data.guests = data.guests.filter((g) => g.id !== btn.dataset.id);
    if (data.guests.length === before) return;
    if (ui.editGuest === btn.dataset.id) ui.editGuest = null;
    writeData(data);
    render();
  },
  "edit-guest"(btn) {
    const { data } = pack();
    const guest = data.guests.find((g) => g.id === btn.dataset.id);
    if (!guest) return;
    ui.editGuest = guest.id;
    ui.editDraft = guest.name;
    ui.editGroup = guest.group;
    ui.editAttend = guest.attendance || "待定";
    ui.editSeq = String(guestSeq(guest.seq));
    ui.editNewGroup = false;
    render();
  },
  "close-edit"() { ui.editGuest = null; ui.editNewGroup = false; render(); }
};

app.addEventListener("submit", async (e) => {
  const form = e.target.closest("form");
  if (!form) return;
  e.preventDefault();
  clearErrors(form);
  const kind = form.dataset.form;
  const btn = form.querySelector("button[type=submit]");
  if (kind === "login") {
    const username = form.username.value.trim();
    const password = form.password.value;
    if (!username || !password) {
      if (!username) showError(form, "username", "请填写用户名");
      if (!password) showError(form, "password", "请填写密码");
      return;
    }
    await pause(btn);
    const store = loadStore();
    const user = store.users.find((u) => u.username === username && u.password === password);
    if (!user) { ui.saving = false; showError(form, "password", "用户名或密码不正确"); return; }
    setSession(username, form.remember.checked);
    ui.msg = "";
    go(store.data[username].wedding ? "/plan" : "/wedding/new");
  }
  if (kind === "register") {
    const username = form.username.value.trim();
    const password = form.password.value;
    const phone = form.phone.value.trim();
    if (!username) showError(form, "username", "请填写用户名");
    if (!validPassword(password)) showError(form, "password", "密码需同时包含大写字母、小写字母和数字");
    if (!phone) showError(form, "phone", "请填写手机号");
    if (!username || !validPassword(password) || !phone) return;
    const store = loadStore();
    if (store.users.some((u) => u.username === username)) { showError(form, "username", "这个用户名已经注册"); return; }
    if (store.users.some((u) => u.phone === phone)) { showError(form, "phone", "这个手机号已经注册"); return; }
    await pause(btn);
    store.users.push({ username, password, phone });
    store.data[username] = emptyData();
    saveStore(store);
    setSession(username, false);
    go("/wedding/new");
  }
  if (kind === "reset") {
    const phone = form.phone.value.trim();
    const code = form.code.value.trim();
    const password = form.password.value;
    if (!phone) showError(form, "phone", "请填写手机号");
    if (code !== "123456") showError(form, "code", "验证码不正确");
    if (!validPassword(password)) showError(form, "password", "密码需同时包含大写字母、小写字母和数字");
    if (!phone || code !== "123456" || !validPassword(password)) return;
    const store = loadStore();
    const user = store.users.find((u) => u.phone === phone);
    if (!user) { showError(form, "phone", "没有找到绑定这个手机号的账号"); return; }
    await pause(btn);
    user.password = password;
    saveStore(store);
    ui.msg = "密码已更新，请用新密码登录";
    ui.msgOk = true;
    go("/login");
  }
  if (kind === "create" || kind === "archive") {
    const { fen, missing } = readWedding(form);
    const coupleRead = readCouple(form);
    missing.concat(coupleRead.missing).forEach(([name, text]) => showError(form, name, text));
    if (missing.length || coupleRead.missing.length) return;
    await pause(btn);
    const fd = new FormData(form);
    const { data } = pack();
    const prev = data.wedding ? data.wedding.weddingDate : "";
    const kept = data.wedding || {};
    const couple = coupleRead.couple || {
      groomName: kept.groomName || "",
      brideName: kept.brideName || "",
      groomBirthday: kept.groomBirthday || "",
      brideBirthday: kept.brideBirthday || ""
    };
    const preference = form.elements.preference ? String(form.elements.preference.value || "") : (kept.preference || "");
    data.wedding = {
      startDate: String(fd.get("startDate")),
      weddingDate: String(fd.get("weddingDate")),
      city: String(fd.get("city")).trim(),
      budgetFen: fen,
      headcount: Number(fd.get("headcount")),
      groomName: couple.groomName,
      brideName: couple.brideName,
      groomBirthday: couple.groomBirthday,
      brideBirthday: couple.brideBirthday,
      preference
    };
    if (kind === "create") {
      data.stages = defaultStages();
      data.tasks = buildTasks(data.wedding.weddingDate);
    } else if (prev && prev !== data.wedding.weddingDate) recalcTasks(data);
    writeData(data);
    if (kind === "create") go("/plan");
    else closeArchive();
  }
  if (kind === "chat") {
    const text = form.chat.value;
    if (!text.trim() && !ui.chatImages.length && !ui.chatFiles.length) return;
    sendChat(text, ui.chatImages.slice(), { files: ui.chatFiles.slice() });
    return;
  }
  if (kind === "edit-chat") {
    const { data } = pack();
    const conv = chatList(data).find((item) => item.id === queryNow().c);
    const userMsg = conv && conv.messages.find((item) => item.id === form.dataset.id);
    if (!userMsg) return;
    sendChat(form.chat.value, userMsg.images || [], { replaceUser: userMsg, files: userMsg.files || [] });
    return;
  }
  if (kind === "rename-chat") {
    const { data } = pack();
    const conv = chatList(data).find((item) => item.id === form.dataset.id);
    const title = form.title.value.trim();
    if (!conv || !title) return;
    if (title === conv.title) {
      ui.renameChat = null;
      render();
      return;
    }
    if ([...title].length > TITLE_CUSTOM_LIMIT) return;
    conv.title = title;
    conv.titleLocked = true;
    writeData(data);
    ui.renameChat = null;
    render();
    return;
  }
  if (kind === "stage") {
    const name = form.name.value.trim();
    if (!name) { showError(form, "name", "请填写阶段名称"); return; }
    const { data } = pack();
    const stage = data.stages.find((item) => item.id === form.dataset.id);
    if (stage) stage.name = name;
    writeData(data);
    ui.editStage = null;
    render();
    return;
  }
  if (kind === "task") {
    const { data } = pack();
    const task = data.tasks.find((t) => t.id === form.dataset.id);
    task.name = form.name.value.trim() || task.name;
    writeData(data);
    ui.editTask = null;
    render();
  }
  if (kind === "cat") {
    const { data } = pack();
    const cat = data.categories.find((c) => c.id === form.dataset.id);
    const fen = toFen(form.amount.value);
    if (fen == null) { showError(form, "amount", "请填写金额"); return; }
    cat.amountFen = fen;
    cat.note = form.note.value.trim();
    cat.status = form.status.value;
    writeData(data);
    ui.openCat = null;
    render();
  }
  if (kind === "new-cat") {
    const name = form.name.value.trim();
    if (!name) { showError(form, "name", "请填写预算名称"); return; }
    const fen = toFen(form.amount.value);
    if (fen == null) { showError(form, "amount", "请填写金额"); return; }
    const { data } = pack();
    data.categories.push({ id: uid(), name, amountFen: fen, note: form.note.value.trim(), status: form.status.value || "未确定", colorIndex: data.categories.length % CAT_COLORS.length });
    ui.addCat = false;
    writeData(data);
    render();
  }
  if (kind === "guest") {
    const name = form.name.value.trim();
    if (!name) { showError(form, "name", "请填写姓名"); return; }
    const { data } = pack();
    let group = form.group.value;
    if (group === "__new") {
      group = form.newGroup.value.trim();
      if (!group) { showError(form, "newGroup", "请填写分组名称"); return; }
      if (!data.groups.includes(group)) data.groups.push(group);
    }
    data.guests.push({ id: uid(), name, group, attendance: form.attendance.value || "待定", note: "", tableId: null, seq: guestSeq(form.seq.value) });
    ui.addGuest = false;
    ui.newGroup = false;
    ui.addDraft = "";
    ui.addGroup = "";
    ui.addAttend = "待定";
    ui.addSeq = "";
    writeData(data);
    render();
  }
  if (kind === "edit-guest") {
    const name = form.name.value.trim();
    if (!name) { showError(form, "name", "请填写姓名"); return; }
    const { data } = pack();
    const guest = data.guests.find((g) => g.id === ui.editGuest);
    if (!guest) { ui.editGuest = null; render(); return; }
    let group = form.group.value;
    if (group === "__new") {
      group = form.newGroup.value.trim();
      if (!group) { showError(form, "newGroup", "请填写分组名称"); return; }
      if (!data.groups.includes(group)) data.groups.push(group);
    }
    guest.name = name;
    guest.group = group;
    guest.attendance = form.attendance.value || "待定";
    guest.seq = guestSeq(form.seq.value);
    ui.editGuest = null;
    ui.editNewGroup = false;
    writeData(data);
    render();
  }
});

function clearZeroAmount(el) {
  if (!el || !el.matches || !el.matches("form[data-form=cat] input[name=amount], form[data-form=new-cat] input[name=amount]")) return;
  if (el.dataset.cleared) return;
  el.dataset.cleared = "1";
  const n = Number(String(el.value).replace(/,/g, ""));
  if (n === 0) el.value = "";
}
app.addEventListener("pointerdown", (e) => clearZeroAmount(e.target));
app.addEventListener("focusin", (e) => clearZeroAmount(e.target));
app.addEventListener("change", (e) => {
  const el = e.target;
  if (el.id === "archive-photo") {
    const file = el.files && el.files[0];
    const replaceId = ui.replacePhoto;
    ui.replacePhoto = null;
    el.value = "";
    if (!file) return;
    const { data } = pack();
    fitWeddingPhoto(file).then((result) => {
      if (result.error) {
        ui.photoNotice = result.error;
        render();
        return;
      }
      ui.photoNotice = storeWeddingPhoto(data, result.src, replaceId);
      render();
    });
    return;
  }
  if (el.id === "chat-file") {
    const file = el.files && el.files[0];
    el.value = "";
    if (!file) return;
    const { data } = pack();
    const conv = chatList(data).find((item) => item.id === queryNow().c);
    if (chatModel(conv) === "deepseek-v4-pro") {
      ui.chatImages = [];
      ui.chatNotice = "当前模型看不了图片，请改用 Flash 后再发送图片。";
      render();
      return;
    }
    const ok = ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type);
    if (!ok) return;
    if (!file.size) {
      ui.chatNotice = "您上传的图片无法识别，请换一张再发送。";
      render();
      return;
    }
    if (file.size > IMAGE_LIMIT) {
      ui.chatNotice = "您上传的图片超过5M，请压缩后再发送。";
      render();
      return;
    }
    ui.chatNotice = "";
    const reader = new FileReader();
    reader.onload = () => {
      ui.chatImages.push({ name: file.name || "图片", src: String(reader.result || "") });
      render();
    };
    reader.readAsDataURL(file);
    return;
  }
  if (el.id === "chat-md") {
    const file = el.files && el.files[0];
    el.value = "";
    if (!file) return;
    if (!/\.md$/i.test(file.name || "")) {
      ui.chatNotice = "只能上传 md 格式的文件。";
      render();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "").replace(/^\uFEFF/, "");
      if (!text.trim()) {
        ui.chatNotice = "这份 Markdown 没有可发送的文字。";
        render();
        return;
      }
      const next = ui.chatFiles.concat([{ name: file.name, text }]);
      if ([...chatPayload(ui.chatDraft, next)].length > CHAT_LIMIT) {
        ui.chatNotice = "您输入的文案太长了，请您缩减后再次发送。";
        render();
        return;
      }
      ui.chatNotice = "";
      ui.chatFiles = next;
      ui.plusMenu = false;
      render();
    };
    reader.readAsText(file);
    return;
  }
  if (el.dataset.act === "status") actions.status(el);
  if (el.dataset.act === "due") {
    const { data } = pack();
    const task = data.tasks.find((t) => t.id === el.dataset.id);
    if (!task || !el.value) return;
    if (el.value !== task.due) task.lockedDue = true;
    task.due = el.value;
    writeData(data);
    render();
  }
  if (el.dataset.act === "filter") actions.filter(el);
  if (el.dataset.act === "roster-type") ui.rosterDraftType = el.value;
  if (el.dataset.act === "roster-attend") ui.rosterDraftAttend = el.value;
  if (el.name === "group" && el.form && el.form.dataset.form === "guest") {
    ui.addDraft = el.form.name.value;
    ui.addAttend = el.form.attendance.value || "待定";
    ui.addSeq = el.form.seq.value;
    ui.addGroup = el.value;
    const nextNew = el.value === "__new";
    if (nextNew !== ui.newGroup) {
      ui.newGroup = nextNew;
      render();
    }
  }
  if (el.name === "group" && el.form && el.form.dataset.form === "edit-guest") {
    ui.editDraft = el.form.name.value;
    ui.editAttend = el.form.attendance.value || "待定";
    ui.editSeq = el.form.seq.value;
    ui.editGroup = el.value;
    const nextNew = el.value === "__new";
    if (nextNew !== ui.editNewGroup) {
      ui.editNewGroup = nextNew;
      render();
    }
  }
  if (el.dataset.act === "rename" || el.dataset.act === "capacity") {
    const { data } = pack();
    const table = data.tables.find((t) => t.id === el.dataset.id);
    if (!table) return;
    if (el.dataset.act === "rename") table.name = el.value.trim() || table.name;
    if (el.dataset.act === "capacity") table.capacity = Math.max(1, Number(el.value) || 1);
    writeData(data);
    render();
  }
});
app.addEventListener("input", (e) => {
  const el = e.target;
  if (el.dataset.act === "search") actions.search(el);
  if (el.dataset.act === "roster-search") ui.rosterDraftQuery = el.value;
  const form = el.closest && el.closest('form[data-form="rename-chat"]');
  if (form && el.name === "title") {
    const original = form.dataset.original || "";
    const locked = form.dataset.locked === "1";
    if (locked || el.value !== original) {
      if ([...el.value].length > TITLE_CUSTOM_LIMIT) el.value = [...el.value].slice(0, TITLE_CUSTOM_LIMIT).join("");
      el.maxLength = TITLE_CUSTOM_LIMIT;
    }
    const submit = form.querySelector(".rename-confirm");
    if (submit) submit.disabled = !el.value.trim();
  }
});
app.addEventListener("click", (e) => {
  if (swallowClick) { swallowClick = false; e.preventDefault(); e.stopPropagation(); return; }
  if (e.target.classList && e.target.classList.contains("modal-back")) {
    if (e.target.dataset.layer === "edit") {
      ui.editGuest = null;
      ui.editNewGroup = false;
      render();
      return;
    }
    ui.addGuest = false;
    ui.roster = false;
    ui.editGuest = null;
    ui.rosterQuery = "";
    ui.rosterType = "";
    ui.rosterAttendFilter = "";
    ui.rosterDraftQuery = "";
    ui.rosterDraftType = "";
    ui.rosterDraftAttend = "";
    ui.addDraft = "";
    ui.addGroup = "";
    ui.addAttend = "待定";
    ui.addSeq = "";
    ui.newGroup = false;
    ui.confirmChat = null;
    ui.renameChat = null;
    ui.confirmLogout = false;
    ui.addCat = false;
    render();
    return;
  }
  const head = e.target.closest(".section-head");
  if (head && !e.target.closest("button, a, input, select, textarea, label, form")) {
    actions.fold(head);
    return;
  }
  const outsideModel = ui.modelMenu && !e.target.closest(".chat-model");
  const outsidePlus = ui.plusMenu && !e.target.closest(".chat-plus-wrap");
  const outsideChat = ui.chatMenu && !e.target.closest(".chat-row");
  if (outsideModel || outsidePlus || outsideChat) {
    if (outsideModel) ui.modelMenu = false;
    if (outsidePlus) ui.plusMenu = false;
    if (outsideChat) ui.chatMenu = null;
    if (!e.target.closest("[data-act]")) { render(); return; }
  }
  const btn = e.target.closest("[data-act]");
  if (!btn || btn.dataset.act === "search" || btn.dataset.act === "status") return;
  if (btn.type === "submit") return;
  const fn = actions[btn.dataset.act];
  if (fn) { e.preventDefault(); fn(btn); }
});

let drag = null;
let press = null;
let swallowClick = false;
let dropLine = null;

function cancelPress() {
  if (!press) return;
  clearTimeout(press.timer);
  press = null;
}
function taskRowsIn(section, skipId) {
  return [...section.querySelectorAll(".task[data-task]")].filter((row) => row.dataset.task !== skipId);
}
function nextTaskId(row, skipId) {
  let node = row.nextElementSibling;
  while (node) {
    if (node.matches && node.matches(".task[data-task]") && node.dataset.task !== skipId) return node.dataset.task;
    node = node.nextElementSibling;
  }
  return null;
}
function openStageForDrop(stageId) {
  const section = document.querySelector(`.section[data-stage="${stageId}"]`);
  if (!section) return null;
  ui.collapsed[stageId] = false;
  const arrow = section.querySelector(".fold-arrow");
  if (arrow) {
    arrow.setAttribute("aria-expanded", "true");
    arrow.setAttribute("aria-label", "收起");
  }
  const head = section.querySelector(".section-head");
  if (head) head.setAttribute("aria-expanded", "true");
  const body = section.querySelector(".stage-body");
  if (body) body.inert = false;
  section.classList.add("no-motion");
  section.classList.remove("is-collapsed");
  return section;
}
function placeDropLine(section, beforeId) {
  if (!dropLine) {
    dropLine = document.createElement("div");
    dropLine.className = "drop-line";
  }
  const host = section.querySelector(".stage-body-inner") || section;
  const before = beforeId ? section.querySelector(`.task[data-task="${beforeId}"]`) : null;
  if (before) host.insertBefore(dropLine, before);
  else host.appendChild(dropLine);
}
function dropAt(x, y, taskId) {
  const under = document.elementFromPoint(x, y);
  const section = under && under.closest(".section");
  if (!section) return null;
  const stage = section.dataset.stage;
  openStageForDrop(stage);
  const rows = taskRowsIn(section, taskId);
  if (!rows.length) return { stage, beforeId: null };
  const row = under.closest(".task[data-task]");
  if (row && row.dataset.task !== taskId && row.closest(".section") === section) {
    const rect = row.getBoundingClientRect();
    const before = y < rect.top + rect.height / 2;
    return { stage, beforeId: before ? row.dataset.task : nextTaskId(row, taskId) };
  }
  for (const item of rows) {
    const rect = item.getBoundingClientRect();
    if (y < rect.top + rect.height / 2) return { stage, beforeId: item.dataset.task };
  }
  return { stage, beforeId: null };
}
function relocateTask(tasks, taskId, stageId, beforeId) {
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;
  tasks.splice(tasks.indexOf(task), 1);
  task.stage = stageId;
  if (beforeId) {
    const at = tasks.findIndex((t) => t.id === beforeId);
    if (at >= 0) { tasks.splice(at, 0, task); return; }
  }
  let at = tasks.length;
  for (let i = tasks.length - 1; i >= 0; i--) {
    if (tasks[i].stage === stageId) { at = i + 1; break; }
  }
  tasks.splice(at, 0, task);
}
function moveTaskDrag(e) {
  drag.x = e.clientX;
  drag.y = e.clientY;
  drag.ghost.style.left = (e.clientX + 12) + "px";
  drag.ghost.style.top = (e.clientY + 12) + "px";
  const spot = dropAt(e.clientX, e.clientY, drag.id);
  if (!spot) return;
  drag.drop = spot;
  const section = document.querySelector(`.section[data-stage="${spot.stage}"]`);
  if (section) placeDropLine(section, spot.beforeId);
}
function finishTaskDrag(e) {
  const current = drag;
  if (e) current.drop = dropAt(e.clientX, e.clientY, current.id);
  swallowClick = true;
  clearInterval(current.scrollTimer);
  document.body.classList.remove("task-dragging");
  if (current.ghost) current.ghost.remove();
  if (dropLine) dropLine.remove();
  dropLine = null;
  const scroller = document.querySelector(".content-scroll");
  const top = scroller ? scroller.scrollTop : 0;
  drag = null;
  if (current.drop) {
    const { data } = pack();
    const task = data.tasks.find((t) => t.id === current.id);
    const before = task ? { stage: task.stage, due: task.due, status: task.status, name: task.name } : null;
    relocateTask(data.tasks, current.id, current.drop.stage, current.drop.beforeId);
    if (task && before) {
      task.due = before.due;
      task.status = before.status;
      task.name = before.name;
    }
    writeData(data);
    render();
    const again = document.querySelector(".content-scroll");
    if (again) again.scrollTop = top;
    return;
  }
  const row = document.querySelector(`.task[data-task="${current.id}"]`);
  if (row) row.classList.remove("is-lifted");
}
function beginTaskDrag() {
  if (!press) return;
  const held = press;
  press = null;
  const row = document.querySelector(`.task[data-task="${held.id}"]`);
  if (!row) return;
  const name = row.querySelector(".name, input[name=name]");
  const ghost = document.createElement("div");
  ghost.className = "task-ghost";
  ghost.textContent = name ? name.value || name.textContent : "";
  document.body.appendChild(ghost);
  row.classList.add("is-lifted");
  document.body.classList.add("task-dragging");
  try { row.setPointerCapture(held.pointerId); } catch (err) { /* 指针已松开时不捕获 */ }
  drag = { type: "task", id: held.id, x: held.x, y: held.y, ghost, drop: null, scrollTimer: 0 };
  drag.scrollTimer = setInterval(() => {
    if (!drag || drag.type !== "task") return;
    const scroller = document.querySelector(".content-scroll");
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    if (drag.y < rect.top + 48) scroller.scrollTop -= 18;
    else if (drag.y > rect.bottom - 48) scroller.scrollTop += 18;
    else return;
    moveTaskDrag({ clientX: drag.x, clientY: drag.y });
  }, 50);
  moveTaskDrag({ clientX: held.x, clientY: held.y });
}
function catRows(skipId) {
  return [...document.querySelectorAll(".cat-item[data-cat]")].filter((row) => row.dataset.cat !== skipId);
}
function nextCatId(row, skipId) {
  let node = row.nextElementSibling;
  while (node) {
    if (node.matches && node.matches(".cat-item[data-cat]") && node.dataset.cat !== skipId) return node.dataset.cat;
    node = node.nextElementSibling;
  }
  return null;
}
function placeCatDropLine(beforeId) {
  if (!dropLine) {
    dropLine = document.createElement("div");
    dropLine.className = "drop-line";
  }
  const host = document.querySelector(".cat-list");
  if (!host) return;
  const before = beforeId ? host.querySelector(`.cat-item[data-cat="${beforeId}"]`) : null;
  if (before) host.insertBefore(dropLine, before);
  else host.appendChild(dropLine);
}
function dropCatAt(x, y, catId) {
  const under = document.elementFromPoint(x, y);
  if (!under || !under.closest(".cat-list, .cat-item")) return null;
  const rows = catRows(catId);
  if (!rows.length) return { beforeId: null };
  const row = under.closest(".cat-item[data-cat]");
  if (row && row.dataset.cat !== catId) {
    const rect = row.getBoundingClientRect();
    const before = y < rect.top + rect.height / 2;
    return { beforeId: before ? row.dataset.cat : nextCatId(row, catId) };
  }
  for (const item of rows) {
    const rect = item.getBoundingClientRect();
    if (y < rect.top + rect.height / 2) return { beforeId: item.dataset.cat };
  }
  return { beforeId: null };
}
function relocateCat(categories, catId, beforeId) {
  const cat = categories.find((item) => item.id === catId);
  if (!cat) return;
  const kept = { name: cat.name, amountFen: cat.amountFen, status: cat.status, note: cat.note, colorIndex: cat.colorIndex };
  categories.splice(categories.indexOf(cat), 1);
  if (beforeId) {
    const at = categories.findIndex((item) => item.id === beforeId);
    if (at >= 0) categories.splice(at, 0, cat);
    else categories.push(cat);
  } else categories.push(cat);
  cat.name = kept.name;
  cat.amountFen = kept.amountFen;
  cat.status = kept.status;
  cat.note = kept.note;
  cat.colorIndex = kept.colorIndex;
}
function moveCatDrag(e) {
  drag.x = e.clientX;
  drag.y = e.clientY;
  drag.ghost.style.left = (e.clientX + 12) + "px";
  drag.ghost.style.top = (e.clientY + 12) + "px";
  const spot = dropCatAt(e.clientX, e.clientY, drag.id);
  if (!spot) return;
  drag.drop = spot;
  placeCatDropLine(spot.beforeId);
}
function finishCatDrag(e) {
  const current = drag;
  if (e) current.drop = dropCatAt(e.clientX, e.clientY, current.id);
  swallowClick = true;
  clearInterval(current.scrollTimer);
  document.body.classList.remove("task-dragging");
  if (current.ghost) current.ghost.remove();
  if (dropLine) dropLine.remove();
  dropLine = null;
  const scroller = document.querySelector(".content-scroll");
  const top = scroller ? scroller.scrollTop : 0;
  drag = null;
  if (current.drop) {
    const { data } = pack();
    relocateCat(data.categories, current.id, current.drop.beforeId);
    writeData(data);
    render();
    const again = document.querySelector(".content-scroll");
    if (again) again.scrollTop = top;
    return;
  }
  const row = document.querySelector(`.cat-item[data-cat="${current.id}"]`);
  if (row) row.classList.remove("is-lifted");
}
function beginCatDrag() {
  if (!press || press.kind !== "cat") return;
  const held = press;
  press = null;
  const row = document.querySelector(`.cat-item[data-cat="${held.id}"]`);
  if (!row) return;
  const name = row.querySelector(".name");
  const ghost = document.createElement("div");
  ghost.className = "task-ghost";
  ghost.textContent = name ? name.textContent : "";
  document.body.appendChild(ghost);
  row.classList.add("is-lifted");
  document.body.classList.add("task-dragging");
  try { row.setPointerCapture(held.pointerId); } catch (err) { /* 指针已松开时不捕获 */ }
  drag = { type: "cat", id: held.id, x: held.x, y: held.y, ghost, drop: null, scrollTimer: 0 };
  drag.scrollTimer = setInterval(() => {
    if (!drag || drag.type !== "cat") return;
    const scroller = document.querySelector(".content-scroll");
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    if (drag.y < rect.top + 48) scroller.scrollTop -= 18;
    else if (drag.y > rect.bottom - 48) scroller.scrollTop += 18;
    else return;
    moveCatDrag({ clientX: drag.x, clientY: drag.y });
  }, 50);
  moveCatDrag({ clientX: held.x, clientY: held.y });
}
function stageSections(skipId) {
  return [...document.querySelectorAll(".stage-list .section[data-stage]")].filter((section) => section.dataset.stage !== skipId);
}
function nextStageId(section, skipId) {
  let node = section.nextElementSibling;
  while (node) {
    if (node.matches && node.matches(".section[data-stage]") && node.dataset.stage !== skipId) return node.dataset.stage;
    node = node.nextElementSibling;
  }
  return null;
}
function placeStageDropLine(beforeId) {
  if (!dropLine) {
    dropLine = document.createElement("div");
    dropLine.className = "drop-line";
  }
  const host = document.querySelector(".stage-list");
  if (!host) return;
  const before = beforeId ? host.querySelector(`.section[data-stage="${beforeId}"]`) : null;
  if (before) host.insertBefore(dropLine, before);
  else host.appendChild(dropLine);
}
function dropStageAt(x, y, stageId) {
  const under = document.elementFromPoint(x, y);
  if (!under || !under.closest(".stage-list, .section")) return null;
  const sections = stageSections(stageId);
  if (!sections.length) return { beforeId: null };
  const section = under.closest(".section[data-stage]");
  if (section && section.dataset.stage !== stageId) {
    const rect = section.getBoundingClientRect();
    const before = y < rect.top + rect.height / 2;
    return { beforeId: before ? section.dataset.stage : nextStageId(section, stageId) };
  }
  for (const item of sections) {
    const rect = item.getBoundingClientRect();
    if (y < rect.top + rect.height / 2) return { beforeId: item.dataset.stage };
  }
  return { beforeId: null };
}
function relocateStage(stages, stageId, beforeId) {
  const stage = stages.find((item) => item.id === stageId);
  if (!stage) return;
  stages.splice(stages.indexOf(stage), 1);
  if (beforeId) {
    const at = stages.findIndex((item) => item.id === beforeId);
    if (at >= 0) stages.splice(at, 0, stage);
    else stages.push(stage);
  } else stages.push(stage);
}
function moveStageDrag(e) {
  drag.x = e.clientX;
  drag.y = e.clientY;
  drag.ghost.style.left = (e.clientX + 12) + "px";
  drag.ghost.style.top = (e.clientY + 12) + "px";
  const spot = dropStageAt(e.clientX, e.clientY, drag.id);
  if (!spot) return;
  drag.drop = spot;
  placeStageDropLine(spot.beforeId);
}
function finishStageDrag(e) {
  const current = drag;
  if (e) current.drop = dropStageAt(e.clientX, e.clientY, current.id);
  swallowClick = true;
  clearInterval(current.scrollTimer);
  document.body.classList.remove("task-dragging");
  if (current.ghost) current.ghost.remove();
  if (dropLine) dropLine.remove();
  dropLine = null;
  const scroller = document.querySelector(".content-scroll");
  const top = scroller ? scroller.scrollTop : 0;
  drag = null;
  if (current.drop) {
    const { data } = pack();
    const before = data.tasks.map((task) => ({ id: task.id, stage: task.stage, name: task.name, due: task.due, status: task.status, note: task.note }));
    relocateStage(data.stages, current.id, current.drop.beforeId);
    before.forEach((item) => {
      const task = data.tasks.find((row) => row.id === item.id);
      if (!task) return;
      task.stage = item.stage;
      task.name = item.name;
      task.due = item.due;
      task.status = item.status;
      task.note = item.note;
    });
    writeData(data);
    render();
    const again = document.querySelector(".content-scroll");
    if (again) again.scrollTop = top;
    return;
  }
  const section = document.querySelector(`.section[data-stage="${current.id}"]`);
  if (section) section.classList.remove("is-lifted");
}
function beginStageDrag() {
  if (!press || press.kind !== "stage") return;
  const held = press;
  press = null;
  const section = document.querySelector(`.section[data-stage="${held.id}"]`);
  if (!section) return;
  const { data } = pack();
  const index = data.stages.findIndex((stage) => stage.id === held.id);
  const stage = index >= 0 ? data.stages[index] : null;
  const ghost = document.createElement("div");
  ghost.className = "task-ghost";
  ghost.textContent = stage ? stageLabel(index, stage.name) : "";
  document.body.appendChild(ghost);
  section.classList.add("is-lifted");
  document.body.classList.add("task-dragging");
  try { section.setPointerCapture(held.pointerId); } catch (err) { /* 指针已松开时不捕获 */ }
  drag = { type: "stage", id: held.id, x: held.x, y: held.y, ghost, drop: null, scrollTimer: 0 };
  drag.scrollTimer = setInterval(() => {
    if (!drag || drag.type !== "stage") return;
    const scroller = document.querySelector(".content-scroll");
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    if (drag.y < rect.top + 48) scroller.scrollTop -= 18;
    else if (drag.y > rect.bottom - 48) scroller.scrollTop += 18;
    else return;
    moveStageDrag({ clientX: drag.x, clientY: drag.y });
  }, 50);
  moveStageDrag({ clientX: held.x, clientY: held.y });
}

app.addEventListener("pointerdown", (e) => {
  const handle = e.target.closest("[data-handle]");
  const guest = e.target.closest("[data-guest]");
  const pan = e.target.closest("[data-pan]");
  if (handle) {
    const { data } = pack();
    const table = data.tables.find((t) => t.id === handle.dataset.handle);
    drag = { type: "table", id: table.id, ox: e.clientX, oy: e.clientY, x: table.x, y: table.y };
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
    return;
  }
  if (guest && !e.target.closest("[data-act]")) {
    drag = { type: "guest", id: guest.dataset.guest };
    guest.setPointerCapture(e.pointerId);
    guest.classList.add("dragging");
    e.preventDefault();
    return;
  }
  if (e.target.classList && (e.target.classList.contains("board") || e.target.classList.contains("canvas"))) {
    const { data } = pack();
    drag = { type: "pan", x: e.clientX - data.canvas.x, y: e.clientY - data.canvas.y };
    e.target.setPointerCapture(e.pointerId);
    return;
  }
  if (e.button !== 0) return;
  const blocked = e.target.closest("button, a, input, select, textarea, label");
  if (pathNow() === "/plan") {
    const row = e.target.closest(".task[data-task]");
    if (row && !blocked) {
      press = { kind: "task", id: row.dataset.task, x: e.clientX, y: e.clientY, pointerId: e.pointerId, timer: 0 };
      press.timer = setTimeout(beginTaskDrag, 500);
      return;
    }
    const head = e.target.closest(".section-head");
    if (!head || blocked) return;
    press = { kind: "stage", id: head.dataset.id, x: e.clientX, y: e.clientY, pointerId: e.pointerId, timer: 0 };
    press.timer = setTimeout(beginStageDrag, 500);
    return;
  }
  if (pathNow() !== "/budget") return;
  const row = e.target.closest(".cat-item[data-cat]");
  if (!row || blocked) return;
  press = { kind: "cat", id: row.dataset.cat, x: e.clientX, y: e.clientY, pointerId: e.pointerId, timer: 0 };
  press.timer = setTimeout(beginCatDrag, 500);
});
app.addEventListener("pointermove", (e) => {
  if (press && !drag) {
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) cancelPress();
  }
  if (!drag) return;
  if (drag.type === "task") { moveTaskDrag(e); return; }
  if (drag.type === "stage") { moveStageDrag(e); return; }
  if (drag.type === "cat") { moveCatDrag(e); return; }
  const { data } = pack();
  if (drag.type === "table") {
    const table = data.tables.find((t) => t.id === drag.id);
    const scale = data.canvas.scale || 1;
    table.x = drag.x + (e.clientX - drag.ox) / scale;
    table.y = drag.y + (e.clientY - drag.oy) / scale;
    const el = document.querySelector(`[data-table="${table.id}"]`);
    if (el) { el.style.left = table.x + "px"; el.style.top = table.y + "px"; }
    return;
  }
  if (drag.type === "pan") {
    data.canvas.x = e.clientX - drag.x;
    data.canvas.y = e.clientY - drag.y;
    const canvas = document.querySelector(".canvas");
    if (canvas) canvas.style.transform = `translate(${data.canvas.x}px,${data.canvas.y}px) scale(${data.canvas.scale})`;
    return;
  }
  if (drag.type === "guest") {
    document.querySelectorAll(".table.over").forEach((n) => n.classList.remove("over"));
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const table = under && under.closest("[data-table]");
    if (table) table.classList.add("over");
  }
});
app.addEventListener("pointerup", (e) => {
  if (drag && drag.type === "task") { finishTaskDrag(e); return; }
  if (drag && drag.type === "stage") { finishStageDrag(e); return; }
  if (drag && drag.type === "cat") { finishCatDrag(e); return; }
  if (press) cancelPress();
  if (!drag) return;
  const current = drag;
  drag = null;
  const { data } = pack();
  if (current.type === "guest") {
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const table = under && under.closest("[data-table]");
    const pool = under && under.closest("[data-pool]");
    const guest = data.guests.find((g) => g.id === current.id);
    if (guest && table) guest.tableId = table.dataset.table;
    else if (guest && pool) guest.tableId = null;
    writeData(data);
    render();
    return;
  }
  writeData(data);
});
app.addEventListener("pointercancel", () => {
  if (press) cancelPress();
  if (drag && drag.type === "task") { drag.drop = null; finishTaskDrag(); }
  if (drag && drag.type === "stage") { drag.drop = null; finishStageDrag(); }
  if (drag && drag.type === "cat") { drag.drop = null; finishCatDrag(); }
});
app.addEventListener("wheel", (e) => {
  if (!e.target.closest(".board")) return;
  e.preventDefault();
  const { data } = pack();
  const dir = e.deltaY < 0 ? 1 : -1;
  data.canvas.scale = Math.round(Math.min(2, Math.max(0.5, data.canvas.scale + dir * 0.1)) * 100) / 100;
  writeData(data);
  const canvas = document.querySelector(".canvas");
  if (canvas) canvas.style.transform = `translate(${data.canvas.x}px,${data.canvas.y}px) scale(${data.canvas.scale})`;
}, { passive: false });

app.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.shiftKey) return;
  const box = e.target.closest("textarea[name=chat]");
  if (!box || !box.closest("form[data-form=chat], form[data-form=edit-chat]")) return;
  e.preventDefault();
  const form = box.closest("form");
  if (form.dataset.form === "chat" && !box.value.trim() && !ui.chatImages.length && !ui.chatFiles.length) return;
  if (form.dataset.form === "edit-chat" && !box.value.trim() && form.dataset.media !== "1") return;
  form.requestSubmit();
});
app.addEventListener("input", (e) => {
  const edit = e.target.closest("form[data-form=edit-chat]");
  if (edit && e.target.name === "chat") {
    sizeEditField(e.target);
    const btn = edit.querySelector("button[type=submit]");
    if (btn) btn.disabled = !e.target.value.trim() && edit.dataset.media !== "1";
    return;
  }
  if (e.target.name !== "chat" || !e.target.closest("form[data-form=chat]")) return;
  ui.chatDraft = e.target.value;
  sizeChatField(e.target);
  const btn = e.target.closest("form").querySelector("button[type=submit]");
  if (!btn) return;
  btn.disabled = !e.target.value.trim() && !ui.chatImages.length && !ui.chatFiles.length;
});
window.addEventListener("hashchange", () => {
  if (pathNow() !== "/xiaobei") clearChatTimer();
  ui.msg = pathNow() === "/login" ? ui.msg : "";
  render();
});
if (!location.hash) go(sessionUser() ? "/plan" : "/login");
else render();
