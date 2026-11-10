# DSH-TASK-FIX-BLOBURL：公考错题本上传错题保存失败

下达：文轩经 DSH云端官 · 2026-11-10
执行方：dsh（本 bot 只布置与验收，不写业务代码）

## 现象
文轩上传/保存错题时 toast：
`保存失败：Failed to store record in an IDBObjectStore: BlobURLs are not yet supported.`

截图已确认。发生在录入页保存（带图片附件）路径。

## 根因方向（供排查，以你实测为准）
项目：`/workspace/dsh-projects/gongkao-cuoti/`
相关：`js/app.js`（`pendingAttachments`、`prepareBlob`、`saveNewQuestion`、导图上传）、`js/db.js`（`putOne`/`putMany`）。

当前预览用 `URL.createObjectURL`，落库本意是存真正的 `Blob`/`File`。该错误表示 IndexedDB 结构化克隆收到了 `blob:` URL 字符串（或含其字段的对象），而不是可存的 Blob 二进制。请核对：
1. `fileRecords` / `putOne('files', …)` 是否误把 `url`（blob:…）当成 `blob` 写入；
2. 大图压缩、粘贴截图、相册/拍照、导图上传各路径，`prepared.blob` 是否始终是 Blob/File；
3. 是否有对象整份（含 `url` 字段）被 put 进 `files` 或 `questions`。

## 修复要求
- 附件落 IndexedDB 时只存真正的二进制：`Blob` / `File` / `ArrayBuffer`，或 dataURL/base64 字符串；**禁止**把 `blob:` 临时地址写入数据库。
- 预览仍可用 `createObjectURL`，但预览用的 `url` 字段不得进入 `putOne`/`putMany` 的记录。
- 保存前若发现非 Blob，应转成 Blob（例如从 dataURL `fetch`/`FileReader` 再存），失败时给出中文提示，不要抛英文 BlobURLs 原文。
- 导图图片上传走同一套安全落库逻辑。
- 修好后 **bump Service Worker 缓存名**（`sw.js` 里 `CACHE_NAME`，例如改为 `gkc-v1.0.1`），避免旧壳缓存。
- **0 元**；不删用户已有数据；不擅自扩大范围（不做账号同步等）。
- 修完后把变更推到已有公开仓库 `3466556309-debug/gongkao-cuoti` 的 `main`，让 GitHub Pages（https://3466556309-debug.github.io/gongkao-cuoti/）更新。云电脑 `gh` 应已登录该账号；若推送失败在验收里写明原因，不要花钱。

## 验收
在 `docs/FIX-BLOBURL-acceptance.md` 写明：
1. 根因一句话；
2. 改了哪些文件；
3. 如何自测（拍照/相册/粘贴截图/仅文字至少覆盖「有图保存」与「无图保存」）；
4. 是否已推送 Pages、新 SW 缓存名；
5. 0 元、未删用户数据。

完成后退出会话。过程不逐步报文轩。
