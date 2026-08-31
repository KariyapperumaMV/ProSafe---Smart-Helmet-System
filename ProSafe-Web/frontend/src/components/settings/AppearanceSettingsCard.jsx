import { GlassCard } from "../ui/GlassCard";
import { Toggle } from "../ui/Toggle";
import { useAppearance } from "../../hooks/useAppearance";

// Applies immediately (no Save button) — these are local-only, never sent
// to the backend (see useAppearance for the localStorage-vs-account choice).
export function AppearanceSettingsCard() {
  const { compactMode, reduceAnimations, setCompactMode, setReduceAnimations } = useAppearance();

  return (
    <GlassCard className="ps-settings-card">
      <h3 className="ps-detail-section-title">Appearance</h3>
      <div className="ps-toggle-list">
        <Toggle
          label="Compact Mode"
          description="Reduces card padding and spacing for a denser layout."
          checked={compactMode}
          onChange={setCompactMode}
        />
        <Toggle
          label="Reduce Animations"
          description="Minimizes motion in modals, dropdowns, and transitions. Your system's reduced-motion setting is always respected too."
          checked={reduceAnimations}
          onChange={setReduceAnimations}
        />
      </div>
    </GlassCard>
  );
}
