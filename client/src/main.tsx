import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

function App() {
  return <div className="p-4 text-foreground">Pi Fleet</div>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
