"""Shared read-only construction document worker.

Reads one .docx, .xlsx, or .pdf file and prints a single JSON document
result on stdout. The caller writes a JSON job file and passes its path as
argv[1]:

    {"op": "inspect" | "read" | "search", "file": "<path>",
     "query": "<text>", "max_chars": <int>, "max_cells": <int>}

Errors print {"error": {"code", "message"}} and exit nonzero. Formulas are
never evaluated: openpyxl only reports the formula text and the cached value
the producer stored.
"""

import hashlib
import json
import os
import sys
import zipfile

PARSER_VERSION = "construction-read/1.0.0"
MAX_OUTPUT_CHARS = 200000
MAX_CELLS = 20000
MAX_MATCHES = 100

_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def fail(code, message):
    print(json.dumps({"error": {"code": code, "message": message}}))
    sys.exit(1)


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def coverage(state, requested, actual, warnings):
    return {
        "state": state,
        "requested": requested,
        "actual": actual,
        "warnings": warnings,
    }


def detect_format(path):
    lowered = path.lower()
    for suffix, fmt in ((".docx", "docx"), (".xlsx", "xlsx"), (".pdf", "pdf")):
        if lowered.endswith(suffix):
            return fmt
    return "unknown"


# ---------------------------------------------------------------------------
# Word (.docx)

def docx_part_xml(zf, name):
    try:
        return zf.read(name)
    except KeyError:
        return None


def docx_features(zf):
    xml = docx_part_xml(zf, "word/document.xml")
    names = set(zf.namelist())
    tracked = False
    objects = 0
    if xml is not None:
        tracked = b"<w:ins " in xml or b"<w:del " in xml
        objects = xml.count(b"<w:object") + xml.count(b"<w:altChunk")
    comments = any(name.startswith("word/comments") for name in names)
    headers = len([name for name in names if name.startswith("word/header")])
    footers = len([name for name in names if name.startswith("word/footer")])
    return {
        "tracked_changes": tracked,
        "comments": comments,
        "embedded_objects": objects,
        "headers": headers,
        "footers": footers,
    }


def docx_table_grid(table):
    """Expand one table into a text grid plus merged-cell spans.

    Horizontal merges carry ``w:gridSpan`` on one cell; vertical merges mark
    continuation cells with ``w:vMerge``. The anchor cell of every merge keeps
    the combined text; continuation positions stay empty.
    """
    from docx.oxml.ns import qn
    from docx.table import _Cell

    grid = []
    spans = []
    for row_idx, tr in enumerate(table._tbl.tr_lst):
        row_cells = []
        col_idx = 0
        for tc in tr.tc_lst:
            tc_pr = tc.tcPr
            colspan = 1
            vmerge = None
            if tc_pr is not None:
                grid_span = tc_pr.find(qn("w:gridSpan"))
                if grid_span is not None:
                    colspan = int(grid_span.get(qn("w:val"), "1"))
                v_merge = tc_pr.find(qn("w:vMerge"))
                if v_merge is not None:
                    vmerge = v_merge.get(qn("w:val")) or "continue"
            text = _Cell(tc, table).text
            if vmerge == "continue":
                anchor = next(
                    (span for span in reversed(spans) if span["col"] == col_idx and span["row"] + span["rowspan"] == row_idx),
                    None,
                )
                if anchor is not None:
                    anchor["rowspan"] += 1
                    anchor["text"] = (anchor["text"] + " " + text).strip()
                for _ in range(colspan):
                    row_cells.append("")
                col_idx += colspan
                continue
            spans.append({"row": row_idx, "col": col_idx, "rowspan": 1, "colspan": colspan, "text": text})
            row_cells.append(text)
            for _ in range(colspan - 1):
                row_cells.append("")
            col_idx += colspan
        grid.append(row_cells)
    width = max((len(row) for row in grid), default=0)
    for row in grid:
        row.extend([""] * (width - len(row)))
    for span in spans:
        span.pop("text", None)
    return grid, spans


def docx_read(path, zf, op, query, max_chars):
    from docx import Document

    document = Document(path)
    features = docx_features(zf)
    warnings = []
    if features["tracked_changes"]:
        warnings.append("document contains tracked changes; inserted or deleted text is not reflected in the reported content")
    if features["comments"]:
        warnings.append("document contains comments that are not included in the reported content")
    if features["embedded_objects"]:
        warnings.append("document contains embedded objects or alternate content not represented in text")

    blocks = []
    refs = []
    matches = []
    section_path = []
    table_index = 0
    paragraph_index = 0
    total_chars = 0
    truncated = False

    body = document.element.body
    from docx.oxml.ns import qn
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    for child in body.iterchildren():
        if child.tag == qn("w:p"):
            paragraph = Paragraph(child, document)
            style_name = paragraph.style.name if paragraph.style is not None else ""
            text = paragraph.text
            heading_level = None
            if style_name.startswith("Heading"):
                try:
                    heading_level = int(style_name.split()[-1])
                except ValueError:
                    heading_level = None
            if heading_level is not None:
                depth = max(heading_level - 1, 0)
                section_path = section_path[:depth] + [text]
            ref = {
                "kind": "word",
                "file": path,
                "section_path": list(section_path),
                "paragraph": paragraph_index,
            }
            if op == "search":
                if query and query.lower() in text.lower():
                    matches.append({"source_ref": ref, "excerpt": text[:300]})
            elif total_chars >= max_chars:
                truncated = True
            else:
                block = {"type": "paragraph", "style": style_name, "text": text}
                if heading_level is not None:
                    block["heading_level"] = heading_level
                blocks.append(block)
                refs.append(ref)
                total_chars += len(text)
            paragraph_index += 1
        elif child.tag == qn("w:tbl"):
            table = Table(child, document)
            grid, spans = docx_table_grid(table)
            ref = {
                "kind": "word",
                "file": path,
                "section_path": list(section_path),
                "table": {"index": table_index, "row_count": len(grid), "col_count": len(grid[0]) if grid else 0},
            }
            if op == "search":
                for row_idx, row in enumerate(grid):
                    for col_idx, cell in enumerate(row):
                        if query and query.lower() in cell.lower():
                            matches.append({
                                "source_ref": {
                                    "kind": "word",
                                    "file": path,
                                    "section_path": list(section_path),
                                    "table": {"index": table_index, "row": row_idx, "col": col_idx},
                                },
                                "excerpt": cell[:300],
                            })
            elif total_chars >= max_chars:
                truncated = True
            else:
                blocks.append({
                    "type": "table",
                    "index": table_index,
                    "rows": grid,
                    "merged_cells": spans,
                })
                refs.append(ref)
                total_chars += sum(len(cell) for row in grid for cell in row)
            table_index += 1

    if truncated:
        warnings.append(f"content truncated at {max_chars} characters; refine parameters or read in parts")

    content = {
        "paragraph_count": paragraph_index,
        "table_count": table_index,
        "headings": [block.get("text") for block in blocks if block.get("heading_level") is not None],
        "features": features,
        "blocks": blocks,
    }
    return content, refs, matches, warnings, paragraph_index, table_index


def docx_inspect(path, zf):
    from docx import Document

    document = Document(path)
    features = docx_features(zf)
    headings = 0
    for paragraph in document.paragraphs:
        style_name = paragraph.style.name if paragraph.style is not None else ""
        if style_name.startswith("Heading"):
            headings += 1
    warnings = []
    if features["tracked_changes"]:
        warnings.append("document contains tracked changes")
    if features["comments"]:
        warnings.append("document contains comments")
    if features["embedded_objects"]:
        warnings.append("document contains embedded objects or alternate content")
    state = "needs_review" if warnings else "complete"
    return {
        "paragraph_count": len(document.paragraphs),
        "table_count": len(document.tables),
        "section_count": len(document.sections),
        "heading_count": headings,
        "features": features,
    }, state, warnings


# ---------------------------------------------------------------------------
# Excel (.xlsx)

def xlsx_inspect(path):
    import openpyxl

    workbook = openpyxl.load_workbook(path, data_only=False, read_only=False)
    formula_count = 0
    sheets = []
    hidden_sheets = []
    for sheet in workbook.worksheets:
        if sheet.sheet_state != "visible":
            hidden_sheets.append(sheet.title)
        for row in sheet.iter_rows():
            for cell in row:
                if isinstance(cell.value, str) and cell.value.startswith("="):
                    formula_count += 1
        sheets.append({
            "name": sheet.title,
            "state": sheet.sheet_state,
            "dimensions": sheet.dimensions,
            "merge_count": len(sheet.merged_cells.ranges),
        })
    cached = xlsx_formula_cache(path)
    cache_missing = cached["missing"]
    warnings = []
    if formula_count:
        if cache_missing:
            warnings.append(
                f"{formula_count} formula cell(s) lack cached values; the workbook was saved without recalculation and openpyxl never evaluates formulas"
            )
        else:
            warnings.append(
                f"{formula_count} formula cell(s) carry producer-cached values only; openpyxl never evaluates formulas"
            )
    state = "needs_review" if formula_count else "complete"
    return {
        "sheet_count": len(sheets),
        "sheets": sheets,
        "hidden_sheets": hidden_sheets,
        "formula_count": formula_count,
        "formula_cache": "missing" if cache_missing else ("present" if formula_count else "none"),
    }, state, warnings


def xlsx_formula_cache(path):
    import openpyxl

    cached_workbook = openpyxl.load_workbook(path, data_only=True, read_only=False)
    formula_workbook = openpyxl.load_workbook(path, data_only=False, read_only=False)
    missing = 0
    total = 0
    for name in formula_workbook.sheetnames:
        formula_sheet = formula_workbook[name]
        cached_sheet = cached_workbook[name]
        for row in formula_sheet.iter_rows():
            for cell in row:
                if isinstance(cell.value, str) and cell.value.startswith("="):
                    total += 1
                    if cached_sheet[cell.coordinate].value is None:
                        missing += 1
    return {"missing": total > 0 and missing == total, "formula_count": total}


def xlsx_read(path, op, query, max_cells):
    import openpyxl

    workbook = openpyxl.load_workbook(path, data_only=False, read_only=False)
    cached_workbook = openpyxl.load_workbook(path, data_only=True, read_only=False)
    sheets = []
    refs = []
    matches = []
    warnings = []
    cell_count = 0
    truncated = False
    formula_count = 0
    cache_missing = 0
    for sheet in workbook.worksheets:
        hidden_rows = [idx for idx, dim in sheet.row_dimensions.items() if dim.hidden]
        hidden_cols = [key for key, dim in sheet.column_dimensions.items() if dim.hidden]
        merges = [str(rng) for rng in sheet.merged_cells.ranges]
        entry = {
            "name": sheet.title,
            "state": sheet.sheet_state,
            "dimensions": sheet.dimensions,
            "merges": merges,
            "hidden_rows": hidden_rows,
            "hidden_cols": hidden_cols,
            "cells": [],
        }
        cached_sheet = cached_workbook[sheet.title]
        for row in sheet.iter_rows():
            for cell in row:
                value = cell.value
                if value is None:
                    continue
                formula = None
                cached = None
                if isinstance(value, str) and value.startswith("="):
                    formula = value
                    formula_count += 1
                    cached = cached_sheet[cell.coordinate].value
                    if cached is None:
                        cache_missing += 1
                if op == "search":
                    if query and query.lower() in str(value).lower():
                        matches.append({
                            "source_ref": {"kind": "excel", "file": path, "sheet": sheet.title, "range": cell.coordinate},
                            "excerpt": str(value)[:300],
                        })
                    continue
                if cell_count >= max_cells:
                    truncated = True
                    continue
                record = {"ref": cell.coordinate}
                if formula is not None:
                    record["formula"] = formula
                    record["cached"] = cached
                else:
                    record["value"] = str(value)
                entry["cells"].append(record)
                refs.append({"kind": "excel", "file": path, "sheet": sheet.title, "range": cell.coordinate})
                cell_count += 1
        sheets.append(entry)
    if formula_count:
        if cache_missing == formula_count:
            warnings.append(
                f"{formula_count} formula cell(s) lack cached values; openpyxl never evaluates formulas, so report the values as unverifiable until recalculated"
            )
        else:
            warnings.append(
                f"{formula_count} formula cell(s) report producer-cached values only, never a fresh recalculation"
            )
    if truncated:
        warnings.append(f"cell output truncated at {max_cells} cells; refine sheet or range parameters")
    content = {
        "sheets": sheets,
        "formula_count": formula_count,
        "formula_cache": "missing" if formula_count and cache_missing == formula_count else ("present" if formula_count else "none"),
    }
    return content, refs, matches, warnings


# ---------------------------------------------------------------------------
# PDF (.pdf)

def pdf_reader(path):
    from pypdf import PdfReader

    reader = PdfReader(path)
    if reader.is_encrypted:
        try:
            unlocked = reader.decrypt("")
        except Exception:
            unlocked = 0
        if unlocked == 0:
            fail("ENCRYPTED", f"{path}: the PDF is encrypted and cannot be opened without a password")
    return reader


def pdf_inspect(path):
    try:
        reader = pdf_reader(path)
        page_count = len(reader.pages)
    except SystemExit:
        raise
    except Exception as error:
        fail("DAMAGED", f"{path}: cannot parse PDF ({error})")
    return {"page_count": page_count, "encrypted": False}, "complete", []


def pdf_read(path, op, query, max_chars):
    reader = pdf_reader(path)
    pages = []
    truncated = False
    refs = []
    matches = []
    warnings = []
    total_chars = 0
    for index, page in enumerate(reader.pages):
        page_no = index + 1
        text = ""
        try:
            text = page.extract_text() or ""
        except Exception as error:
            warnings.append(f"page {page_no}: text extraction failed ({error})")
        needs_visual = text.strip() == ""
        if op == "search":
            lowered = text.lower()
            start = 0
            while query:
                found = lowered.find(query.lower(), start)
                if found < 0:
                    break
                excerpt = text[max(found - 60, 0):found + len(query) + 60]
                matches.append({
                    "source_ref": {"kind": "pdf", "file": path, "page": page_no},
                    "excerpt": excerpt,
                })
                start = found + len(query)
                if len(matches) >= MAX_MATCHES:
                    warnings.append(f"search truncated at {MAX_MATCHES} matches")
                    break
            continue
        if total_chars < max_chars:
            pages.append({
                "page": page_no,
                "text": text,
                "chars": len(text),
                "needs_visual_read": needs_visual,
            })
            refs.append({"kind": "pdf", "file": path, "page": page_no})
            total_chars += len(text)
        else:
            truncated = True
        if needs_visual:
            warnings.append(f"page {page_no}: no extractable text; the page needs a visual read")
    if truncated:
        warnings.append(f"content truncated at {max_chars} characters; refine parameters or read in parts")
    return {"page_count": len(reader.pages), "pages": pages}, refs, matches, warnings


# ---------------------------------------------------------------------------
# Dispatch

def main(argv):
    if len(argv) != 2:
        fail("USAGE", "construction_read.py expects one JSON job file path")
    try:
        with open(argv[1], "r", encoding="utf-8") as handle:
            job = json.load(handle)
    except Exception as error:
        fail("BAD_JOB", f"cannot read job file: {error}")
    op = job.get("op")
    path = job.get("file")
    query = job.get("query")
    max_chars = int(job.get("max_chars") or MAX_OUTPUT_CHARS)
    max_cells = int(job.get("max_cells") or MAX_CELLS)
    if op not in ("inspect", "read", "search"):
        fail("BAD_JOB", f"unsupported op {op!r}")
    if not path:
        fail("BAD_JOB", "job requires a file path")
    if op == "search" and not query:
        fail("BAD_JOB", "search requires a query")

    fmt = detect_format(path)
    size = None
    try:
        size = os.path.getsize(path)
    except OSError:
        pass

    base = {
        "schema_version": 1,
        "parser_version": PARSER_VERSION,
        "status": "ok",
        "file": {
            "path": path,
            "name": os.path.basename(path),
            "size_bytes": size,
            "format": fmt,
            "sha256": None,
        },
        "coverage": None,
        "content": None,
        "source_refs": [],
        "errors": [],
    }

    if fmt == "unknown":
        base["status"] = "unsupported"
        base["errors"] = [f"{path}: unsupported file format; supported formats are .docx, .xlsx, and .pdf"]
        print(json.dumps(base))
        return

    try:
        base["file"]["sha256"] = sha256_file(path)
    except OSError as error:
        fail("NOT_FOUND", f"{path}: cannot open file ({error})")

    try:
        if fmt == "docx":
            result = read_docx(path, op, query, max_chars)
        elif fmt == "xlsx":
            result = read_xlsx(path, op, query, max_cells)
        else:
            result = read_pdf(path, op, query, max_chars)
    except SystemExit:
        raise
    except zipfile.BadZipFile as error:
        base["status"] = "failed"
        base["errors"] = [f"{path}: damaged Office package ({error})"]
        base["coverage"] = coverage("failed", op, "none", [])
        print(json.dumps(base))
        return
    except Exception as error:
        base["status"] = "failed"
        detail = f"cannot parse PDF ({error})" if fmt == "pdf" else f"processing failed ({error})"
        base["errors"] = [f"{path}: {detail}"]
        base["coverage"] = coverage("failed", op, "none", [])
        print(json.dumps(base))
        return

    content, cov, refs, matches = result
    base["content"] = content
    base["source_refs"] = refs
    base["coverage"] = cov
    if op == "search":
        base["content"] = {"matches": matches, "match_count": len(matches)}
        if len(matches) >= MAX_MATCHES:
            cov["warnings"].append(f"search truncated at {MAX_MATCHES} matches")
            cov["state"] = "partial"
    print(json.dumps(base))


def read_docx(path, op, query, max_chars):
    zf = zipfile.ZipFile(path)
    try:
        if op == "inspect":
            content, state, warnings = docx_inspect(path, zf)
            return content, coverage(state, "inspect", "structure", warnings), [], []
        content, refs, matches, warnings, para_count, table_count = docx_read(path, zf, op, query, max_chars)
        if any(w.startswith("content truncated") for w in warnings):
            state = "partial"
        else:
            state = "needs_review" if warnings else "complete"
        return content, coverage(state, op, "full document", warnings), refs, matches
    finally:
        zf.close()


def read_xlsx(path, op, query, max_cells):
    if op == "inspect":
        content, state, warnings = xlsx_inspect(path)
        return content, coverage(state, "inspect", "structure", warnings), [], []
    content, refs, matches, warnings = xlsx_read(path, op, query, max_cells)
    if any(w.startswith("cell output truncated") for w in warnings):
        state = "partial"
    else:
        state = "needs_review" if warnings else "complete"
    actual = "all cells" if not any("truncated" in w for w in warnings) else "truncated cells"
    return content, coverage(state, op, actual, warnings), refs, matches


def read_pdf(path, op, query, max_chars):
    if op == "inspect":
        content, state, warnings = pdf_inspect(path)
        return content, coverage(state, "inspect", "structure", warnings), [], []
    content, refs, matches, warnings = pdf_read(path, op, query, max_chars)
    if any(w.startswith("content truncated") for w in warnings) or any("extraction failed" in w for w in warnings):
        state = "partial"
    elif any("visual" in w for w in warnings):
        state = "needs_review"
    else:
        state = "complete"
    actual = "all pages" if not any(w.startswith("content truncated") for w in warnings) else "truncated pages"
    return content, coverage(state, op, actual, warnings), refs, matches


if __name__ == "__main__":
    main(sys.argv)
