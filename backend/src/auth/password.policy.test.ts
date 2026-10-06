import { describe, it, expect } from "vitest";
import { validatePassword, MIN_PASSWORD_LENGTH } from "./password.policy.js";

describe("validatePassword", () => {
  it("rejects a blank or all-whitespace password (the reported bug)", () => {
    expect(validatePassword("")).not.toBeNull();
    expect(validatePassword("        ")).not.toBeNull();
    expect(validatePassword("\t \n ")).not.toBeNull();
  });

  it("doesn't let leading/trailing spaces pad a too-short password", () => {
    expect(validatePassword("   ab1   ")).not.toBeNull();
  });

  it("rejects a password shorter than the minimum", () => {
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(10);
    expect(validatePassword("Ab1!xyz")).not.toBeNull(); // 7 chars
    expect(validatePassword("Abc12345")).not.toBeNull(); // 8 chars, still below the floor
  });

  it("rejects single-class passwords (all letters / all digits / repeated)", () => {
    expect(validatePassword("abcdefghij")).not.toBeNull();
    expect(validatePassword("1234567890")).not.toBeNull();
    expect(validatePassword("aaaaaaaaaa")).not.toBeNull();
  });

  it("rejects the most common passwords", () => {
    expect(validatePassword("password123")).not.toBeNull();
    expect(validatePassword("Password123")).not.toBeNull(); // common even with a capital
    expect(validatePassword("Masaganang2026")).toBeNull(); // not on the common list
  });

  it("accepts a strong password and a passphrase with internal spaces", () => {
    expect(validatePassword("Barako2026!")).toBeNull();
    expect(validatePassword("correct horse1")).toBeNull();
    expect(validatePassword("Tindahan88")).toBeNull();
  });

  it("rejects an over-long password (DoS guard)", () => {
    expect(validatePassword("Aa1" + "x".repeat(200))).not.toBeNull();
  });
});
