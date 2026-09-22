"""Mechanical PDF splitting worker (pypdf page copies).

Job file (argv[1]) JSON:

    {"file": "<source.pdf>", "by": "range" | "per_page" | "bookmark",
     "ranges": [{"from": 1, "to": 3}, ...], "output_dir": "<dir>",
     "job_id": "<id>"}

Pages are copied as-is: page size, rotation, and scale are never altered.
Split files and an index.json land in ``output_dir``; the stdout result
mirrors the index with absolute output paths. Structured decomposition
requests (by "structure"/"mineru") exit with a defined unsupported result.
"""

import hashlib
import json
import os
import sys

PARSER_VERSION = "construction-pdf-split/1.0.0"

SUPPORTED = ("range", "per_page", "bookmark")
UNSUPPORTED = ("structure", "mineru")


def fail(code, message):
    print(json.dumps({"error": {"code": code, "message": message}}))
    sys.exit(1)


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_reader(path):
    from pypdf import PdfReader

    if not os.path.isfile(path):
        fail("NOT_FOUND", f"{path}: file not found")
    try:
        reader = PdfReader(path)
    except Exception as error:
        fail("DAMAGED", f"{path}: cannot parse PDF ({error})")
    if reader.is_encrypted:
        try:
            unlocked = reader.decrypt("")
        except Exception:
            unlocked = 0
        if unlocked == 0:
            fail("ENCRYPTED", f"{path}: the PDF is encrypted and cannot be opened without a password")
    return reader


def bookmark_ranges(reader):
    try:
        outline = reader.outline
    except Exception as error:
        fail("NO_BOOKMARKS", f"cannot read the PDF outline ({error})")
    starts = []
    for item in outline:
        if isinstance(item, list):
            continue
        try:
            page = reader.get_destination_page_number(item)
        except Exception:
            continue
        if page is not None and page >= 0:
            starts.append(page + 1)
    starts = sorted(set(starts))
    page_count = len(reader.pages)
    if not starts:
        fail("NO_BOOKMARKS", "the PDF has no usable top-level bookmarks to split on")
    if starts[0] != 1:
        starts.insert(0, 1)
    ranges = []
    for index, start in enumerate(starts):
        end = (starts[index + 1] - 1) if index + 1 < len(starts) else page_count
        if start <= end:
            ranges.append((start, end))
    return ranges


def main(argv):
    if len(argv) != 2:
        fail("USAGE", "construction_pdf_split.py expects one JSON job file")
    try:
        with open(argv[1], "r", encoding="utf-8") as handle:
            job = json.load(handle)
    except Exception as error:
        fail("BAD_JOB", f"cannot read job file: {error}")

    path = job.get("file")
    by = job.get("by")
    output_dir = job.get("output_dir")
    job_id = job.get("job_id") or "split"
    if not path or not output_dir:
        fail("BAD_JOB", "job requires file and output_dir")
    if by in UNSUPPORTED:
        print(json.dumps({
            "schema_version": 1,
            "parser_version": PARSER_VERSION,
            "status": "unsupported",
            "reason": "structured drawing decomposition is not available in this release; "
                      "mechanical splitting by range, per_page, or bookmark does not reach it",
            "requested_mode": by,
        }))
        return
    if by not in SUPPORTED:
        fail("BAD_JOB", f"unsupported split mode {by!r}")

    reader = load_reader(path)
    page_count = len(reader.pages)

    if by == "range":
        raw_ranges = job.get("ranges")
        if not isinstance(raw_ranges, list) or not raw_ranges:
            fail("BAD_JOB", "range splitting requires at least one {from, to} range")
        ranges = []
        for entry in raw_ranges:
            try:
                start = int(entry["from"])
                end = int(entry["to"])
            except (TypeError, KeyError, ValueError):
                fail("BAD_JOB", f"invalid range entry {entry!r}")
            if start < 1 or end > page_count or start > end:
                fail("BAD_RANGE", f"range {start}-{end} is outside the document's 1-{page_count} pages")
            ranges.append((start, end))
    elif by == "per_page":
        ranges = [(page, page) for page in range(1, page_count + 1)]
    else:
        ranges = bookmark_ranges(reader)

    os.makedirs(output_dir, exist_ok=True)
    outputs = []
    warnings = []
    for index, (start, end) in enumerate(ranges):
        from pypdf import PdfWriter

        writer = PdfWriter()
        for page_no in range(start, end + 1):
            writer.add_page(reader.pages[page_no - 1])
        name = f"{job_id}-part-{index + 1:03d}.pdf"
        target = os.path.join(output_dir, name)
        try:
            with open(target, "wb") as handle:
                writer.write(handle)
        except OSError as error:
            fail("IO_ERROR", f"cannot write {target}: {error}")
        outputs.append({
            "file": target,
            "pages": list(range(start, end + 1)),
            "page_count": end - start + 1,
        })

    index = {
        "schema_version": 1,
        "parser_version": PARSER_VERSION,
        "job_id": job_id,
        "source": {
            "file": path,
            "sha256": sha256_file(path),
            "page_count": page_count,
        },
        "split_by": by,
        "outputs": [
            {"file": os.path.basename(output["file"]), "pages": output["pages"], "page_count": output["page_count"]}
            for output in outputs
        ],
        "coverage": {
            "state": "complete",
            "requested": by,
            "actual": f"{len(outputs)} output file(s), {sum(len(output['pages']) for output in outputs)} page(s) copied",
            "warnings": warnings,
        },
    }
    index_path = os.path.join(output_dir, "index.json")
    with open(index_path, "w", encoding="utf-8") as handle:
        json.dump(index, handle, indent=2)

    print(json.dumps({
        "schema_version": 1,
        "parser_version": PARSER_VERSION,
        "status": "ok",
        "job_id": job_id,
        "output_dir": output_dir,
        "index_file": index_path,
        "source": index["source"],
        "split_by": by,
        "outputs": outputs,
        "coverage": index["coverage"],
    }))


if __name__ == "__main__":
    main(sys.argv)
