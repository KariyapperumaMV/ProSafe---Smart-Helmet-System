import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { GlassCard } from "../../components/ui/GlassCard";
import { Button } from "../../components/ui/Button";
import { LoadingState } from "../../components/ui/LoadingState";
import { EmptyState } from "../../components/ui/EmptyState";
import { HelmetList } from "../../components/helmets/HelmetList";
import { AddHelmetModal } from "../../components/helmets/AddHelmetModal";
import { HelmetDetailsModal } from "../../components/helmets/HelmetDetailsModal";
import { DeleteHelmetModal } from "../../components/helmets/DeleteHelmetModal";
import { getHelmets, deleteHelmet } from "../../api/helmetApi";
import { useToast } from "../../context/ToastContext";

const ASSIGNMENT_FILTERS = [
  { value: "", label: "All" },
  { value: "assigned", label: "Assigned" },
  { value: "unassigned", label: "Unassigned" },
];

export function HelmetListPage() {
  const { showToast } = useToast();

  const [search, setSearch] = useState("");
  const [assignmentFilter, setAssignmentFilter] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ helmets: [], pagination: { page: 1, pages: 1, total: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [addOpen, setAddOpen] = useState(false);
  const [viewingHelmetId, setViewingHelmetId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchHelmets = useCallback(() => {
    setLoading(true);
    setError(null);
    getHelmets({ page, limit: 10, search: search || undefined, assignment: assignmentFilter || undefined })
      .then(setResult)
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, [page, search, assignmentFilter]);

  // #15 — debounce search so every keystroke doesn't hit the backend.
  useEffect(() => {
    const timer = setTimeout(fetchHelmets, 350);
    return () => clearTimeout(timer);
  }, [fetchHelmets]);

  async function handleConfirmDelete() {
    setDeleting(true);
    try {
      await deleteHelmet(deleteTarget.helmetId);
      showToast("Helmet deleted successfully", { type: "success" });
      setDeleteTarget(null);
      fetchHelmets();
    } catch (err) {
      showToast(err.message || "Unable to delete helmet", { type: "error" });
    } finally {
      setDeleting(false);
    }
  }

  const { pagination } = result;

  return (
    <div>
      <PageHeader
        title="Helmets"
        crumbs={[{ label: "Helmets" }]}
        actions={
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            + Add Helmet
          </Button>
        }
      />

      <GlassCard style={{ marginBottom: "var(--ps-space-4)" }}>
        <div className="ps-toolbar" style={{ padding: "var(--ps-space-4) var(--ps-space-5)" }}>
          <div className="ps-header-search">
            <span aria-hidden="true">🔍</span>
            <input
              type="search"
              placeholder="Search Helmet ID or worker name…"
              aria-label="Search helmets"
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
          <h2>Helmets</h2>
          <div className="ps-filter-pills">
            {ASSIGNMENT_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                className={`ps-filter-pill ${assignmentFilter === f.value ? "is-active" : ""}`}
                onClick={() => {
                  setPage(1);
                  setAssignmentFilter(f.value);
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading && <LoadingState label="Loading helmets…" />}

        {!loading && error && <EmptyState icon="⚠" title="Couldn't load helmets" description={error.message} />}

        {!loading && !error && result.helmets.length === 0 && (
          <EmptyState
            icon="⛑"
            title={search || assignmentFilter ? "No helmets match your search" : "No helmets registered"}
            description={
              search || assignmentFilter
                ? "Try a different search term or filter."
                : "Add your first helmet to get started."
            }
          />
        )}

        {!loading && !error && result.helmets.length > 0 && (
          <>
            <HelmetList helmets={result.helmets} onView={(h) => setViewingHelmetId(h.helmetId)} onDelete={setDeleteTarget} />

            {pagination.pages > 1 && (
              <div className="ps-pagination">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Previous
                </Button>
                <span>
                  Page {pagination.page} of {pagination.pages} ({pagination.total} helmets)
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

      <AddHelmetModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={fetchHelmets} />

      <HelmetDetailsModal open={!!viewingHelmetId} helmetId={viewingHelmetId} onClose={() => setViewingHelmetId(null)} />

      <DeleteHelmetModal
        open={!!deleteTarget}
        helmet={deleteTarget}
        deleting={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
