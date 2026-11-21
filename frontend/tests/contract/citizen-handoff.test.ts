import assert from "node:assert/strict";
import { test } from "node:test";
import { summaryDecisionSchema, correctHandoffSchema, requestHandoffSchema } from "../../src/lib/schema/citizen-handoff";

const commandId = "10000000-0000-4000-8000-000000000009";
const command = { commandId, baseRevision: 0 };
const summary = { ...command, summaryRevision: 1 };

test("citizen handoff commands cannot supply approval evidence or state", () => {
  assert.ok(requestHandoffSchema.safeParse({ ...command, trigger: "voice" }).success);
  assert.equal(requestHandoffSchema.safeParse({ ...command, trigger: "voice", approved: true }).success, false);
  assert.ok(summaryDecisionSchema.safeParse({ ...summary, action: "skip" }).success);
  assert.equal(summaryDecisionSchema.safeParse({ ...summary, action: "confirm", skipReason: "spoof" }).success, false);
});

test("summary edits require one change format and corrections are bounded", () => {
  const edit = { ...summary, action: "edit" };
  const changes = [{ fieldKey: "district", value: "마포구" }];
  assert.equal(summaryDecisionSchema.safeParse(edit).success, false);
  assert.ok(summaryDecisionSchema.safeParse({ ...edit, changes }).success);
  assert.equal(summaryDecisionSchema.safeParse({ ...edit, changes, correctionText: "정정" }).success, false);
  const correction = { ...summary, handoffId: commandId, correctionText: "가".repeat(2_000) };
  assert.ok(correctHandoffSchema.safeParse(correction).success);
  assert.equal(correctHandoffSchema.safeParse({ ...correction, correctionText: correction.correctionText + "가" }).success, false);
});