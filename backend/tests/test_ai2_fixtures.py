import json
import unittest
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def read_json(relative_path):
    return json.loads((ROOT / relative_path).read_text(encoding="utf-8"))


class AI2FixtureTests(unittest.TestCase):
    def test_generalization_set_covers_three_groups_and_policy_locations(self):
        cases = read_json("frontend/tests/fixtures/generalization.json")["cases"]
        self.assertEqual(len({case["id"] for case in cases}), len(cases))
        self.assertEqual(Counter(case["group"] for case in cases), {
            "new-grounded": 5, "variation": 5, "no-evidence": 5,
        })
        by_document = {doc["path"]: doc for doc in read_json("rag-data/index.json")}
        for case in cases:
            self.assertTrue(case["turns"])
            self.assertTrue(case["expected"]["action"])
            for path in case["expected"].get("documents", []):
                self.assertIn(path, by_document)
                self.assertTrue((ROOT / "rag-data" / path).is_file())
            if case["group"] == "no-evidence":
                self.assertTrue(case["expected"]["forbidden"])
        marks = Counter(mark for case in cases for mark in case.get("criteria", []))
        self.assertEqual(marks, {"SC-015": 6, "SC-025": 5})

    def test_handoff_policy_sets_cover_compound_question_limit_and_confirmation(self):
        cases = read_json("frontend/tests/fixtures/policy-cases.json")["cases"]
        self.assertEqual(len({case["id"] for case in cases}), len(cases))
        self.assertEqual(Counter(case["criterion"] for case in cases), {
            "SC-016": 2, "SC-018": 4, "SC-019": 5,
        })
        self.assertTrue(all(case["turns"] and case["expected"] for case in cases))
