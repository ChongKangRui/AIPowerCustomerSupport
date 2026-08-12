"use client";

import { useEffect, useState } from "react";

type Result =
  | { state: "loading" }
  | { state: "ok"; db: string }
  | { state: "error"; message: string };

export default function HealthCheckPage() {
  const [result, setResult] = useState<Result>({ state: "loading" });

  async function runCheck() {
    setResult({ state: "loading" });
    try {
      const res = await fetch("/api/health-check");
      const data = await res.json();
      if (res.ok) {
        setResult({ state: "ok", db: data.db });
      } else {
        setResult({ state: "error", message: `Server returned ${res.status}` });
      }
    } catch {
      setResult({ state: "error", message: "Request failed" });
    }
  }

  useEffect(() => {
    runCheck();
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1>Health Check</h1>

      <p>
        Status:{" "}
        {result.state === "loading" && "Checking..."}
        {result.state === "ok" && `OK (db: ${result.db})`}
        {result.state === "error" && `Error - ${result.message}`}
      </p>

      <button onClick={runCheck} style={{ marginTop: 16 }}>
        Re-check
      </button>
    </div>
  );
}
