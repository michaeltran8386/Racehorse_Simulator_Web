import { test } from "node:test";
import assert from "node:assert/strict";
import { initialUnlocked, isAdminPin } from "./adminPin.ts";

test("isAdminPin chỉ nhận đúng 2204 (bỏ khoảng trắng hai đầu)", () => {
  assert.equal(isAdminPin("2204"), true);
  assert.equal(isAdminPin(" 2204 "), true);
  assert.equal(isAdminPin("2205"), false);
  assert.equal(isAdminPin(""), false);
});

test("initialUnlocked: sessionId hoặc cờ sim_admin mới mở khóa", () => {
  const store = (v: string | null) => ({ getItem: () => v });
  assert.equal(initialUnlocked(store(null), null), false);
  assert.equal(initialUnlocked(store("false"), null), false);
  assert.equal(initialUnlocked(store("true"), null), true);
  assert.equal(initialUnlocked(store(null), "abc"), true);
  assert.equal(initialUnlocked(null, null), false);
  const throwing = { getItem: () => { throw new Error("blocked"); } };
  assert.equal(initialUnlocked(throwing, null), false);
});
