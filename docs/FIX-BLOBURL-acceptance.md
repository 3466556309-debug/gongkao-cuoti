# FIX-BLOBURL 验收说明

> 任务：公考错题本上传错题保存失败（`BlobURLs are not yet supported`）  
> 执行：dsh · 2026-11-10  
> 版本：`1.0.1` · Service Worker 缓存：`gkc-v1.0.1`

---

## 1. 根因（一句话）

附件落库前没有把「预览用的 `blob:` 临时地址」和「真正的 `Blob`/`File` 二进制」强制隔离并校验；一旦 `files` 的 `blob` 字段（或题目/导图附件对象里的 `url`）是 `blob:` 字符串，IndexedDB 结构化克隆就会整条拒绝，并抛出英文 `BlobURLs are not yet supported`。

补充核对结论：

- 当前 `main` 的“正常路径”（相册/拍照/粘贴 → `prepareBlob()` → `pendingAttachments.blob`）在 Chromium 实测写入的本来是 `Blob`，未能复现原始报错；但原代码把附件对象和预览 `url` 放在同一个可变对象里，`fileRecords` 直接取其中的 `blob`，`js/db.js` 落库前又没有任何校验。旧 Service Worker 缓存、异常路径或历史数据只要把 `blob:` 字符串带进来，就会触发用户看到的报错。
- 因此本次不是“只改某一行”，而是在**应用层 + 数据库层**同时加约束：正常路径继续存二进制，异常路径自动把 `blob:`/dataURL 转成 Blob；转不了就抛中文提示，绝不让英文错误原样出现。

---

## 2. 改了哪些文件

| 文件 | 变更 |
| --- | --- |
| `js/app.js` | 新增 `toStorableBlob` 接入、`isBlobValue`、`friendlySaveError`、`storableAttachmentBlob`、`fileRecordFrom`；`prepareBlob` 保证返回 Blob；录入页保存、导图图片上传只写白名单字段（`id/blob/name/type/size/createdAt`），明确丢弃预览 `url`；读取/导出附件时只接受 Blob；错误 toast 改为中文。`APP_VERSION` 升到 `1.0.1`。 |
| `js/db.js` | 新增落库前统一转换与校验：`files` 记录只保留白名单字段，`blob` 支持 `Blob/File/ArrayBuffer/TypedArray/dataURL/blob:`，`blob:` 先 `fetch` 回 Blob；题目附件、导图图片自动去掉 `url` 等预览字段；其他字段若仍含 `blob:` 字符串则拒绝并给中文提示；`putOne`/`putMany` 对结构化克隆错误做中文兜底。 |
| `sw.js` | `CACHE_NAME` 由 `gkc-v1.0.0` 改为 `gkc-v1.0.1`，避免旧壳缓存继续执行旧逻辑。 |
| `docs/FIX-BLOBURL-acceptance.md` | 本验收说明。 |

**数据库 schema 未变**（`DB_VERSION` 仍为 1），没有 `clearStore`/删除用户数据的操作。

---

## 3. 如何自测

### 3.1 启动

```bash
cd /workspace/dsh-projects/gongkao-cuoti
python3 serve.py --port 8080
```

浏览器打开 `http://127.0.0.1:8080/`。建议用 Chrome/Edge 开发者工具，或 Safari 的“开发 → 显示网页检查器”。

### 3.2 必测场景

1. **有图保存 · 相册/文件**
   - 进入「录入」→「相册 / 文件」，选择一张 PNG/JPG（可再选一个 PDF）。
   - 确认缩略图出现，点「仅保存」。
   - 预期：进入详情页，toast 为“已保存”，不出现 `BlobURLs are not yet supported`。
2. **有图保存 · 拍照**
   - 点「拍照」，用相机拍一张，按同样方式保存。
   - 预期：同上；图片可点开大图，刷新页面后仍能显示。
3. **有图保存 · 粘贴截图**
   - 在「录入」页按 `Ctrl+V` / `Cmd+V` 粘贴一张截图，确认缩略图出现后保存。
   - 预期：同上。
4. **无图保存 · 仅文字**
   - 只填题干/答案，不添加任何图片，点「仅保存」或「保存并分析」。
   - 预期：正常保存；「保存并分析」能显示本地分析卡片。
5. **导图图片上传**
   - 进入「导图复盘」→ 新建导图，选择一张图片 → 创建。
   - 预期：导图详情能显示图片，无英文报错；刷新后仍显示。
6. **索引库抽查（关键）**
   - 开发者工具 → Application → IndexedDB → `gongkao-cuoti` → `files`。
   - 每条记录应只有 `id / blob / name / type / size / createdAt` 这些字段；`blob` 列显示为 `Blob`/`File`，**不能**是 `blob:http...` 字符串；不能有 `url` 字段。
   - `questions` 里的 `attachments` 应只有 `id / name / type / size`，不能有 `url`。
   - 也可在 Console 执行：

```js
const db = await new Promise((res, rej) => {
  const r = indexedDB.open('gongkao-cuoti');
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const files = await new Promise((res, rej) => {
  const tx = db.transaction('files', 'readonly');
  const rq = tx.objectStore('files').getAll();
  rq.onsuccess = () => res(rq.result);
  rq.onerror = () => rej(rq.error);
});
console.log('全部是 Blob:', files.every((x) => x.blob instanceof Blob));
console.log('有预览 url:', files.some((x) => 'url' in x));
console.log('有 blob: 字符串:', files.some((x) => typeof x.blob === 'string' && x.blob.startsWith('blob:')));
```

### 3.3 边界回归（可选）

在 Console 里直接调用数据库层，验证“即使传入预览地址也能安全落库”：

```js
const m = await import('./js/db.js');
const url = URL.createObjectURL(new Blob(['hello'], { type: 'text/plain' }));
await m.putOne('files', { id: 'tmp-blob-url', blob: url, name: 'x.txt', type: 'text/plain', size: 5 });
const rec = await m.getOne('files', 'tmp-blob-url');
console.log(rec.blob instanceof Blob, await rec.blob.text(), 'url' in rec); // true hello false
await m.deleteOne('files', 'tmp-blob-url');
URL.revokeObjectURL(url);
```

再试一个失效的 `blob:` 地址，应只看到中文提示，不应出现英文 `BlobURLs are not yet supported`：

```js
const m = await import('./js/db.js');
try {
  await m.putOne('files', { id: 'tmp-bad', blob: 'blob:http://127.0.0.1:8080/not-exist' });
} catch (e) {
  console.log(e.message); // 附件临时预览已失效，请重新选择图片后再保存
}
```

### 3.4 本次实测记录

在 Chromium headless（1024×768）按上述路径实测：

- 3.2MB 大图（自动压缩为约 756KB JPEG）+ PDF：保存成功；刷新后图片 `naturalWidth = 1200`。
- 6.5KB 小图、仅图片无文字：保存成功。
- 粘贴截图（ClipboardEvent + File）：保存成功。
- 纯文字 + 「保存并分析」：保存成功，分析卡片正常。
- 导图带图片：创建成功，图片可显示。
- `files` 库扫描：所有 `blob` 均为 `Blob`/`File`，无 `url` 字段，无 `blob:` 字符串；`questions.attachments` 也无 `url`。
- 数据库层注入测试：合法 `blob:` URL 被转成 Blob（内容 `hello`），dataURL 被转成 Blob；非法 `blob:` URL 返回中文提示“附件临时预览已失效，请重新选择图片后再保存”。
- 页面无未捕获异常；仅“故意传入失效 blob URL”的测试产生一条预期的网络 404。

---

## 4. 是否已推送 GitHub Pages、新 SW 缓存名

- 仓库：`3466556309-debug/gongkao-cuoti`
- 分支：`main`
- 推送状态：**已推送**（见文末提交记录）。
- Service Worker 缓存名：**`gkc-v1.0.1`**（旧 `gkc-v1.0.0` 会在 activate 时被删除）。
- Pages 地址：https://3466556309-debug.github.io/gongkao-cuoti/
- 更新后首次打开若仍是旧界面：关闭所有旧标签页后重新打开，或在浏览器里强制刷新一次；Service Worker 会在新缓存安装后 `skipWaiting` + `clients.claim`。

---

## 5. 0 元、未删用户数据

- **0 元**：未新增任何付费服务、账号体系、后端或 npm 依赖；仍是纯静态本地应用，分析默认本地规则。
- **未删用户数据**：未调用 `clearStore`、未删除任何 `questions`/`maps`/`files` 记录，未改数据库版本或对象仓库结构；旧数据原样保留。旧记录若含无效 `blob:` 地址，读取时会显示“附件缺失”，但不会被删除或覆盖。

---

## 提交记录

- 代码提交：`079a0f9`（`Fix blob URL attachment storage and bump SW cache`）
- 对比：`83390a9..079a0f9`
- 本验收文档随该提交之后的文档提交一并推送。

