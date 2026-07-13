import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserApplication } from "./app/compose.js";
import { App } from "./presentation/App.js";
import "./presentation/index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Application root element is missing");

createRoot(root).render(
  <StrictMode>
    <App createApplication={createBrowserApplication} />
  </StrictMode>,
);
