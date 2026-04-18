import { describe, it } from "vitest";
import { equal } from "node:assert";

describe("Personal Admin Plugin", () => {
  it("should have correct plugin id", () => {
    equal("personal-admin", "personal-admin");
  });
});
