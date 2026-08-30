const userService = require("../services/userService");

describe("validateUserFields", () => {
  const valid = {
    name: "Jane Doe",
    email: "jane@example.com",
    nic: "985654321V",
    phone: "0771234567",
    role: "WORKER",
    password: "Passw0rd1",
  };

  test("accepts a fully valid create payload", () => {
    expect(userService.validateUserFields(valid).valid).toBe(true);
  });

  test("accepts a 12-digit NIC", () => {
    const { valid: ok } = userService.validateUserFields({ ...valid, nic: "200011122233" });
    expect(ok).toBe(true);
  });

  test.each(["12345", "985654321", "985654321Z", "20001112223"])("rejects invalid NIC %s", (nic) => {
    const { valid: ok, errors } = userService.validateUserFields({ ...valid, nic });
    expect(ok).toBe(false);
    expect(errors.nic).toBeDefined();
  });

  test("rejects an invalid email", () => {
    const { valid: ok, errors } = userService.validateUserFields({ ...valid, email: "not-an-email" });
    expect(ok).toBe(false);
    expect(errors.email).toBeDefined();
  });

  test("rejects a short/weak password on create", () => {
    const { valid: ok, errors } = userService.validateUserFields({ ...valid, password: "short" });
    expect(ok).toBe(false);
    expect(errors.password).toBeDefined();
  });

  test("rejects a role outside the enum", () => {
    const { valid: ok, errors } = userService.validateUserFields({ ...valid, role: "SUPERADMIN" });
    expect(ok).toBe(false);
    expect(errors.role).toBeDefined();
  });

  test("update mode allows an empty password (kept unchanged)", () => {
    const { name, email, nic, phone, role } = valid;
    const { valid: ok } = userService.validateUserFields({ name, email, nic, phone, role }, { isUpdate: true });
    expect(ok).toBe(true);
  });

  test("update mode still rejects a weak password if one is provided", () => {
    const { name, email, nic, phone, role } = valid;
    const { valid: ok, errors } = userService.validateUserFields(
      { name, email, nic, phone, role, password: "weak" },
      { isUpdate: true }
    );
    expect(ok).toBe(false);
    expect(errors.password).toBeDefined();
  });
});
