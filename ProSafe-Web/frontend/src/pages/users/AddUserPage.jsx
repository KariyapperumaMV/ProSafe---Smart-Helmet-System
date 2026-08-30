import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { GlassCard } from "../../components/ui/GlassCard";
import { UserForm } from "../../components/users/UserForm";
import { createUser, buildUserFormData } from "../../api/userApi";
import { useToast } from "../../context/ToastContext";

export function AddUserPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [serverErrors, setServerErrors] = useState(null);

  async function handleSubmit(values, imageFile) {
    setSubmitting(true);
    setServerErrors(null);
    try {
      const payload = buildUserFormData(
        {
          name: values.name,
          email: values.email,
          nic: values.nic,
          phone: values.phone,
          role: values.role,
          address: values.address,
          password: values.password,
          helmetId: values.helmetId || "",
        },
        imageFile
      );
      await createUser(payload);
      showToast("User added successfully", { type: "success" });
      navigate("/users");
    } catch (err) {
      if (err.errors) setServerErrors(err.errors);
      showToast(err.message || "Failed to create user", { type: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader title="Add User" crumbs={[{ label: "Users", to: "/users" }, { label: "Add User" }]} />
      <GlassCard>
        <UserForm mode="add" onSubmit={handleSubmit} submitting={submitting} serverErrors={serverErrors} />
      </GlassCard>
    </div>
  );
}
