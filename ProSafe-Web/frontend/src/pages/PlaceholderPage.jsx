import { PageHeader } from "../components/layout/PageHeader";
import { GlassCard } from "../components/ui/GlassCard";
import { EmptyState } from "../components/ui/EmptyState";

// Dashboard/Helmets/Analytics/Settings are explicitly out of scope for the
// Users module phase (#42 Phase E note) — these keep the sidebar/routes
// coherent without building pages that belong to a different ticket.
export function PlaceholderPage({ title }) {
  return (
    <div>
      <PageHeader title={title} crumbs={[{ label: title }]} />
      <GlassCard>
        <EmptyState
          icon="🛠"
          title={`${title} is coming in a later phase`}
          description="This module isn't part of the current User Management build."
        />
      </GlassCard>
    </div>
  );
}
