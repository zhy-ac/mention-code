import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import legacyMarkup from "../legacy-app.html?raw";

const legacyScripts = [
  "libs/codemirror/lib/codemirror.js",
  "libs/codemirror/mode/xml/xml.js",
  "libs/codemirror/mode/javascript/javascript.js",
  "libs/codemirror/mode/css/css.js",
  "libs/codemirror/mode/htmlmixed/htmlmixed.js",
  "libs/codemirror/mode/markdown/markdown.js",
  "libs/codemirror/mode/clike/clike.js",
  "libs/codemirror/mode/shell/shell.js",
  "libs/codemirror/mode/python/python.js",
  "libs/codemirror/mode/php/php.js",
  "libs/codemirror/mode/ruby/ruby.js",
  "libs/codemirror/mode/go/go.js",
  "libs/codemirror/addon/mode/simple.js",
  "libs/codemirror/mode/rust/rust.js",
  "libs/codemirror/mode/sql/sql.js",
  "libs/codemirror/mode/yaml/yaml.js",
  "libs/codemirror/mode/swift/swift.js",
  "libs/codemirror/mode/lua/lua.js",
  "libs/codemirror/mode/perl/perl.js",
  "libs/codemirror/mode/r/r.js",
  "libs/codemirror/mode/dart/dart.js",
  "libs/codemirror/mode/powershell/powershell.js",
  "libs/codemirror/mode/dockerfile/dockerfile.js",
  "libs/codemirror/mode/vbscript/vbscript.js",
  "libs/codemirror/addon/edit/closebrackets.js",
  "libs/codemirror/addon/edit/matchbrackets.js",
  "libs/codemirror/addon/selection/active-line.js",
  "libs/marked/lib/marked.umd.js",
  "libs/dompurify/purify.min.js",
  "languages/language-zh-Hans.js",
  "languages/language-zh-Hant.js",
  "languages/language-en-US.js"
];

function loadLegacyScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Unable to load required script: ${url}`));
    document.body.appendChild(script);
  });
}

function App() {
  const [startupError, setStartupError] = useState("");

  useEffect(() => {
    async function initialize() {
      for (const script of legacyScripts) {
        await loadLegacyScript(new URL(script, document.baseURI).href);
      }
      await import("./app.js");
    }

    initialize().catch(error => {
      console.error("Unable to initialize the editor:", error);
      setStartupError("编辑器启动失败，请检查浏览器控制台并刷新页面重试。");
    });
  }, []);

  return (
    <>
      <div className="react-app" dangerouslySetInnerHTML={{ __html: legacyMarkup }} />
      {startupError && <div role="alert">{startupError}</div>}
    </>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing React root element.");
}

createRoot(rootElement).render(<App />);
