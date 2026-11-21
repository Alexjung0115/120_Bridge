import unittest
from datetime import date

from scripts.prepare_rag import answerable_chunks, load_corpus, validate_documents


class CorpusTests(unittest.TestCase):
    def test_repository_sources_are_readable(self):
        documents = load_corpus()
        self.assertTrue(any(doc["docId"].startswith("OA-23014/") for doc in documents))
        self.assertTrue(any(doc["docId"].endswith(".md") for doc in documents))
        self.assertFalse(any(
            chunk["answerEligible"]
            for doc in documents if doc["verificationStatus"] != "verified"
            for chunk in doc["chunks"]
        ))

    def test_district_and_exclusive_dates(self):
        doc = {
            "jurisdiction": {"scope": "district", "districtName": "마포구"},
            "effectiveFrom": "2026-11-01",
            "effectiveUntil": "2026-12-01",
            "chunks": [{"answerEligible": True}, {"answerEligible": False}],
        }
        current = date(2026, 11, 21)
        self.assertEqual(answerable_chunks(doc, current, "마포구"), [doc["chunks"][0]])
        self.assertEqual(answerable_chunks(doc, current, "강남구"), [])
        self.assertEqual(answerable_chunks(doc, current), [])
        self.assertEqual(answerable_chunks(doc, date(2026, 12, 1), "마포구"), [])
        self.assertEqual(answerable_chunks(doc, date(2026, 10, 31), "마포구"), [])

    def test_cannot_promote_unverified_material(self):
        doc = load_corpus()[0]
        doc["chunks"][0]["answerEligible"] = True
        with self.assertRaisesRegex(ValueError, "unverified or conflicting"):
            validate_documents([doc])

    def test_duplicate_document_ids_fail(self):
        doc = load_corpus()[0]
        with self.assertRaisesRegex(ValueError, "duplicate document ID"):
            validate_documents([doc, doc])
