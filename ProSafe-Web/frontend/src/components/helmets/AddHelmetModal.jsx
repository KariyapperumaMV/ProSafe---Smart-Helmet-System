import { useState } from "react";
import { Modal } from "../ui/Modal";
import { Field, Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { createHelmet } from "../../api/helmetApi";
import { useToast } from "../../context/ToastContext";

const HELMET_ID_PATTERN = /^[A-Za-z0-9_-]{3,40}$/;

// #18/#19 — a popup over the Helmets page, not a separate route. Mirrors the
// backend's own centralized format check for immediate feedback; the
// backend re-validates independently and is the source of truth.
export function AddHelmetModal({ open, onClose, onCreated }) {
  const { showToast } = useToast();
  const [helmetId, setHelmetId] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function handleClose() {
    if (submitting) return;
    setHelmetId("");
    setError(null);
    onClose();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = helmetId.trim();

    if (!trimmed) {
      setError("Helmet ID is required");
      return;
    }
    if (!HELMET_ID_PATTERN.test(trimmed)) {
      setError("3-40 characters: letters, numbers, hyphen, underscore");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await createHelmet(trimmed);
      showToast("Helmet added successfully", { type: "success" });
      setHelmetId("");
      onCreated();
      onClose();
    } catch (err) {
      if (err.status === 409) {
        setError("Helmet ID already exists");
      } else {
        showToast(err.message || "Failed to create helmet", { type: "error" });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Helmet" width={420}>
      <form onSubmit={handleSubmit} noValidate>
        <Field label="Helmet ID" htmlFor="helmetId" error={error} help={!error ? "Example: PS-H-001" : undefined} required>
          <Input
            id="helmetId"
            value={helmetId}
            onChange={(e) => setHelmetId(e.target.value)}
            error={!!error}
            placeholder="PS-H-001"
            autoFocus
            disabled={submitting}
          />
        </Field>

        <div className="ps-form-actions">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting}>
            Add Helmet
          </Button>
        </div>
      </form>
    </Modal>
  );
}
