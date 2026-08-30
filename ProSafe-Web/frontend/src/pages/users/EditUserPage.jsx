import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { GlassCard } from "../../components/ui/GlassCard";
import { LoadingState } from "../../components/ui/LoadingState";
import { EmptyState } from "../../components/ui/EmptyState";
import { UserForm } from "../../components/users/UserForm";
import { getUserById, updateUser, buildUserFormData } from "../../api/userApi";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";

export function EditUserPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user: currentUser, updateStoredUser } = useAuth();

  const [initialValues, setInitialValues] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverErrors, setServerErrors] = useState(null);

  useEffect(() => {
    getUserById(id)
      .then((data) => setInitialValues({ ...data.user, password: "" }))
      .catch((err) => setLoadError(err))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSubmit(values, imageFile) {
    setSubmitting(true);
    setServerErrors(null);
    try {
      const fields = {
        name: values.name,
        email: values.email,
        nic: values.nic,
        phone: values.phone,
        role: values.role,
        address: values.address,
        helmetId: values.helmetId || "",
      };
      if (values.password) fields.password = values.password;

      const payload = buildUserFormData(fields, imageFile);
      const { user } = await updateUser(id, payload);
      showToast("User updated successfully", { type: "success" });
      if (currentUser?.userId === id) {
        updateStoredUser(user);
      }
      navigate(`/users/${id}`);
    } catch (err) {
      if (err.errors) setServerErrors(err.errors);
      showToast(err.message || "Failed to update user", { type: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader title="Edit User" crumbs={[{ label: "Users", to: "/users" }, { label: "Edit User" }]} />

      {loading && (
        <GlassCard>
          <LoadingState label="Loading user…" />
        </GlassCard>
      )}

      {!loading && loadError && (
        <GlassCard>
          <EmptyState icon="⚠" title="Couldn't load this user" description={loadError.message} />
        </GlassCard>
      )}

      {!loading && !loadError && initialValues && (
        <GlassCard>
          <UserForm
            mode="edit"
            userId={initialValues.userId}
            initialValues={initialValues}
            onSubmit={handleSubmit}
            submitting={submitting}
            serverErrors={serverErrors}
          />
        </GlassCard>
      )}
    </div>
  );
}
