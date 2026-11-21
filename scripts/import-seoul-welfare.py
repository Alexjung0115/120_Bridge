"""Convert a Seoul Open Data Plaza OA-23014 JSON export into RAG documents."""

import argparse
import json
import re
from datetime import date, timedelta
from pathlib import Path


SOURCE_URL = "https://data.seoul.go.kr/dataList/OA-23014/S/1/datasetView.do"
DETAIL_URL = (
    "https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do"
    "?wlfareInfoReldBztpCd=02&wlfareInfoId="
)
DISTRICTS = set(
    "강남구 강동구 강북구 강서구 관악구 광진구 구로구 금천구 노원구 도봉구 동대문구 "
    "동작구 마포구 서대문구 서초구 성동구 성북구 송파구 양천구 영등포구 용산구 은평구 "
    "종로구 중구 중랑구".split()
)
SECTIONS = {
    "serv_dgst": "사업 개요",
    "sprt_trgt_cn": "지원 대상",
    "slct_crit_cn": "선정 기준",
    "alw_serv_cn": "지원 내용",
    "aply_mtd_cn": "신청 방법",
}


def clean(value):
    return (value or "").strip().replace("\r\n", "\n").replace("\r", "\n")


def tags(value):
    return [label.strip() for label in clean(value).split(",") if label.strip()]


def source_date(value):
    return date.fromisoformat(value) if value else None


def iso(value):
    return value.isoformat() if value else None


def jurisdiction(row):
    district = clean(row["sgg_nm"])
    department = clean(row["biz_chr_dept_nm"])
    if district in DISTRICTS:
        return {"scope": "district", "districtName": district}
    if department.startswith("서울특별시교육청"):
        return {"scope": "organization", "organizationName": "서울특별시교육청"}
    if not district and department.startswith("서울특별시 "):
        return {"scope": "city"}
    return {"scope": "unknown", "sourceDistrictLabel": district or None}


def document(row, retrieved_at):
    service_id = clean(row["serv_id"])
    title = clean(row["serv_nm"])
    if row["ctpv_nm"] != "서울특별시" or not re.fullmatch(r"WLF\d{8}", service_id) or not title:
        raise ValueError(f"Invalid Seoul service record: {service_id!r}")

    begins = source_date(row["enfc_bgng_ymd"])
    ends = source_date(row["enfc_end_ymd"])
    if begins and ends and ends < begins:
        raise ValueError(f"Invalid effective dates: {service_id}")
    # Convert the source's end date to the corpus's exclusive upper bound.
    until = ends + timedelta(days=1) if ends and ends != date.max else None
    doc_id = f"OA-23014/{service_id}"
    chunks = [
        {
            "chunkId": f"{doc_id}/{field}",
            "docId": doc_id,
            "heading": heading,
            "text": clean(row[field]),
            "claimKeys": [],
            "verifiedClaims": [],
            "answerEligible": False,
            "routingEligible": False,
            "conflicts": [],
        }
        for field, heading in SECTIONS.items()
        if clean(row[field])
    ]
    return {
        "docId": doc_id,
        "serviceId": service_id,
        "title": title,
        "category": "복지",
        "jurisdiction": jurisdiction(row),
        "department": clean(row["biz_chr_dept_nm"]),
        "lifeStages": tags(row["life_nm_array"]),
        "householdTypes": tags(row["trgter_indvdl_nm_array"]),
        "topics": tags(row["intrs_thema_nm_array"]),
        "applicationMethodLabel": clean(row["aply_mtd_nm"]) or None,
        "sourceUrl": SOURCE_URL,
        "detailUrl": DETAIL_URL + service_id,
        "retrievedAt": retrieved_at.isoformat(),
        "updatedAt": iso(source_date(row["last_mod_ymd"])),
        "effectiveFrom": iso(begins),
        "effectiveUntil": iso(until),
        "sourceEndDate": iso(ends),
        "sourceVerifiedAt": None,
        "verificationStatus": "unverified",
        "chunks": chunks,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--retrieved-at", type=date.fromisoformat, required=True)
    args = parser.parse_args()
    rows = json.loads(args.source.read_text(encoding="utf-8-sig"))["DATA"]
    documents = sorted(
        (document(row, args.retrieved_at) for row in rows),
        key=lambda item: item["serviceId"],
    )
    if not documents or len(documents) != len({item["docId"] for item in documents}):
        raise ValueError("The export is empty or contains duplicate service IDs")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="\n") as output:
        for item in documents:
            output.write(json.dumps(item, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"{len(documents)} welfare programs, {sum(len(item['chunks']) for item in documents)} sections")


if __name__ == "__main__":
    main()
