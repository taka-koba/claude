import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// スマホでは開発者ツールが見られないので、エラーで真っ白になる代わりに内容を画面に出す
function showError(msg: string) {
  const el = document.getElementById("fatal") ?? document.body.appendChild(document.createElement("pre"));
  el.id = "fatal";
  el.style.cssText = "white-space:pre-wrap;color:#d33;padding:12px;font-size:13px";
  el.textContent += "エラーが起きました（この画面の写真を Claude に送ってね）\n" + msg + "\n\n";
}
window.addEventListener("error", (e) => showError(String(e.error?.stack || e.message)));
window.addEventListener("unhandledrejection", (e) => showError(String(e.reason?.stack || e.reason)));

class Boundary extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: Error) {
    return { err: String(e?.stack || e) };
  }
  render() {
    if (this.state.err) {
      return (
        <pre style={{ whiteSpace: "pre-wrap", color: "#d33", padding: 12, fontSize: 13 }}>
          {"エラーが起きました（この画面の写真を Claude に送ってね）\n" + navigator.userAgent + "\n\n" + this.state.err}
        </pre>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <Boundary>
    <App />
  </Boundary>,
);
