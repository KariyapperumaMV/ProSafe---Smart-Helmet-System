import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { GlassCard } from "../../components/ui/GlassCard";
import { LoadingState } from "../../components/ui/LoadingState";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { UserDetailView } from "../../components/users/UserDetailView";
import { DeleteUserModal } from "../../components/users/DeleteUserModal";
import { getUserById, deleteUser } from "../../api/userApi";
import { useToast } from "../../context/ToastContext";

export function UserViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchUser = useCallback(() => {
    setLoading(true);
    setError(null);
    getUserById(id)
      .then(setData)
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(fetchUser, [fetchUser]);

  async function handleConfirmDelete() {
    setDeleting(true);
    try {
      await deleteUser(id);
      showToast("User deleted successfully", { type: "success" });
      navigate("/users");
    } catch (err) {
      showToast(err.message || "Unable to delete user", { type: "error" });
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader title="View User" crumbs={[{ label: "Users", to: "/users" }, { label: "View User" }]} />

      {loading && (
        <GlassCard>
          <LoadingState label="Loading user…" />
        </GlassCard>
      )}

      {!loading && error && (
        <GlassCard>
          <EmptyState
            icon="⚠"
            title={error.status === 404 ? "User not found" : "Couldn't load this user"}
            description={error.message}
          />
        </GlassCard>
      )}

      {!loading && !error && data && (
        <UserDetailView
          data={data}
          actions={
            <>
              <Button variant="secondary" onClick={() => navigate(`/users/${id}/edit`)}>
                Update
              </Button>
              <Button variant="danger" onClick={() => setDeleteOpen(true)}>
                Delete
              </Button>
            </>
          }
        />
      )}

      <DeleteUserModal
        open={deleteOpen}
        user={data?.user}
        deleting={deleting}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
