import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import WorkspaceWindow from "./components/WorkspaceWindow";
import { WORKSPACE_WINDOW_LABEL } from "./utils/workspace";

const isWorkspace = getCurrentWebviewWindow().label === WORKSPACE_WINDOW_LABEL;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isWorkspace ? <WorkspaceWindow /> : <App />}
  </React.StrictMode>,
);
