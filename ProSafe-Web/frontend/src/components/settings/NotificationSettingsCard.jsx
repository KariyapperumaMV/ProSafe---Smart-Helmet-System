import { useState } from "react";
import { GlassCard } from "../ui/GlassCard";
import { Toggle } from "../ui/Toggle";
import { Button } from "../ui/Button";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { updateMe } from "../../api/userApi";
import { USER_ROLES } from "../../constants/roles";

// These control TOAST/interruption behavior only — every notification a
// user is entitled to still lands in the bell/inbox regardless (#6). Saved
// as one batch via "Save Preferences" rather than auto-saving each toggle,
// per the approved UX (avoids a PATCH per click, gives a clear save point).
const TOGGLES = [
  { key: "safetyAlerts", label: "Safety Alerts", description: "Toast pop-ups for critical safety alerts. Still recorded in your notification inbox either way." },
  { key: "emergencyAlerts", label: "Emergency Alerts", description: "Toast pop-ups when an emergency is activated." },
  { key: "emergencyResetUpdates", label: "Emergency Reset Updates", description: "Toast pop-ups when an emergency reset is requested or resolved." },
  { key: "accountNotifications", label: "Account Notifications", description: "Toast pop-ups for account-related events." },
  { key: "reportNotifications", label: "Report Notifications", description: "Applies to future scheduled report notifications — not generated yet." },
];

export function NotificationSettingsCard({ user, onSaved }) {
  const { updateStoredUser } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user.role === USER_ROLES.ADMIN;

  const [values, setValues] = useState({ ...user.preferences.notifications });
  const [saving, setSaving] = useState(false);

  function setField(key, value) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { user: updated } = await updateMe({ notificationPreferences: values });
      updateStoredUser(updated);
      onSaved?.(updated);
      showToast("Notification preferences updated", { type: "success" });
    } catch (err) {
      showToast(err.message || "Unable to update settings", { type: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassCard className="ps-settings-card">
      <h3 className="ps-detail-section-title">Notifications</h3>
      <div className="ps-toggle-list">
        {TOGGLES.map((t) => {
          // Emergency alerts can never be suppressed for an admin — the
          // toggle is shown but locked on, never editable (#7).
          const locked = isAdmin && t.key === "emergencyAlerts";
          return (
            <Toggle
              key={t.key}
              label={t.label}
              description={t.description}
              lockedNote={locked ? "Always enabled for administrators" : undefined}
              checked={locked ? true : values[t.key]}
              disabled={locked}
              onChange={(v) => setField(t.key, v)}
            />
          );
        })}
      </div>
      <div className="ps-form-actions">
        <Button type="button" variant="primary" size="sm" onClick={handleSave} loading={saving}>
          Save Preferences
        </Button>
      </div>
    </GlassCard>
  );
}
