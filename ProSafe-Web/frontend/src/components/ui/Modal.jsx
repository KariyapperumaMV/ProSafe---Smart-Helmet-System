import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// Minimal focus handling: focuses the dialog on open, restores focus to the
// trigger on close, and closes on Escape. Fits within the viewport and
// scrolls internally (#31) instead of growing past it.
export function Modal({ open, onClose, title, children, width = 480 }) {
  const dialogRef = useRef(null);
  const previouslyFocused = useRef(null);
  // Read fresh on every render (no effect dependency) — most callers pass an
  // inline onClose, which would otherwise be a new reference on every
  // re-render. Depending on it directly in the effect below made the
  // mount/focus effect re-fire on every keystroke typed into a modal's own
  // input, stealing focus back to the dialog wrapper after each character.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement;
    dialogRef.current?.focus();

    function handleKeyDown(e) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="ps-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="ps-modal ps-card"
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "ps-modal-title" : undefined}
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="ps-modal-header">
          {title && (
            <h2 className="ps-modal-title" id="ps-modal-title">
              {title}
            </h2>
          )}
          <button type="button" className="ps-modal-close" aria-label="Close dialog" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="ps-modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
