import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { applyTheme, getTheme } from "./theme.js";
import "./styles.css";

applyTheme(getTheme());

createRoot(document.getElementById("root")).render(<App />);
