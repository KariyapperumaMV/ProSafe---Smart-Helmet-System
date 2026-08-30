import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";

// #24 — confirmation modal, ProSafe-themed (not the plain wireframe popup).
export function DeleteUserModal({ open, user, onCancel, onConfirm, deleting }) {
  return (
    <Modal open={open} onClose={onCancel} title="Delete User?" width={420}>
      <p className="ps-delete-copy">
        Are you sure you want to delete <strong>{user?.name}</strong>? This action cannot be undone.
      </p>
      <div className="ps-form-actions">
        <Button variant="secondary" onClick={onCancel} disabled={deleting}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm} loading={deleting}>
          Delete
        </Button>
      </div>
    </Modal>
  );
}
