import assert from "node:assert/strict";
import { test } from "node:test";

import { splitUtterances } from "../../src/components/speech/useSpeechController";

test("spoken units hold at most two sentences", () => {
  assert.deepEqual(
    splitUtterances("첫째입니다. 둘째입니다. 셋째입니다? 넷째입니다. 다섯째입니다."),
    ["첫째입니다. 둘째입니다.", "셋째입니다? 넷째입니다.", "다섯째입니다."],
  );
});

test("decimals and empty input do not create extra units", () => {
  assert.deepEqual(splitUtterances("용량은 3.5 리터입니다."), ["용량은 3.5 리터입니다."]);
  assert.deepEqual(splitUtterances("  "), []);
});
