# 公考错题本 · 事业单位 D 类（V1）

仅自己使用的 **iPad Safari 网页版** 错题本：职测 + 综应。数据保存在本机浏览器，离线可看可记；错因分析默认走本地规则（0 元），也可选配任意 OpenAI 兼容接口。

## 启动

```bash
cd /workspace/dsh-projects/gongkao-cuoti
python3 serve.py
```

终端会打印本机和局域网地址。iPad 与电脑连同一 Wi-Fi，在 Safari 打开：

```text
http://<电脑局域网 IP>:8080/
```

需要完整离线缓存（Service Worker）时用 HTTPS：

```bash
python3 serve.py --https --port 8443
```

首次使用自签名证书，iPad 会提示不受信任；按 [docs/V1-acceptance.md](docs/V1-acceptance.md) 处理。也可以把整个目录放到任意 HTTPS 静态托管上（无后端依赖）。

## 能做什么

- 录入：拍照、相册、文件/PDF、粘贴截图、手动文字，均落本机 IndexedDB
- 分析：职测/综应分开；输出考点、错因标签（知识缺失/审题/方法/粗心/时间/心态）和简短原因
- 导图：上传导图图片，按现有考点自动生成节点并对照错题标薄弱点；可自标、补充节点、生成复盘提醒
- 整理：按科目 / 章节模块 / 考点筛选，每题可改分类、写笔记
- 复习：简易间隔复习（忘记 1 天、模糊 3 天、记住 3/7/14/30/60 天）
- 离线：应用外壳与数据本地缓存；断网仍可查看、记笔记、本地分析
- 安全：归档代替删除；支持 JSON 备份导出/导入；无账号、无付费服务

## 技术

- 纯静态：HTML + CSS + 原生 ES Modules，无构建、无 npm 依赖
- 存储：IndexedDB（错题、导图、附件、设置）
- 离线：Service Worker + manifest（HTTPS/localhost）
- 启动：Python 3 标准库静态服务器，支持可选自签名 HTTPS

## 目录

```text
index.html            页面入口
css/app.css           iPad 优先样式
js/app.js             路由、页面、表单、复习、导图、备份
js/db.js              IndexedDB 封装
js/analysis.js        本地规则分析 + OpenAI 兼容联网分析
sw.js                 Service Worker
manifest.webmanifest  PWA 清单
icons/                应用图标
serve.py              本地启动脚本（HTTP / HTTPS）
docs/V1-acceptance.md 验收说明
```

## 验收

完整启动、iPad 打开、功能对照、实测记录与已知边界见 [docs/V1-acceptance.md](docs/V1-acceptance.md)。
