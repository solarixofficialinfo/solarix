"""
po_document_parser.py
=====================
Extracts and maps shipping, logistics, and PO fields from uploaded documents
(PDF, DOCX, DOC).

Designed strictly for Solarix Purchase Orders per operational protocols:
- Minimal, safe, zero-side-effect parsing.
- Handles both digital PDF (via pypdf) and DOCX (via python-docx) including table cells.
- DOC support via macOS textutil where available.
- Flags scanned/empty PDFs without pretending OCR exists.
- Maps recognized labels to PO fields without cross-contamination.
- Retains original extracted text in raw_values.
- Flags ambiguous/conflicting matches for manual user review.
"""

import io
import os
import re
import shutil
import tempfile
import subprocess
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple


# Regex patterns for shipping and logistics fields
# CRITICAL: Use [ \t]* for delimiters so line breaks are NEVER crossed
FIELD_PATTERNS = {
    "ship_via": [
        r'(?:ship\s*via|dispatched?\s*(?:through|by|via)|dispatch\s*via|mode\s*of\s*transport|transport\s*mode|shipment\s*mode|despatch\s*through)[ \t]*[:=-][ \t]*([^\r\n]+)',
    ],
    "shipping_method": [
        r'(?:shipping\s*method|freight\s*(?:paid\s*by|terms?|basis|mode)?|payment\s*of\s*freight)[ \t]*[:=-][ \t]*([^\r\n]+)',
    ],
    "shipping_term": [
        r'(?:shipping\s*terms?|delivery\s*terms?|terms?\s*of\s*delivery|incoterms?|destination\s*terms?)[ \t]*[:=-][ \t]*([^\r\n]+)',
    ],
    "transporter_name": [
        r'(?:transporter\s*(?:name|company)?|transport\s*company|carrier\s*(?:name)?|logistics\s*(?:partner|company|carrier)|courier\s*(?:name)?)[ \t]*[:=-][ \t]*([^\r\n]+)',
    ],
    "expected_dispatch_date": [
        r'(?:expected\s*dispatch\s*date|estimated\s*dispatch\s*date|dispatch\s*date|date\s*of\s*dispatch|scheduled\s*dispatch(?:\s*date)?|despatch\s*date)[ \t]*[:=-][ \t]*([^\r\n]+)',
    ],
    "delivery_date": [
        r'(?:delivery\s*date|date\s*of\s*delivery|expected\s*delivery\s*date|required\s*by(?:\s*date)?|delivery\s*by(?:\s*date)?|schedule\s*date|lead\s*time\s*date)[ \t]*[:=-][ \t]*([^\r\n]+)',
    ],
    "delivery_instructions": [
        r'(?:delivery\s*instructions?|dispatch\s*instructions?|special\s*shipping\s*instructions?|logistics\s*notes?)[ \t]*[:=-][ \t]*([^\r\n]+)',
    ]
}

DATE_FORMATS = [
    "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y",
    "%d %b %Y", "%d %B %Y", "%B %d, %Y", "%b %d, %Y",
    "%B %d %Y", "%b %d %Y",
    "%d-%b-%Y", "%d-%B-%Y", "%d/%m/%y", "%d-%m-%y"
]


def _clean_field_value(raw: str) -> str:
    """Strips leading/trailing punctuation and extra whitespace from extracted value."""
    if not raw:
        return ""
    val = raw.strip()
    # Strip common trailing separators/junk
    val = val.strip(" \t:=-|;,")
    # If it ends with another label or table pipe, take up to pipe
    if "|" in val:
        val = val.split("|")[0].strip()
    return val


def parse_date_value(raw_val: str) -> Tuple[str, bool]:
    """
    Standardizes a date string into YYYY-MM-DD.
    Returns (normalized_date_str, success_flag).
    If unparseable, returns (original_cleaned_string, False).
    """
    if not raw_val:
        return "", False
    
    clean = raw_val.strip()
    # Remove ordinal suffixes: 1st, 2nd, 3rd, 24th
    clean_ord = re.sub(r'(\d+)(st|nd|rd|th)', r'\1', clean, flags=re.IGNORECASE)
    
    # Check for date-like substring: e.g. 24/10/2026, 2026-10-24, 24 Oct 2026, Oct 24, 2026
    m = re.search(
        r'\b\d{1,4}[-/\.]\d{1,2}[-/\.]\d{2,4}\b|'
        r'\b\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\b|'
        r'\b[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}\b|'
        r'\b\d{1,2}-[A-Za-z]{3,9}-\d{2,4}\b',
        clean_ord
    )
    candidate = m.group(0).replace(',', '').strip() if m else clean_ord.replace(',', '').strip()
    # Normalize multiple spaces
    candidate = re.sub(r'\s+', ' ', candidate)

    for fmt in DATE_FORMATS:
        try:
            dt = datetime.strptime(candidate, fmt)
            if dt.year < 100:
                dt = dt.replace(year=2000 + dt.year)
            # Sanity check year range
            if 1990 <= dt.year <= 2100:
                return dt.strftime("%Y-%m-%d"), True
        except ValueError:
            pass

    return clean, False


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text from digital PDF bytes using PyMuPDF (fitz) or pypdf."""
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        text_chunks = []
        for page in doc:
            t = page.get_text()
            if t and t.strip():
                text_chunks.append(t)
        return "\n".join(text_chunks)
    except Exception:
        pass

    try:
        import importlib
        pypdf = importlib.import_module("pypdf")
        stream = io.BytesIO(file_bytes)
        reader = pypdf.PdfReader(stream)
        text_chunks = []
        for page in reader.pages:
            page_text = page.extract_text() or ""
            if page_text.strip():
                text_chunks.append(page_text)
        return "\n".join(text_chunks)
    except Exception as e:
        raise ValueError(f"Failed to extract text from PDF: {e}")


def extract_text_from_docx(file_bytes: bytes) -> str:
    """Extract text from DOCX bytes including paragraphs and table cells."""
    import docx
    stream = io.BytesIO(file_bytes)
    doc = docx.Document(stream)
    lines = []

    for p in doc.paragraphs:
        txt = p.text.strip()
        if txt:
            lines.append(txt)

    for table in doc.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells]
            # Pair adjacent cells (e.g. key: value)
            if len(cells) >= 2:
                for i in range(0, len(cells) - 1, 2):
                    if cells[i] and cells[i + 1]:
                        lines.append(f"{cells[i]}: {cells[i + 1]}")
            # Also append row text joined by pipes
            row_str = " | ".join(c for c in cells if c)
            if row_str:
                lines.append(row_str)

    return "\n".join(lines)


def extract_text_from_doc(file_bytes: bytes) -> str:
    """Extract text from binary .doc files using textutil on macOS if available."""
    textutil_bin = shutil.which("textutil")
    if not textutil_bin:
        raise ValueError(
            "Legacy .doc format requires LibreOffice or textutil which is not configured. "
            "Please upload as .docx or .pdf, or paste details directly."
        )

    with tempfile.NamedTemporaryFile(suffix=".doc", delete=False) as tf:
        tf.write(file_bytes)
        tf_path = tf.name

    try:
        res = subprocess.run(
            [textutil_bin, "-convert", "txt", tf_path, "-stdout"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=10
        )
        if res.returncode == 0 and res.stdout.strip():
            return res.stdout
        else:
            raise ValueError(f"Could not convert .doc file: {res.stderr or 'Empty output'}")
    finally:
        if os.path.exists(tf_path):
            os.remove(tf_path)


def extract_shipping_from_document(
    file_bytes: bytes,
    filename: str
) -> Dict[str, Any]:
    """
    Main entry point: extracts digital text from uploaded file and maps shipping fields.
    Returns:
    {
        "success": bool,
        "filename": str,
        "format": str,
        "is_scanned": bool,
        "extracted_fields": { ... },
        "raw_values": { ... },
        "confidence": { field: "high" | "ambiguous" },
        "ambiguous_fields": [ ... ],
        "review_reasons": { field: str },
        "text_snippet": str,
        "error": Optional[str]
    }
    """
    fn_lower = filename.lower()
    extracted_text = ""
    doc_format = "unknown"

    try:
        if fn_lower.endswith(".pdf"):
            doc_format = "pdf"
            extracted_text = extract_text_from_pdf(file_bytes)
        elif fn_lower.endswith(".docx"):
            doc_format = "docx"
            extracted_text = extract_text_from_docx(file_bytes)
        elif fn_lower.endswith(".doc"):
            doc_format = "doc"
            extracted_text = extract_text_from_doc(file_bytes)
        else:
            return {
                "success": False,
                "filename": filename,
                "format": doc_format,
                "is_scanned": False,
                "extracted_fields": {},
                "raw_values": {},
                "confidence": {},
                "ambiguous_fields": [],
                "review_reasons": {},
                "text_snippet": "",
                "error": f"Unsupported file extension for '{filename}'. Allowed formats: .pdf, .docx, .doc"
            }
    except Exception as e:
        return {
            "success": False,
            "filename": filename,
            "format": doc_format,
            "is_scanned": False,
            "extracted_fields": {},
            "raw_values": {},
            "confidence": {},
            "ambiguous_fields": [],
            "review_reasons": {},
            "text_snippet": "",
            "error": f"Failed to read {doc_format.upper()} document: {str(e)}"
        }

    # Verify if document had extractable digital text
    cleaned_full_text = extracted_text.strip()
    if not cleaned_full_text or len(cleaned_full_text) < 15:
        is_scanned = (doc_format == "pdf")
        msg = (
            "No extractable digital text found in this PDF. It appears to be a scanned image or photo. "
            "Optical Character Recognition (OCR) is not supported for scanned images; please input shipping details manually."
            if is_scanned
            else "The document does not contain any readable text."
        )
        return {
            "success": False,
            "filename": filename,
            "format": doc_format,
            "is_scanned": is_scanned,
            "extracted_fields": {},
            "raw_values": {},
            "confidence": {},
            "ambiguous_fields": [],
            "review_reasons": {},
            "text_snippet": "",
            "error": msg
        }

    extracted_fields: Dict[str, str] = {}
    raw_values: Dict[str, str] = {}
    confidence: Dict[str, str] = {}
    ambiguous_fields: List[str] = []
    review_reasons: Dict[str, str] = {}

    lines = cleaned_full_text.splitlines()

    for field_key, patterns in FIELD_PATTERNS.items():
        matches_found: List[str] = []

        # Check line by line first (prevents any cross-line match)
        for line in lines:
            line_str = line.strip()
            if not line_str:
                continue
            for pat in patterns:
                m = re.search(pat, line_str, flags=re.IGNORECASE)
                if m:
                    cand = _clean_field_value(m.group(1))
                    if cand and cand not in matches_found:
                        matches_found.append(cand)

        # If not found line-by-line, search across full text with multiline flag
        if not matches_found:
            for pat in patterns:
                for m in re.finditer(pat, cleaned_full_text, flags=re.IGNORECASE | re.MULTILINE):
                    cand = _clean_field_value(m.group(1))
                    if cand and cand not in matches_found:
                        matches_found.append(cand)

        if not matches_found:
            continue

        raw_val = matches_found[0]
        raw_values[field_key] = raw_val

        # Check for ambiguity: multiple conflicting values
        if len(matches_found) > 1 and len(set(m.lower() for m in matches_found)) > 1:
            confidence[field_key] = "ambiguous"
            ambiguous_fields.append(field_key)
            review_reasons[field_key] = f"Multiple conflicting values detected: {', '.join(matches_found[:3])}"
        else:
            confidence[field_key] = "high"

        # Field-specific standardizations
        if field_key in ("delivery_date", "expected_dispatch_date"):
            norm_date, ok = parse_date_value(raw_val)
            if ok:
                extracted_fields[field_key] = norm_date
            else:
                # Keep raw value, mark ambiguous
                extracted_fields[field_key] = raw_val
                confidence[field_key] = "ambiguous"
                if field_key not in ambiguous_fields:
                    ambiguous_fields.append(field_key)
                review_reasons[field_key] = f"Could not unambiguously parse date '{raw_val}'. Please verify."
        elif field_key == "shipping_method":
            val_upper = raw_val.upper()
            if "PAID" in val_upper and "TO PAY" not in val_upper and "NOT" not in val_upper:
                extracted_fields[field_key] = "PAID"
            elif "TO PAY" in val_upper or "TOPAY" in val_upper or "COLLECT" in val_upper:
                extracted_fields[field_key] = "TO PAY"
            else:
                extracted_fields[field_key] = raw_val
        elif field_key == "shipping_term":
            val_upper = raw_val.upper()
            if "DOOR" in val_upper:
                extracted_fields[field_key] = "DOOR DELIVERY"
            elif "EX-WORKS" in val_upper or "EX WORKS" in val_upper or "EXWORKS" in val_upper:
                extracted_fields[field_key] = "Ex-Works"
            elif "FOR" in val_upper:
                extracted_fields[field_key] = "FOR Site"
            else:
                extracted_fields[field_key] = raw_val
        elif field_key == "ship_via":
            val_upper = raw_val.upper()
            if val_upper in ("ROAD", "BY ROAD", "BY-ROAD"):
                extracted_fields[field_key] = "By Road"
            elif val_upper in ("FOR", "F.O.R."):
                extracted_fields[field_key] = "FOR"
            elif "COURIER" in val_upper:
                extracted_fields[field_key] = "Courier"
            elif "AIR" in val_upper:
                extracted_fields[field_key] = "Air Freight"
            elif "TRAIN" in val_upper or "RAIL" in val_upper:
                extracted_fields[field_key] = "Train"
            else:
                extracted_fields[field_key] = raw_val
        else:
            extracted_fields[field_key] = raw_val

    # Create readable snippet (first 600 characters)
    snippet = cleaned_full_text[:600]
    if len(cleaned_full_text) > 600:
        snippet += "..."

    return {
        "success": True,
        "filename": filename,
        "format": doc_format,
        "is_scanned": False,
        "extracted_fields": extracted_fields,
        "raw_values": raw_values,
        "confidence": confidence,
        "ambiguous_fields": ambiguous_fields,
        "review_reasons": review_reasons,
        "text_snippet": snippet,
        "error": None
    }
