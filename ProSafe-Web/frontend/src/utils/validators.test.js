import { describe, expect, test } from "vitest";
import { isValidPassword, validateUserForm } from "./validators";

const valid = {
  name: "Jane Doe",
  email: "jane@example.com",
  nic: "985654321V",
  phone: "0771234567",
  role: "WORKER",
  password: "Passw0rd1",
};

describe("isValidPassword", () => {
  test("accepts a password with a letter and a number, 8+ chars", () => {
    expect(isValidPassword("Passw0rd1")).toBe(true);
  });

  test("rejects a password under 8 characters", () => {
    expect(isValidPassword("Ab1")).toBe(false);
  });

  test("rejects a password with no digit", () => {
    expect(isValidPassword("Password")).toBe(false);
  });

  test("rejects a password with no letter", () => {
    expect(isValidPassword("12345678")).toBe(false);
  });
});

describe("validateUserForm (add mode)", () => {
  test("returns no errors for a fully valid form", () => {
    expect(validateUserForm(valid)).toEqual({});
  });

  test("requires name", () => {
    expect(validateUserForm({ ...valid, name: "" })).toHaveProperty("name");
  });

  test("requires a valid email", () => {
    expect(validateUserForm({ ...valid, email: "not-an-email" })).toHaveProperty("email");
  });

  test.each(["12345", "985654321", "985654321Z"])("rejects invalid NIC %s", (nic) => {
    expect(validateUserForm({ ...valid, nic })).toHaveProperty("nic");
  });

  test("accepts a 12-digit NIC", () => {
    expect(validateUserForm({ ...valid, nic: "200011122233" })).toEqual({});
  });

  test("requires password on create", () => {
    expect(validateUserForm({ ...valid, password: "" })).toHaveProperty("password");
  });
});

describe("validateUserForm (edit mode)", () => {
  test("allows an empty password", () => {
    const { password, ...rest } = valid;
    expect(password).toBeDefined();
    expect(validateUserForm(rest, { isEdit: true })).toEqual({});
  });

  test("still rejects a weak password if one is provided", () => {
    expect(validateUserForm({ ...valid, password: "weak" }, { isEdit: true })).toHaveProperty("password");
  });
});
