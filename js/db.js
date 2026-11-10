/* 极简 IndexedDB 封装：错题、导图、附件、设置全部保存在本机浏览器。 */
const DB_NAME = 'gongkao-cuoti';
const DB_VERSION = 1;
const FILE_STORE = 'files';
const ATTACHMENT_META_KEYS = ['id', 'name', 'type', 'size'];

let dbPromise = null;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function isBlobLike(value) {
  if (typeof Blob === 'undefined' || value == null) return false;
  if (value instanceof Blob) return true;
  const tag = Object.prototype.toString.call(value);
  return tag === '[object Blob]' || tag === '[object File]';
}

function friendlyDbError(error) {
  const message = String(error?.message || error || '');
  if (/BlobURLs are not yet supported|Blob URL/i.test(message)) {
    return new Error('图片附件仍是临时预览地址，无法写入本机数据库；请重新选择图片后再保存。');
  }
  if (/QuotaExceeded|quota/i.test(message)) {
    return new Error('本机存储空间不足，请清理浏览器空间后重试。');
  }
  return error instanceof Error ? error : new Error(message || '本机数据库写入失败，请稍后重试。');
}

function dataURLToBlob(dataUrl) {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('附件数据格式不正确，请重新选择图片后再保存');
  const header = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const mimeMatch = /^data:([^;,]+)?/.exec(header);
  const type = mimeMatch?.[1] || 'application/octet-stream';
  try {
    if (/;base64/i.test(header)) {
      const binary = atob(body.replace(/\s/g, ''));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type });
    }
    return new Blob([decodeURIComponent(body)], { type });
  } catch (error) {
    throw new Error('附件数据转换失败，请重新选择图片后再保存');
  }
}

async function toStorableBlobInner(value, depth) {
  if (depth > 4) throw new Error('附件数据嵌套过深，请重新选择图片或文件后再保存');
  if (value == null) throw new Error('没有可保存的附件数据，请重新选择图片或文件');
  if (isBlobLike(value)) return value;
  if (value instanceof ArrayBuffer) return new Blob([value]);
  if (ArrayBuffer.isView(value)) return new Blob([value]);

  if (typeof value === 'string') {
    const text = value.trim();
    if (text.startsWith('data:')) return dataURLToBlob(text);
    if (text.startsWith('blob:')) {
      try {
        const response = await fetch(text);
        if (!response.ok) throw new Error('fetch failed');
        const blob = await response.blob();
        if (!isBlobLike(blob)) throw new Error('not a blob');
        return blob;
      } catch (error) {
        throw new Error('附件临时预览已失效，请重新选择图片后再保存');
      }
    }
    throw new Error('附件格式不支持，请重新选择图片或文件后再保存');
  }

  if (typeof value === 'object') {
    if (value.blob != null) return toStorableBlobInner(value.blob, depth + 1);
    if (value.dataUrl != null) return toStorableBlobInner(value.dataUrl, depth + 1);
    if (value.url != null) return toStorableBlobInner(value.url, depth + 1);
  }
  throw new Error('附件格式不支持，请重新选择图片或文件后再保存');
}

/**
 * 把附件统一转换成可写入 IndexedDB 的二进制。
 * 支持 Blob/File/ArrayBuffer/TypedArray/dataURL；blob: 预览地址会先 fetch 回 Blob。
 * 任何失败都抛出中文提示，绝不把 blob: 字符串原样交给 IndexedDB。
 */
export function toStorableBlob(value) {
  return toStorableBlobInner(value, 0);
}

async function normalizeFileRecord(record) {
  if (!record || typeof record !== 'object') {
    throw new Error('附件数据无效，请重新选择图片或文件后再保存');
  }
  const source = record.blob ?? record.dataUrl ?? record.url ?? record;
  const blob = await toStorableBlob(source);
  const name = record.name || (isBlobLike(blob) && blob.name) || '附件';
  const type = record.type || blob.type || 'application/octet-stream';
  const size = Number.isFinite(record.size) && record.size >= 0 ? record.size : blob.size;
  // 只写白名单字段：预览用的 url / 临时 blob: 地址绝不能进入数据库。
  return {
    id: record.id,
    blob,
    name,
    type,
    size,
    createdAt: record.createdAt || new Date().toISOString()
  };
}

function attachmentMeta(value) {
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of ATTACHMENT_META_KEYS) {
    if (key in value) out[key] = value[key];
  }
  return out;
}

function sanitizeQuestion(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.attachments)) return value;
  return { ...value, attachments: value.attachments.map(attachmentMeta) };
}

function sanitizeMap(value) {
  if (!value || typeof value !== 'object' || !value.image || typeof value.image !== 'object') return value;
  return { ...value, image: attachmentMeta(value.image) };
}

function findBlobUrl(value, path = 'record', seen = new WeakSet()) {
  if (typeof value === 'string') return value.startsWith('blob:') ? path : null;
  if (!value || typeof value !== 'object') return null;
  if (isBlobLike(value) || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return null;
  if (seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const found = findBlobUrl(value[i], `${path}[${i}]`, seen);
      if (found) return found;
    }
    return null;
  }
  for (const key of Object.keys(value)) {
    const found = findBlobUrl(value[key], `${path}.${key}`, seen);
    if (found) return found;
  }
  return null;
}

async function prepareForStore(storeName, value) {
  if (storeName === FILE_STORE) return normalizeFileRecord(value);
  let candidate = value;
  if (storeName === 'questions') candidate = sanitizeQuestion(value);
  if (storeName === 'maps') candidate = sanitizeMap(value);
  if (findBlobUrl(candidate)) {
    throw new Error('附件仍是临时预览地址，无法保存；请重新选择图片后再保存。');
  }
  return candidate;
}

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('当前浏览器不支持 IndexedDB'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('questions')) {
        const store = db.createObjectStore('questions', { keyPath: 'id' });
        store.createIndex('nextReviewAt', 'nextReviewAt');
        store.createIndex('subject', 'subject');
        store.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('maps')) {
        db.createObjectStore('maps', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('数据库被其他页面占用，请关闭旧页面后再试'));
  });
  return dbPromise;
}

export async function getAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getOne(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function putOne(storeName, value) {
  const prepared = await prepareForStore(storeName, value);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(prepared);
    } catch (error) {
      reject(friendlyDbError(error));
      return;
    }
    tx.oncomplete = () => resolve(prepared);
    tx.onerror = () => reject(friendlyDbError(tx.error));
    tx.onabort = () => reject(friendlyDbError(tx.error || new Error('写入被中止')));
  });
}

export async function putMany(storeName, values) {
  if (!values.length) return values;
  const prepared = [];
  for (const value of values) prepared.push(await prepareForStore(storeName, value));
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      prepared.forEach((value) => store.put(value));
    } catch (error) {
      reject(friendlyDbError(error));
      return;
    }
    tx.oncomplete = () => resolve(values);
    tx.onerror = () => reject(friendlyDbError(tx.error));
    tx.onabort = () => reject(friendlyDbError(tx.error || new Error('写入被中止')));
  });
}

export async function deleteOne(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearStore(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
