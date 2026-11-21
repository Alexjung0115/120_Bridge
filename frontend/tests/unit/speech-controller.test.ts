import assert from "node:assert/strict";
import { test } from "node:test";
import { splitIntoSentences } from "../../src/components/speech/useSpeechController.ts";

test("splitIntoSentences breaks text into proper sentences", () => {
  const input = "안녕하세요. 첫 번째 안내입니다! 두 번째 안내는 무엇일까요? 세 번째 문장도 있습니다.";
  const sentences = splitIntoSentences(input);
  assert.equal(sentences.length, 4);
  assert.equal(sentences[0], "안녕하세요.");
  assert.equal(sentences[1], "첫 번째 안내입니다!");
  assert.equal(sentences[2], "두 번째 안내는 무엇일까요?");
  assert.equal(sentences[3], "세 번째 문장도 있습니다.");
});

test("splitIntoSentences limits to two sentences when sliced", () => {
  const input = "서울시 120 다산콜센터입니다. 마포구 대형폐기물 배출을 안내해 드립니다. 수수료는 규격별로 상이합니다.";
  const sentences = splitIntoSentences(input).slice(0, 2);
  assert.equal(sentences.length, 2);
  assert.equal(sentences.join(" "), "서울시 120 다산콜센터입니다. 마포구 대형폐기물 배출을 안내해 드립니다.");
});

test("speech controller handles empty or whitespace text gracefully", () => {
  const sentences = splitIntoSentences("   ");
  assert.deepEqual(sentences, []);
});
