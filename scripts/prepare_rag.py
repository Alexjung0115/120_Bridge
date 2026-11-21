"""Validate local RAG inputs and optionally emit a normalized JSONL import file."""

import argparse
import hashlib
import json
import re
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
WELFARE = ROOT / "data/normalized/seoul-welfare.jsonl"


def date_value(value):
    if value in (None, "미확인"):
        return None
    parsed = date.fromisoformat(value)
    if parsed.isoformat() != value:
        raise ValueError(f"expected YYYY-MM-DD, got {value!r}")
    return parsed


def legacy_documents():
    root = (ROOT / "rag-data").resolve()
    records = json.loads((root / "index.json").read_text(encoding="utf-8-sig"))
    for record in records:
        doc_id = record["path"]
        path = (root / doc_id).resolve()
        if not path.is_relative_to(root) or path.suffix != ".md":
            raise ValueError(f"invalid Markdown source: {doc_id}")
        contents = path.read_text(encoding="utf-8-sig")
        _, front_matter, body = re.split(r"(?m)^---[ \t]*$", contents, maxsplit=2)
        metadata = dict(line.split(": ", 1) for line in front_matter.splitlines() if ": " in line)
        for key in ("source_url", "jurisdiction", "retrieved_at"):
            if metadata.get(key) != record.get(key):
                raise ValueError(f"{doc_id}: Markdown and index disagree on {key}")

        jurisdiction = record["jurisdiction"]
        if jurisdiction.endswith("구"):
            location = {"scope": "district", "districtName": jurisdiction}
        elif jurisdiction == "서울시":
            location = {"scope": "city"}
        elif jurisdiction.startswith("전국"):
            location = {"scope": "national"}
        else:
            location = {"scope": "organization", "organizationName": jurisdiction}

        basis = record.get("date_basis", "")
        basis_date = date_value(record.get("effective_date"))
        prior_review = re.match(r"\d{4}-\d{2}-\d{2}", record.get("source_verified", ""))
        parts = re.split(r"(?m)^#{1,6}[ \t]+(.+)$", body.strip())
        sections = [(record["title"], parts[0]), *zip(parts[1::2], parts[2::2])]
        yield {
            "docId": doc_id,
            "sourcePath": path.relative_to(ROOT).as_posix(),
            "sourceHash": hashlib.sha256(contents.encode("utf-8")).hexdigest(),
            "title": record["title"],
            "category": record["category"],
            "sourceUrl": record["source_url"],
            "jurisdiction": location,
            "retrievedAt": record["retrieved_at"],
            "publishedAt": basis_date.isoformat() if basis_date and basis.startswith("게시일") else None,
            "updatedAt": basis_date.isoformat() if basis_date and "수정일" in basis else None,
            "effectiveFrom": basis_date.isoformat() if basis_date and basis == "시행일" else None,
            "effectiveUntil": None,
            "sourceVerifiedAt": prior_review.group() if prior_review else None,
            "verificationStatus": "historical" if record["verified"] else "unverified",
            "chunks": [
                {
                    "chunkId": f"{doc_id}/section-{number}",
                    "docId": doc_id,
                    "heading": heading.strip(),
                    "text": text.strip(),
                    "claimKeys": [],
                    "verifiedClaims": [],
                    "answerEligible": False,
                    "routingEligible": False,
                    "conflicts": [],
                }
                for number, (heading, text) in enumerate(sections, 1)
                if text.strip()
            ],
        }


def validate_documents(documents):
    doc_ids = set()
    chunk_ids = set()
    for doc in documents:
        doc_id = doc["docId"]
        if not doc_id or doc_id in doc_ids:
            raise ValueError(f"empty or duplicate document ID: {doc_id!r}")
        doc_ids.add(doc_id)
        url = urlsplit(doc["sourceUrl"])
        if url.scheme != "https" or not url.hostname or url.username or url.password:
            raise ValueError(f"{doc_id}: invalid source URL")
        location = doc["jurisdiction"]
        if location["scope"] not in {"city", "district", "national", "organization", "unknown"}:
            raise ValueError(f"{doc_id}: invalid jurisdiction")
        if location["scope"] == "district" and not location.get("districtName"):
            raise ValueError(f"{doc_id}: district name is required")
        begins = date_value(doc.get("effectiveFrom"))
        until = date_value(doc.get("effectiveUntil"))
        reviewed = date_value(doc.get("sourceVerifiedAt"))
        for key in ("publishedAt", "updatedAt"):
            date_value(doc.get(key))
        if date_value(doc.get("retrievedAt")) is None or (begins and until and begins >= until):
            raise ValueError(f"{doc_id}: invalid retrieval date or effective interval")
        if doc["verificationStatus"] not in {"verified", "historical", "unverified", "blocked", "conflict"}:
            raise ValueError(f"{doc_id}: invalid verification status")
        if not doc["chunks"]:
            raise ValueError(f"{doc_id}: no content chunks")
        for chunk in doc["chunks"]:
            chunk_id = chunk["chunkId"]
            if not chunk_id or chunk_id in chunk_ids or chunk["docId"] != doc_id or not chunk["text"].strip():
                raise ValueError(f"{doc_id}: invalid or duplicate chunk {chunk_id!r}")
            chunk_ids.add(chunk_id)
            if type(chunk["answerEligible"]) is not bool:
                raise ValueError(f"{chunk_id}: answerEligible must be a boolean")
            if chunk["answerEligible"] and (
                doc["verificationStatus"] != "verified"
                or reviewed is None
                or not chunk["verifiedClaims"]
                or not chunk["claimKeys"]
                or chunk["conflicts"]
            ):
                raise ValueError(f"{chunk_id}: unverified or conflicting answer evidence")


def answerable_chunks(doc, business_date, district=None):
    location = doc["jurisdiction"]
    scope = location["scope"]
    if scope not in {"city", "national"} and not (
        scope == "district" and district and district == location.get("districtName")
    ):
        return []
    begins = date_value(doc.get("effectiveFrom"))
    until = date_value(doc.get("effectiveUntil"))
    if (begins and business_date < begins) or (until and business_date >= until):
        return []
    return [chunk for chunk in doc["chunks"] if chunk["answerEligible"]]


def load_corpus():
    documents = list(legacy_documents())
    with WELFARE.open(encoding="utf-8") as source:
        documents.extend(json.loads(line) for line in source if line.strip())
    validate_documents(documents)
    return documents


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="write validated records to a new JSONL file")
    args = parser.parse_args()
    documents = load_corpus()
    chunks = [chunk for doc in documents for chunk in doc["chunks"]]
    print(f"{len(documents)} documents; {len(chunks)} chunks; "
          f"{sum(chunk['answerEligible'] for chunk in chunks)} eligible for direct answers")
    if args.output:
        with args.output.open("x", encoding="utf-8", newline="\n") as output:
            for doc in documents:
                output.write(json.dumps(doc, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
