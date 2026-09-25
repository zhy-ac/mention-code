(function () {
  "use strict";

  let _uid = 1;
  const nextId = () => "n" + (_uid++);

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function debounce(fn, ms) {
    let t;
    return function () { clearTimeout(t); const a = arguments, s = this; t = setTimeout(() => fn.apply(s, a), ms); };
  }
  function sanitizeFilename(name) {
    const c = String(name || "project").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "").trim();
    return c || "project";
  }
  function hexToRgba(hex, alpha) {
    hex = String(hex || "").replace("#", "").trim();
    if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
    if (hex.length !== 6) return "rgba(76,154,255," + alpha + ")";
    return "rgba(" + parseInt(hex.slice(0,2),16) + "," + parseInt(hex.slice(2,4),16) + "," + parseInt(hex.slice(4,6),16) + "," + alpha + ")";
  }
  function hexToHsl(hex) {
    hex = String(hex || "").replace("#", "");
    if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
    let r = parseInt(hex.slice(0,2),16)/255, g = parseInt(hex.slice(2,4),16)/255, b = parseInt(hex.slice(4,6),16)/255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    let h = 0, s = 0; const l = (max+min)/2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g-b)/d + (g<b?6:0))/6;
      else if (max === g) h = ((b-r)/d + 2)/6;
      else h = ((r-g)/d + 4)/6;
    }
    return { h: h*360, s: s, l: l };
  }
  function hslToHex(h, s, l) {
    h = ((h%360)+360)%360/360;
    const q = l < 0.5 ? l*(1+s) : l+s-l*s;
    const p = 2*l - q;
    function hue(t) {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q-p)*6*t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q-p)*(2/3-t)*6;
      return p;
    }
    return "#" + [hue(h+1/3), hue(h), hue(h-1/3)].map(v => Math.round(v*255).toString(16).padStart(2,"0")).join("");
  }
  function adjustAccentForLight(hex) {
    const hsl = hexToHsl(hex);
    return hslToHex(hsl.h, Math.min(hsl.s, 0.9), Math.min(hsl.l, 0.42));
  }
  function mergeDeep(target, source) {
    const out = Object.assign({}, target);
    Object.keys(source || {}).forEach(k => {
      const sv = source[k];
      if (sv && typeof sv === "object" && !Array.isArray(sv)) out[k] = mergeDeep(target[k] || {}, sv);
      else if (sv !== undefined) out[k] = sv;
    });
    return out;
  }
  function getExt(name) {
    const base = String(name || "").toLowerCase().split("/").pop();
    const dot = base.lastIndexOf(".");
    if (dot === -1 || dot === base.length - 1) return "";
    return base.slice(dot + 1);
  }
  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = () => reject(r.error || new Error("read error"));
      r.readAsDataURL(file);
    });
  }
  function textToSvgDataUrl(text) {
    try {
      const bytes = new TextEncoder().encode(text);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return "data:image/svg+xml;base64," + btoa(binary);
    } catch (e) {
      return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(text);
    }
  }
  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + " KB";
    return (bytes/1024/1024).toFixed(2) + " MB";
  }

  const SETTINGS_KEY = "minicode.settings.v1";
  const RECENT_KEY = "minicode.recent.v1";
  const LAST_PROJECT_KEY = "minicode.lastWorkspace.v1";
  const WORKSPACES_KEY = "minicode.workspaces.v1";
  const SIDEBAR_WIDTH_KEY = "minicode.sidebarWidth.v1";
  const MENUBAR_LOCATION_KEY = "minicode.menubarLocation.v1";
  const TITLEBAR_BUTTONS_KEY = "minicode.titlebarButtons.v1";

  const supportsFS = (typeof window.showSaveFilePicker === "function")
                  && (typeof window.showDirectoryPicker === "function");

  const FONTS = [
    { key: "jetbrains", name: "JetBrains Mono", stack: "'JetBrains Mono', ui-monospace, monospace" },
    { key: "firacode",  name: "Fira Code",      stack: "'Fira Code', ui-monospace, monospace" },
    { key: "cascadia",  name: "Cascadia Code",  stack: "'Cascadia Code', 'Cascadia Mono', ui-monospace, monospace" },
    { key: "sfmono",    name: "SF Mono",        stack: "'SF Mono', 'SFMono-Regular', ui-monospace, monospace" },
    { key: "menlo",     name: "Menlo",          stack: "Menlo, ui-monospace, monospace" },
    { key: "monaco",    name: "Monaco",         stack: "Monaco, ui-monospace, monospace" },
    { key: "consolas",  name: "Consolas",       stack: "Consolas, ui-monospace, monospace" },
    { key: "courier",   name: "Courier New",    stack: "'Courier New', ui-monospace, monospace" },
    { key: "system",    name: "系统等宽",        stack: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }
  ];

  const HL_FIELDS = [
    { key: "keyword",   name: "关键字",  cls: [".cm-keyword"] },
    { key: "string",    name: "字符串",  cls: [".cm-string", ".cm-string-2"] },
    { key: "number",    name: "数字",    cls: [".cm-number", ".cm-atom"] },
    { key: "comment",   name: "注释",    cls: [".cm-comment"] },
    { key: "func",      name: "函数名",  cls: [".cm-def", ".cm-variable-2"] },
    { key: "variable",  name: "变量",    cls: [".cm-variable", ".cm-variable-3"] },
    { key: "tag",       name: "标签",    cls: [".cm-tag"] },
    { key: "attribute", name: "属性",    cls: [".cm-attribute", ".cm-property"] },
    { key: "operator",  name: "运算符",  cls: [".cm-operator", ".cm-bracket"] },
    { key: "type",      name: "类型",    cls: [".cm-type", ".cm-builtin", ".cm-qualifier"] }
  ];

  const HL_PRESETS = {
    "one-dark": { name: "One Dark", colors: { keyword: "#c678dd", string: "#98c379", number: "#d19a66", comment: "#7f848e", func: "#61afef", variable: "#e06c75", tag: "#e06c75", attribute: "#d19a66", operator: "#56b6c2", type: "#e5c07b" } },
    "dracula":  { name: "Dracula",  colors: { keyword: "#ff79c6", string: "#f1fa8c", number: "#bd93f9", comment: "#6272a4", func: "#50fa7b", variable: "#f8f8f2", tag: "#ff79c6", attribute: "#50fa7b", operator: "#ff79c6", type: "#8be9fd" } },
    "monokai":  { name: "Monokai",  colors: { keyword: "#f92672", string: "#e6db74", number: "#ae81ff", comment: "#75715e", func: "#a6e22e", variable: "#f8f8f2", tag: "#f92672", attribute: "#a6e22e", operator: "#f92672", type: "#66d9ef" } },
    "mention":  { name: "Default",  colors: { keyword: "#3ed0c1", string: "#888888", number: "#bfa660", comment: "#50775d", func: "#bec181", variable: "#697e94", tag: "#5b9068", attribute: "#6b5c87", operator: "#b6616a", type: "#9f6793" } },
    "solarized":{ name: "Solarized",colors: { keyword: "#859900", string: "#2aa198", number: "#d33682", comment: "#586e75", func: "#268bd2", variable: "#839496", tag: "#268bd2", attribute: "#b58900", operator: "#859900", type: "#b58900" } },
    "material": { name: "Material", colors: { keyword: "#c792ea", string: "#c3e88d", number: "#f78c6c", comment: "#546e7a", func: "#82aaff", variable: "#eeffff", tag: "#f07178", attribute: "#ffcb6b", operator: "#89ddff", type: "#ffcb6b" } }
  };

  const DEFAULT_SETTINGS = {
    theme: "dark", language: "system", accent: "#4c9aff", fontKey: "jetbrains", fontSize: 13.5, lineHeight: 1.75,
    hlPreset: "mention", highlight: Object.assign({}, HL_PRESETS["mention"].colors),
    editorBgColor: "",
    editorBgImage: "",
    editorBgFit: "cover",
    editorBgDim: 0.85
  };

  let settings = loadSettings();
  let recentList = loadRecent();

  const I18N = window.MENTION_CODE_LANGUAGES || {};

  const i18nOriginalText = new WeakMap();
  const i18nOriginalAttrs = new WeakMap();
  function resolvedLanguage() {
    if (settings.language !== "system") return settings.language;
    const lang = String(navigator.language || "").toLowerCase();
    if (lang.startsWith("zh-tw") || lang.startsWith("zh-hk") || lang.startsWith("zh-mo")) return "zh-Hant";
    if (lang.startsWith("zh")) return "zh-Hans";
    return "en-US";
  }
  function translate(key) {
    return (I18N[resolvedLanguage()] || {})[key] || key;
  }
  function applyLanguage() {
    const lang = resolvedLanguage();
    const dict = I18N[lang] || {};
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (i18nOriginalText.has(node)) node.nodeValue = i18nOriginalText.get(node);
      nodes.push(node);
    }
    nodes.forEach(node => {
      if (!i18nOriginalText.has(node)) i18nOriginalText.set(node, node.nodeValue);
      const original = i18nOriginalText.get(node);
      const key = original.trim();
      if (!key || !dict[key] || node.parentElement.closest("script,style")) return;
      node.nodeValue = original.replace(key, dict[key]);
    });
    document.querySelectorAll("[title],[placeholder]").forEach(el => {
      ["title", "placeholder"].forEach(attr => {
        const value = el.getAttribute(attr);
        let originals = i18nOriginalAttrs.get(el);
        if (!originals) { originals = {}; i18nOriginalAttrs.set(el, originals); }
        if (originals[attr] === undefined) originals[attr] = value;
        const original = originals[attr];
        if (original) el.setAttribute(attr, original);
        if (original && dict[original]) el.setAttribute(attr, dict[original]);
      });
    });
    const themeLabel = document.getElementById("themeLabel");
    if (themeLabel) themeLabel.textContent = translate(settings.theme === "dark" ? "深色" : "浅色");
    updateStatusLanguage();
    document.documentElement.lang = lang === "en-US" ? "en-US" : lang === "zh-Hant" ? "zh-TW" : "zh-CN";
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return mergeDeep(DEFAULT_SETTINGS, {});
      return mergeDeep(DEFAULT_SETTINGS, JSON.parse(raw));
    } catch (e) { return mergeDeep(DEFAULT_SETTINGS, {}); }
  }
  function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {} }
  function loadRecent() {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.slice(0, 6) : [];
    } catch (e) { return []; }
  }
  function saveRecent() { try { localStorage.setItem(RECENT_KEY, JSON.stringify(recentList)); } catch (e) {} }
  function pushRecent(name, type) {
    recentList = recentList.filter(r => !(r.name === name && r.type === type));
    recentList.unshift({ name: name, type: type, time: Date.now() });
    recentList = recentList.slice(0, 6);
    saveRecent();
    renderRecent();
  }

  /* ============ 工作区快照 ============ */
  function loadWorkspaces() {
    try {
      const raw = localStorage.getItem(WORKSPACES_KEY);
      if (!raw) return {};
      const data = JSON.parse(raw);
      return data && typeof data === "object" ? data : {};
    } catch (e) { return {}; }
  }

  function saveWorkspaceSnapshot(name, treeData) {
    if (!name || !treeData) return;
    try {
      const map = loadWorkspaces();
      map[name] = { savedAt: Date.now(), tree: treeData };
      const entries = Object.entries(map).sort((a, b) => b[1].savedAt - a[1].savedAt);
      const trimmed = {};
      entries.slice(0, 5).forEach(function (kv) { trimmed[kv[0]] = kv[1]; });
      localStorage.setItem(WORKSPACES_KEY, JSON.stringify(trimmed));
    } catch (e) { console.warn("保存工作区快照失败:", e); }
  }

  function restoreWorkspaceByName(name) {
    const map = loadWorkspaces();
    const entry = map[name];
    if (!entry || !entry.tree) return false;
    let newRoot;
    try { newRoot = deserializeTree(entry.tree); }
    catch (e) { console.error(e); return false; }
    newRoot.name = name;
    replaceProject(newRoot);
    hideWelcome();
    pushRecent(name, "folder");
    toast("已恢复项目 " + name);
    return true;
  }

  function downloadBlob(blob, filename) {
    let blobUrl = null;
    try { blobUrl = URL.createObjectURL(blob); } catch (e) { blobUrl = null; }
    if (blobUrl) {
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename || "download";
      a.rel = "noopener";
      a.style.cssText = "position:fixed;top:-1000px;left:-1000px;opacity:0";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        try { document.body.removeChild(a); } catch (e) {}
        try { URL.revokeObjectURL(blobUrl); } catch (e) {}
      }, 2000);
      return true;
    }
    try {
      const reader = new FileReader();
      reader.onload = function () {
        const a = document.createElement("a");
        a.href = reader.result;
        a.download = filename || "download";
        a.style.cssText = "position:fixed;top:-1000px;left:-1000px;opacity:0";
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { try { document.body.removeChild(a); } catch (e) {} }, 2000);
      };
      reader.readAsDataURL(blob);
      return true;
    } catch (err) { console.error("下载失败:", err); return false; }
  }

  /* ============ 真正的保存功能 ============ */
  async function saveActiveFile(saveAs) {
    if (!activeFileId) { toast("没有打开的文件"); return; }
    const f = findNode(activeFileId);
    if (!f || f.type !== "file") return;
    if (f.isBitmap) { toast("图片文件请右键 → 另存为图片"); return; }

    const content = f.content;

    // 1) 已有 handle 且不是另存为 → 直接写入
    if (f.fileHandle && !saveAs) {
      try {
        const writable = await f.fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        f.dirty = false;
        updateDirtyUI();
        flashStatus("已保存 " + f.name);
        toast("已保存到磁盘：" + f.name);
        refreshHtmlPreviewIfActive(f);
        return;
      } catch (e) {
        console.warn("直接保存失败，尝试另存为：", e);
      }
    }

    // 2) 支持 File System Access → 弹出保存对话框
    if (supportsFS) {
      try {
        const suggestedExt = getExt(f.name);
        const opts = { suggestedName: f.name };
        if (suggestedExt) {
          opts.types = [{
            description: f.lang + " 文件",
            accept: { "text/plain": ["." + suggestedExt] }
          }];
        }
        const handle = await window.showSaveFilePicker(opts);
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        f.fileHandle = handle;
        if (handle.name && handle.name !== f.name) {
          f.name = handle.name;
          Object.assign(f, getMeta(handle.name));
          renderTree();
          renderTabs();
          updateBreadcrumb(f);
          statusLangText.textContent = f.lang;
          statusLangIcon.innerHTML = f.icon;
          updateCodeCount(isBitmapFile(f) ? "" : f.content);
          statusFile.textContent = f.name;
        }
        f.dirty = false;
        updateDirtyUI();
        flashStatus("已保存 " + f.name);
        toast("已保存到磁盘：" + f.name);
        refreshHtmlPreviewIfActive(f);
        return;
      } catch (e) {
        if (e.name === "AbortError") return;
        console.error(e);
        toast("保存失败：" + e.message, "error");
        return;
      }
    }

    // 3) 回退：下载
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const ok = downloadBlob(blob, f.name);
    if (ok) {
      f.dirty = false;
      updateDirtyUI();
      toast("浏览器不支持直接保存，已下载：" + f.name);
      refreshHtmlPreviewIfActive(f);
    } else {
      toast("保存失败", "error");
    }
  }

  async function saveAllFiles() {
    const files = flattenFiles().filter(function (f) {
      return f.fileHandle && !f.isBitmap;
    });
    if (!files.length) {
      toast("当前没有可写回磁盘的文件");
      return;
    }
    let ok = 0, fail = 0;
    for (const f of files) {
      try {
        const writable = await f.fileHandle.createWritable();
        await writable.write(f.content || "");
        await writable.close();
        f.dirty = false;
        ok++;
      } catch (e) {
        console.warn("保存失败：" + f.name, e);
        fail++;
      }
    }
    updateDirtyUI();
    toast("已保存 " + ok + " 个文件" + (fail ? "，失败 " + fail + " 个" : ""));
    flashStatus("已保存 " + ok + " 个文件");
    const cur = activeFileId ? findNode(activeFileId) : null;
    if (cur) refreshHtmlPreviewIfActive(cur);
  }

  async function buildTreeFromDirHandle(dirHandle) {
    const folder = makeFolder(dirHandle.name, []);
    folder.dirHandle = dirHandle;
    const entries = [];
    for await (const entry of dirHandle.values()) {
      entries.push(entry);
    }
    entries.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name, "zh-Hans-CN", { numeric: true });
    });
    for (const entry of entries) {
      if (entry.kind === "directory") {
        if (SKIP_DIRS.has(entry.name)) continue;
        try {
          const sub = await buildTreeFromDirHandle(entry);
          folder.children.push(sub);
        } catch (e) { console.warn("读取子目录失败:", entry.name, e); }
      } else {
        if (SKIP_FILES.has(entry.name)) continue;
        const ext = getExt(entry.name);
        if (BINARY_EXTS.has(ext)) continue;
        try {
          const file = await entry.getFile();
          if (IMAGE_MAP[ext]) {
            if (file.size > MAX_IMAGE_SIZE) continue;
            const content = await readFileAsDataURL(file);
            const node = makeFile(entry.name, content);
            node.fileHandle = entry;
            folder.children.push(node);
          } else {
            const content = await file.text();
            const node = makeFile(entry.name, content);
            node.fileHandle = entry;
            folder.children.push(node);
          }
        } catch (e) { console.warn("读取文件失败:", entry.name, e); }
      }
    }
    return folder;
  }

  /* ============ 剪贴板 ============ */
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast("已复制"), () => fallbackCopy(text));
    } else fallbackCopy(text);
  }
  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); toast("已复制"); }
    catch (e) { toast("复制失败", "error"); }
    document.body.removeChild(ta);
  }
  function pasteFromClipboard(cb) {
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(cb, () => toast("浏览器未授权读取剪贴板", "error"));
    } else toast("当前浏览器不支持读取剪贴板", "error");
  }

  /* ============ 图标 ============ */
  function svgWrap(inner, opts) {
    opts = opts || {};
    const rx = opts.rx != null ? opts.rx : 4.5;
    const size = opts.size || 16;
    return '<svg viewBox="0 0 16 16" width="' + size + '" height="' + size + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<rect width="16" height="16" rx="' + rx + '" fill="' + opts.bg + '"/>' + inner + "</svg>";
  }
  function textIcon(bg, label, fg, fontSize, weight) {
    fg = fg || "#fff";
    const len = String(label).length;
    if (!fontSize) fontSize = len <= 1 ? 8.4 : len === 2 ? 6.6 : len === 3 ? 5.2 : 4.2;
    weight = weight || 800;
    const y = 8 + fontSize * 0.35;
    const spacing = len >= 3 ? "-.4" : "-.2";
    return svgWrap('<text x="8" y="' + y + '" text-anchor="middle" font-family="Inter, Segoe UI, system-ui, Arial, sans-serif" font-size="' + fontSize + '" font-weight="' + weight + '" fill="' + fg + '" letter-spacing="' + spacing + '">' + label + "</text>", { bg: bg });
  }
  function imageIcon(bg) {
    return svgWrap('<circle cx="5.4" cy="5.4" r="1.5" fill="#fff"/><path d="M2.4 13.4 6.2 9.2 8.5 11.6 10.5 9.2 13.6 13.4z" fill="#fff" fill-opacity="0.95"/>', { bg: bg });
  }

  const ICONS = {
    html: svgWrap('<path d="M5.5 5.4 3.4 8l2.1 2.6M10.5 5.4 12.6 8l-2.1 2.6M9.3 4.7 6.7 11.3" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>', { bg: "#E44D26" }),
    css: svgWrap('<path d="M6.7 4.8 5.3 11.2M10.7 4.8 9.3 11.2M4.4 6.5h7.2M4 9.5h7.2" stroke="#fff" stroke-width="1.35" stroke-linecap="round" fill="none"/>', { bg: "#2965F1" }),
    scss: textIcon("#CF649A", "S", "#fff", 8),
    less: textIcon("#2A4D80", "L", "#fff", 8),
    sass: textIcon("#CD6799", "S", "#fff", 8),
    js: textIcon("#F7DF1E", "JS", "#1c1c1c", 6.6, 900),
    ts: textIcon("#3178C6", "TS", "#fff", 6.6, 800),
    json: svgWrap('<path d="M6.6 5c-.9 0-1.4.5-1.4 1.3v.6c0 .5-.3.8-.8.8h-.2M6.6 5h.4M6.6 11c-.9 0-1.4-.5-1.4-1.3v-.6c0-.5-.3-.8-.8-.8h-.2M9.4 5c.9 0 1.4.5 1.4 1.3v.6c0 .5.3.8.8.8h.2M9.4 5h-.4M9.4 11c.9 0 1.4-.5 1.4-1.3v-.6c0-.5.3-.8.8-.8h.2" stroke="#fff" stroke-width="1.2" stroke-linecap="round" fill="none"/>', { bg: "#9B7BE8" }),
    yaml: textIcon("#CB171E", "Y"),
    md: svgWrap('<path d="M4 10.6V5.4h1.6L8 8l2.4-2.6H12v5.2M12 8.2l-1 2.4-1-2.4" stroke="#fff" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" fill="none"/>', { bg: "#519ABA" }),
    xml: svgWrap('<path d="M5.8 5.6 3.6 8l2.2 2.4M10.2 5.6 12.4 8l-2.2 2.4M9.3 4.8 6.7 11.2" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>', { bg: "#A65CFF" }),
    c: textIcon("#5C6BC0", "C"),
    cpp: textIcon("#00599C", "C++"),
    csharp: textIcon("#68217A", "C#"),
    java: textIcon("#E76F00", "J"),
    kotlin: textIcon("#7F52FF", "Kt"),
    scala: textIcon("#DC322F", "Sc"),
    go: textIcon("#00ADD8", "Go", "#fff", 6.6, 800),
    rust: textIcon("#CE422B", "Rs"),
    swift: textIcon("#F05138", "Sw"),
    dart: textIcon("#0175C2", "D"),
    python: textIcon("#3776AB", "Py"),
    php: textIcon("#777BB4", "php", "#fff", 5, 800),
    ruby: textIcon("#CC342D", "Rb"),
    perl: textIcon("#39457E", "Pl"),
    lua: textIcon("#2C2D72", "L"),
    r: textIcon("#276DC3", "R"),
    shell: textIcon("#4EAA25", ">_", "#fff", 6.4, 900),
    batch: textIcon("#1F1F1F", "BAT", "#fff", 5),
    powershell: textIcon("#5391FE", "PS", "#fff", 6),
    vb: textIcon("#A5CE00", "Vb", "#1c1c1c", 6),
    sql: textIcon("#336791", "SQL", "#fff", 5),
    docker: textIcon("#2496ED", "Dk"),
    txt: svgWrap('<path d="M5 5.6h6M5 8h6M5 10.4h4" stroke="#fff" stroke-width="1.35" stroke-linecap="round" fill="none"/>', { bg: "#7A869A" }),
    svg: imageIcon("#FFB300"), png: imageIcon("#42A5F5"), jpg: imageIcon("#FF9800"),
    jpeg: imageIcon("#FF9800"), gif: imageIcon("#AB47BC"), webp: imageIcon("#26A69A"),
    bmp: imageIcon("#90A4AE"), ico: imageIcon("#78909C"), avif: imageIcon("#66BB6A"),
    tiff: imageIcon("#8D6E63"), tif: imageIcon("#8D6E63")
  };
  const FOLDER_SVG = '<svg viewBox="0 0 16 16" width="15" height="15" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M1.6 4.4A1.4 1.4 0 0 1 3 3h3.2l1.7 1.9H13a1.4 1.4 0 0 1 1.4 1.4v6.3A1.4 1.4 0 0 1 13 14H3a1.4 1.4 0 0 1-1.4-1.4z" fill="#F2B23E"/><path d="M1.6 4.4A1.4 1.4 0 0 1 3 3h3.2l1.7 1.9h-6.3z" fill="#FBD46D"/><path d="M1.6 6.7h12.8" stroke="rgba(120,70,0,.14)" stroke-width=".8"/></svg>';

  const LANGUAGES = [
    { key: "plaintext", group: "基础", mode: null, lang: "纯文本", hint: "plain", icon: ICONS.txt },
    { key: "html", group: "Web", mode: "htmlmixed", lang: "HTML", hint: "htmlmixed", icon: ICONS.html },
    { key: "xml", group: "Web", mode: "xml", lang: "XML / SVG", hint: "xml", icon: ICONS.xml },
    { key: "css", group: "Web", mode: "css", lang: "CSS", hint: "css", icon: ICONS.css },
    { key: "scss", group: "Web", mode: "css", lang: "SCSS / Sass", hint: "css", icon: ICONS.scss },
    { key: "javascript", group: "Web", mode: "javascript", lang: "JavaScript", hint: "javascript", icon: ICONS.js },
    { key: "typescript", group: "Web", mode: "javascript", lang: "TypeScript", hint: "javascript", icon: ICONS.ts },
    { key: "json", group: "Web", mode: { name: "javascript", json: true }, lang: "JSON", hint: "json", icon: ICONS.json },
    { key: "yaml", group: "Web", mode: "text/x-yaml", lang: "YAML", hint: "yaml", icon: ICONS.yaml },
    { key: "markdown", group: "Web", mode: "markdown", lang: "Markdown", hint: "markdown", icon: ICONS.md },
    { key: "c", group: "系统语言", mode: "text/x-csrc", lang: "C", hint: "clike", icon: ICONS.c },
    { key: "cpp", group: "系统语言", mode: "text/x-c++src", lang: "C++", hint: "clike", icon: ICONS.cpp },
    { key: "csharp", group: "系统语言", mode: "text/x-csharp", lang: "C#", hint: "clike", icon: ICONS.csharp },
    { key: "java", group: "系统语言", mode: "text/x-java", lang: "Java", hint: "clike", icon: ICONS.java },
    { key: "kotlin", group: "系统语言", mode: "text/x-kotlin", lang: "Kotlin", hint: "clike", icon: ICONS.kotlin },
    { key: "scala", group: "系统语言", mode: "text/x-scala", lang: "Scala", hint: "clike", icon: ICONS.scala },
    { key: "go", group: "系统语言", mode: "text/x-go", lang: "Go", hint: "go", icon: ICONS.go },
    { key: "rust", group: "系统语言", mode: "text/x-rustsrc", lang: "Rust", hint: "rust", icon: ICONS.rust },
    { key: "swift", group: "系统语言", mode: "text/x-swift", lang: "Swift", hint: "swift", icon: ICONS.swift },
    { key: "dart", group: "系统语言", mode: "application/dart", lang: "Dart", hint: "dart", icon: ICONS.dart },
    { key: "python", group: "脚本", mode: "text/x-python", lang: "Python", hint: "python", icon: ICONS.python },
    { key: "php", group: "脚本", mode: "application/x-httpd-php", lang: "PHP", hint: "php", icon: ICONS.php },
    { key: "ruby", group: "脚本", mode: "text/x-ruby", lang: "Ruby", hint: "ruby", icon: ICONS.ruby },
    { key: "perl", group: "脚本", mode: "text/x-perl", lang: "Perl", hint: "perl", icon: ICONS.perl },
    { key: "lua", group: "脚本", mode: "text/x-lua", lang: "Lua", hint: "lua", icon: ICONS.lua },
    { key: "r", group: "脚本", mode: "text/x-rsrc", lang: "R", hint: "r", icon: ICONS.r },
    { key: "shell", group: "脚本", mode: "text/x-sh", lang: "Shell / Bash", hint: "shell", icon: ICONS.shell },
    { key: "batch", group: "脚本", mode: "text/x-batch", lang: "Batch (.bat / .cmd)", hint: "batch", icon: ICONS.batch },
    { key: "powershell", group: "脚本", mode: "text/x-powershell", lang: "PowerShell", hint: "powershell", icon: ICONS.powershell },
    { key: "vb", group: "脚本", mode: "text/vbscript", lang: "VBScript", hint: "vbscript", icon: ICONS.vb },
    { key: "sql", group: "数据 / 配置", mode: "text/x-sql", lang: "SQL", hint: "sql", icon: ICONS.sql },
    { key: "dockerfile", group: "数据 / 配置", mode: "text/x-dockerfile", lang: "Dockerfile", hint: "dockerfile", icon: ICONS.docker }
  ];

  const LANG_BY_KEY = {};
  LANGUAGES.forEach(l => { LANG_BY_KEY[l.key] = l; });

  const EXT_MAP = {
    html: "html", htm: "html", xhtml: "html", vue: "html", svelte: "html",
    css: "css", less: "css", scss: "scss", sass: "scss",
    js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
    ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
    json: "json", jsonc: "json", json5: "json", yml: "yaml", yaml: "yaml",
    md: "markdown", markdown: "markdown", mdx: "markdown",
    xml: "xml", xsl: "xml", plist: "xml",
    c: "c", h: "c", cpp: "cpp", cc: "cpp", cxx: "cpp", "c++": "cpp", hpp: "cpp", hh: "cpp", hxx: "cpp",
    cs: "csharp", java: "java", kt: "kotlin", kts: "kotlin", scala: "scala", sc: "scala",
    go: "go", rs: "rust", swift: "swift", dart: "dart",
    py: "python", pyw: "python", pyi: "python", php: "php", phtml: "php",
    rb: "ruby", rake: "ruby", gemspec: "ruby", pl: "perl", pm: "perl", lua: "lua", r: "r", rmd: "r",
    sh: "shell", bash: "shell", zsh: "shell", ksh: "shell", fish: "shell", env: "shell",
    bat: "batch", cmd: "batch", ps1: "powershell", psm1: "powershell",
    vbs: "vb", vba: "vb", sql: "sql", mysql: "sql", pgsql: "sql", dockerfile: "dockerfile",
    txt: "plaintext", log: "plaintext", ini: "plaintext", conf: "plaintext"
  };

  const IMAGE_MAP = {
    png:  { mime: "image/png",     lang: "PNG 图片",   icon: ICONS.png  },
    jpg:  { mime: "image/jpeg",    lang: "JPEG 图片",  icon: ICONS.jpg  },
    jpeg: { mime: "image/jpeg",    lang: "JPEG 图片",  icon: ICONS.jpeg },
    gif:  { mime: "image/gif",     lang: "GIF 图片",   icon: ICONS.gif  },
    webp: { mime: "image/webp",    lang: "WebP 图片",  icon: ICONS.webp },
    bmp:  { mime: "image/bmp",     lang: "BMP 图片",   icon: ICONS.bmp  },
    ico:  { mime: "image/x-icon",  lang: "图标",       icon: ICONS.ico  },
    avif: { mime: "image/avif",    lang: "AVIF 图片",  icon: ICONS.avif },
    tiff: { mime: "image/tiff",    lang: "TIFF 图片",  icon: ICONS.tiff },
    tif:  { mime: "image/tiff",    lang: "TIFF 图片",  icon: ICONS.tif  }
  };

  // HTML 预览用到的资源 MIME 表
  const MIME_BY_EXT = {
    html: "text/html;charset=utf-8", htm: "text/html;charset=utf-8", xhtml: "application/xhtml+xml;charset=utf-8",
    css: "text/css;charset=utf-8", less: "text/css;charset=utf-8", scss: "text/css;charset=utf-8",
    js: "text/javascript;charset=utf-8", mjs: "text/javascript;charset=utf-8", cjs: "text/javascript;charset=utf-8",
    json: "application/json;charset=utf-8", xml: "application/xml;charset=utf-8", svg: "image/svg+xml;charset=utf-8",
    txt: "text/plain;charset=utf-8", md: "text/markdown;charset=utf-8", csv: "text/csv;charset=utf-8",
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
    bmp: "image/bmp", ico: "image/x-icon", avif: "image/avif", tiff: "image/tiff", tif: "image/tiff",
    woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
    eot: "application/vnd.ms-fontobject",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", mp4: "video/mp4", webm: "video/webm"
  };

  const NAME_MAP = { dockerfile: "dockerfile", makefile: "plaintext", "readme": "markdown", "license": "plaintext" };

  function detectLangKey(fileName) {
    const lower = fileName.toLowerCase();
    const base = lower.split("/").pop();
    if (NAME_MAP[base]) return NAME_MAP[base];
    const ext = getExt(base);
    if (EXT_MAP[ext]) return EXT_MAP[ext];
    if (base.startsWith("dockerfile")) return "dockerfile";
    return "plaintext";
  }
  function isSvgName(name) { return getExt(name) === "svg"; }
  function isBitmapName(name) { return !!IMAGE_MAP[getExt(name)]; }

  function getMeta(fileName) {
    if (isSvgName(fileName)) {
      return { langKey: "svg", mode: "xml", lang: "SVG", icon: ICONS.svg, isImage: true, isSvg: true, isBitmap: false };
    }
    if (isBitmapName(fileName)) {
      const info = IMAGE_MAP[getExt(fileName)];
      return { langKey: "image", mode: null, lang: info.lang, icon: info.icon, isImage: true, isSvg: false, isBitmap: true };
    }
    const key = detectLangKey(fileName);
    const item = LANG_BY_KEY[key] || LANG_BY_KEY.plaintext;
    return { langKey: item.key, mode: item.mode, lang: item.lang, icon: item.icon, isImage: false, isSvg: false, isBitmap: false };
  }

  function makeFile(name, content) {
    return Object.assign({ id: nextId(), name: name, type: "file", content: content || "" }, getMeta(name));
  }
  function makeFolder(name, children) {
    return { id: nextId(), name: name, type: "folder", expanded: true, children: children || [] };
  }

  /* ============ 空项目启动 ============ */
  let root = makeFolder("untitled-project", []);

  function findNode(id, node) {
    node = node || root;
    if (node.id === id) return node;
    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        const r = findNode(id, node.children[i]);
        if (r) return r;
      }
    }
    return null;
  }
  function findParent(id, node) {
    node = node || root;
    if (!node.children) return null;
    for (let i = 0; i < node.children.length; i++) {
      const c = node.children[i];
      if (c.id === id) return node;
      const r = findParent(id, c);
      if (r) return r;
    }
    return null;
  }
  function findPath(id, node, trail) {
    node = node || root;
    trail = trail || [];
    if (node.id === id) return trail.concat(node);
    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        const r = findPath(id, node.children[i], trail.concat(node));
        if (r) return r;
      }
    }
    return null;
  }
  function flattenFiles(node, out) {
    node = node || root;
    out = out || [];
    if (node.type === "file") out.push(node);
    else if (node.children) node.children.forEach(c => flattenFiles(c, out));
    return out;
  }
  function findFirstFile(node) {
    if (!node) return null;
    if (node.type === "file") return node;
    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        const f = findFirstFile(node.children[i]);
        if (f) return f;
      }
    }
    return null;
  }
  function sortChildren(node) {
    if (!node.children) return;
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name, "zh-Hans-CN", { numeric: true });
    });
    node.children.forEach(sortChildren);
  }
  function getPathSegments(id) {
    const path = findPath(id);
    if (!path) return null;
    return path.slice(1).map(n => n.name);
  }
  function findNodeBySegments(segments) {
    let cur = root;
    for (let i = 0; i < segments.length; i++) {
      if (!cur.children) return null;
      const next = cur.children.find(c => c.name === segments[i]);
      if (!next) return null;
      cur = next;
    }
    return cur;
  }

  const tabsEl = document.getElementById("tabs");
  const treeEl = document.getElementById("fileTree");
  const crumbEl = document.getElementById("breadcrumb");
  const statusLang = document.getElementById("statusLang");
  const statusLangText = document.getElementById("statusLangText");
  const statusLangIcon = document.getElementById("statusLangIcon");
  const statusCursor = document.getElementById("statusCursor");
  const statusSpaces = document.getElementById("statusSpaces");
  const statusCodeCount = document.getElementById("statusCodeCount");
  const statusFile = document.getElementById("statusFile");
  const themeBtn = document.getElementById("themeBtn");
  const themeIcon = document.getElementById("themeIcon");
  const themeLabel = document.getElementById("themeLabel");
  const projectChip = document.getElementById("projectChip");
  const explorerTitle = document.getElementById("explorerTitle");
  const toastHost = document.getElementById("toastHost");
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsBtn2 = document.getElementById("settingsBtn2");
  const menubar = document.getElementById("menubar");
  const titlebar = document.querySelector(".titlebar");
  const titleChip = document.getElementById("titleChip");
  const sidebarMenubarSlot = document.getElementById("sidebarMenubarSlot");
  const layoutResizer = document.getElementById("layoutResizer");
  const sidebarEl = document.querySelector(".sidebar");
  const bodyEl = document.querySelector(".body");

  let menubarInSidebar = false;
  let titlebarButtons = { theme: true, settings: true };
  try {
    menubarInSidebar = localStorage.getItem(MENUBAR_LOCATION_KEY) === "sidebar";
    const savedButtons = JSON.parse(localStorage.getItem(TITLEBAR_BUTTONS_KEY) || "{}");
    if (typeof savedButtons.theme === "boolean") titlebarButtons.theme = savedButtons.theme;
    if (typeof savedButtons.settings === "boolean") titlebarButtons.settings = savedButtons.settings;
  } catch (e) {}

  function saveTitlebarLayout() {
    try {
      localStorage.setItem(MENUBAR_LOCATION_KEY, menubarInSidebar ? "sidebar" : "titlebar");
      localStorage.setItem(TITLEBAR_BUTTONS_KEY, JSON.stringify(titlebarButtons));
    } catch (e) {}
  }
  function applyMenubarLocation() {
    if (!menubar || !titlebar || !sidebarMenubarSlot) return;
    if (menubarInSidebar) {
      sidebarMenubarSlot.appendChild(menubar);
      sidebarMenubarSlot.style.display = "block";
      menubar.classList.add("in-sidebar");
    } else {
      titlebar.insertBefore(menubar, titleChip);
      sidebarMenubarSlot.style.display = "none";
      menubar.classList.remove("in-sidebar");
    }
    saveTitlebarLayout();
  }
  function applyTitlebarButtons() {
    if (themeBtn) themeBtn.style.display = titlebarButtons.theme ? "" : "none";
    if (settingsBtn) settingsBtn.style.display = titlebarButtons.settings ? "" : "none";
  }
  applyMenubarLocation();
  applyTitlebarButtons();

  const welcomeScreen = document.getElementById("welcomeScreen");
  const welcomeRecent = document.getElementById("welcomeRecent");
  const recentListEl = document.getElementById("recentList");
  const welcomeCloseBtn = document.getElementById("welcomeCloseBtn");
  const welcomeSettingsBtn = document.getElementById("welcomeSettingsBtn");

  const settingsScreen = document.getElementById("settingsScreen");
  const settingsBack = document.getElementById("settingsBack");
  const settingsReset = document.getElementById("settingsReset");

  const panelExplorer = document.getElementById("panel-explorer");
  const panelSearch = document.getElementById("panel-search");
  const searchInput = document.getElementById("searchInput");
  const replaceInput = document.getElementById("replaceInput");
  const searchResults = document.getElementById("searchResults");
  const caseToggle = document.getElementById("caseToggle");
  const regexToggle = document.getElementById("regexToggle");
  const replaceOneBtn = document.getElementById("replaceOneBtn");
  const replaceAllBtn = document.getElementById("replaceAllBtn");

  const findWidget = document.getElementById("findWidget");
  const findInput = document.getElementById("findInput");
  const findCount = document.getElementById("findCount");
  const findReplaceRow = document.getElementById("findReplaceRow");
  const replaceEditorInput = document.getElementById("replaceEditorInput");
  const findToggleReplace = document.getElementById("findToggleReplace");

  const langMenu = document.getElementById("langMenu");
  const langMenuList = document.getElementById("langMenuList");

  const contextMenu = document.getElementById("contextMenu");
  const contextMenuList = document.getElementById("contextMenuList");
  const contextTitle = document.getElementById("contextTitle");

  const editorPane = document.getElementById("editorPane");
  const previewPane = document.getElementById("previewPane");
  const previewBody = document.getElementById("previewBody");
  const previewToggle = document.getElementById("previewToggle");

  const htmlPreviewEl = document.getElementById("htmlPreview");
  const htmlFrame = document.getElementById("htmlFrame");
  const htmlConsoleEl = document.getElementById("htmlConsole");

  const editor = CodeMirror.fromTextArea(document.getElementById("code"), {
    lineNumbers: true, mode: "htmlmixed", theme: "material-darker",
    autoCloseBrackets: true, matchBrackets: true, styleActiveLine: true,
    indentUnit: 2, tabSize: 2, lineWrapping: false
  });

  let activeFileId = null;
  let openTabs = [];
  let selectedFolderId = null;
  let isDark = true;

  function setSidebarWidth(width) {
    if (!sidebarEl) return;
    const bodyWidth = bodyEl ? bodyEl.clientWidth : window.innerWidth;
    const activityWidth = document.querySelector(".activitybar") ? document.querySelector(".activitybar").offsetWidth : 58;
    const maxWidth = Math.max(180, Math.min(480, bodyWidth - activityWidth - 340));
    const nextWidth = Math.round(Math.max(180, Math.min(maxWidth, width)));
    sidebarEl.style.width = nextWidth + "px";
    try { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(nextWidth)); } catch (e) {}
  }
  function restoreSidebarWidth() {
    let width = 268;
    try {
      const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
      if (Number.isFinite(saved) && saved > 0) width = saved;
    } catch (e) {}
    setSidebarWidth(width);
  }
  if (layoutResizer && sidebarEl) {
    let resizing = false;
    layoutResizer.addEventListener("pointerdown", e => {
      if (e.button !== 0) return;
      if (sidebarHidden) setSidebarVisible(true);
      resizing = true;
      layoutResizer.classList.add("dragging");
      layoutResizer.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    layoutResizer.addEventListener("pointermove", e => {
      if (!resizing) return;
      const rect = bodyEl.getBoundingClientRect();
      setSidebarWidth(e.clientX - rect.left - document.querySelector(".activitybar").offsetWidth - 10);
    });
    const stopResizing = e => {
      if (!resizing) return;
      resizing = false;
      layoutResizer.classList.remove("dragging");
      if (layoutResizer.hasPointerCapture(e.pointerId)) layoutResizer.releasePointerCapture(e.pointerId);
      editor.refresh();
    };
    layoutResizer.addEventListener("pointerup", stopResizing);
    layoutResizer.addEventListener("pointercancel", stopResizing);
    layoutResizer.addEventListener("dblclick", () => setSidebarWidth(268));
    layoutResizer.addEventListener("keydown", e => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        setSidebarWidth(sidebarEl.offsetWidth + (e.key === "ArrowRight" ? 16 : -16));
      } else if (e.key === "Home") {
        e.preventDefault();
        setSidebarWidth(180);
      } else if (e.key === "End") {
        e.preventDefault();
        setSidebarWidth(480);
      }
    });
    layoutResizer.addEventListener("contextmenu", e => {
      e.preventDefault();
      e.stopPropagation();
      setSidebarVisible(true);
    });
    restoreSidebarWidth();
  }

  function applyAccent() {
    const rootEl = document.documentElement;
    const color = isDark ? settings.accent : adjustAccentForLight(settings.accent);
    rootEl.style.setProperty("--accent", color);
    rootEl.style.setProperty("--accent-glow", hexToRgba(color, isDark ? 0.4 : 0.35));
  }
  function buildHighlightCSS() {
    const h = settings.highlight;
    const themes = [".cm-s-material-darker", ".cm-s-eclipse"];
    let css = "";
    HL_FIELDS.forEach(f => {
      f.cls.forEach(cls => {
        themes.forEach(t => {
          css += t + " " + cls + " { color: " + h[f.key] + " !important; }\n";
        });
      });
    });
    return css;
  }
  function applyHighlight() {
    let el = document.getElementById("mc-hl-style");
    if (!el) { el = document.createElement("style"); el.id = "mc-hl-style"; document.head.appendChild(el); }
    el.textContent = buildHighlightCSS();
    renderHlPreview();
  }
  function applyFont() {
    const font = FONTS.find(f => f.key === settings.fontKey) || FONTS[0];
    let el = document.getElementById("mc-font-style");
    if (!el) { el = document.createElement("style"); el.id = "mc-font-style"; document.head.appendChild(el); }
    el.textContent =
      ".editor-host .CodeMirror {" +
      "  font-family: " + font.stack + " !important;" +
      "  font-size: " + settings.fontSize + "px !important;" +
      "  line-height: " + settings.lineHeight + " !important;" +
      "}\n" +
      ".preview-body code, .preview-body pre, .hl-preview pre, .font-preview {" +
      "  font-family: " + font.stack + " !important;" +
      "}";
    const fp = document.getElementById("fontPreview");
    if (fp) {
      fp.style.fontFamily = font.stack;
      fp.style.fontSize = settings.fontSize + "px";
      fp.style.lineHeight = settings.lineHeight;
    }
    setTimeout(() => editor.refresh(), 30);
  }

  function applyBackground() {
    const s = settings;
    const defaultBg = isDark ? "#1e1e21" : "#ffffff";
    const wrap = document.querySelector(".editor-wrap");

    if (wrap) {
      const bgColor = s.editorBgColor || defaultBg;
      wrap.style.backgroundColor = bgColor;
      if (s.editorBgImage) {
        const dim = Math.max(0, Math.min(1, s.editorBgDim));
        const rgba = hexToRgba(bgColor, dim);
        const size = s.editorBgFit === "contain" ? "contain"
                   : (s.editorBgFit === "repeat" ? "auto" : "cover");
        const repeat = s.editorBgFit === "repeat" ? "repeat" : "no-repeat";
        wrap.style.backgroundImage =
          "linear-gradient(" + rgba + ", " + rgba + "), url(\"" + s.editorBgImage + "\")";
        wrap.style.backgroundSize = "auto, " + size;
        wrap.style.backgroundPosition = "0 0, center center";
        wrap.style.backgroundRepeat = "no-repeat, " + repeat;
      } else {
        wrap.style.backgroundImage = "";
        wrap.style.backgroundSize = "";
        wrap.style.backgroundPosition = "";
        wrap.style.backgroundRepeat = "";
      }
    }


    setTimeout(() => editor.refresh(), 30);
  }

  function applyTheme(dark, skipAnim) {
    isDark = dark;
    settings.theme = dark ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    editor.setOption("theme", dark ? "material-darker" : "eclipse");
    themeIcon.textContent = dark ? "🌙" : "☀️";
    themeLabel.textContent = translate(dark ? "深色" : "浅色");
    if (!skipAnim) {
      themeIcon.classList.remove("theme-icon-spin");
      void themeIcon.offsetWidth;
      themeIcon.classList.add("theme-icon-spin");
    }
    applyAccent();
    applyBackground();
    syncThemeSeg();
    saveSettings();
  }
  function syncThemeSeg() {
    const seg = document.getElementById("themeSeg");
    if (!seg) return;
    seg.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.val === settings.theme));
  }

  if (window.marked) { try { marked.setOptions({ gfm: true, breaks: true }); } catch (e) {} }

  let previewVisible = false;

  function isMarkdownFile(node) { return node && node.type === "file" && node.langKey === "markdown"; }
  function isSvgFile(node) { return node && node.type === "file" && !!node.isSvg; }
  function isBitmapFile(node) { return node && node.type === "file" && !!node.isBitmap; }
  function isHtmlFile(node) { return node && node.type === "file" && node.langKey === "html"; }

  function renderMarkdownPreview() {
    if (!activeFileId) return;
    const f = findNode(activeFileId);
    if (!f || !isMarkdownFile(f)) return;
    const raw = editor.getValue();
    let html;
    try { html = marked.parse(raw || ""); } catch (e) { html = "<p>Markdown 解析失败</p>"; }
    if (window.DOMPurify) html = DOMPurify.sanitize(html, { ADD_ATTR: ["target"] });
    previewBody.innerHTML = html;
  }
  const renderMarkdownPreviewDebounced = debounce(renderMarkdownPreview, 140);

  function renderSvgPreview() {
    if (!activeFileId) return;
    const f = findNode(activeFileId);
    if (!f || !isSvgFile(f)) return;
    const src = textToSvgDataUrl(f.content || "<svg xmlns='http://www.w3.org/2000/svg'></svg>");
    previewBody.innerHTML =
      '<div class="image-info-bar">' +
        '<span class="ii-name">' + escapeHtml(f.name) + '</span>' +
        '<span class="ii-badge">SVG</span>' +
        '<span class="ii-spacer"></span>' +
        '<span class="ii-badge">' + formatBytes(new Blob([f.content || ""]).size) + '</span>' +
      '</div>' +
      '<div class="image-canvas"><img src="' + src + '" alt="' + escapeHtml(f.name) + '" /></div>';
  }

  function renderBitmapPreview() {
    if (!activeFileId) return;
    const f = findNode(activeFileId);
    if (!f || !isBitmapFile(f)) return;
    let bytes = 0;
    const idx = (f.content || "").indexOf(",");
    if (idx > -1) {
      const b64 = f.content.slice(idx + 1);
      bytes = Math.floor(b64.length * 0.75);
      if (b64.endsWith("==")) bytes -= 2;
      else if (b64.endsWith("=")) bytes -= 1;
    }
    previewBody.innerHTML =
      '<div class="image-info-bar">' +
        '<span class="ii-name">' + escapeHtml(f.name) + '</span>' +
        '<span class="ii-badge">' + escapeHtml(f.lang || "图片") + '</span>' +
        '<span class="ii-badge" id="iiSize">—</span>' +
        '<span class="ii-spacer"></span>' +
        '<span class="ii-badge">' + formatBytes(bytes) + '</span>' +
      '</div>' +
      '<div class="image-canvas"><img id="iiImg" src="' + f.content + '" alt="' + escapeHtml(f.name) + '" /></div>';
    const img = document.getElementById("iiImg");
    const sizeEl = document.getElementById("iiSize");
    if (img && sizeEl) {
      const updateSize = () => { if (img.naturalWidth) sizeEl.textContent = img.naturalWidth + " × " + img.naturalHeight; };
      if (img.complete) updateSize(); else img.addEventListener("load", updateSize);
    }
  }

  /* ==================== HTML 预览核心 ==================== */
  let htmlPreviewUrls = [];
  let htmlAutoRefresh = true;

  const HTML_CONSOLE_MAX = 200;
  let htmlConsoleCount = 0;

  // 注入到 iframe 里的 console 桥
  const CONSOLE_BRIDGE = "(function(){"
    + "function fmt(v){"
    + "  if(typeof v==='string')return v;"
    + "  if(v===null)return 'null';"
    + "  if(v===undefined)return 'undefined';"
    + "  if(typeof v==='function')return 'function '+ (v.name||'anonymous');"
    + "  if(typeof v==='object'){ try{ return JSON.stringify(v); }catch(e){ return Object.prototype.toString.call(v); } }"
    + "  return String(v);"
    + "}"
    + "function send(level,args){"
    + "  try{ var out=[]; for(var i=0;i<args.length;i++){ out.push(fmt(args[i])); }"
    + "    parent.postMessage({__minicode_console:true,level:level,text:out.join(' ')},'*'); }catch(e){}"
    + "}"
    + "['log','info','warn','error','debug'].forEach(function(k){"
    + "  var orig = (console[k] && console[k].bind)?console[k].bind(console):function(){};"
    + "  console[k]=function(){ send(k,arguments); try{ orig.apply(null,arguments); }catch(e){} };"
    + "});"
    + "window.addEventListener('error',function(e){"
    + "  send('error',[ (e.message||'Script error') + (e.lineno?(' (行 '+e.lineno+')'):'') ]);"
    + "});"
    + "window.addEventListener('unhandledrejection',function(e){"
    + "  send('error',['Unhandled rejection: '+fmt(e.reason)]);"
    + "});"
    + "})();";

  function clearHtmlConsole() {
    if (!htmlConsoleEl) return;
    htmlConsoleEl.innerHTML = '<div class="hc-empty">控制台输出会显示在这里…</div>';
    htmlConsoleCount = 0;
  }

  function appendHtmlConsole(level, text) {
    if (!htmlConsoleEl) return;
    if (htmlConsoleCount === 0) htmlConsoleEl.innerHTML = "";
    const line = document.createElement("div");
    line.className = "hc-line" + (level === "error" ? " hc-error" : (level === "warn" ? " hc-warn" : ""));
    const lv = document.createElement("span");
    lv.className = "hc-level";
    lv.textContent = level;
    const msg = document.createElement("span");
    msg.className = "hc-msg";
    msg.textContent = text;
    line.appendChild(lv);
    line.appendChild(msg);
    htmlConsoleEl.appendChild(line);
    htmlConsoleCount++;
    while (htmlConsoleEl.children.length > HTML_CONSOLE_MAX) {
      htmlConsoleEl.removeChild(htmlConsoleEl.firstChild);
    }
    htmlConsoleEl.scrollTop = htmlConsoleEl.scrollHeight;
  }

  window.addEventListener("message", function (e) {
    const d = e.data;
    if (!d || typeof d !== "object" || !d.__minicode_console) return;
    if (htmlFrame && e.source !== htmlFrame.contentWindow) return;
    appendHtmlConsole(String(d.level || "log"), String(d.text == null ? "" : d.text));
  });

  // 把相对路径解析成"从根开始的 segments"数组
  function resolveAssetSegments(fromSegments, ref) {
    if (!ref) return null;
    const raw = String(ref).trim();
    if (!raw) return null;
    // 协议 / 协议相对 / 纯锚点 → 原样保留
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(raw)) return null;
    const clean = raw.split("#")[0].split("?")[0];
    if (!clean) return null;

    let parts;
    let stack;
    if (clean.charAt(0) === "/") {
      parts = clean.replace(/^\/+/, "").split("/");
      stack = [];
    } else {
      parts = clean.replace(/\\/g, "/").split("/");
      stack = (fromSegments || []).slice(0, -1);
    }
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p || p === ".") continue;
      if (p === "..") { stack.pop(); continue; }
      stack.push(p);
    }
    return stack;
  }

  // 为一个文件节点生成可被 iframe 访问的 URL
  function makeAssetUrl(node, bucket) {
    if (!node || node.type !== "file") return null;
    bucket = bucket || htmlPreviewUrls;
    // 位图已经是 data URL，直接复用
    if (node.isBitmap) return node.content || null;

    const ext = getExt(node.name);
    let content = node.content || "";
    // CSS 文件需要先把内部的 url() 一起重写
    if (ext === "css" || ext === "less" || ext === "scss") {
      const segs = getPathSegments(node.id) || [node.name];
      content = rewriteCssText(content, segs, bucket);
    }
    const mime = MIME_BY_EXT[ext] || "text/plain;charset=utf-8";
    try {
      const url = URL.createObjectURL(new Blob([content], { type: mime }));
      bucket.push(url);
      return url;
    } catch (e) {
      return null;
    }
  }

  function rewriteCssText(css, fromSegments, bucket) {
    if (!css) return css;
    return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, function (m, q, url) {
      const segs = resolveAssetSegments(fromSegments, url);
      if (!segs) return m;
      const node = findNodeBySegments(segs);
      if (!node || node.type !== "file") return m;
      const u = makeAssetUrl(node, bucket);
      if (!u) return m;
      return "url(" + JSON.stringify(u) + ")";
    });
  }

  function rewriteSrcset(val, fromSegments, bucket) {
    return String(val).split(",").map(function (part) {
      const trimmed = part.trim();
      if (!trimmed) return part;
      const bits = trimmed.split(/\s+/);
      if (!bits[0]) return part;
      const segs = resolveAssetSegments(fromSegments, bits[0]);
      if (segs) {
        const node = findNodeBySegments(segs);
        if (node && node.type === "file") {
          const u = makeAssetUrl(node, bucket);
          if (u) bits[0] = u;
        }
      }
      return bits.join(" ");
    }).join(", ");
  }

  // 需要重写引用的标签属性
  const HTML_REF_ATTRS = {
    img: ["src", "srcset"],
    script: ["src"],
    link: ["href"],
    source: ["src", "srcset"],
    video: ["src", "poster"],
    audio: ["src"],
    track: ["src"],
    embed: ["src"],
    object: ["data"],
    input: ["src"],
    iframe: ["src"],
    use: ["href", "xlink:href"],
    image: ["href", "xlink:href"]
  };

  function buildHtmlPreviewDoc(node, bucket) {
    bucket = bucket || htmlPreviewUrls;
    const segments = getPathSegments(node.id) || [node.name];
    const parser = new DOMParser();
    const doc = parser.parseFromString(node.content || "", "text/html");

    // 1. 重写元素属性引用
    Object.keys(HTML_REF_ATTRS).forEach(function (tag) {
      const attrs = HTML_REF_ATTRS[tag];
      const els = doc.getElementsByTagName(tag);
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        for (let a = 0; a < attrs.length; a++) {
          const attr = attrs[a];
          if (!el.hasAttribute(attr)) continue;
          const val = el.getAttribute(attr);
          if (!val) continue;
          if (attr === "srcset") {
            el.setAttribute(attr, rewriteSrcset(val, segments, bucket));
            continue;
          }
          const segs = resolveAssetSegments(segments, val);
          if (!segs) continue;
          const target = findNodeBySegments(segs);
          if (!target || target.type !== "file") continue;
          const u = makeAssetUrl(target, bucket);
          if (u) el.setAttribute(attr, u);
        }
      }
    });

    // 2. <style> 内的 url()
    const styleTags = doc.getElementsByTagName("style");
    for (let i = 0; i < styleTags.length; i++) {
      const st = styleTags[i];
      const txt = st.textContent || "";
      if (txt.indexOf("url(") > -1) st.textContent = rewriteCssText(txt, segments, bucket);
    }

    // 3. style="" 属性内的 url()
    const all = doc.getElementsByTagName("*");
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (!el.hasAttribute || !el.hasAttribute("style")) continue;
      const s = el.getAttribute("style") || "";
      if (s.indexOf("url(") > -1) el.setAttribute("style", rewriteCssText(s, segments, bucket));
    }

    // 4. 注入 console 桥（尽量靠前，保证最早生效）
    const bridge = doc.createElement("script");
    bridge.textContent = CONSOLE_BRIDGE;
    const head = doc.head || doc.documentElement;
    if (head && head.insertBefore) {
      head.insertBefore(bridge, head.firstChild);
    }

    // 5. 序列化
    const dt = doc.doctype ? "<!DOCTYPE " + doc.doctype.name + ">" : "<!DOCTYPE html>";
    return dt + "\n" + doc.documentElement.outerHTML;
  }

  function renderHtmlPreview() {
    if (!activeFileId) return;
    const f = findNode(activeFileId);
    if (!f || !isHtmlFile(f)) return;

    const oldUrls = htmlPreviewUrls;
    htmlPreviewUrls = [];

    let docText;
    try {
      docText = buildHtmlPreviewDoc(f, htmlPreviewUrls);
    } catch (err) {
      console.error(err);
      toast("HTML 预览构建失败：" + err.message, "error");
      htmlPreviewUrls = oldUrls;
      return;
    }

    const nameEl = document.getElementById("htmlPreviewName");
    const sizeEl = document.getElementById("htmlPreviewSize");
    if (nameEl) nameEl.textContent = f.name;
    if (sizeEl) {
      try { sizeEl.textContent = formatBytes(new Blob([f.content || ""]).size); }
      catch (e) { sizeEl.textContent = "—"; }
    }

    clearHtmlConsole();
    if (htmlConsoleCount === 0) {
      htmlConsoleEl.innerHTML = '<div class="hc-empty">控制台输出会显示在这里…</div>';
    }
    htmlFrame.srcdoc = docText;

    // 延迟回收上一批 Blob URL，避免打断正在加载的资源
    setTimeout(function () {
      oldUrls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
    }, 4000);
  }

  const renderHtmlPreviewDebounced = debounce(renderHtmlPreview, 600);

  function refreshHtmlPreviewIfActive(f) {
    if (!f || !isHtmlFile(f)) return;
    if (!previewVisible) return;
    if (activeFileId !== f.id) return;
    if (previewPane.hidden) return;
    renderHtmlPreview();
  }

  function openHtmlInNewWindow() {
    if (!activeFileId) return;
    const f = findNode(activeFileId);
    if (!f || !isHtmlFile(f)) return;
    const bucket = [];
    let docText;
    try { docText = buildHtmlPreviewDoc(f, bucket); }
    catch (e) { toast("构建失败：" + e.message, "error"); return; }
    let url = null;
    try { url = URL.createObjectURL(new Blob([docText], { type: "text/html;charset=utf-8" })); }
    catch (e) { url = null; }
    if (!url) { toast("无法打开新窗口", "error"); return; }
    const w = window.open(url, "_blank");
    if (!w) toast("浏览器阻止了弹出窗口", "error");
    setTimeout(function () {
      bucket.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
      try { URL.revokeObjectURL(url); } catch (e) {}
    }, 60000);
  }

  // HTML 预览工具栏事件
  (function bindHtmlToolbar() {
    const reloadBtn = document.getElementById("htmlReloadBtn");
    const autoBtn = document.getElementById("htmlAutoBtn");
    const consoleBtn = document.getElementById("htmlConsoleBtn");
    const externalBtn = document.getElementById("htmlExternalBtn");

    if (reloadBtn) reloadBtn.addEventListener("click", function () { renderHtmlPreview(); });

    if (autoBtn) {
      autoBtn.classList.toggle("on", htmlAutoRefresh);
      autoBtn.addEventListener("click", function () {
        htmlAutoRefresh = !htmlAutoRefresh;
        autoBtn.classList.toggle("on", htmlAutoRefresh);
        toast(htmlAutoRefresh ? "已开启自动刷新" : "已关闭自动刷新（保存时仍会刷新）");
      });
    }

    if (consoleBtn && htmlConsoleEl) {
      consoleBtn.addEventListener("click", function () {
        htmlConsoleEl.hidden = !htmlConsoleEl.hidden;
        consoleBtn.classList.toggle("on", !htmlConsoleEl.hidden);
        if (!htmlConsoleEl.hidden && htmlConsoleCount === 0) {
          clearHtmlConsole();
        }
      });
    }

    if (externalBtn) externalBtn.addEventListener("click", openHtmlInNewWindow);
  })();

  /* ==================== HTML 预览核心结束 ==================== */

  function renderPreviewPane() {
    if (!activeFileId) return;
    const f = findNode(activeFileId);
    if (isMarkdownFile(f)) {
      previewPane.classList.remove("image-mode", "html-mode");
      if (htmlPreviewEl) htmlPreviewEl.hidden = true;
      renderMarkdownPreview();
    } else if (isSvgFile(f)) {
      previewPane.classList.add("image-mode");
      previewPane.classList.remove("html-mode");
      if (htmlPreviewEl) htmlPreviewEl.hidden = true;
      renderSvgPreview();
    } else if (isBitmapFile(f)) {
      previewPane.classList.add("image-mode");
      previewPane.classList.remove("html-mode");
      if (htmlPreviewEl) htmlPreviewEl.hidden = true;
      renderBitmapPreview();
    }
  }

  // 根据文件类型展示对应的预览内容（前提：previewPane 已可见）
  function showPreviewFor(f) {
    if (!f) return;
    if (isHtmlFile(f)) {
      previewPane.classList.add("html-mode");
      previewPane.classList.remove("image-mode");
      previewBody.innerHTML = "";
      if (htmlPreviewEl) htmlPreviewEl.hidden = false;
      renderHtmlPreview();
    } else {
      previewPane.classList.remove("html-mode");
      if (htmlPreviewEl) htmlPreviewEl.hidden = true;
      renderPreviewPane();
    }
  }

  function applyFileView() {
    if (!activeFileId) {
      editorPane.style.display = "";
      previewPane.hidden = true;
      previewPane.classList.remove("image-mode", "html-mode");
      if (htmlPreviewEl) htmlPreviewEl.hidden = true;
      previewToggle.hidden = true;
      previewToggle.classList.remove("on");
      setTimeout(() => editor.refresh(), 30);
      return;
    }
    const f = findNode(activeFileId);
    if (isBitmapFile(f)) {
      editorPane.style.display = "none";
      previewPane.hidden = false;
      previewPane.classList.remove("html-mode");
      previewPane.classList.add("image-mode");
      if (htmlPreviewEl) htmlPreviewEl.hidden = true;
      previewToggle.hidden = true;
      previewToggle.classList.remove("on");
      renderPreviewPane();
      setTimeout(() => editor.refresh(), 30);
      return;
    }
    editorPane.style.display = "";
    const canPreview = isSvgFile(f) || isMarkdownFile(f) || isHtmlFile(f);
    previewToggle.hidden = !canPreview;
    if (canPreview) {
      const span = previewToggle.querySelector("span");
      if (span) span.textContent = previewVisible ? "关闭预览" : "预览";
      previewToggle.classList.toggle("on", previewVisible);
      if (previewVisible) {
        previewPane.hidden = false;
        showPreviewFor(f);
      } else {
        previewPane.hidden = true;
        previewPane.classList.remove("image-mode", "html-mode");
        if (htmlPreviewEl) htmlPreviewEl.hidden = true;
      }
    } else {
      previewPane.hidden = true;
      previewPane.classList.remove("image-mode", "html-mode");
      if (htmlPreviewEl) htmlPreviewEl.hidden = true;
      previewToggle.classList.remove("on");
      previewVisible = false;
    }
    setTimeout(() => editor.refresh(), 30);
  }

  function updateDirtyUI() {
    // 文件树
    treeEl.querySelectorAll(".tree-row").forEach(row => {
      const id = row.dataset.id;
      const n = findNode(id);
      row.classList.toggle("dirty", !!(n && n.dirty));
    });
    // 标签页
    tabsEl.querySelectorAll(".tab").forEach(tab => {
      const id = tab.dataset.fileId;
      const n = id ? findNode(id) : null;
      tab.classList.toggle("dirty", !!(n && n.dirty));
    });
  }

  const TOAST_ICON_SUCCESS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.2 2.4 2.4 4.6-5"/></svg>';
  const TOAST_ICON_ERROR = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.01"/></svg>';

  function toast(text, type) {
    const el = document.createElement("div");
    el.className = "toast" + (type === "error" ? " toast-error" : " toast-success");
    el.innerHTML = '<span class="toast-icon">' + (type === "error" ? TOAST_ICON_ERROR : TOAST_ICON_SUCCESS) + '</span><span>' + escapeHtml(text) + '</span>';
    toastHost.appendChild(el);
    setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 320); }, 2000);
  }

  function showWelcome() { welcomeScreen.hidden = false; renderRecent(); }
  function hideWelcome() { welcomeScreen.hidden = true; }

  function renderRecent() {
    if (!recentList.length) { welcomeRecent.hidden = true; return; }
    welcomeRecent.hidden = false;
    recentListEl.innerHTML = "";
    recentList.forEach((r, i) => {
      const el = document.createElement("div");
      el.className = "recent-item";
      el.style.animation = "fadeSlideUp .3s var(--ease-out) both";
      el.style.animationDelay = Math.min(i * 40, 200) + "ms";
      const iconSvg = r.type === "folder" ? FOLDER_SVG :
        (r.type === "mcp" ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 19h14"/></svg>' :
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>');
      el.innerHTML =
        '<span class="recent-icon">' + iconSvg + '</span>' +
        '<span class="recent-name">' + escapeHtml(r.name) + '</span>' +
        '<span class="recent-time">' + formatTime(r.time) + '</span>' +
        '<button class="recent-del" type="button" title="移除记录">×</button>';
      el.addEventListener("click", (e) => {
        if (e.target.closest(".recent-del")) return;
        hideWelcome();

        // 文件夹 / 项目：优先从快照恢复
        if (r.type === "folder" || r.type === "mcp") {
          if (restoreWorkspaceByName(r.name)) return;
          if (r.type === "folder") {
            const go = confirm(
              "「" + r.name + "」没有保存的本地快照。\n\n" +
              "是否现在通过「打开文件夹」重新选择它？"
            );
            if (go) openFolderAction();
          } else {
            toast("该项目的快照已丢失，请重新导入 .mcp 文件");
          }
          return;
        }

        // 普通文件
        openSingleFile();
      });
      el.querySelector(".recent-del").addEventListener("click", (e) => {
        e.stopPropagation();
        recentList = recentList.filter(x => x !== r);
        saveRecent();
        renderRecent();
      });
      recentListEl.appendChild(el);
    });
  }
  function formatTime(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return Math.floor(diff / 60000) + " 分钟前";
    if (diff < 86400000) return Math.floor(diff / 3600000) + " 小时前";
    if (diff < 604800000) return Math.floor(diff / 86400000) + " 天前";
    const d = new Date(ts);
    return (d.getMonth() + 1) + "/" + d.getDate();
  }

  welcomeCloseBtn.addEventListener("click", hideWelcome);
  welcomeSettingsBtn.addEventListener("click", () => { hideWelcome(); openSettings(); });
  document.querySelectorAll(".welcome-card").forEach(card => {
    card.addEventListener("click", () => {
      const action = card.dataset.action;
      hideWelcome();
      if (action === "new-project") newProject();
      else if (action === "open-file") openSingleFile();
      else if (action === "open-folder") openFolderAction();
      else if (action === "import-mcp") importProject();
    });
  });

  function openSettings() {
    closeAllMenus(); hideContextMenu(); langMenu.hidden = true;
    settingsScreen.hidden = false;
    renderSettingsUI();
    updateFsStatus();
  }
  function closeSettings() { settingsScreen.hidden = true; }

  settingsBtn.addEventListener("click", openSettings);
  settingsBtn2.addEventListener("click", openSettings);
  settingsBack.addEventListener("click", closeSettings);
  settingsScreen.addEventListener("click", (e) => { if (e.target === settingsScreen) closeSettings(); });

  function updateFsStatus() {
    const el = document.getElementById("fsStatusDesc");
    if (!el) return;
    if (supportsFS) {
      el.innerHTML = translate("当前浏览器支持") + " <b>File System Access API</b>，" + translate("保存会直接写回磁盘。");
    } else {
      el.innerHTML = translate("当前浏览器不支持直接写回磁盘，保存会改为下载文件。推荐使用 Chrome / Edge。");
    }
  }

  function resetAllSettings() {
    if (!confirm("确定恢复所有设置为默认值吗？")) return;
    settings = mergeDeep(DEFAULT_SETTINGS, {});
    saveSettings();
    applyTheme(settings.theme === "dark", true);
    applyHighlight();
    applyFont();
    applyBackground();
    renderSettingsUI();
    toast("已恢复默认设置");
  }
  settingsReset.addEventListener("click", resetAllSettings);

  document.querySelectorAll(".snav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const sec = btn.dataset.sec;
      document.querySelectorAll(".snav-item").forEach(b => b.classList.toggle("active", b === btn));
      document.querySelectorAll(".ssec").forEach(s => { s.hidden = s.dataset.sec !== sec; });
    });
  });

  function renderSettingsUI() {
    const languageSelect = document.getElementById("languageSelect");
    if (languageSelect) languageSelect.value = settings.language || "system";
    syncThemeSeg();
    const accentColorEl = document.getElementById("accentColor");
    const accentTextEl = document.getElementById("accentText");
    if (accentColorEl) accentColorEl.value = settings.accent;
    if (accentTextEl) accentTextEl.value = settings.accent.toUpperCase();
    renderSwatches();

    const presetSel = document.getElementById("hlPreset");
    if (presetSel) {
      presetSel.innerHTML = "";
      const customOpt = document.createElement("option");
      customOpt.value = "custom";
      customOpt.textContent = translate("自定义");
      presetSel.appendChild(customOpt);
      Object.keys(HL_PRESETS).forEach(k => {
        const o = document.createElement("option");
        o.value = k; o.textContent = translate(HL_PRESETS[k].name);
        presetSel.appendChild(o);
      });
      presetSel.value = settings.hlPreset || "custom";
    }
    renderHlGrid();
    renderHlPreview();

    const fontSel = document.getElementById("fontSelect");
    if (fontSel) {
      fontSel.innerHTML = "";
      FONTS.forEach(f => {
        const o = document.createElement("option");
        o.value = f.key; o.textContent = translate(f.name);
        fontSel.appendChild(o);
      });
      fontSel.value = settings.fontKey;
    }
    const fsEl = document.getElementById("fontSize");
    const fsValEl = document.getElementById("fontSizeVal");
    if (fsEl) { fsEl.value = settings.fontSize; fsValEl.textContent = settings.fontSize.toFixed(1) + " px"; }
    const lhEl = document.getElementById("lineHeight");
    const lhValEl = document.getElementById("lineHeightVal");
    if (lhEl) { lhEl.value = settings.lineHeight; lhValEl.textContent = settings.lineHeight.toFixed(2); }

    const ebc = document.getElementById("editorBgColor");
    const ebct = document.getElementById("editorBgColorText");
    if (ebc) ebc.value = settings.editorBgColor || (isDark ? "#1e1e21" : "#ffffff");
    if (ebct) ebct.value = settings.editorBgColor || "";
    const fitSeg = document.getElementById("editorBgFitSeg");
    if (fitSeg) {
      fitSeg.querySelectorAll("button").forEach(b => {
        b.classList.toggle("active", b.dataset.val === settings.editorBgFit);
      });
    }
    const dimEl = document.getElementById("editorBgDim");
    const dimVal = document.getElementById("editorBgDimVal");
    if (dimEl) {
      const dv = Math.round(settings.editorBgDim * 100);
      dimEl.value = dv;
      dimVal.textContent = dv + "%";
    }
    applyFont();
    rebuildMenus();
    updateFsStatus();
  }

  const ACCENT_SWATCHES = ["#4c9aff","#6c5ce7","#00b894","#00cec9","#e17055","#fd79a8","#fdcb6e","#a29bfe"];

  function renderSwatches() {
    const host = document.getElementById("accentSwatches");
    if (!host) return;
    host.innerHTML = "";
    ACCENT_SWATCHES.forEach(c => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "swatch" + (c.toLowerCase() === settings.accent.toLowerCase() ? " active" : "");
      b.style.background = c;
      b.title = c.toUpperCase();
      b.addEventListener("click", () => {
        settings.accent = c;
        applyAccent();
        saveSettings();
        const ce = document.getElementById("accentColor");
        const ct = document.getElementById("accentText");
        if (ce) ce.value = c;
        if (ct) ct.value = c.toUpperCase();
        renderSwatches();
      });
      host.appendChild(b);
    });
  }

  function renderHlGrid() {
    const grid = document.getElementById("hlGrid");
    if (!grid) return;
    grid.innerHTML = "";
    HL_FIELDS.forEach(f => {
      const item = document.createElement("div");
      item.className = "hl-item";
      const name = document.createElement("span");
      name.className = "hl-name";
      name.textContent = translate(f.name);
      item.appendChild(name);
      const inp = document.createElement("input");
      inp.type = "color";
      inp.value = settings.highlight[f.key] || "#000000";
      inp.title = f.name;
      inp.addEventListener("input", () => {
        settings.highlight[f.key] = inp.value;
        settings.hlPreset = "custom";
        const ps = document.getElementById("hlPreset");
        if (ps) ps.value = "custom";
        applyHighlight();
        saveSettings();
      });
      item.appendChild(inp);
      grid.appendChild(item);
    });
  }

  const HL_PREVIEW_CODE =
    '<span class="tk-cmt">// 问候函数</span>\n' +
    '<span class="tk-kw">function</span> <span class="tk-fn">greet</span>(<span class="tk-var">name</span>) {\n' +
    '  <span class="tk-kw">const</span> <span class="tk-var">msg</span> <span class="tk-op">=</span> <span class="tk-str">`Hello, ${name}!`</span>;\n' +
    '  <span class="tk-kw">return</span> <span class="tk-var">msg</span>;\n' +
    '}\n\n' +
    '<span class="tk-kw">const</span> <span class="tk-var">count</span> <span class="tk-op">=</span> <span class="tk-num">42</span>;\n' +
    '<span class="tk-kw">const</span> <span class="tk-var">list</span> <span class="tk-op">=</span> [<span class="tk-str">"a"</span>, <span class="tk-str">"b"</span>];\n' +
    '<span class="tk-tag">&lt;div</span> <span class="tk-attr">class</span><span class="tk-op">=</span><span class="tk-str">"card"</span><span class="tk-tag">&gt;</span>...<span class="tk-tag">&lt;/div&gt;</span>';

  function renderHlPreview() {
    const pre = document.getElementById("hlPreview");
    if (!pre) return;
    pre.innerHTML = HL_PREVIEW_CODE;
    const h = settings.highlight;
    const map = { ".tk-kw": h.keyword, ".tk-str": h.string, ".tk-num": h.number, ".tk-cmt": h.comment, ".tk-fn": h.func, ".tk-var": h.variable, ".tk-tag": h.tag, ".tk-attr": h.attribute, ".tk-op": h.operator, ".tk-type": h.type };
    Object.keys(map).forEach(sel => {
      pre.querySelectorAll(sel).forEach(el => { el.style.color = map[sel]; });
    });
  }

  document.getElementById("themeSeg").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    applyTheme(btn.dataset.val === "dark");
    renderSettingsUI();
  });
  document.getElementById("languageSelect").addEventListener("change", e => {
    settings.language = e.target.value;
    saveSettings();
    applyLanguage();
    rebuildMenus();
    updateFsStatus();
    if (searchInput.value || !panelSearch.hidden) runSearch();
    renderSettingsUI();
  });
  window.addEventListener("languagechange", () => {
    if (settings.language === "system") {
      applyLanguage();
      rebuildMenus();
      if (searchInput.value || !panelSearch.hidden) runSearch();
      renderSettingsUI();
    }
  });
  document.getElementById("accentColor").addEventListener("input", (e) => {
    settings.accent = e.target.value;
    document.getElementById("accentText").value = settings.accent.toUpperCase();
    applyAccent(); renderSwatches(); saveSettings();
  });
  document.getElementById("accentText").addEventListener("input", (e) => {
    let v = e.target.value.trim();
    if (!v.startsWith("#")) v = "#" + v;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      settings.accent = v.toLowerCase();
      document.getElementById("accentColor").value = v.toLowerCase();
      applyAccent(); renderSwatches(); saveSettings();
    }
  });
  document.getElementById("hlPreset").addEventListener("change", (e) => {
    const key = e.target.value;
    if (key === "custom") settings.hlPreset = "custom";
    else if (HL_PRESETS[key]) {
      settings.hlPreset = key;
      settings.highlight = Object.assign({}, HL_PRESETS[key].colors);
      renderHlGrid();
      applyHighlight();
    }
    saveSettings();
  });
  document.getElementById("fontSelect").addEventListener("change", (e) => {
    settings.fontKey = e.target.value; applyFont(); saveSettings();
  });
  document.getElementById("fontSize").addEventListener("input", (e) => {
    settings.fontSize = parseFloat(e.target.value);
    document.getElementById("fontSizeVal").textContent = settings.fontSize.toFixed(1) + " px";
    applyFont(); saveSettings();
  });
  document.getElementById("lineHeight").addEventListener("input", (e) => {
    settings.lineHeight = parseFloat(e.target.value);
    document.getElementById("lineHeightVal").textContent = settings.lineHeight.toFixed(2);
    applyFont(); saveSettings();
  });

  document.getElementById("editorBgColor").addEventListener("input", (e) => {
    settings.editorBgColor = e.target.value;
    document.getElementById("editorBgColorText").value = e.target.value.toUpperCase();
    applyBackground();
    saveSettings();
  });
  document.getElementById("editorBgColorText").addEventListener("input", (e) => {
    let v = e.target.value.trim();
    if (!v) {
      settings.editorBgColor = "";
      applyBackground();
      saveSettings();
      return;
    }
    if (!v.startsWith("#")) v = "#" + v;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      settings.editorBgColor = v.toLowerCase();
      document.getElementById("editorBgColor").value = v.toLowerCase();
      applyBackground();
      saveSettings();
    }
  });
  document.getElementById("editorBgImageUpload").addEventListener("click", async () => {
    const file = await pickFile("image/*");
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataURL(file);
      settings.editorBgImage = dataUrl;
      applyBackground();
      saveSettings();
      toast("已设置背景图片");
    } catch (err) {
      toast("读取图片失败", "error");
    }
  });
  document.getElementById("editorBgImageUrl").addEventListener("click", () => {
    const url = prompt("输入图片 URL（以 http:// / https:// / data: 开头）：", settings.editorBgImage || "https://");
    if (url === null) return;
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!/^(https?:|data:)/.test(trimmed)) {
      toast("URL 格式无效", "error");
      return;
    }
    settings.editorBgImage = trimmed;
    applyBackground();
    saveSettings();
    toast("已设置背景图片");
  });
  document.getElementById("editorBgImageClear").addEventListener("click", () => {
    settings.editorBgImage = "";
    applyBackground();
    saveSettings();
    toast("已清除背景图片");
  });
  document.getElementById("editorBgFitSeg").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    settings.editorBgFit = btn.dataset.val;
    document.getElementById("editorBgFitSeg").querySelectorAll("button").forEach(b => {
      b.classList.toggle("active", b === btn);
    });
    applyBackground();
    saveSettings();
  });
  document.getElementById("editorBgDim").addEventListener("input", (e) => {
    settings.editorBgDim = parseFloat(e.target.value) / 100;
    document.getElementById("editorBgDimVal").textContent = e.target.value + "%";
    applyBackground();
    saveSettings();
  });
  document.getElementById("resetBgBtn").addEventListener("click", () => {
    settings.editorBgColor = "";
    settings.editorBgImage = "";
    settings.editorBgFit = "cover";
    settings.editorBgDim = 0.85;
    applyBackground();
    renderSettingsUI();
    saveSettings();
    toast("已重置背景设置");
  });

  function exportSettings() {
    try {
      const data = { format: "mini-code-settings", version: "1.0", generator: "Mention Code", exportedAt: new Date().toISOString(), settings: settings };
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json;charset=utf-8" });
      const ok = downloadBlob(blob, "mini-code-settings.json");
      toast(ok ? "已导出设置文件" : "导出失败", ok ? "" : "error");
    } catch (err) { toast("导出失败：" + err.message, "error"); }
  }
  async function importSettings() {
    const file = await pickFile(".json,.mcpsettings,application/json");
    if (!file) return;
    let text;
    try { text = await file.text(); } catch (e) { alert("读取文件失败：" + e.message); return; }
    let data;
    try { data = JSON.parse(text); } catch (e) { alert("解析失败：" + e.message); return; }
    let settingsData = null;
    if (data && data.format === "mini-code-settings" && data.settings) settingsData = data.settings;
    else if (data && typeof data === "object" && (data.theme !== undefined || data.accent !== undefined || data.highlight !== undefined)) settingsData = data;
    else { alert("无效的设置文件"); return; }
    if (!confirm("导入设置将覆盖当前所有设置，确定继续吗？")) return;
    settings = mergeDeep(DEFAULT_SETTINGS, settingsData);
    saveSettings();
    applyTheme(settings.theme === "dark", true);
    applyHighlight(); applyFont(); applyBackground(); renderSettingsUI();
    toast("已导入设置");
  }
  document.getElementById("exportSettingsBtn").addEventListener("click", exportSettings);
  document.getElementById("importSettingsBtn").addEventListener("click", importSettings);
  document.getElementById("resetSettingsBtn2").addEventListener("click", resetAllSettings);
  document.getElementById("forgetWorkspaceBtn2").addEventListener("click", forgetWorkspace);
  document.getElementById("clearFsHandles").addEventListener("click", () => {
    if (!confirm("清除所有磁盘文件句柄？下次保存会重新弹出保存对话框。")) return;
    flattenFiles().forEach(f => { f.fileHandle = null; });
    toast("已清除文件句柄");
  });

  function forgetWorkspace() {
    if (!confirm("清除浏览器中保存的上次项目？下次打开将显示欢迎页。")) return;
    try { localStorage.removeItem(LAST_PROJECT_KEY); } catch (e) {}
    toast("已清除上次项目记录");
  }

  function pickFile(accept) {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      if (accept) input.accept = accept;
      let done = false;
      input.onchange = () => { if (done) return; done = true; resolve((input.files && input.files[0]) || null); };
      input.addEventListener("cancel", () => { if (done) return; done = true; resolve(null); });
      input.click();
    });
  }
  function pickFolder() {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.webkitdirectory = true;
      input.directory = true;
      input.multiple = true;
      let done = false;
      input.onchange = () => { if (done) return; done = true; resolve(Array.from(input.files || [])); };
      input.addEventListener("cancel", () => { if (done) return; done = true; resolve([]); });
      input.click();
    });
  }

  async function readFileContent(file) {
    const ext = getExt(file.name);
    try {
      if (ext === "svg") return await file.text();
      if (IMAGE_MAP[ext]) return await readFileAsDataURL(file);
      return await file.text();
    } catch (e) { return ""; }
  }

  async function openSingleFile() {
    const file = await pickFile();
    if (!file) return;
    const content = await readFileContent(file);
    hideWelcome();
    const existing = (root.children || []).find(c => c.type === "file" && c.name === file.name);
    if (existing) {
      if (!confirm("根目录已存在同名文件「" + file.name + "」，是否覆盖？")) return;
      existing.content = content;
      Object.assign(existing, getMeta(file.name));
      openFile(existing.id);
      pulseRow(existing.id);
      toast("已覆盖 " + file.name);
      pushRecent(root.name, "file");
      scheduleAutosave();
      return;
    }
    const node = makeFile(file.name, content);
    if (!root.children) root.children = [];
    root.children.push(node);
    sortChildren(root);
    renderTree();
    openFile(node.id);
    pulseRow(node.id);
    toast("已打开 " + file.name);
    pushRecent(root.name, "file");
    scheduleAutosave();
  }

  const SKIP_DIRS = new Set(["node_modules",".git",".svn",".hg","__pycache__",".next",".nuxt","dist","build","target",".idea",".vscode"]);
  const SKIP_FILES = new Set([".DS_Store","Thumbs.db","desktop.ini"]);
  const BINARY_EXTS = new Set(["mp3","mp4","mov","avi","wav","flac","ogg","webm","mkv","zip","rar","7z","tar","gz","bz2","xz","zst","pdf","doc","docx","xls","xlsx","ppt","pptx","odt","ods","exe","dll","so","dylib","bin","class","jar","pyc","o","obj","woff","woff2","ttf","otf","eot"]);
  const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

  async function openFolderAction() {
    // 优先使用 File System Access API（保留 handle，便于写回）
    if (supportsFS) {
      try {
        const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
        toast("正在读取文件夹…");
        const newRoot = await buildTreeFromDirHandle(dirHandle);
        sortChildren(newRoot);
        saveWorkspaceSnapshot(newRoot.name, serializeTree(newRoot));
        replaceProject(newRoot);
        hideWelcome();
        pushRecent(newRoot.name, "folder");
        toast("已打开文件夹：" + newRoot.name);
        scheduleAutosave();
        return;
      } catch (e) {
        if (e.name === "AbortError") return;
        console.warn("File System Access 打开失败，回退到兼容模式：", e);
        // 继续走原路径
      }
    }

    const files = await pickFolder();
    if (!files.length) return;
    const filtered = files.filter(file => {
      const rel = file.webkitRelativePath || file.name;
      const parts = rel.split("/");
      if (parts.some(p => SKIP_DIRS.has(p))) return false;
      const fname = parts[parts.length - 1];
      if (SKIP_FILES.has(fname)) return false;
      const ext = getExt(fname);
      if (BINARY_EXTS.has(ext)) return false;
      return true;
    });
    if (!filtered.length) { toast("文件夹为空或全部被忽略"); return; }
    const results = [];
    let totalSkippedImages = 0;
    const BATCH = 10;
    for (let i = 0; i < filtered.length; i += BATCH) {
      const batch = filtered.slice(i, i + BATCH);
      const batchResults = await Promise.all(batch.map(async (file) => {
        const ext = getExt(file.name);
        try {
          if (IMAGE_MAP[ext] && file.size > MAX_IMAGE_SIZE) { totalSkippedImages++; return null; }
          const content = await readFileContent(file);
          return { path: file.webkitRelativePath || file.name, name: file.name, content: content };
        } catch (e) { return { path: file.webkitRelativePath || file.name, name: file.name, content: "" }; }
      }));
      batchResults.forEach(r => { if (r) results.push(r); });
    }
    if (!results.length) { toast("文件夹为空或全部被忽略"); return; }
    let rootName = "project";
    const firstPath = results[0].path;
    if (firstPath && firstPath.indexOf("/") > -1) rootName = firstPath.split("/")[0];
    const newRoot = makeFolder(rootName, []);
    const pathMap = { "": newRoot };
    results.sort((a, b) => a.path.localeCompare(b.path));
    results.forEach(entry => {
      const parts = entry.path.split("/").filter(Boolean);
      if (parts[0] === rootName) parts.shift();
      if (!parts.length) return;
      let currentPath = "";
      let current = newRoot;
      for (let i = 0; i < parts.length - 1; i++) {
        const folderName = parts[i];
        const nextPath = currentPath ? currentPath + "/" + folderName : folderName;
        if (!pathMap[nextPath]) {
          const folder = makeFolder(folderName, []);
          current.children.push(folder);
          pathMap[nextPath] = folder;
        }
        current = pathMap[nextPath];
        currentPath = nextPath;
      }
      const fileName = parts[parts.length - 1];
      if (fileName) current.children.push(makeFile(fileName, entry.content));
    });
    sortChildren(newRoot);
    saveWorkspaceSnapshot(newRoot.name, serializeTree(newRoot));
    replaceProject(newRoot);
    hideWelcome();
    let msg = "已打开文件夹 " + rootName + "（" + results.length + " 个文件）";
    if (totalSkippedImages > 0) msg += "，跳过 " + totalSkippedImages + " 张大图片";
    toast(msg);
    pushRecent(rootName, "folder");
    scheduleAutosave();
  }

  function closeFolder() {
    if (!root.children || !root.children.length) { toast("当前没有打开任何文件夹"); return; }
    if (!confirm("确定关闭文件夹「" + root.name + "」吗？\n未导出的修改将会丢失。")) return;
    replaceProject(makeFolder("untitled-project", []));
    showWelcome();
    try { localStorage.removeItem(LAST_PROJECT_KEY); } catch (e) {}
    toast("已关闭文件夹");
  }
  function newProject() {
    if (root.children && root.children.length) {
      if (!confirm("确定新建项目吗？当前项目未导出的修改将会丢失。")) return;
    }
    replaceProject(makeFolder("new-project", []));
    hideWelcome();
    toast("已新建项目");
    scheduleAutosave();
  }
  function replaceProject(newRoot, skipAutoOpen) {
    root = newRoot;
    activeFileId = null;
    openTabs = [];
    selectedFolderId = root.id;
    editor.setValue("");
    editor.setOption("mode", null);
    editor.clearHistory();
    crumbEl.innerHTML = "";
    statusLangText.textContent = "None";
    statusLangIcon.innerHTML = "";
    statusFile.textContent = "—";
    closeFind();
    previewVisible = false;
    applyFileView();
    renderTree(); renderTabs();
    updateCursor(); updateTitleUI();
    searchInput.value = "";
    runSearch();
    if (!skipAutoOpen) {
      const first = findFirstFile(root);
      if (first) setTimeout(() => openFile(first.id), 60);
    }
  }
  function updateTitleUI() {
    titleChip.textContent = root.name + " — Mention Code";
    projectChip.textContent = "⎇ " + root.name;
    explorerTitle.textContent = root.name.toUpperCase();
  }

  function serializeTree(node) {
    if (node.type === "file") return { type: "file", name: node.name, content: node.content || "" };
    return { type: "folder", name: node.name, expanded: node.expanded !== false, children: (node.children || []).map(serializeTree) };
  }
  function deserializeTree(data) {
    if (!data || typeof data !== "object") throw new Error("无效的节点数据");
    if (data.type === "file") return makeFile(data.name || "untitled.txt", data.content || "");
    const folder = makeFolder(data.name || "untitled", []);
    folder.expanded = data.expanded !== false;
    folder.children = (data.children || []).map(deserializeTree);
    return folder;
  }
  function exportProject() {
    try {
      const data = { format: "mini-code-project", version: "1.0", generator: "Mention Code", exportedAt: new Date().toISOString(), name: root.name, tree: serializeTree(root) };
      const json = JSON.stringify(data, null, 2);
      const sizeMB = json.length / (1024 * 1024);
      if (sizeMB > 10) { if (!confirm("项目文件大约 " + sizeMB.toFixed(1) + " MB（包含图片），继续导出吗？")) return; }
      const blob = new Blob([json], { type: "application/octet-stream" });
      const filename = (sanitizeFilename(root.name) || "project") + ".mcp";
      const ok = downloadBlob(blob, filename);
      if (ok) { toast("已导出 " + filename); flashStatus("已导出 " + filename); }
      else toast("导出失败，请检查浏览器设置", "error");
    } catch (err) { alert("导出失败：" + err.message); toast("导出失败：" + err.message, "error"); }
  }
  async function importProject() {
    const file = await pickFile(".mcp,application/json,.json,application/octet-stream");
    if (!file) return;
    let text;
    try { text = await file.text(); } catch (e) { alert("读取文件失败：" + e.message); return; }
    let data;
    try { data = JSON.parse(text); } catch (e) { alert("解析失败：" + e.message); return; }
    let treeData = null, projectName = null;
    if (data && data.format === "mini-code-project" && data.tree) {
      treeData = data.tree; projectName = data.name || (data.tree && data.tree.name) || "imported";
    } else if (data && data.type && data.name) {
      treeData = data; projectName = data.name;
    } else { alert("无效的 .mcp 文件：缺少 format 或 tree 字段"); return; }
    let newRoot;
    try { newRoot = deserializeTree(treeData); } catch (e) { alert("构建项目失败：" + e.message); return; }
    if (projectName) newRoot.name = projectName;
    saveWorkspaceSnapshot(newRoot.name, serializeTree(newRoot));
    replaceProject(newRoot);
    hideWelcome();
    toast("已导入 " + file.name);
    flashStatus("已导入 " + file.name);
    pushRecent(projectName || file.name.replace(/\.mcp$/i, ""), "mcp");
    scheduleAutosave();
  }

  let autosaveTimer = null;
  const MAX_WORKSPACE_SIZE = 4 * 1024 * 1024;

  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(saveCurrentWorkspace, 1000);
  }
  function saveCurrentWorkspace() {
    if (!root.children || root.children.length === 0) {
      try { localStorage.removeItem(LAST_PROJECT_KEY); } catch (e) {}
      return;
    }
    try {
      const openPaths = openTabs.map(id => getPathSegments(id)).filter(Boolean);
      const activePath = activeFileId ? getPathSegments(activeFileId) : null;
      const data = {
        format: "mini-code-workspace", version: "1.0", savedAt: Date.now(),
        name: root.name, tree: serializeTree(root),
        openTabs: openPaths, activePath: activePath, previewVisible: previewVisible
      };
      const json = JSON.stringify(data);
      if (json.length > MAX_WORKSPACE_SIZE) {
        console.warn("工作区太大，跳过自动保存（" + formatBytes(json.length) + "）");
        return;
      }
      localStorage.setItem(LAST_PROJECT_KEY, json);
    } catch (e) { console.warn("自动保存失败:", e); }
  }
  function tryRestoreLastWorkspace() {
    let raw;
    try { raw = localStorage.getItem(LAST_PROJECT_KEY); } catch (e) { return false; }
    if (!raw) return false;
    let data;
    try { data = JSON.parse(raw); }
    catch (e) { try { localStorage.removeItem(LAST_PROJECT_KEY); } catch (e2) {} return false; }
    if (!data || data.format !== "mini-code-workspace" || !data.tree) return false;
    let newRoot;
    try { newRoot = deserializeTree(data.tree); } catch (e) { return false; }
    if (data.name) newRoot.name = data.name;
    // 空项目不恢复
    if (!newRoot.children || newRoot.children.length === 0) return false;
    replaceProject(newRoot, true);
    if (Array.isArray(data.openTabs)) {
      data.openTabs.forEach(segs => {
        const n = findNodeBySegments(segs);
        if (n && n.type === "file" && openTabs.indexOf(n.id) === -1) openTabs.push(n.id);
      });
    }
    let target = null;
    if (Array.isArray(data.activePath)) target = findNodeBySegments(data.activePath);
    if (!target && openTabs.length) target = findNode(openTabs[0]);
    if (target && target.type === "file") {
      openFile(target.id);
      if (data.previewVisible && (isSvgFile(target) || isMarkdownFile(target) || isHtmlFile(target))) {
        previewVisible = true;
        applyFileView();
      }
    } else if (openTabs.length) openFile(openTabs[0]);
    else { clearEditor(); hideWelcome(); }
    return true;
  }

  const MENU_ICONS = {
    newProject: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    openFile: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
    openFolder: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h3.6l2 2.5H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    closeFolder: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h3.6l2 2.5H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="m9.5 10.5 5 5M14.5 10.5l-5 5"/></svg>',
    importFile: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 19h14"/></svg>',
    exportFile: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 19h14"/></svg>',
    save: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h11l4 4v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M8 3v6h7V3M8 15h8"/></svg>',
    preview: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/></svg>',
    theme: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>',
    panel: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg>',
    welcome: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/></svg>',
    settings: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1"/></svg>',
    undo: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
    redo: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
    cut: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.6"/><circle cx="6" cy="18" r="2.6"/><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12"/></svg>',
    copy: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    paste: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>',
    selectAll: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h5M3 3v5M21 3h-5M21 3v5M3 21h5M3 21v-5M21 21h-5M21 21v-5"/></svg>',
    find: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>',
    closeAll: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="14" height="14" rx="2"/><path d="M21 7v12a2 2 0 0 1-2 2H9"/></svg>',
    zoomIn: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    zoomOut: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>',
    zoomReset: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
    fullscreen: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
    forget: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9.5 7V4.8h5V7M6.5 7l1 12.2h9L17.5 7"/></svg>',
    keyboard: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/></svg>',
    info: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/></svg>'
  };

  const MENU_DEFS = {
    file: [
      { label: "新建项目", icon: MENU_ICONS.newProject, action: "new-project" },
      { divider: true },
      { label: "打开文件…", icon: MENU_ICONS.openFile, action: "open-file", shortcut: "Ctrl+O" },
      { label: "打开文件夹…", icon: MENU_ICONS.openFolder, action: "open-folder", shortcut: "Ctrl+Shift+O" },
      { label: "关闭文件夹", icon: MENU_ICONS.closeFolder, action: "close-folder" },
      { divider: true },
      { label: "导入项目 (.mcp)…", icon: MENU_ICONS.importFile, action: "import-mcp" },
      { label: "导出项目 (.mcp)…", icon: MENU_ICONS.exportFile, action: "export-mcp", shortcut: "Ctrl+E" },
      { divider: true },
      { label: "关闭所有标签", icon: MENU_ICONS.closeAll, action: "close-all-tabs" },
      { label: "忘记上次项目", icon: MENU_ICONS.forget, action: "forget-workspace" },
      { divider: true },
      { label: "显示欢迎页", icon: MENU_ICONS.welcome, action: "show-welcome" },
      { label: "设置…", icon: MENU_ICONS.settings, action: "open-settings", shortcut: "Ctrl+," },
      { divider: true },
      { label: "保存", icon: MENU_ICONS.save, action: "save", shortcut: "Ctrl+S" },
      { label: "另存为…", icon: MENU_ICONS.save, action: "save-as", shortcut: "Ctrl+Shift+S" },
      { label: "保存全部到磁盘", icon: MENU_ICONS.save, action: "save-all" }
    ],
    edit: [
      { label: "撤销", icon: MENU_ICONS.undo, action: "edit-undo", shortcut: "Ctrl+Z" },
      { label: "重做", icon: MENU_ICONS.redo, action: "edit-redo", shortcut: "Ctrl+Y" },
      { divider: true },
      { label: "剪切", icon: MENU_ICONS.cut, action: "edit-cut", shortcut: "Ctrl+X" },
      { label: "复制", icon: MENU_ICONS.copy, action: "edit-copy", shortcut: "Ctrl+C" },
      { label: "粘贴", icon: MENU_ICONS.paste, action: "edit-paste", shortcut: "Ctrl+V" },
      { divider: true },
      { label: "全选", icon: MENU_ICONS.selectAll, action: "edit-select-all", shortcut: "Ctrl+A" },
      { divider: true },
      { label: "查找替换", icon: MENU_ICONS.find, action: "open-find", shortcut: "Ctrl+F" },
      { label: "全局搜索", icon: MENU_ICONS.find, action: "global-search", shortcut: "Ctrl+Shift+P" }
    ],
    view: [
      { label: "切换预览", icon: MENU_ICONS.preview, action: "toggle-preview", shortcut: "Ctrl+Shift+V" },
      { label: "切换主题", icon: MENU_ICONS.theme, action: "toggle-theme" },
      { divider: true },
      { label: "放大字号", icon: MENU_ICONS.zoomIn, action: "zoom-in", shortcut: "Ctrl+=" },
      { label: "缩小字号", icon: MENU_ICONS.zoomOut, action: "zoom-out", shortcut: "Ctrl+-" },
      { label: "重置字号", icon: MENU_ICONS.zoomReset, action: "zoom-reset", shortcut: "Ctrl+0" },
      { divider: true },
      { label: "显示 / 隐藏侧边栏", icon: MENU_ICONS.panel, action: "toggle-sidebar" },
      { label: "切换全屏", icon: MENU_ICONS.fullscreen, action: "toggle-fullscreen", shortcut: "F11" }
    ],
    help: [
      { label: "快捷键参考…", icon: MENU_ICONS.keyboard, action: "show-shortcuts" },
      { label: "关于 Mention Code", icon: MENU_ICONS.info, action: "show-about" }
    ]
  };

  function buildMenu(menuEl, items) {
    menuEl.innerHTML = "";
    items.forEach(item => {
      if (item.divider) {
        const d = document.createElement("div");
        d.className = "dd-divider";
        menuEl.appendChild(d);
        return;
      }
      const el = document.createElement("div");
      el.className = "dropdown-item";
      el.dataset.action = item.action;
      el.innerHTML = '<span class="dd-icon">' + item.icon + '</span><span class="dd-label">' + escapeHtml(translate(item.label)) + '</span>' + (item.shortcut ? '<span class="dd-shortcut">' + item.shortcut + '</span>' : "");
      el.addEventListener("click", (e) => { e.stopPropagation(); closeAllMenus(); handleMenuAction(item.action); });
      menuEl.appendChild(el);
    });
  }

  function rebuildMenus() {
    buildMenu(document.getElementById("menu-file"), MENU_DEFS.file);
    buildMenu(document.getElementById("menu-edit"), MENU_DEFS.edit);
    buildMenu(document.getElementById("menu-view"), MENU_DEFS.view);
    buildMenu(document.getElementById("menu-help"), MENU_DEFS.help);
  }
  rebuildMenus();

  let openMenuBtn = null;

  function closeAllMenus() {
    document.querySelectorAll(".dropdown").forEach(m => { m.hidden = true; });
    document.querySelectorAll(".menu-btn").forEach(b => b.classList.remove("open"));
    openMenuBtn = null;
  }
  function openDropdown(btn, menu) {
    closeAllMenus();
    btn.classList.add("open");
    openMenuBtn = btn;
    menu.hidden = false;
    const rect = btn.getBoundingClientRect();
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    let left = rect.left, top = rect.bottom + 6;
    if (left + mw > window.innerWidth - 10) left = window.innerWidth - mw - 10;
    if (left < 10) left = 10;
    if (top + mh > window.innerHeight - 10) top = Math.max(10, window.innerHeight - mh - 10);
    menu.style.left = left + "px";
    menu.style.top = top + "px";
  }

  document.querySelectorAll(".menu-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const menu = document.getElementById("menu-" + btn.dataset.menu);
      if (!menu) return;
      if (openMenuBtn === btn) { closeAllMenus(); return; }
      openDropdown(btn, menu);
    });
    btn.addEventListener("mouseenter", () => {
      if (openMenuBtn && openMenuBtn !== btn) {
        const menu = document.getElementById("menu-" + btn.dataset.menu);
        if (menu) openDropdown(btn, menu);
      }
    });
  });
  document.addEventListener("click", (e) => {
    if (!openMenuBtn) return;
    if (e.target.closest(".menu-btn")) return;
    if (e.target.closest(".dropdown")) return;
    closeAllMenus();
  });
  window.addEventListener("blur", closeAllMenus);

  function handleMenuAction(action) {
    switch (action) {
      case "new-project": newProject(); break;
      case "open-file": openSingleFile(); break;
      case "open-folder": openFolderAction(); break;
      case "close-folder": closeFolder(); break;
      case "import-mcp": importProject(); break;
      case "export-mcp": exportProject(); break;
      case "show-welcome": showWelcome(); break;
      case "open-settings": openSettings(); break;
      case "save": saveActiveFile(false); break;
      case "save-as": saveActiveFile(true); break;
      case "save-all": saveAllFiles(); break;
      case "close-all-tabs":
        if (!openTabs.length) { toast("没有打开的标签"); break; }
        openTabs = []; clearEditor(); break;
      case "forget-workspace": forgetWorkspace(); break;
      case "edit-undo": if (editor.historySize().undo > 0) editor.undo(); else toast("没有可撤销的操作"); editor.focus(); break;
      case "edit-redo": if (editor.historySize().redo > 0) editor.redo(); else toast("没有可重做的操作"); editor.focus(); break;
      case "edit-cut": {
        const sel = editor.getSelection();
        if (!sel) { toast("未选中任何内容"); break; }
        copyToClipboard(sel); editor.replaceSelection(""); editor.focus();
        break;
      }
      case "edit-copy": {
        const sel = editor.getSelection();
        if (!sel) { toast("未选中任何内容"); break; }
        copyToClipboard(sel);
        break;
      }
      case "edit-paste": pasteFromClipboard(text => { if (text) editor.replaceSelection(text); editor.focus(); }); break;
      case "edit-select-all": editor.execCommand("selectAll"); editor.focus(); break;
      case "open-find": openFind(); break;
      case "global-search": switchPanel("search"); break;
      case "toggle-preview": {
        const f = activeFileId ? findNode(activeFileId) : null;
        if (isSvgFile(f) || isMarkdownFile(f) || isHtmlFile(f)) { previewVisible = !previewVisible; applyFileView(); }
        else if (isBitmapFile(f)) toast("图片已处于预览状态");
        else toast("当前文件不支持预览");
        break;
      }
      case "toggle-theme": applyTheme(!isDark); if (!settingsScreen.hidden) renderSettingsUI(); break;
      case "zoom-in":
        settings.fontSize = Math.min(20, +(settings.fontSize + 0.5).toFixed(1));
        applyFont(); saveSettings();
        if (!settingsScreen.hidden) renderSettingsUI();
        flashStatus("字号 " + settings.fontSize + "px");
        break;
      case "zoom-out":
        settings.fontSize = Math.max(11, +(settings.fontSize - 0.5).toFixed(1));
        applyFont(); saveSettings();
        if (!settingsScreen.hidden) renderSettingsUI();
        flashStatus("字号 " + settings.fontSize + "px");
        break;
      case "zoom-reset":
        settings.fontSize = DEFAULT_SETTINGS.fontSize;
        applyFont(); saveSettings();
        if (!settingsScreen.hidden) renderSettingsUI();
        flashStatus("字号已重置");
        break;
      case "toggle-sidebar": toggleSidebar(); break;
      case "toggle-fullscreen": toggleFullscreen(); break;
      case "show-shortcuts": showShortcutsDialog(); break;
      case "show-about": showAboutDialog(); break;
    }
  }

  let sidebarHidden = false;
  function setSidebarVisible(visible) {
    sidebarHidden = !visible;
    const sb = document.querySelector(".sidebar");
    const ab = document.querySelector(".activitybar");
    if (sb) sb.style.display = visible ? "" : "none";
    if (ab) ab.style.display = visible ? "" : "none";
    if (visible) {
      if (sidebarEl && sidebarEl.offsetWidth > 0) setSidebarWidth(sidebarEl.offsetWidth);
      else restoreSidebarWidth();
    }
    setTimeout(() => editor.refresh(), 60);
  }
  function toggleSidebar() {
    if (!sidebarHidden && menubarInSidebar) {
      menubarInSidebar = false;
      applyMenubarLocation();
    }
    setSidebarVisible(sidebarHidden);
  }
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => toast("当前浏览器不允许全屏", "error"));
    } else {
      document.exitFullscreen();
    }
  }
  function showShortcutsDialog() {
    const rows = [
      ["Ctrl/Cmd + ,", "打开设置"], ["Ctrl/Cmd + O", "打开文件"], ["Ctrl/Cmd + Shift + O", "打开文件夹"],
      ["Ctrl/Cmd + E", "导出 .mcp"], ["Ctrl/Cmd + S", "保存到磁盘（HTML 会刷新预览）"], ["Ctrl/Cmd + Shift + S", "另存为"],
      ["Ctrl/Cmd + F", "查找替换"], ["Ctrl/Cmd + Shift + P", "全局搜索"],
      ["Ctrl/Cmd + Shift + V", "切换预览（含 HTML 实时预览）"],
      ["Ctrl/Cmd + =", "放大字号"], ["Ctrl/Cmd + -", "缩小字号"], ["Ctrl/Cmd + 0", "重置字号"],
      ["F2", "重命名文件"], ["Del", "删除文件"], ["F11", "切换全屏"], ["Esc", "关闭弹层 / 菜单"]
    ];
    const html =
      '<p style="margin:0 0 10px;font-size:12.5px;color:var(--text-dim)">' + escapeHtml(translate("以下快捷键可在编辑器中直接使用：")) + '</p>' +
      '<table style="width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px">' +
      rows.map(r => '<tr><td style="padding:6px 10px;border-bottom:1px solid var(--border);font-family:monospace;color:var(--text);width:180px">' + r[0] + '</td><td style="padding:6px 10px;border-bottom:1px solid var(--border);color:var(--text-dim)">' + escapeHtml(translate(r[1])) + '</td></tr>').join("") +
      '</table>';
    simpleDialog(translate("快捷键参考"), html);
  }
  function showAboutDialog() {
    const html =
      '<div style="text-align:center;padding:8px 0 4px">' +
      '<div style="font-size:22px;font-weight:800;margin-bottom:6px">Mention Code</div>' +
      '<div style="font-size:12.5px;color:var(--text-dim);line-height:1.8">' +
      escapeHtml(translate("一个轻量、圆润、顺手的在线代码编辑器")) + '<br />' +
      escapeHtml(translate("基于 CodeMirror 5 · Marked · DOMPurify 构建")) + '<br />' +
      '<span style="font-family:monospace">v2.3.0</span>' +
      '</div></div>';
    simpleDialog(translate("关于 Mention Code"), html);
  }
  function simpleDialog(title, innerHtml) {
    document.querySelectorAll(".mc-dialog").forEach(function (el) { el.remove(); });

    var overlay = document.createElement("div");
    overlay.className = "mc-dialog";
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.right = "0";
    overlay.style.bottom = "0";
    overlay.style.background = "rgba(0,0,0,0.65)";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "99999";
    overlay.style.padding = "24px";
    overlay.style.boxSizing = "border-box";

    var box = document.createElement("div");
    box.style.width = "100%";
    box.style.maxWidth = "520px";
    box.style.maxHeight = "80vh";
    box.style.overflowY = "auto";
    box.style.background = isDark ? "#1c1c1f" : "#ffffff";
    box.style.color = isDark ? "#d7d7db" : "#2b2d31";
    box.style.borderRadius = "20px";
    box.style.padding = "20px 24px";
    box.style.boxSizing = "border-box";
    box.style.boxShadow = "0 24px 70px rgba(0,0,0,0.5)";
    box.style.fontSize = "14px";
    box.style.lineHeight = "1.6";

    box.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">' +
        '<strong style="font-size:15px">' + escapeHtml(title) + '</strong>' +
        '<button type="button" style="border:none;background:none;color:inherit;font-size:22px;line-height:1;cursor:pointer;padding:0 6px">×</button>' +
      '</div>' +
      '<div>' + innerHtml + '</div>';

    box.querySelector("button").onclick = function () { overlay.remove(); };
    overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  const CARET_SVG = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';
  const PLUS_FILE_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9"/><path d="M13 3v6h6"/><path d="M17.5 2v5M15 4.5h5"/></svg>';
  const PLUS_FOLDER_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h3.2l1.8 2.5H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M17.5 3v5M15 5.5h5"/></svg>';
  const TRASH_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9.5 7V4.8h5V7M6.5 7l1 12.2h9L17.5 7"/></svg>';

  const CTX_NEW_FILE = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 12.5v4M10 14.5h4"/></svg>';
  const CTX_NEW_FOLDER = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h3.6l2 2.5H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11.5v4M10 13.5h4"/></svg>';
  const CTX_OPEN = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3h7v7"/><path d="M21 3l-8 8"/><path d="M18 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/></svg>';
  const CTX_RENAME = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 3.5 20.5 7.5 8 20H4v-4z"/><path d="M14.5 5.5l4 4"/></svg>';
  const CTX_TRASH = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9.5 7V4.8h5V7M6.5 7l1 12.2h9L17.5 7"/><path d="M10 11v5M14 11v5"/></svg>';
  const CTX_PREVIEW = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/></svg>';
  const CTX_SAVE_IMG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 19h14"/></svg>';
  const CTX_COPY_IMG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>';
  const CTX_LOCATE = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';
  const CTX_CLOSE = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  const CTX_CLOSE_OTHERS = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="14" height="14" rx="2"/><path d="M21 7v12a2 2 0 0 1-2 2H9"/></svg>';

  function makeActionBtn(title, svg, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "row-btn";
    b.title = title;
    b.innerHTML = svg;
    b.addEventListener("click", e => { e.stopPropagation(); onClick(); });
    return b;
  }

  function buildRow(node, depth) {
    const row = document.createElement("div");
    row.className = "tree-row";
    row.dataset.id = node.id;
    row.dataset.depth = depth;
    row.style.paddingLeft = (8 + depth * 14) + "px";
    if (node.type === "folder") {
      if (node.expanded) row.classList.add("expanded");
      const caret = document.createElement("span");
      caret.className = "tree-caret";
      caret.innerHTML = CARET_SVG;
      row.appendChild(caret);
      const icon = document.createElement("span");
      icon.className = "folder-icon";
      icon.innerHTML = FOLDER_SVG;
      row.appendChild(icon);
    } else {
      const spacer = document.createElement("span");
      spacer.style.width = "14px";
      spacer.style.flex = "none";
      row.appendChild(spacer);
      const icon = document.createElement("span");
      icon.className = "file-icon";
      icon.innerHTML = node.icon;
      row.appendChild(icon);
    }
    const name = document.createElement("span");
    name.className = "tree-name";
    name.textContent = node.name;
    row.appendChild(name);

    const actions = document.createElement("div");
    actions.className = "row-actions";
    if (node.type === "folder") {
      actions.appendChild(makeActionBtn("新建文件", PLUS_FILE_SVG, () => {
        node.expanded = true;
        renderTree();
        const el = getRowEl(node.id);
        if (el) showCreateInput(node, el, "file");
      }));
      actions.appendChild(makeActionBtn("新建文件夹", PLUS_FOLDER_SVG, () => {
        node.expanded = true;
        renderTree();
        const el = getRowEl(node.id);
        if (el) showCreateInput(node, el, "folder");
      }));
    }
    if (node !== root) {
      actions.appendChild(makeActionBtn("删除", TRASH_SVG, () => deleteNode(node.id)));
    }
    row.appendChild(actions);

    row.addEventListener("click", () => {
      if (node.type === "folder") {
        node.expanded = !node.expanded;
        selectedFolderId = node.id;
        renderTree();
      } else {
        const p = findParent(node.id);
        selectedFolderId = p ? p.id : null;
        openFile(node.id);
      }
    });
    row.addEventListener("dblclick", e => { e.preventDefault(); if (node !== root) startRename(node, row); });
    if (node.type === "file" && node.id === activeFileId) row.classList.add("active");
    if (node.type === "folder" && node.id === selectedFolderId) row.classList.add("selected");
    if (node.dirty) row.classList.add("dirty");
    return row;
  }

  function renderChildren(node, depth) {
    (node.children || []).forEach(child => {
      treeEl.appendChild(buildRow(child, depth));
      if (child.type === "folder" && child.expanded) renderChildren(child, depth + 1);
    });
  }
  function renderTree() {
    const st = treeEl.scrollTop;
    treeEl.innerHTML = "";
    treeEl.appendChild(buildRow(root, 0));
    if (root.expanded) renderChildren(root, 1);
    treeEl.scrollTop = st;
  }
  function getRowEl(id) { return treeEl.querySelector('.tree-row[data-id="' + id + '"]'); }
  function insertAfterSubtree(parentRowEl, newEl) {
    const depth = parseInt(parentRowEl.dataset.depth, 10);
    let ref = parentRowEl.nextElementSibling;
    while (ref && parseInt(ref.dataset.depth, 10) > depth) ref = ref.nextElementSibling;
    treeEl.insertBefore(newEl, ref);
  }
  function pulseRow(id) {
    const el = getRowEl(id);
    if (!el) return;
    el.classList.add("anim", "pulse");
    setTimeout(() => el.classList.remove("anim", "pulse"), 1000);
  }

  function showCreateInput(parentNode, parentRowEl, type) {
    const depth = parseInt(parentRowEl.dataset.depth, 10) + 1;
    const row = document.createElement("div");
    row.className = "tree-row anim";
    row.dataset.depth = depth;
    row.style.paddingLeft = (8 + depth * 14) + "px";
    const caret = document.createElement("span");
    caret.className = "tree-caret";
    caret.style.opacity = "0";
    caret.innerHTML = CARET_SVG;
    row.appendChild(caret);
    const icon = document.createElement("span");
    if (type === "folder") { icon.className = "folder-icon"; icon.innerHTML = FOLDER_SVG; }
    else { icon.className = "file-icon"; icon.innerHTML = ICONS.txt; }
    row.appendChild(icon);
    const input = document.createElement("input");
    input.className = "inline-input";
    input.placeholder = type === "folder" ? "文件夹名称" : "文件名称（含扩展名）";
    input.spellcheck = false;
    row.appendChild(input);
    insertAfterSubtree(parentRowEl, row);
    input.focus();

    let done = false;
    function finish(commit) {
      if (done) return;
      done = true;
      const name = input.value.trim();
      if (commit && name) {
        const siblings = (parentNode.children || []).map(c => c.name);
        if (siblings.indexOf(name) > -1) { alert("同级下已存在同名项目：" + name); row.remove(); return; }
        let node;
        if (type === "folder") node = makeFolder(name, []);
        else node = makeFile(name, "");
        parentNode.children.push(node);
        parentNode.expanded = true;
        selectedFolderId = parentNode.id;
        const st = treeEl.scrollTop;
        renderTree();
        treeEl.scrollTop = st;
        if (type === "file") openFile(node.id);
        else pulseRow(node.id);
        scheduleAutosave();
        return;
      }
      row.remove();
    }
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); finish(true); }
      if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(false));
  }

  function startRename(node, rowEl) {
    if (node === root) return;
    const nameEl = rowEl.querySelector(".tree-name");
    if (!nameEl) return;
    const input = document.createElement("input");
    input.className = "inline-input";
    input.value = node.name;
    input.spellcheck = false;
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    function finish(commit) {
      if (done) return;
      done = true;
      const val = input.value.trim();
      if (commit && val && val !== node.name) {
        const parent = findParent(node.id);
        if (parent && parent.children.some(c => c !== node && c.name === val)) {
          alert("同级下已存在同名项目：" + val);
          renderTree();
          return;
        }
        node.name = val;
        if (node.type === "file") Object.assign(node, getMeta(val));
      }
      renderTree();
      renderTabs();
      if (activeFileId === node.id) {
        statusFile.textContent = node.name;
        statusLangText.textContent = node.lang;
        statusLangIcon.innerHTML = node.icon;
        updateBreadcrumb(node);
        applyFileView();
      }
      pulseRow(node.id);
      scheduleAutosave();
    }
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); finish(true); }
      if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(false));
  }

  function deleteNode(id) {
    const node = findNode(id);
    if (!node || node === root) return;
    const tip = node.type === "folder" ? '确定删除文件夹「' + node.name + '」及其全部内容？' : '确定删除文件「' + node.name + '」？';
    if (!confirm(tip)) return;
    const parent = findParent(id);
    if (!parent) return;
    parent.children = parent.children.filter(c => c.id !== id);
    const removedIds = node.type === "folder" ? flattenFiles(node).map(f => f.id) : [id];
    openTabs = openTabs.filter(t => removedIds.indexOf(t) === -1);
    if (removedIds.indexOf(activeFileId) > -1) {
      if (openTabs.length) openFile(openTabs[openTabs.length - 1]);
      else clearEditor();
    }
    if (removedIds.indexOf(selectedFolderId) > -1) selectedFolderId = parent.id;
    renderTree();
    renderTabs();
    runSearch();
    scheduleAutosave();
  }

  function renderTabs() {
    tabsEl.innerHTML = "";
    openTabs.forEach((id, idx) => {
      const f = findNode(id);
      if (!f) return;
      const tab = document.createElement("div");
      tab.className = "tab" + (id === activeFileId ? " active" : "");
      tab.style.animationDelay = Math.min(idx * 28, 240) + "ms";
      tab.dataset.fileId = id;
      const icon = document.createElement("span");
      icon.className = "file-icon";
      icon.innerHTML = f.icon;
      tab.appendChild(icon);
      const label = document.createElement("span");
      label.textContent = f.name;
      tab.appendChild(label);
      const close = document.createElement("button");
      close.type = "button";
      close.className = "tab-close";
      close.textContent = "×";
      close.title = "关闭";
      close.addEventListener("click", e => { e.stopPropagation(); closeTab(id); });
      tab.appendChild(close);
      tab.addEventListener("click", () => openFile(id));
      if (f.dirty) tab.classList.add("dirty");
      tabsEl.appendChild(tab);
    });
  }
  function closeTab(id) {
    const idx = openTabs.indexOf(id);
    if (idx === -1) return;
    openTabs.splice(idx, 1);
    if (activeFileId === id) {
      if (openTabs.length) openFile(openTabs[openTabs.length - 1]);
      else clearEditor();
    } else renderTabs();
    scheduleAutosave();
  }

  function openFile(id) {
    const f = findNode(id);
    if (!f || f.type !== "file") return;
    activeFileId = id;
    if (openTabs.indexOf(id) === -1) openTabs.push(id);
    hideWelcome();
    if (isBitmapFile(f)) {
      editor.setOption("mode", null);
      editor.setValue("");
      editor.clearHistory();
    } else {
      editor.setOption("mode", f.mode);
      editor.setValue(f.content);
      editor.clearHistory();
      editor.setCursor({ line: 0, ch: 0 });
    }
    renderTabs();
    renderTree();
    updateBreadcrumb(f);
    statusLangText.textContent = f.lang;
    statusLangIcon.innerHTML = f.icon;
    statusFile.textContent = f.name;
    closeFind();
    updateCursor();
    applyFileView();
    if (searchInput.value) runSearch();
    scheduleAutosave();
  }
  function clearEditor() {
    activeFileId = null;
    editor.setValue("");
    editor.setOption("mode", null);
    crumbEl.innerHTML = "";
    statusLangText.textContent = "None";
    statusLangIcon.innerHTML = "";
    updateCodeCount("");
    statusFile.textContent = "None";
    updateCursor();
    renderTabs();
    renderTree();
    previewVisible = false;
    applyFileView();
    showWelcome();
    scheduleAutosave();
  }
  function updateBreadcrumb(node) {
    const path = findPath(node.id) || [];
    let html = "";
    path.forEach((p, i) => {
      const isLast = i === path.length - 1;
      if (isLast && p.type === "file") html += '<span class="file-icon">' + p.icon + '</span>';
      html += "<span>" + escapeHtml(p.name) + "</span>";
      if (!isLast) html += '<span class="sep">›</span>';
    });
    crumbEl.innerHTML = html;
  }
  function updateCursor() {
    const c = editor.getCursor();
    const sel = editor.getSelection();
    statusCursor.textContent = translate("行") + " " + (c.line + 1) + "，" + translate("列") + " " + (c.ch + 1) +
      (sel ? "（" + translate("已选") + " " + sel.length + "）" : "");
  }
  function updateCodeCount(content) {
    const count = String(content || "").replace(/\s/g, "").length;
    statusCodeCount.textContent = translate("字数") + ": " + count.toLocaleString(resolvedLanguage());
  }
  function updateStatusLanguage() {
    if (statusSpaces) statusSpaces.textContent = translate("空格") + ": 2";
    updateCursor();
    updateCodeCount(activeFileId ? editor.getValue() : "");
  }

  const actBtns = document.querySelectorAll(".act-btn[data-panel]");
  function switchPanel(name) {
    actBtns.forEach(b => b.classList.toggle("active", b.dataset.panel === name));
    panelExplorer.hidden = name !== "explorer";
    panelSearch.hidden = name !== "search";
    if (name === "search") setTimeout(() => searchInput.focus(), 30);
  }
  actBtns.forEach(btn => {
    btn.addEventListener("click", () => switchPanel(btn.dataset.panel));
  });

  const searchState = { caseSensitive: false, regex: false, matches: [], activeIndex: -1 };

  caseToggle.addEventListener("click", () => {
    searchState.caseSensitive = !searchState.caseSensitive;
    caseToggle.classList.toggle("on", searchState.caseSensitive);
    runSearch();
  });
  regexToggle.addEventListener("click", () => {
    searchState.regex = !searchState.regex;
    regexToggle.classList.toggle("on", searchState.regex);
    runSearch();
  });
  document.getElementById("clearSearchBtn").addEventListener("click", () => {
    searchInput.value = ""; replaceInput.value = ""; runSearch(); searchInput.focus();
  });

  function buildSearchRegExp(query) {
    const flags = searchState.caseSensitive ? "g" : "gi";
    const source = searchState.regex ? query : escapeRegExp(query);
    return new RegExp(source, flags);
  }
  function highlightText(text, re) {
    let out = "", last = 0, m;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      if (m[0] === "") { re.lastIndex++; continue; }
      out += escapeHtml(text.slice(last, m.index));
      out += "<mark>" + escapeHtml(m[0]) + "</mark>";
      last = m.index + m[0].length;
    }
    out += escapeHtml(text.slice(last));
    return out;
  }
  function runSearch() {
    const query = searchInput.value;
    searchResults.innerHTML = "";
    searchState.matches = [];
    if (!query) {
      searchState.activeIndex = -1;
      searchResults.innerHTML = '<div class="empty-hint">' + translate("输入关键词，搜索整个项目的内容") + '<br />' + translate("支持") + ' <b>Aa</b> ' + translate("大小写") + ' &amp; <b>.*</b> ' + translate("使用正则表达式") + '<br />' + translate("并可直接替换") + '</div>';
      updateReplaceButtons();
      return;
    }
    let re;
    try { re = buildSearchRegExp(query); }
    catch (e) {
      searchState.activeIndex = -1;
      searchResults.innerHTML = '<div class="empty-hint">' + translate("正则表达式无效") + '</div>';
      updateReplaceButtons();
      return;
    }
    const files = flattenFiles();
    const groups = [];
    let globalIndex = 0;
    files.forEach(f => {
      if (f.isBitmap) return;
      const lines = f.content.split("\n");
      const fileMatches = [];
      lines.forEach((lineText, i) => {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(lineText)) !== null) {
          if (m[0] === "") { re.lastIndex++; continue; }
          fileMatches.push({ globalIndex: globalIndex++, fileId: f.id, line: i, start: m.index, end: m.index + m[0].length, lineText: lineText });
        }
      });
      if (fileMatches.length) {
        groups.push({ file: f, matches: fileMatches });
        searchState.matches.push.apply(searchState.matches, fileMatches);
      }
    });
    const total = searchState.matches.length;
    if (searchState.activeIndex >= total) searchState.activeIndex = -1;
    if (!total) { searchResults.innerHTML = '<div class="empty-hint">' + translate("没有找到匹配结果") + '</div>'; updateReplaceButtons(); return; }
    const summary = document.createElement("div");
    summary.className = "empty-hint";
    summary.style.cssText = "padding:2px 4px 10px;text-align:left";
    summary.textContent = resolvedLanguage() === "en-US"
      ? groups.length + translate("个文件中有") + total + translate("处匹配")
      : groups.length + " " + translate("个文件中有") + " " + total + " " + translate("处匹配");
    searchResults.appendChild(summary);
    groups.forEach((g, gi) => {
      const group = document.createElement("div");
      group.className = "result-group";
      group.style.animationDelay = Math.min(gi * 40, 320) + "ms";
      const head = document.createElement("div");
      head.className = "result-file";
      head.innerHTML = '<span class="file-icon">' + g.file.icon + '</span><span class="result-file-name">' + escapeHtml(g.file.name) + '</span><span class="result-count">' + g.matches.length + '</span>';
      group.appendChild(head);
      g.matches.forEach(m => {
        const item = document.createElement("div");
        item.className = "result-item" + (m.globalIndex === searchState.activeIndex ? " active" : "");
        item.dataset.matchIndex = m.globalIndex;
        item.innerHTML = '<span class="result-line">' + (m.line + 1) + '</span><span class="result-text">' + highlightText(m.lineText.trim(), re) + '</span>';
        item.addEventListener("click", () => gotoMatch(m.globalIndex));
        group.appendChild(item);
      });
      searchResults.appendChild(group);
    });
    updateReplaceButtons();
  }
  function updateReplaceButtons() {
    const has = searchState.matches.length > 0;
    replaceOneBtn.disabled = !has;
    replaceAllBtn.disabled = !has;
  }
  function gotoMatch(index) {
    const m = searchState.matches[index];
    if (!m) return;
    searchState.activeIndex = index;
    searchResults.querySelectorAll(".result-item").forEach(el => el.classList.toggle("active", Number(el.dataset.matchIndex) === index));
    if (activeFileId !== m.fileId) openFile(m.fileId);
    const from = { line: m.line, ch: m.start };
    const to = { line: m.line, ch: m.end };
    editor.setSelection(from, to);
    editor.scrollIntoView({ from: from, to: to }, 100);
    editor.focus();
    const mark = editor.markText(from, to, { className: "cm-find-match-active" });
    setTimeout(() => { try { mark.clear(); } catch (e) {} }, 1200);
  }
  function replaceInContent(content, line, start, end, replacement) {
    const lines = content.split("\n");
    if (line < 0 || line >= lines.length) return content;
    const target = lines[line];
    const before = target.slice(0, start);
    const after = target.slice(end);
    const repLines = String(replacement).split("\n");
    if (repLines.length === 1) {
      lines[line] = before + replacement + after;
    } else {
      const inserted = [before + repLines[0]];
      for (let i = 1; i < repLines.length - 1; i++) inserted.push(repLines[i]);
      inserted.push(repLines[repLines.length - 1] + after);
      lines.splice(line, 1, ...inserted);
    }
    return lines.join("\n");
  }
  function replaceOne() {
    if (!searchState.matches.length) return;
    let idx = searchState.activeIndex;
    if (idx < 0 || idx >= searchState.matches.length) idx = 0;
    const m = searchState.matches[idx];
    const replacement = replaceInput.value;
    if (activeFileId === m.fileId) {
      editor.replaceRange(replacement, { line: m.line, ch: m.start }, { line: m.line, ch: m.end });
    } else {
      const f = findNode(m.fileId);
      if (f) f.content = replaceInContent(f.content, m.line, m.start, m.end, replacement);
    }
    runSearch();
    if (searchState.matches.length) gotoMatch(Math.min(idx, searchState.matches.length - 1));
    flashStatus("已替换 1 处");
    scheduleAutosave();
  }
  function replaceAll() {
    if (!searchState.matches.length) return;
    const replacement = replaceInput.value;
    const byFile = {};
    searchState.matches.forEach(m => { (byFile[m.fileId] = byFile[m.fileId] || []).push(m); });
    let count = 0;
    Object.keys(byFile).forEach(fid => {
      const f = findNode(fid);
      if (!f) return;
      const ms = byFile[fid].slice().sort((a, b) => a.line !== b.line ? b.line - a.line : b.start - a.start);
      let content = f.content;
      ms.forEach(m => { content = replaceInContent(content, m.line, m.start, m.end, replacement); count++; });
      f.content = content;
      if (activeFileId === fid) {
        const info = editor.getScrollInfo();
        const cursor = editor.getCursor();
        editor.setValue(content);
        try { editor.setCursor(cursor); } catch (e) {}
        editor.scrollTo(info.left, info.top);
      }
    });
    runSearch();
    if (previewVisible) {
      const f = activeFileId ? findNode(activeFileId) : null;
      if (f && (isSvgFile(f) || isMarkdownFile(f) || isHtmlFile(f))) showPreviewFor(f);
    }
    flashStatus("已替换 " + count + " 处");
    scheduleAutosave();
  }
  replaceOneBtn.addEventListener("click", replaceOne);
  replaceAllBtn.addEventListener("click", replaceAll);
  searchInput.addEventListener("input", debounce(runSearch, 160));
  searchInput.addEventListener("keydown", e => {
    if (e.key === "Escape") { searchInput.value = ""; runSearch(); }
    if (e.key === "Enter") { e.preventDefault(); if (searchState.matches.length) gotoMatch((searchState.activeIndex + 1) % searchState.matches.length); }
  });
  replaceInput.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); replaceOne(); } });

  const findState = { matches: [], index: -1, query: "", marks: [] };
  let findTimer = null;
  let svgPreviewTimer = null;

  function clearFindMarks() { findState.marks.forEach(m => { try { m.clear(); } catch (e) {} }); findState.marks = []; }
  function renderFindMarks() {
    clearFindMarks();
    findState.matches.forEach((m, i) => {
      const mark = editor.markText(m.from, m.to, { className: i === findState.index ? "cm-find-match-active" : "cm-find-match" });
      findState.marks.push(mark);
    });
  }
  function updateFindCount() {
    const n = findState.matches.length;
    findCount.textContent = n ? (findState.index + 1) + "/" + n : "0/0";
  }
  function runFind(query, keepIndex) {
    const prevIndex = keepIndex ? findState.index : 0;
    clearFindMarks();
    findState.matches = [];
    findState.query = query;
    if (query) {
      const cursor = editor.getSearchCursor(query, { line: 0, ch: 0 }, { caseSensitive: false });
      while (cursor.findNext()) findState.matches.push({ from: cursor.from(), to: cursor.to() });
    }
    const n = findState.matches.length;
    findState.index = n ? Math.max(0, Math.min(prevIndex, n - 1)) : -1;
    renderFindMarks();
    updateFindCount();
    if (n) {
      const m = findState.matches[findState.index];
      editor.scrollIntoView({ from: m.from, to: m.to }, 80);
    }
  }
  function nextMatch(dir) {
    const n = findState.matches.length;
    if (!n) return;
    findState.index = (findState.index + dir + n) % n;
    renderFindMarks();
    const m = findState.matches[findState.index];
    editor.setSelection(m.from, m.to);
    editor.scrollIntoView({ from: m.from, to: m.to }, 80);
    updateFindCount();
  }
  function openFind() {
    const f = activeFileId ? findNode(activeFileId) : null;
    if (f && f.isBitmap) { toast("图片文件不支持查找"); return; }
    findWidget.hidden = false;
    const sel = editor.getSelection();
    if (sel && sel.indexOf("\n") === -1) findInput.value = sel;
    findInput.focus();
    findInput.select();
    if (findInput.value) runFind(findInput.value, false);
  }
  function closeFind() {
    findWidget.hidden = true;
    findReplaceRow.hidden = true;
    findToggleReplace.classList.remove("toggled");
    clearFindMarks();
    findState.matches = [];
    findState.index = -1;
    findState.query = "";
  }
  findInput.addEventListener("input", () => runFind(findInput.value, false));
  findInput.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); nextMatch(e.shiftKey ? -1 : 1); }
    if (e.key === "Escape") { e.preventDefault(); closeFind(); editor.focus(); }
  });
  document.getElementById("findNext").addEventListener("click", () => nextMatch(1));
  document.getElementById("findPrev").addEventListener("click", () => nextMatch(-1));
  document.getElementById("findClose").addEventListener("click", () => { closeFind(); editor.focus(); });
  findToggleReplace.addEventListener("click", () => {
    findReplaceRow.hidden = !findReplaceRow.hidden;
    findToggleReplace.classList.toggle("toggled", !findReplaceRow.hidden);
    if (!findReplaceRow.hidden) setTimeout(() => replaceEditorInput.focus(), 20);
  });
  function replaceOneInEditor() {
    const query = findInput.value;
    if (!query || !findState.matches.length || findState.index < 0) return;
    const m = findState.matches[findState.index];
    const replacement = replaceEditorInput.value;
    const oldIndex = findState.index;
    editor.replaceRange(replacement, m.from, m.to);
    runFind(query, false);
    if (findState.matches.length) {
      findState.index = Math.min(oldIndex, findState.matches.length - 1);
      renderFindMarks();
      const nm = findState.matches[findState.index];
      editor.setSelection(nm.from, nm.to);
      editor.scrollIntoView({ from: nm.from, to: nm.to }, 80);
      updateFindCount();
    }
    editor.focus();
  }
  function replaceAllInEditor() {
    const query = findInput.value;
    if (!query) return;
    const replacement = replaceEditorInput.value;
    const content = editor.getValue();
    const re = new RegExp(escapeRegExp(query), "gi");
    const newContent = content.replace(re, replacement);
    if (newContent === content) return;
    const info = editor.getScrollInfo();
    editor.setValue(newContent);
    editor.scrollTo(info.left, info.top);
    runFind(query, false);
    editor.focus();
  }
  document.getElementById("replaceOneInEditorBtn").addEventListener("click", replaceOneInEditor);
  document.getElementById("replaceAllInEditorBtn").addEventListener("click", replaceAllInEditor);
  replaceEditorInput.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); replaceOneInEditor(); } });

  function hideContextMenu() { if (!contextMenu.hidden) contextMenu.hidden = true; }

  function renderContextMenu(items, titleHTML, x, y) {
    contextMenuList.innerHTML = "";
    contextTitle.innerHTML = titleHTML || "";
    contextTitle.style.display = titleHTML ? "" : "none";
    items.forEach(it => {
      if (it.divider) {
        const d = document.createElement("div");
        d.className = "context-divider";
        contextMenuList.appendChild(d);
        return;
      }
      const el = document.createElement("div");
      el.className = "context-item" + (it.danger ? " danger" : "");
      if (it.disabled) { el.style.opacity = "0.45"; el.style.pointerEvents = "none"; }
      el.innerHTML = '<span class="ctx-icon">' + (it.icon || "") + '</span><span class="ctx-label">' + escapeHtml(translate(it.label)) + '</span>' + (it.shortcut ? '<span class="ctx-shortcut">' + it.shortcut + '</span>' : "");
      if (!it.disabled) el.addEventListener("click", () => { hideContextMenu(); it.action && it.action(); });
      contextMenuList.appendChild(el);
    });
    contextMenu.hidden = false;
    const menuW = contextMenu.offsetWidth, menuH = contextMenu.offsetHeight;
    let left = x, top = y;
    if (left + menuW > window.innerWidth - 10) left = window.innerWidth - menuW - 10;
    if (top + menuH > window.innerHeight - 10) top = window.innerHeight - menuH - 10;
    if (left < 10) left = 10;
    if (top < 10) top = 10;
    contextMenu.style.left = left + "px";
    contextMenu.style.top = top + "px";
  }

  function buildTreeTitle(type, node) {
    if (type === "file") return '<span class="file-icon">' + node.icon + '</span><span class="context-title-name">' + escapeHtml(node.name) + '</span>';
    if (type === "folder") return '<span class="folder-icon">' + FOLDER_SVG + '</span><span class="context-title-name">' + escapeHtml(node.name) + '</span>';
    return '<span class="context-title-name" style="color:var(--text-dim);font-weight:500">' + escapeHtml(translate("项目根目录")) + '</span>';
  }
  function buildTreeMenuItems(target) {
    const items = [];
    if (target.type === "root" || target.type === "folder") {
      items.push({ label: "新建文件", icon: CTX_NEW_FILE, action: () => createChild(target.node, "file") });
      items.push({ label: "新建文件夹", icon: CTX_NEW_FOLDER, action: () => createChild(target.node, "folder") });
      items.push({ divider: true });
    }
    if (target.type === "file") {
      items.push({ label: "打开", icon: CTX_OPEN, shortcut: "Enter", action: () => openFile(target.node.id) });
      if (!target.node.isBitmap) {
        items.push({ label: "保存到磁盘", icon: CTX_SAVE_IMG, shortcut: "Ctrl+S", action: () => { if (activeFileId !== target.node.id) openFile(target.node.id); saveActiveFile(false); } });
        items.push({ label: "另存为…", icon: CTX_SAVE_IMG, shortcut: "Ctrl+Shift+S", action: () => { if (activeFileId !== target.node.id) openFile(target.node.id); saveActiveFile(true); } });
      }
      if (isMarkdownFile(target.node) || isSvgFile(target.node) || isHtmlFile(target.node)) {
        items.push({
          label: previewVisible ? "关闭预览" : "打开预览",
          icon: CTX_PREVIEW,
          action: () => {
            if (activeFileId !== target.node.id) openFile(target.node.id);
            previewVisible = !previewVisible;
            applyFileView();
          }
        });
      }
      items.push({ divider: true });
    }
    if (target.type === "file" || target.type === "folder") {
      items.push({
        label: "重命名", icon: CTX_RENAME, shortcut: "F2",
        action: () => {
          const rowEl = getRowEl(target.node.id);
          if (rowEl) startRename(target.node, rowEl);
        }
      });
      items.push({ label: "删除", icon: CTX_TRASH, danger: true, shortcut: "Del", action: () => deleteNode(target.node.id) });
    }
    return items;
  }
  function buildEditorMenuItems() {
    const hasSel = editor.somethingSelected();
    const hist = editor.historySize();
    return [
      { label: "撤销", icon: MENU_ICONS.undo, shortcut: "Ctrl+Z", disabled: hist.undo === 0, action: () => { editor.undo(); editor.focus(); } },
      { label: "重做", icon: MENU_ICONS.redo, shortcut: "Ctrl+Y", disabled: hist.redo === 0, action: () => { editor.redo(); editor.focus(); } },
      { divider: true },
      { label: "剪切", icon: MENU_ICONS.cut, shortcut: "Ctrl+X", disabled: !hasSel, action: () => { const s = editor.getSelection(); if (s) { copyToClipboard(s); editor.replaceSelection(""); editor.focus(); } } },
      { label: "复制", icon: MENU_ICONS.copy, shortcut: "Ctrl+C", disabled: !hasSel, action: () => { const s = editor.getSelection(); if (s) copyToClipboard(s); } },
      { label: "粘贴", icon: MENU_ICONS.paste, shortcut: "Ctrl+V", action: () => pasteFromClipboard(t => { if (t) editor.replaceSelection(t); editor.focus(); }) },
      { divider: true },
      { label: "全选", icon: MENU_ICONS.selectAll, shortcut: "Ctrl+A", action: () => { editor.execCommand("selectAll"); editor.focus(); } },
      { divider: true },
      { label: "保存", icon: MENU_ICONS.save, shortcut: "Ctrl+S", action: () => saveActiveFile(false) },
      { label: "另存为…", icon: MENU_ICONS.save, shortcut: "Ctrl+Shift+S", action: () => saveActiveFile(true) },
      { divider: true },
      { label: "查找替换", icon: MENU_ICONS.find, shortcut: "Ctrl+F", action: () => openFind() }
    ];
  }
  function buildTabMenuItems(fileId) {
    const f = findNode(fileId);
    const items = [{ label: "关闭", icon: CTX_CLOSE, action: () => closeTab(fileId) }];
    if (openTabs.length > 1) items.push({ label: "关闭其他", icon: CTX_CLOSE_OTHERS, action: () => { openTabs = [fileId]; openFile(fileId); } });
    items.push({ label: "关闭全部", icon: CTX_CLOSE_OTHERS, action: () => { openTabs = []; clearEditor(); } });
    items.push({ divider: true });
    if (f && !f.isBitmap) {
      items.push({ label: "保存", icon: MENU_ICONS.save, action: () => { if (activeFileId !== fileId) openFile(fileId); saveActiveFile(false); } });
      items.push({ label: "另存为…", icon: MENU_ICONS.save, action: () => { if (activeFileId !== fileId) openFile(fileId); saveActiveFile(true); } });
      items.push({ divider: true });
    }
    items.push({
      label: "在文件树中定位", icon: CTX_LOCATE,
      action: () => {
        const rowEl = getRowEl(fileId);
        if (rowEl) { rowEl.scrollIntoView({ block: "nearest", behavior: "smooth" }); rowEl.classList.add("pulse"); setTimeout(() => rowEl.classList.remove("pulse"), 1000); }
        else toast("该文件不在当前项目中");
      }
    });
    return items;
  }
  function buildImageMenuItems(fileId) {
    const f = findNode(fileId);
    if (!f) return [];
    return [
      { label: "另存为图片…", icon: CTX_SAVE_IMG,
        action: () => {
          let dataUrl = f.content;
          if (isSvgFile(f)) dataUrl = textToSvgDataUrl(f.content);
          try {
            const idx = dataUrl.indexOf(",");
            const meta = dataUrl.slice(0, idx);
            const b64 = dataUrl.slice(idx + 1);
            const m = meta.match(/:(.*?);/);
            const mime = (m && m[1]) || "image/png";
            const bstr = atob(b64);
            const u8 = new Uint8Array(bstr.length);
            for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
            downloadBlob(new Blob([u8], { type: mime }), f.name);
            toast("已导出 " + f.name);
          } catch (err) { toast("导出失败：" + err.message, "error"); }
        }
      },
      { label: "复制为 Data URL", icon: CTX_COPY_IMG,
        action: () => copyToClipboard(isSvgFile(f) ? textToSvgDataUrl(f.content) : f.content)
      },
      { divider: true },
      { label: "在文件树中定位", icon: CTX_LOCATE,
        action: () => {
          const rowEl = getRowEl(fileId);
          if (rowEl) { rowEl.scrollIntoView({ block: "nearest", behavior: "smooth" }); rowEl.classList.add("pulse"); setTimeout(() => rowEl.classList.remove("pulse"), 1000); }
        }
      }
    ];
  }
  function buildBlankMenuItems() {
    return [
      { label: "新建项目", icon: MENU_ICONS.newProject, action: newProject },
      { label: "打开文件…", icon: MENU_ICONS.openFile, shortcut: "Ctrl+O", action: openSingleFile },
      { label: "打开文件夹…", icon: MENU_ICONS.openFolder, shortcut: "Ctrl+Shift+O", action: openFolderAction },
      { divider: true },
      { label: "设置…", icon: MENU_ICONS.settings, shortcut: "Ctrl+,", action: openSettings }
    ];
  }
  function buildMenubarMenuItems() {
    return [
      {
        label: menubarInSidebar ? "将菜单栏移回标题栏" : "将菜单栏移到侧边栏",
        icon: MENU_ICONS.panel,
        action: () => {
          menubarInSidebar = !menubarInSidebar;
          applyMenubarLocation();
        }
      },
      {
        label: (titlebarButtons.settings ? "隐藏" : "显示") + "设置按钮",
        icon: MENU_ICONS.settings,
        action: () => {
          titlebarButtons.settings = !titlebarButtons.settings;
          applyTitlebarButtons();
          saveTitlebarLayout();
        }
      },
      {
        label: (titlebarButtons.theme ? "隐藏" : "显示") + "切换深浅主题按钮",
        icon: MENU_ICONS.theme,
        action: () => {
          titlebarButtons.theme = !titlebarButtons.theme;
          applyTitlebarButtons();
          saveTitlebarLayout();
        }
      },
      { divider: true },
      { label: "打开设置", icon: MENU_ICONS.settings, shortcut: "Ctrl+,", action: openSettings }
    ];
  }
  function createChild(parentNode, type) {
    parentNode.expanded = true;
    selectedFolderId = parentNode.id;
    renderTree();
    const rowEl = getRowEl(parentNode.id);
    if (rowEl) showCreateInput(parentNode, rowEl, type);
  }

  document.addEventListener("contextmenu", e => {
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    if (settingsScreen.contains(e.target)) return;
    if (menubar && menubar.contains(e.target)) {
      e.preventDefault();
      renderContextMenu(buildMenubarMenuItems(), "", e.clientX, e.clientY);
      return;
    }
    e.preventDefault();
    const target = e.target;

    if (treeEl.contains(target) || target === treeEl) {
      const rowEl = target.closest(".tree-row");
      if (rowEl) {
        const id = rowEl.dataset.id;
        const node = findNode(id);
        if (node) {
          const type = node === root ? "root" : node.type;
          renderContextMenu(buildTreeMenuItems({ type: type, node: node }), buildTreeTitle(type, node), e.clientX, e.clientY);
          return;
        }
      }
      renderContextMenu(buildTreeMenuItems({ type: "root", node: root }), buildTreeTitle("root", root), e.clientX, e.clientY);
      return;
    }

    const tabEl = target.closest(".tab");
    if (tabEl && tabsEl.contains(tabEl)) {
      const fileId = tabEl.dataset.fileId;
      const f = fileId ? findNode(fileId) : null;
      if (f) {
        renderContextMenu(buildTabMenuItems(fileId), '<span class="file-icon">' + f.icon + '</span><span class="context-title-name">' + escapeHtml(f.name) + '</span>', e.clientX, e.clientY);
        return;
      }
    }

    if (!previewPane.hidden && previewPane.contains(target)) {
      const f = activeFileId ? findNode(activeFileId) : null;
      if (f && (f.isBitmap || f.isSvg)) {
        renderContextMenu(buildImageMenuItems(f.id), '<span class="file-icon">' + f.icon + '</span><span class="context-title-name">' + escapeHtml(f.name) + '</span>', e.clientX, e.clientY);
        return;
      }
      if (f && isMarkdownFile(f)) {
        renderContextMenu([
          { label: "复制选中文本", icon: MENU_ICONS.copy, action: () => { const sel = window.getSelection(); if (sel && sel.toString()) copyToClipboard(sel.toString()); else toast("未选中任何文本"); } },
          { divider: true },
          { label: "关闭预览", icon: CTX_CLOSE, action: () => { previewVisible = false; applyFileView(); } }
        ], "", e.clientX, e.clientY);
        return;
      }
      if (f && isHtmlFile(f)) {
        renderContextMenu([
          { label: "刷新预览", icon: CTX_PREVIEW, action: () => renderHtmlPreview() },
          { label: "在新窗口打开", icon: CTX_OPEN, action: openHtmlInNewWindow },
          { divider: true },
          { label: "关闭预览", icon: CTX_CLOSE, action: () => { previewVisible = false; applyFileView(); } }
        ], '<span class="file-icon">' + f.icon + '</span><span class="context-title-name">' + escapeHtml(f.name) + '</span>', e.clientX, e.clientY);
        return;
      }
    }

    if (editorPane.contains(target) || target.closest(".CodeMirror")) {
      if (!activeFileId) { renderContextMenu(buildBlankMenuItems(), "", e.clientX, e.clientY); return; }
      renderContextMenu(buildEditorMenuItems(), "", e.clientX, e.clientY);
      return;
    }

    renderContextMenu(buildBlankMenuItems(), "", e.clientX, e.clientY);
  });

  document.addEventListener("click", e => { if (!contextMenu.hidden && !contextMenu.contains(e.target)) hideContextMenu(); });
  window.addEventListener("blur", hideContextMenu);
  window.addEventListener("resize", hideContextMenu);
  document.addEventListener("scroll", hideContextMenu, true);

  previewToggle.addEventListener("click", () => {
    if (!activeFileId) return;
    const f = findNode(activeFileId);
    if (!f) return;
    if (isBitmapFile(f)) { toast("图片已处于预览状态"); return; }
    if (!isSvgFile(f) && !isMarkdownFile(f) && !isHtmlFile(f)) { toast("当前文件不支持预览"); return; }
    previewVisible = !previewVisible;
    applyFileView();
  });

  document.addEventListener("keydown", e => {
    const mod = e.ctrlKey || e.metaKey;
    const tag = (e.target.tagName || "").toLowerCase();
    const inInput = tag === "input" || tag === "textarea" || e.target.isContentEditable;

    if (e.key === "Escape") {
      if (!settingsScreen.hidden) { closeSettings(); return; }
      if (!contextMenu.hidden) { hideContextMenu(); return; }
      if (!langMenu.hidden) { langMenu.hidden = true; return; }
      if (openMenuBtn) { closeAllMenus(); return; }
      if (!findWidget.hidden) { closeFind(); editor.focus(); return; }
    }

    if (mod && e.key === ",") { e.preventDefault(); if (settingsScreen.hidden) openSettings(); else closeSettings(); return; }
    if (mod && e.shiftKey && e.key.toLowerCase() === "o") { e.preventDefault(); openFolderAction(); return; }
    if (mod && e.key.toLowerCase() === "o") { e.preventDefault(); openSingleFile(); return; }
    if (mod && e.key.toLowerCase() === "e") { e.preventDefault(); exportProject(); return; }
    if (mod && e.shiftKey && e.key.toLowerCase() === "s") { e.preventDefault(); saveActiveFile(true); return; }
    if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); saveActiveFile(false); return; }
    if (mod && !e.shiftKey && e.key.toLowerCase() === "f") { if (inInput) return; e.preventDefault(); openFind(); return; }
    if (mod && e.key.toLowerCase() === "h") { if (inInput) return; e.preventDefault(); openFind(); findReplaceRow.hidden = false; findToggleReplace.classList.add("toggled"); setTimeout(() => replaceEditorInput.focus(), 30); return; }
    if (mod && e.shiftKey && e.key.toLowerCase() === "p") { e.preventDefault(); switchPanel("search"); return; }
    if (mod && e.shiftKey && e.key.toLowerCase() === "v") {
      const f = activeFileId ? findNode(activeFileId) : null;
      if (isSvgFile(f) || isMarkdownFile(f) || isHtmlFile(f)) { e.preventDefault(); previewVisible = !previewVisible; applyFileView(); }
      return;
    }
    if (mod && e.key === "=") { e.preventDefault(); settings.fontSize = Math.min(20, +(settings.fontSize + 0.5).toFixed(1)); applyFont(); saveSettings(); flashStatus("字号 " + settings.fontSize + "px"); return; }
    if (mod && e.key === "-") { e.preventDefault(); settings.fontSize = Math.max(11, +(settings.fontSize - 0.5).toFixed(1)); applyFont(); saveSettings(); flashStatus("字号 " + settings.fontSize + "px"); return; }
    if (mod && e.key === "0") { e.preventDefault(); settings.fontSize = DEFAULT_SETTINGS.fontSize; applyFont(); saveSettings(); flashStatus("字号已重置"); return; }
    if (e.key === "F11") { e.preventDefault(); toggleFullscreen(); return; }
    if (e.key === "F2" && activeFileId) {
      if (inInput) return;
      e.preventDefault();
      const node = findNode(activeFileId);
      if (node) { const rowEl = getRowEl(node.id); if (rowEl) startRename(node, rowEl); }
    }
  });

  let flashTimer = null;
  function flashStatus(text) {
    statusFile.textContent = text;
    statusFile.classList.add("flash");
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      statusFile.classList.remove("flash");
      const f = activeFileId ? findNode(activeFileId) : null;
      statusFile.textContent = f ? f.name : "—";
    }, 1200);
  }

  editor.on("cursorActivity", updateCursor);
  editor.on("change", () => {
    updateCodeCount(editor.getValue());
    if (!activeFileId) return;
    const f = findNode(activeFileId);
    if (!f) return;
    if (f.isBitmap) return;
    f.content = editor.getValue();
    f.dirty = true;
    updateCodeCount(f.content);
    updateDirtyUI();
    scheduleAutosave();
    if (previewVisible && (isSvgFile(f) || isMarkdownFile(f) || isHtmlFile(f))) {
      if (isMarkdownFile(f)) renderMarkdownPreviewDebounced();
      else if (isSvgFile(f)) {
        clearTimeout(svgPreviewTimer);
        svgPreviewTimer = setTimeout(() => {
          const cur = activeFileId ? findNode(activeFileId) : null;
          if (cur && isSvgFile(cur)) renderSvgPreview();
        }, 200);
      } else if (isHtmlFile(f)) {
        if (htmlAutoRefresh) renderHtmlPreviewDebounced();
      }
    }
    if (!findWidget.hidden && findInput.value) {
      clearTimeout(findTimer);
      findTimer = setTimeout(() => runFind(findInput.value, true), 260);
    }
  });

  themeBtn.addEventListener("click", () => {
    applyTheme(!isDark);
    if (!settingsScreen.hidden) renderSettingsUI();
  });

  function currentLangKey() {
    if (!activeFileId) return null;
    const f = findNode(activeFileId);
    return f ? f.langKey : null;
  }
  function renderLangMenu() {
    langMenuList.innerHTML = "";
    const curKey = currentLangKey();
    let lastGroup = null;
    LANGUAGES.forEach(l => {
      if (l.group && l.group !== lastGroup) {
        const title = document.createElement("div");
        title.className = "lang-group-title";
        title.textContent = l.group;
        langMenuList.appendChild(title);
        lastGroup = l.group;
      }
      const item = document.createElement("div");
      item.className = "lang-option" + (l.key === curKey ? " active" : "");
      item.innerHTML = '<span class="check">✓</span><span class="file-icon">' + l.icon + '</span><span>' + escapeHtml(l.lang) + '</span><span class="lang-hint">' + escapeHtml(l.hint) + '</span>';
      item.addEventListener("click", () => { setLanguage(l); langMenu.hidden = true; });
      langMenuList.appendChild(item);
    });
  }
  function setLanguage(l) {
    editor.setOption("mode", l.mode);
    if (activeFileId) {
      const f = findNode(activeFileId);
      if (f) {
        f.mode = l.mode;
        f.lang = l.lang;
        f.langKey = l.key;
        f.icon = l.icon;
        statusLangIcon.innerHTML = l.icon;
        renderTree();
        renderTabs();
        updateBreadcrumb(f);
      }
      statusLangText.textContent = l.lang;
    }
    scheduleAutosave();
    editor.focus();
  }
  function openLangMenu() {
    renderLangMenu();
    langMenu.hidden = false;
    const rect = statusLang.getBoundingClientRect();
    const menuW = langMenu.offsetWidth, menuH = langMenu.offsetHeight;
    let left = rect.left;
    if (left + menuW > window.innerWidth - 12) left = window.innerWidth - menuW - 12;
    if (left < 12) left = 12;
    let top = rect.top - menuH - 8;
    if (top < 12) { top = rect.bottom + 8; if (top + menuH > window.innerHeight - 12) top = Math.max(12, window.innerHeight - menuH - 12); }
    langMenu.style.left = left + "px";
    langMenu.style.top = top + "px";
  }
  statusLang.addEventListener("click", e => {
    e.stopPropagation();
    const f = activeFileId ? findNode(activeFileId) : null;
    if (f && f.isBitmap) { toast("图片文件无法切换语言模式"); return; }
    if (langMenu.hidden) openLangMenu();
    else langMenu.hidden = true;
  });
  document.addEventListener("click", e => { if (!langMenu.hidden && !langMenu.contains(e.target)) langMenu.hidden = true; });
  window.addEventListener("resize", () => { langMenu.hidden = true; editor.refresh(); });

  function getCreationParent() {
    if (selectedFolderId) {
      const n = findNode(selectedFolderId);
      if (n && n.type === "folder") return n;
    }
    if (activeFileId) {
      const p = findParent(activeFileId);
      if (p) return p;
    }
    return root;
  }
  function createFromPanel(type) {
    const parent = getCreationParent();
    parent.expanded = true;
    renderTree();
    const rowEl = getRowEl(parent.id);
    if (rowEl) showCreateInput(parent, rowEl, type);
  }
  document.getElementById("newFileBtn").addEventListener("click", () => { switchPanel("explorer"); createFromPanel("file"); });
  document.getElementById("newFolderBtn").addEventListener("click", () => { switchPanel("explorer"); createFromPanel("folder"); });

  window.addEventListener("beforeunload", (e) => {
    clearTimeout(autosaveTimer);
    saveCurrentWorkspace();
    const dirty = flattenFiles().some(function (f) {
      return f.fileHandle && f.dirty;
    });
    if (dirty) {
      e.preventDefault();
      e.returnValue = "有未保存的修改，确定离开吗？";
      return "有未保存的修改，确定离开吗？";
    }
  });

  /* ============ 启动 ============ */
  applyTheme(settings.theme === "dark", true);
  applyHighlight();
  applyFont();
  applyBackground();
  applyLanguage();

  updateTitleUI();
  renderSettingsUI();

  selectedFolderId = root.id;
  renderTree();
  renderTabs();
  updateReplaceButtons();
  editor.refresh();
  updateFsStatus();
  clearHtmlConsole();

  const restored = tryRestoreLastWorkspace();
  if (!restored) {
    showWelcome();
  }

})();
