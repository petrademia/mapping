import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

// The exact odds carry bigint hand counts. React's development build prints the props that changed
// between renders with JSON.stringify, which throws on a bigint and takes the page down when the
// odds arrive from a worker. Give a bigint a JSON form so that print cannot fail.
Object.defineProperty(BigInt.prototype, "toJSON", {
  value(this: bigint): string {
    return this.toString();
  },
  configurable: true,
  writable: true,
});

const root = document.getElementById("root");
if (!root) throw new Error("root element missing");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
