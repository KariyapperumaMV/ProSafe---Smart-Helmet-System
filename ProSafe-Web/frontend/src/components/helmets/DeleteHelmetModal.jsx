import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";

// #22/#23 — the backend is the real enforcement (409 while assigned); this
// improves the UX on top of it by not even offering a one-click force-delete
// when the helmet is known to be assigned, rather than showing Delete and
// then surfacing a server error after the click.
export function DeleteHelmetModal({ open, helmet, onCancel, onConfirm, deleting }) {
  const isAssigned = !!helmet?.assigned;

  return (
    <Modal open={open} onClose={onCancel} title={isAssigned ? "Cannot Delete Helmet" : "Delete Helmet?"} width={420}>
      {isAssigned ? (
        <>
          <p className="ps-delete-copy">
            This helmet is assigned to <strong>{helmet?.assignedTo?.name}</strong>. Unassign it before deleting.
          </p>
          <div className="ps-form-actions">
            <Button variant="secondary" onClick={onCancel}>
              Close
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="ps-delete-copy">
            Are you sure you want to delete <strong>{helmet?.helmetId}</strong>? This action cannot be undone from the
            interface.
          </p>
          <div className="ps-form-actions">
            <Button variant="secondary" onClick={onCancel} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={onConfirm} loading={deleting}>
              Delete
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
