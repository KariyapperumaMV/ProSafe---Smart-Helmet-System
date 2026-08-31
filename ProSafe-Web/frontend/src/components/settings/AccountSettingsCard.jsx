import { useRef, useState } from "react";
import { GlassCard } from "../ui/GlassCard";
import { Field, Input, Textarea } from "../ui/Input";
import { Button } from "../ui/Button";
import { UserAvatar } from "../ui/UserAvatar";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { updateMe, buildUserFormData } from "../../api/userApi";
import { RoleBadge } from "../ui/StatusBadge";

// Editable: name, phone, address, profile image (same upload mechanism as
// Admin Edit User — see buildUserFormData). Read-only: email, role, user ID
// — those stay controlled through User Management, never through Settings.
export function AccountSettingsCard({ user, onSaved }) {
  const { updateStoredUser } = useAuth();
  const { showToast } = useToast();

  const [values, setValues] = useState({ name: user.name, phone: user.phone, address: user.address || "" });
  const [errors, setErrors] = useState({});
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(user.profileImageUrl || null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  function setField(field, value) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function handleImagePick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!values.name.trim()) {
      setErrors({ name: "Name is required" });
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const fields = { name: values.name, phone: values.phone, address: values.address };
      const payload = buildUserFormData(fields, imageFile);
      const { user: updated } = await updateMe(payload);
      updateStoredUser(updated);
      onSaved?.(updated);
      setImageFile(null);
      showToast("Settings updated successfully", { type: "success" });
    } catch (err) {
      if (err.errors) setErrors(err.errors);
      showToast(err.message || "Unable to update settings", { type: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassCard className="ps-settings-card">
      <h3 className="ps-detail-section-title">Account</h3>
      <form onSubmit={handleSubmit} noValidate>
        <div className="ps-settings-photo-row">
          <UserAvatar name={values.name} imageUrl={imagePreview?.startsWith("blob:") ? null : imagePreview} size={72} />
          {imagePreview?.startsWith("blob:") && <img src={imagePreview} alt="Preview" className="ps-avatar" style={{ width: 72, height: 72 }} />}
          <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
            {imagePreview ? "Change photo" : "Upload photo"}
          </Button>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImagePick} hidden />
        </div>

        <div className="ps-settings-readonly-row">
          <Field label="User ID">
            <Input value={user.userId} disabled readOnly />
          </Field>
          <Field label="Role">
            <div className="ps-settings-role-display">
              <RoleBadge role={user.role} />
            </div>
          </Field>
        </div>

        <Field label="Email" htmlFor="settings-email" help="Contact an administrator to change your email address.">
          <Input id="settings-email" value={user.email} disabled readOnly />
        </Field>

        <Field label="Name" htmlFor="settings-name" error={errors.name} required>
          <Input id="settings-name" value={values.name} onChange={(e) => setField("name", e.target.value)} error={!!errors.name} />
        </Field>

        <Field label="Phone" htmlFor="settings-phone" error={errors.phone}>
          <Input id="settings-phone" value={values.phone} onChange={(e) => setField("phone", e.target.value)} error={!!errors.phone} />
        </Field>

        <Field label="Address" htmlFor="settings-address" error={errors.address}>
          <Textarea id="settings-address" rows={2} value={values.address} onChange={(e) => setField("address", e.target.value)} />
        </Field>

        <div className="ps-form-actions">
          <Button type="submit" variant="primary" size="sm" loading={saving}>
            Save Account Changes
          </Button>
        </div>
      </form>
    </GlassCard>
  );
}
