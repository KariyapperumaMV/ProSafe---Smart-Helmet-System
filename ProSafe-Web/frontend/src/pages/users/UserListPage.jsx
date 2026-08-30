import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { GlassCard } from "../../components/ui/GlassCard";
import { Button } from "../../components/ui/Button";
import { LoadingState } from "../../components/ui/LoadingState";
import { EmptyState } from "../../components/ui/EmptyState";
import { UserRow } from "../../components/users/UserRow";
import { DeleteUserModal } from "../../components/users/DeleteUserModal";
import { listUsers, deleteUser } from "../../api/userApi";
import { useToast } from "../../context/ToastContext";
import { USER_ROLES } from "../../constants/roles";

const ROLE_FILTERS = [
  { value: "", label: "All" },
  { value: USER_ROLES.ADMIN, label: "Admin" },
  { value: USER_ROLES.WORKER, label: "Worker" },
];

export function UserListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ users: [], pagination: { page: 1, pages: 1, total: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchUsers = useCallback(() => {
    setLoading(true);
    setError(null);
    listUsers({ page, limit: 10, search: search || undefined, role: roleFilter || undefined })
      .then(setResult)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page, search, roleFilter]);

  // #13 — debounce search so every keystroke doesn't hit the backend.
  useEffect(() => {
    const timer = setTimeout(fetchUsers, 350);
    return () => clearTimeout(timer);
  }, [fetchUsers]);

  async function handleConfirmDelete() {
    setDeleting(true);
    try {
      await deleteUser(deleteTarget.userId);
      showToast("User deleted successfully", { type: "success" });
      setDeleteTarget(null);
      fetchUsers();
    } catch (err) {
      showToast(err.message || "Unable to delete user", { type: "error" });
    } finally {
      setDeleting(false);
    }
  }

  const { pagination } = result;

  return (
    <div>
      <PageHeader
        title="Users"
        crumbs={[{ label: "Users" }]}
        actions={
          <Button variant="primary" onClick={() => navigate("/users/add")}>
            + Add User
          </Button>
        }
      />

      <GlassCard style={{ marginBottom: "var(--ps-space-4)" }}>
        <div className="ps-toolbar" style={{ padding: "var(--ps-space-4) var(--ps-space-5)" }}>
          <div className="ps-header-search">
            <span aria-hidden="true">🔍</span>
            <input
              type="search"
              placeholder="Search User…"
              aria-label="Search users"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
            />
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <div className="ps-filter-bar">
          <h2>Users</h2>
          <div className="ps-filter-pills">
            {ROLE_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                className={`ps-filter-pill ${roleFilter === f.value ? "is-active" : ""}`}
                onClick={() => {
                  setPage(1);
                  setRoleFilter(f.value);
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading && <LoadingState label="Loading users…" />}

        {!loading && error && (
          <EmptyState icon="⚠" title="Couldn't load users" description={error} />
        )}

        {!loading && !error && result.users.length === 0 && (
          <EmptyState
            icon="👤"
            title={search || roleFilter ? "No users match your search" : "No users yet"}
            description={search || roleFilter ? "Try a different search term or filter." : "Add your first user to get started."}
          />
        )}

        {!loading && !error && result.users.length > 0 && (
          <>
            <div className="ps-user-list">
              {result.users.map((u) => (
                <UserRow key={u.userId} user={u} onDelete={setDeleteTarget} />
              ))}
            </div>

            {pagination.pages > 1 && (
              <div className="ps-pagination">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span>
                  Page {pagination.page} of {pagination.pages} ({pagination.total} users)
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= pagination.pages}
                  onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </GlassCard>

      <DeleteUserModal
        open={!!deleteTarget}
        user={deleteTarget}
        deleting={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
