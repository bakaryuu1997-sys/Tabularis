import { describe, it, expect } from "vitest";
import {
  isSensitiveColumn,
  maskEmail,
  maskPhone,
  maskCitizenId,
  maskCreditCard,
  maskBankAccount,
  maskSensitiveValue,
} from "../../src/utils/dataMasking";

describe("dataMasking", () => {
  describe("isSensitiveColumn", () => {
    it("identifies sensitive column names correctly", () => {
      expect(isSensitiveColumn("password")).toBe(true);
      expect(isSensitiveColumn("user_email")).toBe(true);
      expect(isSensitiveColumn("phone_number")).toBe(true);
      expect(isSensitiveColumn("cccd_number")).toBe(true);
      expect(isSensitiveColumn("cmnd")).toBe(true);
      expect(isSensitiveColumn("credit_card")).toBe(true);
      expect(isSensitiveColumn("bank_account")).toBe(true);
      expect(isSensitiveColumn("api_key")).toBe(true);
      expect(isSensitiveColumn("salary")).toBe(true);
      expect(isSensitiveColumn("tax_id")).toBe(true);

      expect(isSensitiveColumn("created_at")).toBe(false);
      expect(isSensitiveColumn("id")).toBe(false);
      expect(isSensitiveColumn("product_title")).toBe(false);
      expect(isSensitiveColumn("status")).toBe(false);
    });
  });

  describe("maskEmail", () => {
    it("masks email addresses with smart profile", () => {
      expect(maskEmail("alexander@gmail.com")).toBe("al***@gmail.com");
      expect(maskEmail("ab@domain.org")).toBe("a***@domain.org");
      expect(maskEmail("invalid-email")).toBe("••••••••");
    });

    it("masks email addresses with full and redacted profiles", () => {
      expect(maskEmail("alexander@gmail.com", "full")).toBe("••••••••");
      expect(maskEmail("alexander@gmail.com", "redacted")).toBe("[REDACTED EMAIL]");
    });
  });

  describe("maskPhone", () => {
    it("masks phone numbers with smart profile", () => {
      expect(maskPhone("0901234567")).toBe("090*****67");
      expect(maskPhone("+84901234567")).toBe("+84*****67");
      expect(maskPhone("1234")).toBe("••••");
    });

    it("masks phone numbers with full and redacted profiles", () => {
      expect(maskPhone("0901234567", "full")).toBe("••••••••");
      expect(maskPhone("0901234567", "redacted")).toBe("[REDACTED PHONE]");
    });
  });

  describe("maskCitizenId", () => {
    it("masks CCCD/CMND numbers with smart profile", () => {
      expect(maskCitizenId("001234567890")).toBe("001******890");
      expect(maskCitizenId("012345678")).toBe("012******678");
    });

    it("masks CCCD/CMND with full and redacted profiles", () => {
      expect(maskCitizenId("001234567890", "full")).toBe("••••••••••••");
      expect(maskCitizenId("001234567890", "redacted")).toBe("[REDACTED ID]");
    });
  });

  describe("maskCreditCard", () => {
    it("masks credit card numbers with smart profile", () => {
      expect(maskCreditCard("4532123456789012")).toBe("•••• •••• •••• 9012");
      expect(maskCreditCard("4532 1234 5678 9012")).toBe("•••• •••• •••• 9012");
    });

    it("masks credit card with full and redacted profiles", () => {
      expect(maskCreditCard("4532123456789012", "full")).toBe("•••• •••• •••• ••••");
      expect(maskCreditCard("4532123456789012", "redacted")).toBe("[REDACTED CARD]");
    });
  });

  describe("maskBankAccount", () => {
    it("masks bank account numbers with smart profile", () => {
      expect(maskBankAccount("190367890123")).toBe("190*****0123");
    });

    it("masks bank account with full and redacted profiles", () => {
      expect(maskBankAccount("190367890123", "full")).toBe("••••••••••••");
      expect(maskBankAccount("190367890123", "redacted")).toBe("[REDACTED ACCOUNT]");
    });
  });

  describe("maskSensitiveValue", () => {
    it("dispatches to correct masker based on column name", () => {
      expect(maskSensitiveValue("001234567890", "user_cccd")).toBe("001******890");
      expect(maskSensitiveValue("4532123456789012", "credit_card")).toBe("•••• •••• •••• 9012");
      expect(maskSensitiveValue("190367890123", "bank_account")).toBe("190*****0123");
      expect(maskSensitiveValue("alex@example.com", "email")).toBe("al***@example.com");
      expect(maskSensitiveValue("0987654321", "phone")).toBe("098*****21");
      expect(maskSensitiveValue("50000000", "salary")).toBe("***,***");
      expect(maskSensitiveValue("my_secret_token", "api_token")).toBe("••••••••");
    });

    it("handles null, undefined and empty values", () => {
      expect(maskSensitiveValue(null, "email")).toBe("NULL");
      expect(maskSensitiveValue(undefined, "email")).toBe("NULL");
      expect(maskSensitiveValue("", "email")).toBe("");
    });
  });
});
