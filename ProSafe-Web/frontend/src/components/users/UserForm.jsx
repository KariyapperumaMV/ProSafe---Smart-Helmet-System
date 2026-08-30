import { useRef, useState } from "react";
import { Field, Input, Select, Textarea } from "../ui/Input";
import { Button } from "../ui/Button";
import { UserAvatar } from "../ui/UserAvatar";
import { HelmetAssignField } from "./HelmetAssignField";
import { USER_ROLES } from "../../constants/roles";
import { validateUserForm } from "../../utils/validators";

const emptyValues = {
  name: "",
  email: "",
  nic: "",
  phone: "",
  role: USER_ROLES.WORKER,
  address: "",
  password: "",
  helmetId: null,
};

// Shared by AddUserPage and EditUserPage (#17/#21 — same form design). In
// edit mode the password field is optional (#21) and userId is shown
// read-only, never editable (#17 — backend generates it).
export function UserForm({ mode = "add", initialValues, userId, onSubmit, submitting, serverErrors }) {
  const [values, setValues] = useState({ ...emptyValues, ...initialValues });
  const [errors, setErrors] = useState({});
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(initialValues?.profileImageUrl || null);
  const fileInputRef = useRef(null);

  const isEdit = mode === "edit";

  function setField(field, value) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function handleImagePick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function handleRoleChange(role) {
    setValues((prev) => ({ ...prev, role, helmetId: role === USER_ROLES.ADMIN ? null : prev.helmetId }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const validationErrors = validateUserForm(values, { isEdit });
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;
    onSubmit(values, imageFile);
  }

  const fieldError = (name) => errors[name] || serverErrors?.[name];

  return (
    <form className="ps-user-form" onSubmit={handleSubmit} noValidate>
      <div className="ps-form-grid">
        <div className="ps-form-photo-col">
          <div className="ps-photo-upload">
            <UserAvatar name={values.name || "New User"} imageUrl={imagePreview?.startsWith("blob:") ? null : imagePreview} size={110} />
            {imagePreview?.startsWith("blob:") && (
              <img src={imagePreview} alt="Preview" className="ps-avatar ps-photo-upload-preview" />
            )}
            <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" onClick={() => fileInputRef.current?.click()}>
              {imagePreview ? "Change photo" : "Upload photo"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleImagePick}
              hidden
            />
          </div>

          {isEdit && userId && (
            <Field label="User ID">
              <Input value={userId} disabled readOnly />
            </Field>
          )}
        </div>

        <div className="ps-form-fields-col">
          <Field label="Name" htmlFor="name" error={fieldError("name")} required>
            <Input
              id="name"
              value={values.name}
              onChange={(e) => setField("name", e.target.value)}
              error={!!fieldError("name")}
              placeholder="Full name"
            />
          </Field>

          <Field label="Email" htmlFor="email" error={fieldError("email")} required>
            <Input
              id="email"
              type="email"
              value={values.email}
              onChange={(e) => setField("email", e.target.value)}
              error={!!fieldError("email")}
              placeholder="name@example.com"
            />
          </Field>

          <div className="ps-form-row-2">
            <Field label="NIC" htmlFor="nic" error={fieldError("nic")} required>
              <Input
                id="nic"
                value={values.nic}
                onChange={(e) => setField("nic", e.target.value)}
                error={!!fieldError("nic")}
                placeholder="200012345678"
              />
            </Field>
            <Field label="Phone No" htmlFor="phone" error={fieldError("phone")} required>
              <Input
                id="phone"
                value={values.phone}
                onChange={(e) => setField("phone", e.target.value)}
                error={!!fieldError("phone")}
                placeholder="0771234567"
              />
            </Field>
          </div>

          <div className="ps-form-row-2">
            <Field label="Type" htmlFor="role" error={fieldError("role")} required>
              <Select id="role" value={values.role} onChange={(e) => handleRoleChange(e.target.value)}>
                <option value={USER_ROLES.WORKER}>Worker</option>
                <option value={USER_ROLES.ADMIN}>Admin</option>
              </Select>
            </Field>

            {values.role === USER_ROLES.WORKER ? (
              <HelmetAssignField
                value={values.helmetId}
                onChange={(v) => setField("helmetId", v)}
                currentHelmetId={isEdit ? initialValues?.helmetId : null}
                error={fieldError("helmetId")}
              />
            ) : (
              <div />
            )}
          </div>

          <Field label="Address" htmlFor="address" error={fieldError("address")}>
            <Textarea
              id="address"
              rows={2}
              value={values.address}
              onChange={(e) => setField("address", e.target.value)}
            />
          </Field>

          <Field
            label="Password"
            htmlFor="password"
            error={fieldError("password")}
            help={isEdit ? "Leave blank to keep current password" : undefined}
            required={!isEdit}
          >
            <Input
              id="password"
              type="password"
              value={values.password}
              onChange={(e) => setField("password", e.target.value)}
              error={!!fieldError("password")}
              placeholder={isEdit ? "••••••••" : "At least 8 characters"}
              autoComplete="new-password"
            />
          </Field>
        </div>
      </div>

      <div className="ps-form-actions">
        <Button type="submit" variant="primary" loading={submitting}>
          {isEdit ? "Update User" : "Add User"}
        </Button>
      </div>
    </form>
  );
}
