import { useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { useToast } from "../../context/ToastContext";
import { requestEmergencyReset } from "../../api/helmetApi";

// Confirmation gate for a supervisor action with real physical consequences
// — resets the helmet's emergency LED/state. Requesting a reset does NOT
// itself resolve the alert; the physical helmet still has to confirm it
// (see RecentAlertsCard's "Reset requested" interim badge).
export function ResetEmergencyModal({ open, onClose, alert, onResetRequested }) {
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);

  if (!alert) return null;

  async function handleConfirm() {
    setPending(true);
    try {
      await requestEmergencyReset(alert.helmetId);
      showToast("Reset requested — waiting for the helmet to confirm.", { type: "success" });
      onResetRequested?.(alert.id);
      onClose();
    } catch (err) {
      showToast(err.message || "Couldn't request a reset.", { type: "error" });
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open={open} onClose={pending ? () => {} : onClose} title="Reset Emergency?" width={420}>
      <div className="ps-reset-modal-body">
        <p>
          Confirm that <strong>{alert.workerName}</strong>'s situation has been checked before resetting the
          helmet's emergency state.
        </p>
        <p className="ps-help-text">
          This sends a reset request to the helmet — the emergency stays active until the helmet confirms it.
        </p>
        <div className="ps-reset-modal-actions">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirm} loading={pending}>
            Reset Emergency
          </Button>
        </div>
      </div>
    </Modal>
  );
}
