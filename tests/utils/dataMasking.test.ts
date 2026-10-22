import { describe, it, expect } from "vitest";
import {
  isSensitiveColumn,
  maskEmail,
  maskPhone,
  maskSensitiveValue,
} from "../../src/utils/dataMasking";

describe("dataMasking", () => {
  describe("isSensitiveColumn", () => {
    it("detects sensitive column names", () => {
      expect(isSensitiveColumn("password")).toBe(true);
      expect(isSensitiveColumn("user_password_hash")).toBe(true);
      expect(isSensitiveColumn("api_key")).toBe(true);
      expect(isSensitiveColumn("apiKey")).toBe(true);
      expect(isSensitiveColumn("secret_token")).toBe(true);
      expect(isSensitiveColumn("user_email")).toBe(true);
      expect(isSensitiveColumn("phone_number")).toBe(true);
      expect(isSensitiveColumn("salary")).toBe(true);
      expect(isSensitiveColumn("ssn")).toBe(true);
      expect(isSensitiveColumn("credit_card")).toBe(true);
    });

    it("returns false for non-sensitive column names", () => {
      expect(isSensitiveColumn("id")).toBe(false);
      expect(isSensitiveColumn("name")).toBe(false);
      expect(isSensitiveColumn("created_at")).toBe(false);
      expect(isSensitiveColumn("status")).toBe(false);
      expect(isSensitiveColumn("")).toBe(false);
    });
  });

  describe("maskEmail", () => {
    it("masks email preserving domain", () => {
      expect(maskEmail("john.doe@example.com")).toBe("jo***@example.com");
      expect(maskEmail("ab@domain.org")).toBe("a***@domain.org");
    });

    it("handles invalid email by returning bullet mask", () => {
      expect(maskEmail("not-an-email")).toBe("••••••••");
    });
  });

  describe("maskPhone", () => {
    it("masks middle digits of phone numbers", () => {
      expect(maskPhone("0901234567")).toBe("090*****67");
      expect(maskPhone("1234")).toBe("••••");
    });
  });

  describe("maskSensitiveValue", () => {
    it("returns NULL for null/undefined", () => {
      expect(maskSensitiveValue(null)).toBe("NULL");
      expect(maskSensitiveValue(undefined)).toBe("NULL");
    });

    it("masks email when column contains email", () => {
      expect(maskSensitiveValue("dev@tabularis.io", "contact_email")).toBe("de***@tabularis.io");
    });

    it("masks phone numbers", () => {
      expect(maskSensitiveValue("+84987654321", "mobile_phone")).toBe("+84*****21");
    });

    it("masks salary", () => {
      expect(maskSensitiveValue(50000, "employee_salary")).toBe("***,***");
    });

    it("masks passwords and secrets as bullets", () => {
      expect(maskSensitiveValue("super_secret_123", "password")).toBe("••••••••");
      expect(maskSensitiveValue("sk_live_9999", "api_token")).toBe("••••••••");
    });
  });
});
