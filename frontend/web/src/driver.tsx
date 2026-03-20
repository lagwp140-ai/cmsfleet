import React, { useMemo, useState } from "react";
import ReactDOM from "react-dom/client";

import "./styles/admin-shell.css";

const MAX_PIN_LENGTH = 4;
const DRIVER_PIN = (import.meta.env.VITE_DRIVER_PIN ?? "2580").trim() || "2580";

function DriverPage() {
  const [enteredPin, setEnteredPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const maskedDigits = useMemo(() => Array.from({ length: MAX_PIN_LENGTH }, (_, index) => enteredPin[index] ?? ""), [enteredPin]);

  function appendDigit(digit: string) {
    if (isUnlocked || enteredPin.length >= MAX_PIN_LENGTH) {
      return;
    }

    const nextPin = `${enteredPin}${digit}`;
    setEnteredPin(nextPin);
    setError(null);

    if (nextPin.length === MAX_PIN_LENGTH) {
      if (nextPin === DRIVER_PIN) {
        setIsUnlocked(true);
        return;
      }

      setError("Incorrect PIN. Clear and try again.");
      setEnteredPin("");
    }
  }

  function clearPin() {
    setEnteredPin("");
    setError(null);
    setIsUnlocked(false);
  }

  return (
    <main className="driver-page">
      <section className="driver-hero">
        <div className="driver-badge">Driver Access</div>
        <h1 className="driver-title">Independent PIN entry for future driver data modules</h1>
        <p className="driver-copy">Built as a separate page so driver-facing tools can grow without affecting the admin console flow.</p>
      </section>

      <section className="driver-shell">
        <div className="driver-card">
          <div className="driver-card__header">
            <div>
              <div className="driver-card__eyebrow">Secure Entry</div>
              <h2 className="driver-card__title">Driver PIN</h2>
            </div>
            <span className={`tone-pill tone-pill--${isUnlocked ? "good" : "neutral"}`}>{isUnlocked ? "Unlocked" : "Locked"}</span>
          </div>

          <div className="driver-pin-display" aria-label="PIN status">
            {maskedDigits.map((digit, index) => (
              <span className={`driver-pin-display__slot${digit ? " driver-pin-display__slot--filled" : ""}`} key={index}>
                {digit ? "*" : ""}
              </span>
            ))}
          </div>

          {error ? <div className="notice-card notice-card--critical"><div className="notice-card__body">{error}</div></div> : null}

          <div className="driver-keypad">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((digit) => (
              <button className="driver-keypad__button" key={digit} onClick={() => appendDigit(digit)} type="button">
                {digit}
              </button>
            ))}
            <button className="driver-keypad__button driver-keypad__button--clear" onClick={clearPin} type="button">
              Clear
            </button>
          </div>

          <p className="helper-text">Prototype PIN page for future driver workflows. Local development PIN comes from `VITE_DRIVER_PIN` or defaults to `2580`.</p>
        </div>

        <div className="driver-card driver-card--wide">
          <div className="driver-card__eyebrow">Future Space</div>
          <h2 className="driver-card__title">Driver Module Placeholder</h2>
          {isUnlocked ? (
            <div className="driver-grid">
              <article className="driver-panel">
                <strong>Assigned vehicle</strong>
                <span>Ready for future live bus and route binding.</span>
              </article>
              <article className="driver-panel">
                <strong>Trip status</strong>
                <span>Reserved for current duty, destination, and next-stop details.</span>
              </article>
              <article className="driver-panel">
                <strong>Messages</strong>
                <span>Reserved for operator notices, incidents, and acknowledgements.</span>
              </article>
              <article className="driver-panel">
                <strong>Diagnostics</strong>
                <span>Reserved for onboard device health and controller state.</span>
              </article>
            </div>
          ) : (
            <div className="empty-state">Enter the correct PIN to unlock the future driver module area.</div>
          )}
        </div>
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DriverPage />
  </React.StrictMode>
);

