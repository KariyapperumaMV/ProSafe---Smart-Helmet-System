import { useState } from "react";
import { GlassCard } from "../ui/GlassCard";
import { Field, Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { useToast } from "../../context/ToastContext";
import { changePassword } from "../../api/authApi";
import { isValidPassword } from "../../utils/validators";

const BLANK = { currentPassword: "", newPassword: "", confirmPassword: "" };

export function PasswordSettingsCard() {
  const { showToast } = useToast();
  const [values, setValues] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  function setField(field, value) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function validate() {
    const errs = {};
    if (!values.currentPassword) errs.currentPassword = "Current password is required";
    if (!values.newPassword || !isValidPassword(values.newPassword)) {
      errs.newPassword = "At least 8 characters, with a letter and a number";
    }
    if (values.confirmPassword !== values.newPassword) {
      errs.confirmPassword = "Passwords do not match";
    }
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setSaving(true);
    try {
      await changePassword(values.currentPassword, values.newPassword);
      showToast("Password changed successfully", { type: "success" });
      setValues(BLANK); // never repopulate password inputs after success
      setErrors({});
    } catch (err) {
      // The backend returns a single message, not per-field errors — map
      // it to whichever field it's actually about.
      if (err.message === "Current password is incorrect") {
        setErrors({ currentPassword: err.message });
      } else if (err.status === 400) {
        setErrors({ newPassword: err.message });
      } else {
        showToast(err.message || "Unable to change password", { type: "error" });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassCard className="ps-settings-card">
      <h3 className="ps-detail-section-title">Password</h3>
      <form onSubmit={handleSubmit} noValidate>
        <Field label="Current Password" htmlFor="current-password" error={errors.currentPassword} required>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={values.currentPassword}
            onChange={(e) => setField("currentPassword", e.target.value)}
            error={!!errors.currentPassword}
          />
        </Field>

        <Field label="New Password" htmlFor="new-password" error={errors.newPassword} required>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={values.newPassword}
            onChange={(e) => setField("newPassword", e.target.value)}
            error={!!errors.newPassword}
            placeholder="At least 8 characters"
          />
        </Field>

        <Field label="Confirm New Password" htmlFor="confirm-password" error={errors.confirmPassword} required>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={values.confirmPassword}
            onChange={(e) => setField("confirmPassword", e.target.value)}
            error={!!errors.confirmPassword}
          />
        </Field>

        <p className="ps-help-text">You'll stay signed in on this device after changing your password.</p>

        <div className="ps-form-actions">
          <Button type="submit" variant="primary" size="sm" loading={saving}>
            Change Password
          </Button>
        </div>
      </form>
    </GlassCard>
  );
}
