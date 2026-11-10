import {
  openDB, getAll, getOne, putOne, putMany, toStorableBlob
} from './db.js';
import {
  analyzeLocal, analyzeRemote, mergeKnowledgePoints, splitKnowledgePoints,
  apiEndpoint, CAUSE_TAGS
} from './analysis.js';

/* ------------------------------------------------------------------ *
 * 常量与状态
 * ------------------------------------------------------------------ */

const APP_VERSION = '1.0.1';
const REVIEW_INTERVALS = [1, 3, 7, 14, 30, 60];
const MAX_FILE_SIZE = 30 * 1024 * 1024;

const SUBJECTS = {
  职测: {
    tone: 'teal',
    modules: [
      { name: '常识判断', kps: ['政治常识', '法律常识', '经济常识', '科技常识', '人文历史', '地理国情', '教育法律法规'] },
      { name: '言语理解与表达', kps: ['逻辑填空', '片段阅读', '语句表达', '成语辨析'] },
      { name: '数量分析', kps: ['数学运算', '数字推理', '资料分析', '增长率', '比重', '平均数', '倍数'] },
      { name: '判断推理', kps: ['图形推理', '定义判断', '类比推理', '逻辑判断', '削弱加强', '翻译推理'] },
      { name: '策略选择', kps: ['课堂管理', '家校沟通', '学生心理', '突发事件', '教师职业道德'] },
      { name: '其他', kps: [] }
    ]
  },
  综应: {
    tone: 'amber',
    modules: [
      { name: '辨析题', kps: ['教育理念', '教育心理学', '教师职业道德', '教育法律法规'] },
      { name: '案例分析', kps: ['班级管理', '学生发展', '教学设计', '家校合作', '教育评价', '心理健康'] },
      { name: '教育方案设计', kps: ['主题班会', '教学活动', '家长会', '教学设计', '教育实践'] },
      { name: '其他', kps: [] }
    ]
  }
};

const DEFAULT_SETTINGS = {
  analysisMode: 'local',
  api: { baseUrl: '', model: '', apiKey: '' }
};

const NAV = [
  { key: 'home', label: '首页', icon: 'home', href: '#/home' },
  { key: 'library', label: '错题本', icon: 'book', href: '#/library' },
  { key: 'add', label: '录入', icon: 'plus', href: '#/add' },
  { key: 'maps', label: '导图复盘', icon: 'map', href: '#/maps' },
  { key: 'review', label: '复习', icon: 'calendar', href: '#/review' },
  { key: 'settings', label: '设置', icon: 'settings', href: '#/settings' }
];

const state = {
  questions: [],
  maps: [],
  settings: { ...DEFAULT_SETTINGS, api: { ...DEFAULT_SETTINGS.api } },
  library: { subject: '全部', module: '全部', kp: '全部', q: '', status: 'active' },
  pendingRemote: new Set(),
  fileUrls: new Map(),
  currentPage: null
};

let addDraft = null;
let pendingAttachments = [];
let addSubmitMode = 'analyze';
let processingFiles = 0;
let toastTimer = null;

/* ------------------------------------------------------------------ *
 * 图标与基础工具
 * ------------------------------------------------------------------ */

const ICON_PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v18H6.5A2.5 2.5 0 0 1 4 18.5z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  map: '<path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/>',
  camera: '<path d="M5 7h2l1.5-2h7L17 7h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"/><circle cx="12" cy="13" r="3.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 15-4.5-4.5L7 20"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  'arrow-left': '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  sparkle: '<path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z"/><path d="M19 16v4M17 18h4"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 6.7"/><path d="M20 4v7h-7"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  upload: '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/>',
  check: '<path d="m4 12.5 5 5L20 6.5"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v11h14V9M10 13h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01"/>',
  'wifi-off': '<path d="M3 3l18 18"/><path d="M8.5 16a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4-2.4M12 19.5h.01"/>',
  alert: '<path d="M12 3 2.5 20h19z"/><path d="M12 9v5M12 17h.01"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/><path d="M10 10v7M14 10v7"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/>',
  external: '<path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-6M22 20H2"/>'
};

function icon(name, cls = '') {
  return `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function uuid() {
  if (window.crypto?.randomUUID) {
    try { return window.crypto.randomUUID(); } catch (e) { /* fall through */ }
  }
  const bytes = new Uint8Array(16);
  if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function uniq(list) {
  const arr = Array.isArray(list) ? list : (list ? [list] : []);
  return [...new Set(arr.filter(Boolean))];
}

function truncate(text, max = 80) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }

function nowISO() { return new Date().toISOString(); }

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayDiff(iso) {
  if (!iso) return 0;
  return Math.round((startOfDay(new Date(iso)) - startOfDay(new Date())) / 86400000);
}

function formatDate(iso, withYear = false) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const opts = withYear
    ? { year: 'numeric', month: 'numeric', day: 'numeric' }
    : { month: 'numeric', day: 'numeric' };
  return new Intl.DateTimeFormat('zh-CN', opts).format(d);
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${formatDate(iso, true)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function relativeDue(iso) {
  const diff = dayDiff(iso);
  if (diff < 0) return `已逾期 ${Math.abs(diff)} 天`;
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff <= 7) return `${diff} 天后`;
  return formatDate(iso);
}

function isDue(q) {
  return q.status !== 'archived' && q.nextReviewAt && new Date(q.nextReviewAt) <= new Date();
}

function isActive(q) { return q.status !== 'archived'; }

function providerLabel(analysis) {
  if (!analysis) return '';
  if (analysis.provider === 'api') return analysis.model ? `联网 AI · ${analysis.model}` : '联网 AI';
  return '本地规则';
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

/* ------------------------------------------------------------------ *
 * 数据读取与附件
 * ------------------------------------------------------------------ */

function findQuestion(id) { return state.questions.find((q) => q.id === id) || null; }
function findMap(id) { return state.maps.find((m) => m.id === id) || null; }

function mergeSettings(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  return {
    analysisMode: value.analysisMode === 'api' ? 'api' : 'local',
    api: { ...DEFAULT_SETTINGS.api, ...(value.api || {}) }
  };
}

function isBlobValue(value) {
  if (typeof Blob === 'undefined' || value == null) return false;
  if (value instanceof Blob) return true;
  const tag = Object.prototype.toString.call(value);
  return tag === '[object Blob]' || tag === '[object File]';
}

function friendlySaveError(error) {
  const message = String(error?.message || error || '');
  if (/BlobURLs are not yet supported|Blob URL/i.test(message)) {
    return '图片附件仍是临时预览地址，无法写入本机数据库；请重新选择图片后再保存。';
  }
  if (/QuotaExceeded|quota/i.test(message)) {
    return '本机存储空间不足，请清理浏览器空间后重试。';
  }
  return message || '未知错误，请稍后重试。';
}

async function storableAttachmentBlob(source) {
  try {
    const blob = await toStorableBlob(source);
    if (!isBlobValue(blob)) throw new Error('附件转换失败');
    return blob;
  } catch (error) {
    throw new Error(friendlySaveError(error));
  }
}

function fileRecordFrom(id, item, blob) {
  return {
    id,
    blob,
    name: item.name || (isBlobValue(blob) && blob.name) || '附件',
    type: item.type || blob.type || 'application/octet-stream',
    size: blob.size,
    createdAt: nowISO()
  };
}

async function getFileURL(id) {
  if (!id) return null;
  if (state.fileUrls.has(id)) return state.fileUrls.get(id);
  const record = await getOne('files', id);
  if (!isBlobValue(record?.blob)) return null;
  const url = URL.createObjectURL(record.blob);
  state.fileUrls.set(id, url);
  return url;
}

async function hydrateFiles(root = document) {
  const images = qsa('img[data-file-img]', root);
  for (const img of images) {
    if (!img.isConnected) continue;
    const id = img.dataset.fileImg;
    try {
      const url = await getFileURL(id);
      if (url) img.src = url;
      else img.alt = '附件已缺失';
    } catch (e) {
      img.alt = '附件读取失败';
    }
  }
  const links = qsa('[data-file-link]', root);
  for (const link of links) {
    if (!link.isConnected) continue;
    const url = await getFileURL(link.dataset.fileLink);
    if (url) link.href = url;
    else link.removeAttribute('href');
  }
}

function attachmentThumb(attachments) {
  if (!Array.isArray(attachments)) return null;
  const image = attachments.find((a) => String(a.type || '').startsWith('image/'));
  return image || null;
}

async function prepareBlob(file) {
  if (!file) return null;
  const source = isBlobValue(file) ? file : await storableAttachmentBlob(file);
  if (source.size > MAX_FILE_SIZE) throw new Error(`文件超过 30MB：${source.name || '附件'}`);
  if (!String(source.type || '').startsWith('image/')) {
    return { blob: source, name: source.name || '附件', type: source.type || 'application/octet-stream' };
  }
  if (source.type === 'image/svg+xml' || source.type === 'image/gif' || source.size < 700 * 1024) {
    return { blob: source, name: source.name || '图片', type: source.type };
  }
  let url = null;
  try {
    url = URL.createObjectURL(source);
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('图片读取失败'));
      img.src = url;
    });
    const maxEdge = 1600;
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.84));
    if (!isBlobValue(blob)) {
      return { blob: source, name: source.name || '图片', type: source.type };
    }
    const name = (source.name || '图片').replace(/\.[^.]+$/, '') + '.jpg';
    return { blob, name, type: 'image/jpeg' };
  } catch (e) {
    return { blob: source, name: source.name || '图片', type: source.type };
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

/* ------------------------------------------------------------------ *
 * 页面外壳
 * ------------------------------------------------------------------ */

function navLink(item, active) {
  return `<a class="nav-link${item.key === active ? ' active' : ''}" href="${item.href}">
    ${icon(item.icon)}<span>${item.label}</span>
  </a>`;
}

function mobileTabs(active) {
  return `<nav class="mobile-tabs" aria-label="主导航">
    ${NAV.map((item) => `<a class="mobile-tab${item.key === active ? ' active' : ''}" data-tab="${item.key}" href="${item.href}">${icon(item.icon)}<span>${item.label}</span></a>`).join('')}
  </nav>`;
}

function shell(page) {
  const netOnline = navigator.onLine;
  return `<div class="shell">
    <aside class="sidebar">
      <a class="brand" href="#/home">
        <span class="brand-mark">错</span>
        <span>
          <span class="brand-name">公考错题本</span>
          <span class="brand-sub">D 类 · 职测 + 综应</span>
        </span>
      </a>
      <nav class="nav" aria-label="侧边导航">
        ${NAV.map((item) => navLink(item, page.active)).join('')}
        <div class="nav-sep"></div>
        <a class="nav-link${page.active === 'about' ? ' active' : ''}" href="#/settings">${icon('sparkle')}<span>使用说明</span></a>
      </nav>
      <div class="sidebar-foot">
        <div class="sidebar-note"><span class="dot ${netOnline ? '' : 'off'}" id="net-dot"></span><span id="net-text">${netOnline ? '在线 · 可联网分析' : '离线 · 仍可查看与记录'}</span></div>
        <div class="sidebar-small">数据只存本机浏览器 · 0 元使用</div>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <div class="topbar-title">
          <div>
            <h1>${esc(page.title)}</h1>
            ${page.sub ? `<span class="topbar-sub">${esc(page.sub)}</span>` : ''}
          </div>
        </div>
        <div class="topbar-actions">${page.actions || ''}</div>
      </header>
      <main class="page">${page.content}</main>
    </div>
    ${mobileTabs(page.active)}
  </div>`;
}

function topbarBack(href, label = '返回') {
  return `<a class="btn btn-ghost btn-sm" href="${href}">${icon('arrow-left')}<span>${label}</span></a>`;
}

/* ------------------------------------------------------------------ *
 * 通用展示片段
 * ------------------------------------------------------------------ */

function subjectChip(subject) {
  return `<span class="chip ${subject === '综应' ? 'chip-amber' : 'chip-teal'}">${esc(subject)}</span>`;
}

function causeChip(cause) {
  return `<span class="chip" data-cause="${esc(cause)}">${esc(cause)}</span>`;
}

function statusChip(q) {
  if (q.status === 'archived') return '<span class="chip chip-line">已归档</span>';
  if (q.status === 'mastered') return '<span class="chip chip-teal">已掌握</span>';
  if (isDue(q)) return '<span class="chip chip-red">待复习</span>';
  return '<span class="chip chip-line">复习中</span>';
}

function kpChips(points, limit = 6) {
  const list = uniq(points || []).slice(0, limit);
  return list.map((p) => `<span class="chip chip-line">${esc(p)}</span>`).join('');
}

function qTitle(q) {
  const stem = q.stem == null ? '' : String(q.stem).trim();
  if (stem) return truncate(stem.split('\n')[0], 90);
  if (q.attachments?.length) return '图片错题 · 尚未填写题干';
  return '未填写题干';
}

function questionCard(q) {
  const thumb = attachmentThumb(q.attachments);
  const reason = q.analysis?.reason || (q.myAnswer ? `我的答案：${q.myAnswer}` : '尚未分析，点开可查看详情');
  return `<a class="q-card" href="#/q/${q.id}">
    <div class="q-thumb${thumb ? ' wide' : ''}">
      ${thumb ? `<img data-file-img="${esc(thumb.id)}" alt="" />` : icon('book')}
    </div>
    <div class="q-body">
      <div class="q-topline">
        ${subjectChip(q.subject)}
        <span class="chip chip-line">${esc(q.module)}</span>
        ${statusChip(q)}
      </div>
      <div class="q-title">${esc(qTitle(q))}</div>
      <div class="q-excerpt">${esc(reason)}</div>
      <div class="q-tags">${kpChips(q.knowledgePoints, 4)}</div>
      <div class="q-foot">
        <span>${esc(formatDate(q.createdAt))} 录入</span>
        <span class="${isDue(q) ? 'q-due' : ''}">${isDue(q) ? '待复习' : `下次 ${relativeDue(q.nextReviewAt)}`}</span>
      </div>
    </div>
  </a>`;
}

function emptyState(iconName, title, text, action = '') {
  return `<div class="empty">
    <div class="empty-icon">${icon(iconName)}</div>
    <h3>${esc(title)}</h3>
    <p>${esc(text)}</p>
    ${action}
  </div>`;
}

function attachmentTiles(attachments, { lightbox = true } = {}) {
  if (!Array.isArray(attachments) || !attachments.length) return '';
  return `<div class="image-grid">${attachments.map((a) => {
    if (String(a.type || '').startsWith('image/')) {
      return `<button type="button" class="image-tile" ${lightbox ? `data-lightbox="${esc(a.id)}"` : ''} aria-label="查看图片 ${esc(a.name || '')}">
        <img data-file-img="${esc(a.id)}" alt="${esc(a.name || '题目图片')}" />
      </button>`;
    }
    return `<a class="file-tile" data-file-link="${esc(a.id)}" href="#" target="_blank" rel="noopener">
      ${icon('file')}<span>${esc(a.name || '附件')}</span>
    </a>`;
  }).join('')}</div>`;
}

function knowledgeStats() {
  const counts = new Map();
  for (const q of state.questions.filter(isActive)) {
    for (const kp of uniq(q.knowledgePoints || [])) {
      counts.set(kp, (counts.get(kp) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([kp, count]) => ({ kp, count }))
    .sort((a, b) => b.count - a.count || a.kp.localeCompare(b.kp, 'zh'));
}

/* ------------------------------------------------------------------ *
 * 首页
 * ------------------------------------------------------------------ */

function pageHome() {
  const active = state.questions.filter(isActive);
  const due = active.filter(isDue).sort((a, b) => new Date(a.nextReviewAt) - new Date(b.nextReviewAt));
  const stats = knowledgeStats();
  const weak = stats.filter((s) => s.count >= 2).slice(0, 5);
  const recent = active.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  const weekCount = active.filter((q) => new Date(q.createdAt) >= addDays(new Date(), -7)).length;
  const mapSummaries = mapWeakSummaries();
  const weakMaps = mapSummaries.filter((m) => m.weakCount > 0);
  const weakMapCount = weakMaps.length;
  const maxWeak = weak[0]?.count || 1;

  const dueList = due.length
    ? due.slice(0, 5).map((q, i) => `<a class="due-item" href="#/q/${q.id}">
        <span class="due-num">${i + 1}</span>
        <span class="due-main">
          <span class="due-title">${esc(qTitle(q))}</span>
          <span class="due-meta">${esc(q.subject)} · ${esc(q.module)} · ${relativeDue(q.nextReviewAt)}</span>
        </span>
        ${icon('arrow-left', 'due-arrow')}
      </a>`).join('')
    : emptyState('check', '今天没有到期错题', '可以录入新错题，或去复习列表看看即将到期的题目。', '<a class="btn btn-soft btn-sm" href="#/add">录入错题</a>');

  const weakList = weak.length
    ? weak.map((item) => `<div class="weak-item">
        <span class="weak-name">${esc(item.kp)}</span>
        <span class="weak-count">${item.count} 道</span>
        <span class="weak-bar"><span style="width:${Math.max(12, Math.round((item.count / maxWeak) * 100))}%"></span></span>
      </div>`).join('')
    : emptyState('chart', '还没有薄弱考点', '同一考点累计 2 道错题后，会在这里标出。');

  const mapReminder = weakMaps.length
    ? weakMaps.slice(0, 2).map((item) => `<a class="map-reminder" href="#/map/${item.map.id}">
        <span class="map-glyph">${icon('map')}</span>
        <span class="due-main">
          <span class="due-title">${esc(item.map.title)}</span>
          <span class="due-meta">${item.weakCount} 个薄弱节点待复盘 · ${item.weakLabels.slice(0, 3).map(esc).join('、')}</span>
        </span>
      </a>`).join('')
    : `<div class="empty" style="padding:22px 10px">
        <div class="empty-icon">${icon('map')}</div>
        <h3>用导图看薄弱点</h3>
        <p>上传一张思维导图，系统会把错题考点和导图节点对上号。</p>
        <a class="btn btn-soft btn-sm" href="#/maps">去上传导图</a>
      </div>`;

  return {
    title: '首页',
    sub: '事业单位 D 类 · 职测 + 综应',
    active: 'home',
    actions: `<a class="btn btn-primary btn-sm" href="#/add">${icon('plus')}<span>录入错题</span></a>`,
    content: `
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">${esc(new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date()))}</p>
          <h1>${greeting()}，把错题变成得分点。</h1>
          <p>${due.length ? `今天有 ${due.length} 道错题待复习。` : '今天没有到期错题。'} 当前共 ${active.length} 道错题、${weak.length} 个薄弱考点${weakMapCount ? `、${weakMapCount} 张导图待复盘` : ''}。</p>
        </div>
        <div class="hero-actions">
          <a class="btn btn-primary" href="#/add">${icon('plus')}录入错题</a>
          <a class="btn btn-ghost" href="#/review">${icon('calendar')}开始复习</a>
        </div>
      </section>

      <div class="stat-grid">
        <div class="stat alert"><div class="stat-value">${due.length}<small>道</small></div><div class="stat-label">今日待复习</div></div>
        <div class="stat"><div class="stat-value">${active.length}<small>道</small></div><div class="stat-label">错题总数</div></div>
        <div class="stat"><div class="stat-value">${weekCount}<small>道</small></div><div class="stat-label">近 7 天新增</div></div>
        <div class="stat"><div class="stat-value">${weak.length}<small>个</small></div><div class="stat-label">薄弱考点</div></div>
      </div>

      <div class="home-grid">
        <section class="card card-pad">
          <div class="card-head">
            <div><h2 class="card-title">今日待复习</h2><p class="card-sub">按到期时间排序，点开即可复习</p></div>
            <a class="btn btn-ghost btn-xs" href="#/review">全部</a>
          </div>
          <div class="due-list">${dueList}</div>
        </section>

        <section class="card card-pad">
          <div class="card-head">
            <div><h2 class="card-title">薄弱考点</h2><p class="card-sub">同一考点累计 2 道错题即标出</p></div>
            <a class="btn btn-ghost btn-xs" href="#/library">错题本</a>
          </div>
          <div class="weak-list">${weakList}</div>
        </section>

        <section class="card card-pad span-2">
          <div class="card-head">
            <div><h2 class="card-title">最近错题</h2><p class="card-sub">刚录入的题，先看原因再看考点</p></div>
            <a class="btn btn-ghost btn-xs" href="#/library">查看全部</a>
          </div>
          <div class="q-list">${recent.length ? recent.map(questionCard).join('') : emptyState('book', '还没有错题', '拍照、上传文件或手动输入，先把第一道错题记下来。', '<a class="btn btn-primary btn-sm" href="#/add">录入第一道错题</a>')}</div>
        </section>

        <section class="card card-pad">
          <div class="card-head">
            <div><h2 class="card-title">导图复盘</h2><p class="card-sub">上传导图，对照错题标薄弱点</p></div>
            <a class="btn btn-ghost btn-xs" href="#/maps">管理</a>
          </div>
          <div>${mapReminder}</div>
        </section>
      </div>`
  };
}

/* ------------------------------------------------------------------ *
 * 错题本
 * ------------------------------------------------------------------ */

function allModuleNames(subject) {
  if (subject === '全部') {
    return uniq(Object.values(SUBJECTS).flatMap((s) => s.modules.map((m) => m.name)));
  }
  return (SUBJECTS[subject]?.modules || []).map((m) => m.name);
}

function moduleIndex(subject, module) {
  const s = SUBJECTS[subject];
  if (!s) return 99;
  const index = s.modules.findIndex((m) => m.name === module);
  return index === -1 ? 90 : index;
}

function matchesStatus(q, status) {
  if (status === 'all') return true;
  if (status === 'archived') return q.status === 'archived';
  if (status === 'due') return isDue(q);
  if (status === 'mastered') return q.status === 'mastered';
  return isActive(q);
}

function filteredLibraryQuestions() {
  const lib = state.library;
  const keyword = lib.q.trim().toLowerCase();
  return state.questions.filter((q) => {
    if (!matchesStatus(q, lib.status)) return false;
    if (lib.subject !== '全部' && q.subject !== lib.subject) return false;
    if (lib.module !== '全部' && q.module !== lib.module) return false;
    if (lib.kp !== '全部' && !(q.knowledgePoints || []).includes(lib.kp)) return false;
    if (keyword) {
      const haystack = [q.stem, q.myAnswer, q.correctAnswer, q.module, q.source, ...(q.knowledgePoints || []), q.analysis?.reason]
        .join(' ').toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function libraryListHTML() {
  const list = filteredLibraryQuestions();
  if (!list.length) {
    return emptyState('search', '没有符合条件的错题', '换一个筛选条件，或先去录入一道新错题。', '<a class="btn btn-soft btn-sm" href="#/add">录入错题</a>');
  }
  const groups = new Map();
  for (const q of list) {
    const key = `${q.subject}|${q.module}`;
    if (!groups.has(key)) groups.set(key, { subject: q.subject, module: q.module, items: [] });
    groups.get(key).items.push(q);
  }
  const ordered = [...groups.values()].sort((a, b) => {
    const subjectOrder = ['职测', '综应'];
    return subjectOrder.indexOf(a.subject) - subjectOrder.indexOf(b.subject)
      || moduleIndex(a.subject, a.module) - moduleIndex(b.subject, b.module);
  });
  return ordered.map((group) => `<div class="group-block">
    <div class="group-head"><h3>${esc(group.subject)} · ${esc(group.module)}</h3><span>${group.items.length} 道</span></div>
    <div class="q-list">${group.items.map(questionCard).join('')}</div>
  </div>`).join('');
}

function libraryCounts() {
  const lib = state.library;
  const base = state.questions.filter((q) => matchesStatus(q, lib.status) && (lib.subject === '全部' || q.subject === lib.subject));
  const moduleCounts = new Map();
  const kpCounts = new Map();
  for (const q of base) {
    moduleCounts.set(q.module, (moduleCounts.get(q.module) || 0) + 1);
    for (const kp of uniq(q.knowledgePoints || [])) kpCounts.set(kp, (kpCounts.get(kp) || 0) + 1);
  }
  return { moduleCounts, kpCounts };
}

function pageLibrary() {
  const lib = state.library;
  const { moduleCounts, kpCounts } = libraryCounts();
  const modules = allModuleNames(lib.subject);
  const kpTop = [...kpCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh')).slice(0, 14);
  const subjects = ['全部', '职测', '综应'];
  const statuses = [
    { key: 'active', label: '全部错题' },
    { key: 'due', label: '待复习' },
    { key: 'mastered', label: '已掌握' },
    { key: 'archived', label: '已归档' },
    { key: 'all', label: '含全部状态' }
  ];

  const subjectButtons = subjects.map((s) => `<button type="button" class="seg-btn${lib.subject === s ? ' active' : ''}" data-filter="subject" data-value="${s}">${s}</button>`).join('');
  const moduleChips = [`<button type="button" class="filter-chip${lib.module === '全部' ? ' active' : ''}" data-filter="module" data-value="全部">全部</button>`]
    .concat(modules.filter((m) => m !== '其他' || moduleCounts.get('其他')).map((m) => `<button type="button" class="filter-chip${lib.module === m ? ' active' : ''}" data-filter="module" data-value="${esc(m)}">${esc(m)}<span class="count">${moduleCounts.get(m) || 0}</span></button>`))
    .join('');
  const kpChips = [`<button type="button" class="filter-chip${lib.kp === '全部' ? ' active' : ''}" data-filter="kp" data-value="全部">全部</button>`]
    .concat(kpTop.map(([kp, count]) => `<button type="button" class="filter-chip${lib.kp === kp ? ' active' : ''}" data-filter="kp" data-value="${esc(kp)}">${esc(kp)}<span class="count">${count}</span></button>`))
    .join('');
  const statusChips = statuses.map((s) => `<button type="button" class="filter-chip${lib.status === s.key ? ' active' : ''}" data-filter="status" data-value="${s.key}">${s.label}</button>`).join('');

  const count = filteredLibraryQuestions().length;

  return {
    title: '错题本',
    sub: '按章节与考点整理，离线也能查看',
    active: 'library',
    actions: `<a class="btn btn-primary btn-sm" href="#/add">${icon('plus')}<span>录入错题</span></a>`,
    content: `
      <div class="section-head">
        <div><h2>章节 / 考点本</h2><p>按科目、模块和考点归档，点开题目可补充笔记与复习。</p></div>
      </div>
      <div class="library-layout">
        <aside class="filter-rail">
          <div class="row" style="gap:8px;margin-bottom:10px">
            <div class="segmented" style="flex:1">${subjectButtons}</div>
            <button type="button" class="btn btn-ghost btn-sm mobile-filter-toggle" data-toggle-filter>筛选</button>
          </div>
          <div class="card filter-panel" id="filter-panel">
            <div class="search-box">${icon('search')}<input class="input" id="library-search" type="search" placeholder="搜题干、答案、考点…" value="${esc(lib.q)}" /></div>
            <div class="filter-group">
              <div class="filter-title">章节 / 模块</div>
              <div class="filter-list">${moduleChips}</div>
            </div>
            <div class="filter-group">
              <div class="filter-title">考点</div>
              <div class="filter-list">${kpChips}</div>
            </div>
            <div class="filter-group">
              <div class="filter-title">状态</div>
              <div class="filter-list">${statusChips}</div>
            </div>
            <div class="filter-group">
              <button type="button" class="btn btn-ghost btn-sm btn-block" data-reset-filter>重置筛选</button>
            </div>
          </div>
        </aside>
        <section>
          <div class="library-toolbar">
            <span class="library-count" id="library-count">共 ${count} 道</span>
            <a class="btn btn-ghost btn-xs" href="#/review">${icon('calendar')}去复习</a>
          </div>
          <div id="library-list">${libraryListHTML()}</div>
        </section>
      </div>`
  };
}

function bindLibrary() {
  const lib = state.library;
  qsa('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.filter;
      const value = btn.dataset.value;
      if (key === 'subject') {
        lib.subject = value;
        lib.module = '全部';
        lib.kp = '全部';
      } else {
        lib[key] = value;
      }
      renderRoute(true);
    });
  });
  qs('[data-toggle-filter]')?.addEventListener('click', () => {
    qs('#filter-panel')?.classList.toggle('mobile-open');
  });
  qs('[data-reset-filter]')?.addEventListener('click', () => {
    state.library = { subject: '全部', module: '全部', kp: '全部', q: '', status: 'active' };
    renderRoute(true);
  });
  const search = qs('#library-search');
  search?.addEventListener('input', () => {
    lib.q = search.value;
    const list = qs('#library-list');
    const count = qs('#library-count');
    if (list) list.innerHTML = libraryListHTML();
    if (count) count.textContent = `共 ${filteredLibraryQuestions().length} 道`;
    hydrateFiles(list || document);
  });
}

/* ------------------------------------------------------------------ *
 * 录入
 * ------------------------------------------------------------------ */

function freshDraft() {
  return {
    subject: '职测',
    module: '常识判断',
    stem: '',
    myAnswer: '',
    correctAnswer: '',
    source: '',
    knowledgePoints: '',
    selfCauseTags: []
  };
}

function ensureDraft() {
  if (!addDraft) addDraft = freshDraft();
  const modules = SUBJECTS[addDraft.subject]?.modules || [];
  if (!modules.some((m) => m.name === addDraft.module)) {
    addDraft.module = modules[0]?.name || '其他';
  }
  return addDraft;
}

function clearAddDraft() {
  for (const item of pendingAttachments) {
    if (item.url) URL.revokeObjectURL(item.url);
  }
  pendingAttachments = [];
  addDraft = null;
}

function renderAttachmentPreview() {
  const grid = qs('#attach-grid');
  if (!grid) return;
  grid.innerHTML = pendingAttachments.map((item) => {
    if (String(item.type || '').startsWith('image/')) {
      return `<div class="attach-item">
        <img src="${esc(item.url)}" alt="${esc(item.name)}" />
        <button type="button" class="attach-remove" data-remove-attachment="${esc(item.key)}" aria-label="移除">${icon('x')}</button>
      </div>`;
    }
    return `<div class="attach-item">
      <div class="attach-file">${icon('file')}<span>${esc(truncate(item.name, 18))}</span></div>
      <button type="button" class="attach-remove" data-remove-attachment="${esc(item.key)}" aria-label="移除">${icon('x')}</button>
    </div>`;
  }).join('');
  grid.hidden = pendingAttachments.length === 0;
}

async function addFiles(fileList) {
  const files = [...(fileList || [])];
  if (!files.length) return;
  processingFiles += 1;
  toast(`正在处理 ${files.length} 个文件…`);
  try {
    for (const file of files) {
      try {
        const prepared = await prepareBlob(file);
        if (!prepared) continue;
        const blob = isBlobValue(prepared.blob)
          ? prepared.blob
          : await storableAttachmentBlob(prepared.blob ?? prepared.url);
        pendingAttachments.push({
          key: uuid(),
          blob,
          name: prepared.name || blob.name || '附件',
          type: prepared.type || blob.type || 'application/octet-stream',
          size: blob.size,
          url: URL.createObjectURL(blob)
        });
      } catch (error) {
        toast(friendlySaveError(error), 'error');
      }
    }
  } finally {
    processingFiles -= 1;
    renderAttachmentPreview();
  }
}

function moduleOptions(subject, selected) {
  return (SUBJECTS[subject]?.modules || []).map((m) => `<option value="${esc(m.name)}"${m.name === selected ? ' selected' : ''}>${esc(m.name)}</option>`).join('');
}

function pageAdd() {
  const draft = ensureDraft();
  const selfCauses = CAUSE_TAGS.filter((c) => c !== '信息不足');
  const modeText = state.settings.analysisMode === 'api' && state.settings.api.baseUrl && state.settings.api.model
    ? '保存后先本地分析，联网可用时自动尝试 AI 分析'
    : '使用本地规则分析（离线可用，不产生费用）';

  return {
    title: '录入错题',
    sub: '拍照、上传、截图或手动输入',
    active: 'add',
    actions: topbarBack('#/home', '返回'),
    content: `
      <div class="form-page">
        <form class="card form-card" id="add-form" novalidate>
          <div class="form-section">
            <div class="form-section-head"><span class="step-no">1</span><h2>题目归属</h2></div>
            <div class="form-grid">
              <div class="field full">
                <span class="field-label">科目</span>
                <div class="segmented" id="subject-switch">
                  ${Object.keys(SUBJECTS).map((s) => `<button type="button" class="seg-btn${draft.subject === s ? ' active' : ''}" data-subject="${s}">${s}</button>`).join('')}
                </div>
              </div>
              <div class="field">
                <label for="module">章节 / 模块</label>
                <select class="select" id="module" name="module">${moduleOptions(draft.subject, draft.module)}</select>
              </div>
              <div class="field">
                <label for="source">来源（可选）</label>
                <input class="input" id="source" name="source" type="text" placeholder="如：2025 联考 D 类 / 某套卷" value="${esc(draft.source)}" />
              </div>
            </div>
          </div>

          <div class="form-section">
            <div class="form-section-head"><span class="step-no">2</span><h2>题目内容</h2></div>
            <div class="form-grid">
              <div class="field full">
                <label for="stem">题干 / 材料</label>
                <textarea class="textarea" id="stem" name="stem" rows="5" placeholder="可直接输入文字；也可以只拍照，留空题干。">${esc(draft.stem)}</textarea>
              </div>
              <div class="field">
                <label for="myAnswer">我的答案 / 我的作答</label>
                <textarea class="textarea" id="myAnswer" name="myAnswer" rows="3" placeholder="选了什么、写了哪些要点">${esc(draft.myAnswer)}</textarea>
              </div>
              <div class="field">
                <label for="correctAnswer">正确答案 / 参考要点</label>
                <textarea class="textarea" id="correctAnswer" name="correctAnswer" rows="3" placeholder="正确答案或参考答案要点">${esc(draft.correctAnswer)}</textarea>
              </div>
            </div>
          </div>

          <div class="form-section">
            <div class="form-section-head"><span class="step-no">3</span><h2>拍照 / 文件 / 截图</h2></div>
            <div class="upload-zone" id="upload-zone" role="button" tabindex="0">
              ${icon('upload')}
              <strong>点这里选择图片、文件或截图</strong>
              <span>支持相册、相机、PDF 等；iPad 也可直接粘贴截图</span>
            </div>
            <div class="upload-buttons">
              <button type="button" class="btn btn-soft btn-sm" data-pick="camera">${icon('camera')}拍照</button>
              <button type="button" class="btn btn-ghost btn-sm" data-pick="library">${icon('image')}相册 / 文件</button>
            </div>
            <input type="file" id="camera-input" accept="image/*" capture="environment" hidden />
            <input type="file" id="file-input" multiple hidden />
            <div class="attach-grid" id="attach-grid" ${pendingAttachments.length ? '' : 'hidden'}></div>
            <p class="hint" style="margin-top:8px">图片会压缩后只存本机；原图不会上传。单文件上限 30MB。</p>
          </div>

          <div class="form-section">
            <div class="form-section-head"><span class="step-no">4</span><h2>考点与错因</h2></div>
            <div class="form-grid">
              <div class="field full">
                <label for="knowledgePoints">考点标注（可选，逗号分隔）</label>
                <input class="input" id="knowledgePoints" name="knowledgePoints" type="text" placeholder="如：增长率、比重、审题" value="${esc(draft.knowledgePoints)}" />
                <p class="hint">留空时，系统会根据题干、模块自动识别考点。</p>
              </div>
              <div class="field full">
                <span class="field-label">自评错因（可选，可多选）</span>
                <div class="cause-picker">
                  ${selfCauses.map((cause) => `<label class="cause-option">
                    <input type="checkbox" name="selfCause" value="${cause}"${draft.selfCauseTags.includes(cause) ? ' checked' : ''} />
                    <span>${cause}</span>
                  </label>`).join('')}
                </div>
              </div>
              <div class="full analysis-mode-note">${icon('sparkle')}<span>${modeText}</span></div>
            </div>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-ghost" data-submit="plain">仅保存</button>
            <button type="submit" class="btn btn-primary" data-submit="analyze">${icon('sparkle')}保存并分析</button>
          </div>
        </form>
      </div>`
  };
}

function captureAddForm() {
  if (!addDraft) return;
  const form = qs('#add-form');
  if (!form) return;
  addDraft.stem = form.stem?.value ?? addDraft.stem;
  addDraft.myAnswer = form.myAnswer?.value ?? addDraft.myAnswer;
  addDraft.correctAnswer = form.correctAnswer?.value ?? addDraft.correctAnswer;
  addDraft.source = form.source?.value ?? addDraft.source;
  addDraft.knowledgePoints = form.knowledgePoints?.value ?? addDraft.knowledgePoints;
  addDraft.module = form.module?.value ?? addDraft.module;
  addDraft.selfCauseTags = qsa('input[name="selfCause"]:checked', form).map((input) => input.value);
}

function bindAdd() {
  const form = qs('#add-form');
  if (!form) return;
  renderAttachmentPreview();

  qsa('[data-subject]').forEach((btn) => {
    btn.addEventListener('click', () => {
      captureAddForm();
      addDraft.subject = btn.dataset.subject;
      addDraft.module = SUBJECTS[addDraft.subject].modules[0].name;
      renderRoute(true);
    });
  });

  form.addEventListener('input', () => captureAddForm());
  qs('#module')?.addEventListener('change', () => captureAddForm());
  form.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-submit]');
    if (btn) addSubmitMode = btn.dataset.submit;
  });

  qsa('[data-pick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      qs(btn.dataset.pick === 'camera' ? '#camera-input' : '#file-input')?.click();
    });
  });
  qs('#upload-zone')?.addEventListener('click', () => qs('#file-input')?.click());
  qs('#upload-zone')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      qs('#file-input')?.click();
    }
  });
  qs('#camera-input')?.addEventListener('change', async (e) => {
    await addFiles(e.target.files);
    e.target.value = '';
  });
  qs('#file-input')?.addEventListener('change', async (e) => {
    await addFiles(e.target.files);
    e.target.value = '';
  });
  qs('#attach-grid')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-attachment]');
    if (!btn) return;
    const index = pendingAttachments.findIndex((item) => item.key === btn.dataset.removeAttachment);
    if (index >= 0) {
      URL.revokeObjectURL(pendingAttachments[index].url);
      pendingAttachments.splice(index, 1);
      renderAttachmentPreview();
    }
  });

  const zone = qs('#upload-zone');
  ['dragenter', 'dragover'].forEach((eventName) => zone?.addEventListener(eventName, (e) => {
    e.preventDefault();
    zone.classList.add('drag');
  }));
  ['dragleave', 'drop'].forEach((eventName) => zone?.addEventListener(eventName, (e) => {
    e.preventDefault();
    zone.classList.remove('drag');
  }));
  zone?.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const analyze = (e.submitter?.dataset.submit || addSubmitMode) !== 'plain';
    await saveNewQuestion(analyze);
  });
}

async function saveNewQuestion(analyze) {
  if (processingFiles > 0) {
    toast('文件还在处理中，请稍候再保存', 'error');
    return;
  }
  captureAddForm();
  const draft = addDraft;
  if (!draft) return;
  const hasContent = draft.stem.trim() || draft.myAnswer.trim() || draft.correctAnswer.trim() || pendingAttachments.length;
  if (!hasContent) {
    toast('至少写一点题干、答案，或添加一张图片', 'error');
    return;
  }

  const submitButtons = qsa('#add-form button[type="submit"]');
  submitButtons.forEach((b) => { b.disabled = true; });
  try {
    const attachments = [];
    const fileRecords = [];
    for (const item of pendingAttachments) {
      // 只把真正的二进制写进 files；预览用的 blob: url 在这里被明确丢弃。
      const blob = await storableAttachmentBlob(item.blob ?? item.url ?? item.dataUrl);
      const id = uuid();
      attachments.push({
        id,
        name: item.name || blob.name || '附件',
        type: item.type || blob.type || 'application/octet-stream',
        size: blob.size
      });
      fileRecords.push(fileRecordFrom(id, item, blob));
    }
    if (fileRecords.length) await putMany('files', fileRecords);

    const id = uuid();
    const now = new Date();
    const q = {
      id,
      subject: draft.subject,
      module: draft.module,
      knowledgePoints: splitKnowledgePoints(draft.knowledgePoints),
      selfCauseTags: draft.selfCauseTags,
      stem: draft.stem.trim(),
      myAnswer: draft.myAnswer.trim(),
      correctAnswer: draft.correctAnswer.trim(),
      source: draft.source.trim(),
      note: '',
      attachments,
      analysis: null,
      status: 'new',
      reviewStage: 0,
      reviewCount: 0,
      lastReviewedAt: null,
      nextReviewAt: addDays(now, 1).toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    if (analyze) {
      const analysis = analyzeLocal(q);
      q.analysis = analysis;
      q.knowledgePoints = mergeKnowledgePoints(q.knowledgePoints, analysis.knowledgePoints);
    }

    await putOne('questions', q);
    state.questions.unshift(q);
    clearAddDraft();
    location.hash = `#/q/${id}`;
    toast(analyze ? '已保存，并完成本地分析' : '已保存', 'success');

    const api = state.settings.api;
    if (analyze && state.settings.analysisMode === 'api' && api.baseUrl && api.model && navigator.onLine) {
      setTimeout(() => runAnalysis(id, 'remote', { silent: true }), 500);
    }
  } catch (error) {
    toast(`保存失败：${friendlySaveError(error)}`, 'error');
    submitButtons.forEach((b) => { b.disabled = false; });
  }
}

/* ------------------------------------------------------------------ *
 * 错题详情
 * ------------------------------------------------------------------ */

function analysisCard(q) {
  if (state.pendingRemote.has(q.id)) {
    return `<section class="card analysis-card">
      <div class="analysis-head"><h2>${icon('sparkle')}错因分析</h2><span class="provider">联网分析中</span></div>
      <div class="loading-bar" style="margin-top:16px"></div>
      <p class="analysis-remote-note">正在请求已配置的 AI 接口，失败会自动保留本地分析结果。</p>
    </section>`;
  }

  const analysis = q.analysis;
  const canUseApi = state.settings.analysisMode === 'api' && state.settings.api.baseUrl && state.settings.api.model;
  const actionLabel = canUseApi ? '重新分析' : '重新分析';

  if (!analysis) {
    return `<section class="card analysis-card">
      <div class="analysis-head"><h2>${icon('sparkle')}错因分析</h2><span class="provider">未分析</span></div>
      <div class="analysis-empty">
        <p>还没有分析结果。本地规则离线可用；配置 API 后也可联网分析。</p>
        <div class="row-wrap">
          <button type="button" class="btn btn-primary btn-sm" data-analyze="auto">${icon('sparkle')}开始分析</button>
          <button type="button" class="btn btn-ghost btn-sm" data-analyze="local">仅本地分析</button>
        </div>
      </div>
    </section>`;
  }

  return `<section class="card analysis-card">
    <div class="analysis-head">
      <h2>${icon('sparkle')}错因分析</h2>
      <span class="provider${analysis.provider === 'api' ? ' api' : ''}">${esc(providerLabel(analysis))}</span>
    </div>
    <div class="analysis-block">
      <div class="analysis-block-title">错因标签</div>
      <div class="row-wrap">${(analysis.causeTags || []).map(causeChip).join('')}</div>
    </div>
    <div class="analysis-block">
      <div class="analysis-block-title">原因判断</div>
      <p class="analysis-reason">${esc(analysis.reason || '—')}</p>
    </div>
    ${analysis.advice ? `<div class="analysis-advice">${esc(analysis.advice)}</div>` : ''}
    <div class="analysis-block">
      <div class="analysis-block-title">建议考点</div>
      <div class="row-wrap">${kpChips(analysis.knowledgePoints, 8) || '<span class="muted small">未识别到考点</span>'}</div>
    </div>
    ${analysis.remoteError ? `<p class="analysis-error">联网分析失败：${esc(analysis.remoteError)}</p>` : ''}
    <div class="row" style="justify-content:space-between;margin-top:15px">
      <p class="analysis-remote-note" style="margin:0">${analysis.provider === 'api' ? '本次由已配置的 AI 接口分析，仅发送文字。' : '本地规则分析，不联网、不产生费用。'}</p>
      <button type="button" class="btn btn-ghost btn-xs" data-analyze="auto" ${state.pendingRemote.has(q.id) ? 'disabled' : ''}>${icon('refresh')}${actionLabel}</button>
    </div>
  </section>`;
}

function pageDetail(id) {
  const q = findQuestion(id);
  if (!q) {
    return {
      title: '错题详情', sub: '', active: 'library', actions: topbarBack('#/library'),
      content: emptyState('alert', '这道错题不在了', '可能已被归档或数据被清理。', '<a class="btn btn-soft btn-sm" href="#/library">返回错题本</a>')
    };
  }

  const canUseApi = state.settings.analysisMode === 'api' && state.settings.api.baseUrl && state.settings.api.model;
  const attachments = attachmentTiles(q.attachments);
  const kpValue = splitKnowledgePoints(q.knowledgePoints).join('、');
  const modules = SUBJECTS[q.subject]?.modules || [];
  const archived = q.status === 'archived';

  return {
    title: '错题详情',
    sub: `${q.subject} · ${q.module}`,
    active: 'library',
    actions: topbarBack('#/library', '错题本'),
    content: `
      <div class="detail-grid">
        <div class="detail-main">
          <section class="card content-card">
            <div class="detail-topline">
              ${subjectChip(q.subject)}
              <span class="chip chip-teal">${esc(q.module)}</span>
              ${statusChip(q)}
              <span class="detail-date">${formatDateTime(q.createdAt)} 录入</span>
            </div>
            <div class="row-wrap" style="margin-top:12px">${kpChips(q.knowledgePoints, 10) || '<span class="muted small">未标注考点，可在页面下方整理</span>'}</div>
            <div class="stem-text">${q.stem ? esc(q.stem) : '<span class="muted">题干未填写，可参考下方图片。</span>'}</div>
            ${attachments}
            <div class="answer-grid">
              <div class="answer-box"><div class="answer-label">我的答案</div><div class="answer-value">${q.myAnswer ? esc(q.myAnswer) : '<span class="muted">未填写</span>'}</div></div>
              <div class="answer-box correct"><div class="answer-label">正确答案 / 参考要点</div><div class="answer-value">${q.correctAnswer ? esc(q.correctAnswer) : '<span class="muted">未填写</span>'}</div></div>
            </div>
            ${q.source ? `<p class="hint" style="margin-top:12px">来源：${esc(q.source)}</p>` : ''}
          </section>

          ${analysisCard(q)}
        </div>

        <aside class="detail-side">
          <section class="card side-card">
            <div class="row" style="justify-content:space-between">
              <h3>复习安排</h3>
              <span class="chip ${isDue(q) ? 'chip-red' : 'chip-line'}">${isDue(q) ? '已到期' : '未到期'}</span>
            </div>
            <div class="review-dates">
              <div class="review-date"><strong>${relativeDue(q.nextReviewAt)}</strong><span>下次复习</span></div>
              <div class="review-date"><strong>${q.reviewCount || 0} 次</strong><span>已复习</span></div>
            </div>
            <p class="hint">忘记 → 1 天后；模糊 → 3 天后；记住 → 逐步拉长间隔。</p>
            ${archived ? '<p class="hint" style="margin-top:8px">已归档。恢复后才能继续安排复习。</p>' : `<div class="review-buttons" style="margin-top:12px">
              <button type="button" class="btn review-btn-again" data-review="again">忘记</button>
              <button type="button" class="btn review-btn-hard" data-review="hard">模糊</button>
              <button type="button" class="btn review-btn-good" data-review="good">记住</button>
            </div>`}
            ${!archived ? `<button type="button" class="btn btn-ghost btn-sm btn-block" style="margin-top:8px" data-review-now>加入今日复习</button>` : ''}
          </section>

          <section class="card side-card">
            <h3>整理到章节 / 考点本</h3>
            <form id="organize-form" style="margin-top:12px;display:flex;flex-direction:column;gap:10px">
              <div class="field">
                <label for="org-subject">科目</label>
                <select class="select" id="org-subject" name="subject">
                  ${Object.keys(SUBJECTS).map((s) => `<option value="${s}"${q.subject === s ? ' selected' : ''}>${s}</option>`).join('')}
                </select>
              </div>
              <div class="field">
                <label for="org-module">章节 / 模块</label>
                <select class="select" id="org-module" name="module">${moduleOptions(q.subject, q.module)}</select>
              </div>
              <div class="field">
                <label for="org-kp">考点（逗号分隔）</label>
                <input class="input" id="org-kp" name="knowledgePoints" value="${esc(kpValue)}" placeholder="如：增长率、比重" />
              </div>
              <button type="submit" class="btn btn-soft btn-sm">保存整理</button>
            </form>
          </section>

          <section class="card side-card">
            <h3>我的笔记</h3>
            <p class="hint">只存本机，离线可读可改。</p>
            <textarea class="textarea note-area" id="note-input" placeholder="记录易错点、复盘结论、下次注意…">${esc(q.note || '')}</textarea>
            <div class="note-actions"><button type="button" class="btn btn-soft btn-sm" id="save-note">保存笔记</button></div>
          </section>

          <section class="card side-card">
            <h3>题目信息</h3>
            <div class="meta-list" style="margin-top:10px">
              <div class="kv"><span>录入时间</span><span>${formatDateTime(q.createdAt)}</span></div>
              <div class="kv"><span>最近更新</span><span>${formatDateTime(q.updatedAt)}</span></div>
              <div class="kv"><span>附件</span><span>${q.attachments?.length || 0} 个</span></div>
              <div class="kv"><span>分析方式</span><span>${q.analysis ? esc(providerLabel(q.analysis)) : '未分析'}</span></div>
            </div>
            <div class="divider"></div>
            ${archived
              ? '<button type="button" class="btn btn-soft btn-sm btn-block" data-restore>恢复这道错题</button>'
              : '<button type="button" class="btn btn-danger-soft btn-sm btn-block" data-archive>归档（不删除数据）</button>'}
          </section>
        </aside>
      </div>`
  };
}

function bindDetail(id) {
  const q = findQuestion(id);
  if (!q) return;

  qsa('[data-analyze]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.analyze === 'local' ? 'local' : 'auto';
      runAnalysis(q.id, mode);
    });
  });

  qsa('[data-review]').forEach((btn) => {
    btn.addEventListener('click', () => reviewQuestion(q.id, btn.dataset.review));
  });

  qs('[data-review-now]')?.addEventListener('click', async () => {
    q.nextReviewAt = nowISO();
    q.updatedAt = nowISO();
    await putOne('questions', q);
    toast('已加入今日复习', 'success');
    renderRoute(true);
  });

  qs('#org-subject')?.addEventListener('change', (e) => {
    const modules = SUBJECTS[e.target.value]?.modules || [];
    const select = qs('#org-module');
    if (select) select.innerHTML = moduleOptions(e.target.value, modules[0]?.name);
  });

  qs('#organize-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const subject = qs('#org-subject').value;
    const module = qs('#org-module').value;
    const kp = splitKnowledgePoints(qs('#org-kp').value);
    q.subject = subject;
    q.module = module;
    q.knowledgePoints = kp;
    q.updatedAt = nowISO();
    await putOne('questions', q);
    toast('已整理到错题本', 'success');
    renderRoute(true);
  });

  qs('#save-note')?.addEventListener('click', async () => {
    q.note = qs('#note-input').value.trim();
    q.updatedAt = nowISO();
    await putOne('questions', q);
    toast('笔记已保存', 'success');
  });

  qs('[data-archive]')?.addEventListener('click', async () => {
    const ok = await confirmDialog('归档这道错题？', '归档不会删除任何数据，之后可以在错题本的「已归档」里恢复。', '归档');
    if (!ok) return;
    q.status = 'archived';
    q.updatedAt = nowISO();
    await putOne('questions', q);
    toast('已归档，可随时恢复', 'success');
    location.hash = '#/library';
  });

  qs('[data-restore]')?.addEventListener('click', async () => {
    q.status = q.reviewStage > 0 ? 'reviewing' : 'new';
    q.updatedAt = nowISO();
    await putOne('questions', q);
    toast('已恢复', 'success');
    renderRoute(true);
  });
}

/* ------------------------------------------------------------------ *
 * 分析调用
 * ------------------------------------------------------------------ */

async function runAnalysis(id, mode = 'auto', options = {}) {
  const q = findQuestion(id);
  if (!q) return;
  const api = state.settings.api;
  const useRemote = mode === 'remote' || (mode === 'auto' && state.settings.analysisMode === 'api');

  if (useRemote) {
    if (!api.baseUrl || !api.model) {
      toast('尚未配置联网分析，已改用本地规则', 'error');
      return runAnalysis(id, 'local', options);
    }
    if (!navigator.onLine) {
      toast('当前离线，已改用本地规则', 'error');
      return runAnalysis(id, 'local', options);
    }
    state.pendingRemote.add(id);
    if (state.currentPage === 'q') renderRoute(true);
    try {
      const analysis = await analyzeRemote(q, api);
      q.analysis = analysis;
      q.knowledgePoints = mergeKnowledgePoints(q.knowledgePoints, analysis.knowledgePoints);
      q.updatedAt = nowISO();
      await putOne('questions', q);
      if (!options.silent) toast('联网分析完成', 'success');
    } catch (error) {
      if (!q.analysis) {
        q.analysis = analyzeLocal(q);
        q.knowledgePoints = mergeKnowledgePoints(q.knowledgePoints, q.analysis.knowledgePoints);
      }
      q.analysis.remoteError = error.message || '未知错误';
      q.updatedAt = nowISO();
      await putOne('questions', q);
      toast(`联网分析失败：${error.message}。已保留本地分析。`, 'error');
    } finally {
      state.pendingRemote.delete(id);
      if (state.currentPage === 'q') renderRoute(true);
    }
    return;
  }

  const analysis = analyzeLocal(q);
  q.analysis = analysis;
  q.knowledgePoints = mergeKnowledgePoints(q.knowledgePoints, analysis.knowledgePoints);
  q.updatedAt = nowISO();
  await putOne('questions', q);
  if (!options.silent) toast('本地分析完成', 'success');
  if (state.currentPage === 'q') renderRoute(true);
  else if (state.currentPage === 'home' || state.currentPage === 'review') renderRoute(true);
}

function reviewQuestion(id, rating) {
  const q = findQuestion(id);
  if (!q) return;
  const now = new Date();
  let stage = Math.max(0, Number(q.reviewStage) || 0);
  if (rating === 'again') stage = 0;
  else if (rating === 'hard') stage = Math.max(1, stage);
  else stage = Math.min(REVIEW_INTERVALS.length - 1, stage + 1);

  const days = rating === 'again' ? 1 : rating === 'hard' ? 3 : REVIEW_INTERVALS[stage] || 1;
  q.reviewStage = stage;
  q.reviewCount = (q.reviewCount || 0) + 1;
  q.lastReviewedAt = now.toISOString();
  q.nextReviewAt = addDays(now, days).toISOString();
  q.status = stage >= 5 ? 'mastered' : 'reviewing';
  q.updatedAt = now.toISOString();

  putOne('questions', q).then(() => {
    toast(`已记录，${days} 天后再复习`, 'success');
    renderRoute(true);
  }).catch((error) => toast(`保存失败：${error.message}`, 'error'));
}

/* ------------------------------------------------------------------ *
 * 复习
 * ------------------------------------------------------------------ */

function pageReview() {
  const active = state.questions.filter(isActive);
  const due = active.filter(isDue).sort((a, b) => new Date(a.nextReviewAt) - new Date(b.nextReviewAt));
  const upcoming = active
    .filter((q) => !isDue(q) && dayDiff(q.nextReviewAt) <= 7 && dayDiff(q.nextReviewAt) > 0)
    .sort((a, b) => new Date(a.nextReviewAt) - new Date(b.nextReviewAt));
  const mastered = active.filter((q) => q.status === 'mastered');

  const reviewRow = (q) => `<div class="review-row">
    <div class="review-main">
      <a class="review-title" href="#/q/${q.id}">${esc(qTitle(q))}</a>
      <div class="review-meta">${esc(q.subject)} · ${esc(q.module)} · ${isDue(q) ? '已到期' : relativeDue(q.nextReviewAt)}${q.analysis?.causeTags?.length ? ` · ${q.analysis.causeTags.slice(0, 2).map(esc).join(' / ')}` : ''}</div>
      <div class="q-tags">${kpChips(q.knowledgePoints, 3)}</div>
    </div>
    <div class="review-actions">
      <button type="button" class="btn review-btn-again btn-xs" data-review="again" data-id="${q.id}">忘记</button>
      <button type="button" class="btn review-btn-hard btn-xs" data-review="hard" data-id="${q.id}">模糊</button>
      <button type="button" class="btn review-btn-good btn-xs" data-review="good" data-id="${q.id}">记住</button>
    </div>
  </div>`;

  return {
    title: '复习',
    sub: '按到期时间安排，简单间隔复习',
    active: 'review',
    actions: `<a class="btn btn-primary btn-sm" href="#/add">${icon('plus')}<span>录入错题</span></a>`,
    content: `
      <div class="section-head">
        <div><h2>今天要复习的题</h2><p>点「忘记 / 模糊 / 记住」即可安排下一次；也可以点开题目慢慢看。</p></div>
      </div>
      <div class="review-summary">
        <div class="card stat ${due.length ? 'alert' : ''}"><div class="stat-value">${due.length}<small>道</small></div><div class="stat-label">已到期</div></div>
        <div class="card stat"><div class="stat-value">${upcoming.length}<small>道</small></div><div class="stat-label">7 天内到期</div></div>
        <div class="card stat"><div class="stat-value">${mastered.length}<small>道</small></div><div class="stat-label">已掌握</div></div>
      </div>

      <section class="card card-pad" style="margin-bottom:18px">
        <div class="card-head"><div><h2 class="card-title">已到期</h2><p class="card-sub">先复习这些，再看即将到期的题</p></div></div>
        ${due.length ? `<div>${due.map(reviewRow).join('')}</div>` : emptyState('check', '到期清单已清空', '可以去录入新错题，或翻翻错题本里的笔记。', '<a class="btn btn-soft btn-sm" href="#/library">打开错题本</a>')}
      </section>

      <section class="card card-pad">
        <div class="card-head"><div><h2 class="card-title">7 天内到期</h2><p class="card-sub">提前看一眼，避免堆积</p></div></div>
        ${upcoming.length ? `<div>${upcoming.map(reviewRow).join('')}</div>` : emptyState('calendar', '最近没有到期安排', '新录入的错题默认 1 天后进入复习。')}
      </section>`
  };
}

function bindReview() {
  qsa('[data-review]').forEach((btn) => {
    btn.addEventListener('click', () => reviewQuestion(btn.dataset.id, btn.dataset.review));
  });
}

/* ------------------------------------------------------------------ *
 * 导图复盘
 * ------------------------------------------------------------------ */

function normKey(value) {
  return String(value || '').toLowerCase().replace(/[\s·•,，、;；:：\-—_/\\（）()【】\[\]「」"'“”]/g, '');
}

function questionMatchesLabel(q, label) {
  const key = normKey(label);
  if (!key || key.length < 2) return false;
  const kps = Array.isArray(q.knowledgePoints) ? q.knowledgePoints : splitKnowledgePoints(q.knowledgePoints);
  if (kps.some((kp) => {
    const nk = normKey(kp);
    return nk && (nk === key || nk.includes(key) || key.includes(nk));
  })) return true;
  const moduleKey = normKey(q.module);
  return Boolean(moduleKey && (moduleKey === key || moduleKey.includes(key) || key.includes(moduleKey)));
}

function mapNodeMatches(map, node) {
  return state.questions.filter((q) => isActive(q) && questionMatchesLabel(q, node.label));
}

function mapWeakSummaries() {
  return state.maps.map((map) => {
    const weak = (map.nodes || []).filter((node) => node.selfWeak || mapNodeMatches(map, node).length > 0);
    return { map, weakCount: weak.length, weakLabels: weak.map((node) => node.label) };
  });
}

function pageMaps() {
  const summaries = mapWeakSummaries();
  const cards = state.maps.length
    ? state.maps.map((map) => {
      const image = attachmentThumb(map.image ? [map.image] : []);
      const weakCount = summaries.find((s) => s.map.id === map.id)?.weakCount || 0;
      return `<a class="card map-card" href="#/map/${map.id}">
        <div class="map-card-img">${image ? `<img data-file-img="${esc(image.id)}" alt="" />` : icon('map')}</div>
        <div class="map-card-body">
          <div class="map-card-title">${esc(map.title)}</div>
          <div class="map-card-meta">${(map.nodes || []).length} 个节点 · ${formatDate(map.createdAt, true)}</div>
          <div class="map-card-foot">
            <span class="chip ${weakCount ? 'chip-red' : 'chip-line'}">${weakCount ? `${weakCount} 个薄弱点` : '暂无薄弱点'}</span>
            <span class="small muted">查看复盘 →</span>
          </div>
        </div>
      </a>`;
    }).join('')
    : emptyState('map', '还没有导图', '上传一张思维导图，系统会自动把错题考点对照到节点上。');

  return {
    title: '导图复盘',
    sub: '上传导图 · 自动对照错题 · 标出薄弱点',
    active: 'maps',
    actions: '',
    content: `
      <div class="map-intro">
        ${icon('map')}
        <div>
          <h2>把错题放回知识框架里</h2>
          <p>V1 不识别图片文字：上传导图后，系统从已有错题的考点生成节点并自动对照；也可以手动补充节点、自标薄弱点。图片只存本机。</p>
        </div>
      </div>

      <section class="card card-pad" style="margin-bottom:20px">
        <div class="card-head"><div><h2 class="card-title">新建导图复盘</h2><p class="card-sub">可只建节点清单，也可附上导图图片</p></div></div>
        <form id="map-form" class="map-form">
          <div class="field full">
            <label for="map-title">导图名称</label>
            <input class="input" id="map-title" name="title" placeholder="如：资料分析 · 增长与比重" required />
          </div>
          <div class="field">
            <label for="map-image">导图图片（可选）</label>
            <input class="input" id="map-image" name="image" type="file" accept="image/*" />
            <p class="hint">jpg / png / 截图；会自动压缩。</p>
          </div>
          <div class="field">
            <span class="field-label">节点来源</span>
            <label class="radio-card" style="display:block">
              <input type="checkbox" name="autoNodes" checked />
              <span><strong>自动带入现有考点</strong><small>最多 24 个；可稍后手动增删</small></span>
            </label>
          </div>
          <div class="full row" style="justify-content:flex-end">
            <button type="submit" class="btn btn-primary">${icon('plus')}创建导图复盘</button>
          </div>
        </form>
      </section>

      <div class="section-head"><div><h2>我的导图</h2><p>红色节点 = 有对应错题的薄弱点；黄色 = 自标薄弱点。</p></div></div>
      <div class="map-grid">${cards}</div>`
  };
}

function bindMaps() {
  const form = qs('#map-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = qs('#map-title').value.trim();
    if (!title) {
      toast('请填写导图名称', 'error');
      return;
    }
    const file = qs('#map-image').files?.[0];
    const autoNodes = qs('input[name="autoNodes"]').checked;
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      let image = null;
      if (file) {
        const prepared = await prepareBlob(file);
        if (prepared) {
          const blob = await storableAttachmentBlob(prepared.blob ?? prepared.url);
          const id = uuid();
          image = {
            id,
            name: prepared.name || blob.name || '附件',
            type: prepared.type || blob.type || 'application/octet-stream',
            size: blob.size
          };
          await putOne('files', fileRecordFrom(id, prepared, blob));
        }
      }
      const labels = autoNodes ? knowledgeStats().map((item) => item.kp).slice(0, 24) : [];
      const map = {
        id: uuid(),
        title,
        image,
        nodes: uniq(labels).map((label) => ({ id: uuid(), label, selfWeak: false })),
        createdAt: nowISO(),
        updatedAt: nowISO()
      };
      await putOne('maps', map);
      state.maps.unshift(map);
      toast('导图复盘已创建', 'success');
      location.hash = `#/map/${map.id}`;
    } catch (error) {
      toast(`创建失败：${friendlySaveError(error)}`, 'error');
      submit.disabled = false;
    }
  });
}

function pageMap(id) {
  const map = findMap(id);
  if (!map) {
    return {
      title: '导图复盘', sub: '', active: 'maps', actions: topbarBack('#/maps'),
      content: emptyState('alert', '这张导图不在了', '可能数据被清理了。', '<a class="btn btn-soft btn-sm" href="#/maps">返回导图列表</a>')
    };
  }
  const image = map.image ? attachmentThumb([map.image]) : null;
  const nodes = (map.nodes || []).map((node) => {
    const matches = mapNodeMatches(map, node);
    return { ...node, matches, weak: matches.length > 0 };
  });
  const weakNodes = nodes.filter((n) => n.weak || n.selfWeak);
  const weakQuestionIds = uniq(weakNodes.flatMap((n) => n.matches.map((q) => q.id)));
  const dueCount = weakQuestionIds.filter((id) => {
    const q = findQuestion(id);
    return q && isDue(q);
  }).length;

  const nodeRows = nodes.length
    ? nodes.map((node) => `<div>
        <div class="map-node${node.weak ? ' weak' : ''}${node.selfWeak ? ' self' : ''}">
          <span class="node-dot"></span>
          <span class="map-node-main">
            <span class="node-label">${esc(node.label)}</span>
            <span class="node-meta">${node.matches.length ? `${node.matches.length} 道关联错题` : '暂无关联错题'}${node.selfWeak ? ' · 已自标薄弱' : ''}</span>
          </span>
          <span class="node-actions">
            <button type="button" class="btn btn-ghost" data-node-self="${esc(node.id)}">${node.selfWeak ? '取消自标' : '自标薄弱'}</button>
            <button type="button" class="btn btn-ghost" data-node-remove="${esc(node.id)}" aria-label="删除节点">${icon('x')}</button>
          </span>
        </div>
        ${node.matches.length ? `<details class="node-questions">
          <summary>查看 ${node.matches.length} 道关联错题</summary>
          <div class="node-q-links">${node.matches.slice(0, 8).map((q) => `<a href="#/q/${q.id}">${esc(qTitle(q))}</a>`).join('')}</div>
        </details>` : ''}
      </div>`).join('')
    : emptyState('chart', '还没有节点', '在下面添加一个考点，或重新创建导图时自动带入。');

  return {
    title: map.title,
    sub: `${nodes.length} 个节点 · ${weakNodes.length} 个薄弱点`,
    active: 'maps',
    actions: topbarBack('#/maps', '导图列表'),
    content: `
      <div class="map-layout">
        <div class="card map-image-card">
          <div class="map-image-wrap">
            ${image ? `<img data-file-img="${esc(image.id)}" alt="${esc(map.title)}" data-lightbox="${esc(image.id)}" class="map-img" />` : `<div class="map-placeholder">${icon('map')}<span>没有上传导图图片</span><span class="tiny">可以只使用右侧节点清单进行复盘</span></div>`}
          </div>
        </div>
        <div class="stack" style="gap:14px">
          <section class="card card-pad">
            <div class="card-head">
              <div><h2 class="card-title">薄弱点对照</h2><p class="card-sub">红点 = 有错题对应；黄点 = 自标薄弱</p></div>
              <span class="chip ${weakNodes.length ? 'chip-red' : 'chip-line'}">${weakNodes.length} 个</span>
            </div>
            <div class="map-node-list">${nodeRows}</div>
            <form id="add-node-form" class="row" style="margin-top:16px;gap:8px">
              <input class="input" id="new-node" placeholder="补充考点节点，如：综合分析" style="min-height:40px" />
              <button type="submit" class="btn btn-soft btn-sm">添加</button>
            </form>
          </section>

          <section class="card side-card">
            <h3>复盘提醒</h3>
            <p class="hint">${weakNodes.length ? `有 ${weakNodes.length} 个节点被标为薄弱，其中 ${weakQuestionIds.length} 道关联错题${dueCount ? `，${dueCount} 道已到期` : '暂未到期'}。` : '还没有薄弱节点。可以先自标，或关联更多错题。'}</p>
            <div class="row-wrap" style="margin-top:10px">
              ${weakNodes.slice(0, 8).map((n) => `<span class="chip ${n.weak ? 'chip-red' : 'chip-amber'}">${esc(n.label)}${n.matches.length ? ` · ${n.matches.length}` : ''}</span>`).join('') || '<span class="muted small">暂无</span>'}
            </div>
            <button type="button" class="btn btn-primary btn-sm btn-block" style="margin-top:14px" data-review-map ${weakQuestionIds.length ? '' : 'disabled'}>把关联错题加入今日复习</button>
          </section>
        </div>
      </div>`
  };
}

function bindMap(id) {
  const map = findMap(id);
  if (!map) return;

  qs('#add-node-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const label = qs('#new-node').value.trim();
    if (!label) return;
    if ((map.nodes || []).some((n) => normKey(n.label) === normKey(label))) {
      toast('这个节点已经存在', 'error');
      return;
    }
    map.nodes = map.nodes || [];
    map.nodes.push({ id: uuid(), label, selfWeak: false });
    map.updatedAt = nowISO();
    await putOne('maps', map);
    toast('节点已添加', 'success');
    renderRoute(true);
  });

  qsa('[data-node-self]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const node = (map.nodes || []).find((n) => n.id === btn.dataset.nodeSelf);
      if (!node) return;
      node.selfWeak = !node.selfWeak;
      map.updatedAt = nowISO();
      await putOne('maps', map);
      renderRoute(true);
    });
  });

  qsa('[data-node-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const node = (map.nodes || []).find((n) => n.id === btn.dataset.nodeRemove);
      if (!node) return;
      const ok = await confirmDialog('删除这个节点？', `只会从导图「${map.title}」中移除「${node.label}」，不会删除任何错题。`, '删除');
      if (!ok) return;
      map.nodes = map.nodes.filter((n) => n.id !== node.id);
      map.updatedAt = nowISO();
      await putOne('maps', map);
      renderRoute(true);
    });
  });

  qs('[data-review-map]')?.addEventListener('click', async () => {
    const ids = uniq((map.nodes || []).filter((n) => n.selfWeak || mapNodeMatches(map, n).length > 0)
      .flatMap((n) => mapNodeMatches(map, n).map((q) => q.id)));
    if (!ids.length) return;
    const now = nowISO();
    for (const qid of ids) {
      const q = findQuestion(qid);
      if (q && isActive(q)) {
        q.nextReviewAt = now;
        q.updatedAt = now;
        await putOne('questions', q);
      }
    }
    toast(`已把 ${ids.length} 道关联错题加入今日复习`, 'success');
    renderRoute(true);
  });
}

/* ------------------------------------------------------------------ *
 * 设置
 * ------------------------------------------------------------------ */

function pageSettings() {
  const settings = state.settings;
  const api = settings.api;
  const secure = window.isSecureContext;
  return {
    title: '设置',
    sub: '分析方式、数据备份与离线说明',
    active: 'settings',
    actions: '',
    content: `
      <div class="settings-grid">
        <div class="settings-stack">
          <section class="card setting-card">
            <h2>${icon('sparkle')}分析方式</h2>
            <p class="hint">默认本地规则，0 元、离线可用。需要更细的分析时，可填任意 OpenAI 兼容接口（如自建 Ollama）。</p>
            <form id="settings-form">
              <div class="radio-row">
                <label class="radio-card">
                  <input type="radio" name="mode" value="local"${settings.analysisMode === 'local' ? ' checked' : ''} />
                  <span><strong>本地规则</strong><small>离线运行，不发送任何内容</small></span>
                </label>
                <label class="radio-card">
                  <input type="radio" name="mode" value="api"${settings.analysisMode === 'api' ? ' checked' : ''} />
                  <span><strong>联网 AI</strong><small>仅发送题目文字；失败回退本地</small></span>
                </label>
              </div>
              <div class="api-fields${settings.analysisMode === 'api' ? '' : ' disabled'}" id="api-fields">
                <div class="field">
                  <label for="api-base">接口地址</label>
                  <input class="input" id="api-base" type="url" placeholder="如 http://192.168.1.10:11434 或 https://…/v1" value="${esc(api.baseUrl)}" />
                  <p class="hint">可填到 /v1 为止，也可直接填 .../chat/completions。</p>
                </div>
                <div class="field">
                  <label for="api-model">模型名称</label>
                  <input class="input" id="api-model" type="text" placeholder="如 qwen2.5:7b、gpt-4o-mini" value="${esc(api.model)}" />
                </div>
                <div class="field">
                  <label for="api-key">API Key（可选）</label>
                  <input class="input" id="api-key" type="password" autocomplete="off" placeholder="本地 Ollama 通常留空" value="${esc(api.apiKey)}" />
                  <p class="hint">密钥只保存在本机浏览器，不会写进导出备份。</p>
                </div>
              </div>
              <div class="row-wrap" style="margin-top:14px">
                <button type="submit" class="btn btn-primary btn-sm">保存设置</button>
                <button type="button" class="btn btn-ghost btn-sm" id="test-api">测试连接</button>
              </div>
            </form>
            <p class="hint" style="margin-top:10px">隐私：联网分析仅发送题干、答案、考点等文字，图片始终留在本机。接口若不支持浏览器跨域（CORS），会回退本地规则。</p>
          </section>

          <section class="card setting-card">
            <h2>${icon('download')}数据与备份</h2>
            <p class="hint">所有数据保存在当前浏览器的 IndexedDB。换设备或清理 Safari 数据前，请先导出 JSON 备份。</p>
            <div class="data-actions">
              <button type="button" class="btn btn-soft btn-sm" id="export-data">${icon('download')}导出备份</button>
              <button type="button" class="btn btn-ghost btn-sm" id="import-data-btn">${icon('upload')}导入备份</button>
              <input type="file" id="import-data" accept="application/json,.json" hidden />
            </div>
            <div class="status-line">${icon('folder')}当前：${state.questions.length} 道错题 · ${state.maps.length} 张导图</div>
            <p class="hint" style="margin-top:8px">导入按 id 合并：相同题目不会覆盖，只补充新数据；不会删除现有内容。</p>
          </section>
        </div>

        <div class="settings-stack">
          <section class="card setting-card">
            <h2>${icon(secure ? 'wifi' : 'wifi-off')}离线与 iPad 打开</h2>
            <div class="status-line"><span class="dot ${navigator.onLine ? '' : 'off'}"></span>${navigator.onLine ? '当前有网络' : '当前离线，仍可查看和记笔记'}</div>
            <div class="about-list">
              <div><b>局域网打开：</b>电脑运行 <code>python3 serve.py</code>，iPad 和电脑连同一 Wi-Fi，Safari 打开 <code>http://电脑IP:8080</code>。</div>
              <div><b>离线缓存：</b>${secure ? '当前是安全上下文，Service Worker 已启用；Safari 分享 → 添加到主屏幕，可像 App 一样打开。' : '当前是普通 HTTP，数据仍存本机，但完整离线缓存需要 HTTPS。可运行 <code>python3 serve.py --https</code> 后按验收文档信任证书。'}</div>
              <div><b>拍照：</b>使用表单里的「拍照」按钮；Safari 首次可能询问相机权限，拒绝也能从相册选。</div>
              <div><b>截图：</b>复制截图后在录入页长按粘贴，或保存到相册再上传。</div>
            </div>
          </section>

          <section class="card setting-card">
            <h2>${icon('book')}关于这一版</h2>
            <div class="about-list">
              <div><b>版本：</b>V1 · ${APP_VERSION}</div>
              <div><b>科目：</b>事业单位 D 类 · 职测 + 综应</div>
              <div><b>存储：</b>本机浏览器 IndexedDB，无账号体系</div>
              <div><b>费用：</b>0 元；不接入任何付费服务，不主动上传数据</div>
              <div><b>边界：</b>仅自己使用；不做多人、题库爬取、App Store 原生包</div>
            </div>
          </section>
        </div>
      </div>`
  };
}

function bindSettings() {
  const form = qs('#settings-form');
  const fields = qs('#api-fields');
  qsa('input[name="mode"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      fields?.classList.toggle('disabled', radio.value !== 'api' || !radio.checked);
      if (radio.checked && radio.value === 'api') fields?.classList.remove('disabled');
    });
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const mode = qs('input[name="mode"]:checked')?.value === 'api' ? 'api' : 'local';
    const next = {
      analysisMode: mode,
      api: {
        baseUrl: qs('#api-base').value.trim(),
        model: qs('#api-model').value.trim(),
        apiKey: qs('#api-key').value.trim()
      }
    };
    state.settings = next;
    await putOne('meta', { key: 'settings', value: next });
    if (mode === 'api' && (!next.api.baseUrl || !next.api.model)) {
      toast('已保存，但接口地址或模型未填完整，分析时会回退本地', 'error');
    } else {
      toast('设置已保存', 'success');
    }
    renderRoute(true);
  });

  qs('#test-api')?.addEventListener('click', async () => {
    const baseUrl = qs('#api-base').value.trim();
    const model = qs('#api-model').value.trim();
    const apiKey = qs('#api-key').value.trim();
    if (!baseUrl || !model) {
      toast('请先填写接口地址和模型名称', 'error');
      return;
    }
    const btn = qs('#test-api');
    btn.disabled = true;
    btn.textContent = '测试中…';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      const response = await fetch(apiEndpoint(baseUrl), {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({ model, max_tokens: 8, messages: [{ role: 'user', content: '只回复 OK' }] })
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status} ${body.slice(0, 100)}`);
      }
      const data = await response.json();
      if (!data?.choices?.[0]) throw new Error('返回格式不是 OpenAI Chat Completions');
      toast('连接成功，可以联网分析', 'success');
    } catch (error) {
      toast(`连接失败：${error.name === 'AbortError' ? '超时' : error.message}`, 'error');
    } finally {
      clearTimeout(timer);
      btn.disabled = false;
      btn.textContent = '测试连接';
    }
  });

  qs('#export-data')?.addEventListener('click', exportBackup);
  qs('#import-data-btn')?.addEventListener('click', () => qs('#import-data')?.click());
  qs('#import-data')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await importBackup(file);
  });
}

/* ------------------------------------------------------------------ *
 * 备份导入导出
 * ------------------------------------------------------------------ */

function blobToDataURL(blob) {
  if (!isBlobValue(blob)) return Promise.reject(new Error('附件不是有效二进制'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function exportBackup() {
  try {
    toast('正在打包备份…');
    const fileRecords = await getAll('files');
    const files = [];
    for (const record of fileRecords) {
      if (!isBlobValue(record.blob)) continue;
      files.push({
        id: record.id,
        name: record.name,
        type: record.type,
        size: record.size,
        createdAt: record.createdAt,
        dataUrl: await blobToDataURL(record.blob)
      });
    }
    const payload = {
      app: 'gongkao-cuoti',
      version: 1,
      exportedAt: nowISO(),
      questions: state.questions,
      maps: state.maps,
      files,
      settings: {
        analysisMode: state.settings.analysisMode,
        api: { ...state.settings.api, apiKey: '' }
      }
    };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `公考错题本备份-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    toast(`已导出 ${state.questions.length} 道错题、${files.length} 个附件`, 'success');
  } catch (error) {
    toast(`导出失败：${error.message}`, 'error');
  }
}

async function importBackup(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (data.file) throw new Error('这似乎是原始数据文件，请选择导出的 JSON 备份');
    if (data.app !== 'gongkao-cuoti' || !Array.isArray(data.questions)) throw new Error('不是有效的错题本备份');
    const existingQuestions = new Set(state.questions.map((q) => q.id));
    const existingMaps = new Set(state.maps.map((m) => m.id));
    const newQuestions = data.questions.filter((q) => q?.id && !existingQuestions.has(q.id));
    const newMaps = (Array.isArray(data.maps) ? data.maps : []).filter((m) => m?.id && !existingMaps.has(m.id));

    if (Array.isArray(data.files)) {
      for (const record of data.files) {
        if (!record?.id || !record.dataUrl) continue;
        try {
          const blob = await toStorableBlob(record.dataUrl);
          await putOne('files', {
            id: record.id,
            blob,
            name: record.name || '附件',
            type: record.type || blob.type,
            size: record.size || blob.size,
            createdAt: record.createdAt || nowISO()
          });
          state.fileUrls.delete(record.id);
        } catch (e) { /* 跳过损坏附件，不影响题目导入 */ }
      }
    }

    if (newQuestions.length) {
      await putMany('questions', newQuestions);
      state.questions = [...newQuestions, ...state.questions];
    }
    if (newMaps.length) {
      await putMany('maps', newMaps);
      state.maps = [...newMaps, ...state.maps];
    }
    toast(`导入完成：新增 ${newQuestions.length} 道错题、${newMaps.length} 张导图`, 'success');
    renderRoute(true);
  } catch (error) {
    toast(`导入失败：${error.message}`, 'error');
  }
}

/* ------------------------------------------------------------------ *
 * 通用交互：提示、弹窗、灯箱、文件粘贴
 * ------------------------------------------------------------------ */

function toast(message, type = '') {
  let el = qs('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = `toast ${type}`; }, 3200);
}

function confirmDialog(title, message, confirmText = '确认') {
  return new Promise((resolve) => {
    const root = qs('#modal-root');
    root.innerHTML = `<div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <h3>${esc(title)}</h3>
        <p>${esc(message)}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-confirm="no">取消</button>
          <button type="button" class="btn btn-primary btn-sm" data-confirm="yes">${esc(confirmText)}</button>
        </div>
      </div>
    </div>`;
    const close = (value) => {
      root.innerHTML = '';
      resolve(value);
    };
    qsa('[data-confirm]', root).forEach((btn) => {
      btn.addEventListener('click', () => close(btn.dataset.confirm === 'yes'));
    });
    root.querySelector('.modal-backdrop')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) close(false);
    });
    setTimeout(() => qs('[data-confirm="yes"]', root)?.focus(), 30);
  });
}

function openLightbox(src) {
  if (!src) return;
  const root = qs('#modal-root');
  root.innerHTML = `<div class="lightbox" role="dialog" aria-modal="true" aria-label="查看图片">
    <button type="button" class="lightbox-close" data-lightbox-close aria-label="关闭">${icon('x')}</button>
    <img src="${esc(src)}" alt="题目图片" />
  </div>`;
  const close = () => { root.innerHTML = ''; document.body.classList.remove('no-scroll'); };
  document.body.classList.add('no-scroll');
  qs('[data-lightbox-close]', root)?.addEventListener('click', close);
  root.querySelector('.lightbox')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) close();
  });
}

document.addEventListener('click', async (e) => {
  const tile = e.target.closest('[data-lightbox]');
  if (tile) {
    const img = tile.querySelector('img');
    let src = img?.src;
    if (!src) src = await getFileURL(tile.dataset.lightbox);
    openLightbox(src);
    return;
  }
  if (e.target.closest('[data-lightbox-close]')) {
    qs('#modal-root').innerHTML = '';
    document.body.classList.remove('no-scroll');
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const root = qs('#modal-root');
    if (root?.innerHTML) {
      root.innerHTML = '';
      document.body.classList.remove('no-scroll');
    }
  }
});

document.addEventListener('paste', async (e) => {
  if (state.currentPage !== 'add') return;
  const items = [...(e.clipboardData?.items || [])];
  const files = items.filter((item) => item.kind === 'file').map((item) => item.getAsFile()).filter(Boolean);
  if (files.length) {
    e.preventDefault();
    await addFiles(files);
  }
});

/* ------------------------------------------------------------------ *
 * 路由
 * ------------------------------------------------------------------ */

function currentRoute() {
  const raw = location.hash.replace(/^#\/?/, '') || 'home';
  const [path] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return { name: parts[0] || 'home', id: parts[1] || '' };
}

function renderRoute(keepScroll = false) {
  const route = currentRoute();
  const previous = state.currentPage;
  state.currentPage = route.name;

  if (route.name !== 'add' && addDraft) clearAddDraft();
  if (route.name === 'add' && previous !== 'add') addSubmitMode = 'analyze';

  let page;
  if (route.name === 'home') page = pageHome();
  else if (route.name === 'library') page = pageLibrary();
  else if (route.name === 'add') page = pageAdd();
  else if (route.name === 'q') page = pageDetail(route.id);
  else if (route.name === 'review') page = pageReview();
  else if (route.name === 'maps') page = pageMaps();
  else if (route.name === 'map') page = pageMap(route.id);
  else if (route.name === 'settings') page = pageSettings();
  else page = pageHome();

  const app = qs('#app');
  app.innerHTML = shell(page);
  document.title = `${page.title} · 公考错题本`;

  if (route.name === 'library') bindLibrary();
  if (route.name === 'add') bindAdd();
  if (route.name === 'q') bindDetail(route.id);
  if (route.name === 'review') bindReview();
  if (route.name === 'maps') bindMaps();
  if (route.name === 'map') bindMap(route.id);
  if (route.name === 'settings') bindSettings();

  hydrateFiles(document);
  updateConnectivity();
  if (!keepScroll || route.name !== previous) window.scrollTo(0, 0);
}

function updateConnectivity() {
  const online = navigator.onLine;
  const dot = qs('#net-dot');
  const text = qs('#net-text');
  if (dot) dot.classList.toggle('off', !online);
  if (text) text.textContent = online ? '在线 · 可联网分析' : '离线 · 仍可查看与记录';
}

/* ------------------------------------------------------------------ *
 * 启动
 * ------------------------------------------------------------------ */

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  try {
    await navigator.serviceWorker.register('./sw.js');
  } catch (e) {
    // 离线缓存不可用不影响本地数据与功能。
  }
}

async function boot() {
  try {
    await openDB();
    const [questions, maps, settingsRecord] = await Promise.all([
      getAll('questions'),
      getAll('maps'),
      getOne('meta', 'settings')
    ]);
    state.questions = (questions || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    state.maps = (maps || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    state.settings = mergeSettings(settingsRecord?.value);

    if (!location.hash) location.replace('#/home');
    window.addEventListener('hashchange', () => renderRoute(false));
    window.addEventListener('online', updateConnectivity);
    window.addEventListener('offline', updateConnectivity);
    renderRoute(false);
    registerServiceWorker();
  } catch (error) {
    qs('#app').innerHTML = `<div class="boot"><div class="boot-card">
      <div class="boot-mark">错</div>
      <h2>本地数据库打开失败</h2>
      <p class="muted">${esc(error.message)}</p>
      <p class="small muted" style="margin-top:8px">请确认没有在 Safari 无痕模式打开，或尝试刷新页面。</p>
    </div></div>`;
  }
}

boot();
