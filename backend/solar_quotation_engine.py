"""
Solarix Solar Quotation / Proposal Engine
Faithful generator for S1 and S2 Word (.docx / .dotx) proposal templates.
Preserves original template fonts, styling, layout, tables, graphics, drawings, and headers/footers.
"""

import io
import os
import re
import copy
import logging
import zipfile
import subprocess
import tempfile
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

import docx
import docx.document
import docx.text.paragraph
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT

logger = logging.getLogger(__name__)

# Template paths
BASE_DIR = Path(__file__).parent
TEMPLATES_DIR = BASE_DIR / "templates" / "quotation"
EXTERNAL_TEMPLATES_DIR = Path("/Users/mac/P-SOLARIX")


def _resolve_template_path(template_name: str) -> Path:
    """Finds the template file (prefers .docx, then .dotx in local or external dir)."""
    clean_name = template_name.upper().strip()
    if not clean_name.startswith("S"):
        clean_name = "S1"

    candidates = [
        TEMPLATES_DIR / f"{clean_name}.docx",
        TEMPLATES_DIR / f"{clean_name}.dotx",
        EXTERNAL_TEMPLATES_DIR / f"{clean_name}.docx",
        EXTERNAL_TEMPLATES_DIR / f"{clean_name}.dotx",
    ]
    for p in candidates:
        if p.exists() and p.stat().st_size > 0:
            return p
    raise FileNotFoundError(f"Quotation template {clean_name} not found in {TEMPLATES_DIR} or {EXTERNAL_TEMPLATES_DIR}")


def _load_document(template_path: Path) -> Any:
    """Loads a .docx or .dotx document into python-docx."""
    with open(template_path, "rb") as f:
        file_bytes = f.read()

    # If it is a .dotx, normalize [Content_Types].xml in-memory so python-docx can open it
    if template_path.suffix.lower() == ".dotx":
        in_zip = zipfile.ZipFile(io.BytesIO(file_bytes))
        out_buf = io.BytesIO()
        out_zip = zipfile.ZipFile(out_buf, "w", compression=zipfile.ZIP_DEFLATED)
        for item in in_zip.infolist():
            content = in_zip.read(item.filename)
            if item.filename == "[Content_Types].xml":
                content = content.replace(
                    b"application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml",
                    b"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
                )
            out_zip.writestr(item, content)
        out_zip.close()
        out_buf.seek(0)
        return Document(out_buf)

    return Document(io.BytesIO(file_bytes))


def format_indian_number(n: Any, show_decimals: bool = False) -> str:
    """Formats a number into standard Indian comma notation (e.g., 2,60,000)."""
    try:
        if n is None or str(n).strip() == "":
            return "0"
        val = float(str(n).replace(",", "").strip())
    except (ValueError, TypeError):
        return str(n)

    is_neg = val < 0
    val = abs(val)
    int_part = int(val)
    dec_part = f"{val - int_part:.2f}"[1:] if show_decimals else ""
    s = str(int_part)
    if len(s) <= 3:
        res = s
    else:
        last3 = s[-3:]
        rest = s[:-3]
        groups = []
        while len(rest) > 2:
            groups.insert(0, rest[-2:])
            rest = rest[:-2]
        if rest:
            groups.insert(0, rest)
        res = ",".join(groups) + "," + last3
    result = ("-" if is_neg else "") + res + dec_part
    return result


def format_inr(n: Any) -> str:
    """Returns Indian Rupee formatted string without ₹ symbol (for in-document use)."""
    formatted = format_indian_number(n)
    return formatted


def number_to_words_inr(amount: float) -> str:
    """Converts a numeric amount into Indian Currency words (Rupees ... Only)."""
    try:
        val = round(float(amount))
    except Exception:
        return ""

    if val == 0:
        return "Rupees Zero Only"

    units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
             "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
             "Seventeen", "Eighteen", "Nineteen"]
    tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

    def convert_upto_thousand(n):
        res = ""
        if n >= 100:
            res += units[n // 100] + " Hundred "
            n %= 100
        if n >= 20:
            res += tens[n // 10] + " " + units[n % 10] + " "
        elif n > 0:
            res += units[n] + " "
        return res.strip()

    words = ""
    crore = val // 10_000_000
    val %= 10_000_000
    lakh = val // 100_000
    val %= 100_000
    thousand = val // 1000
    val %= 1000
    rest = val

    if crore:
        words += convert_upto_thousand(crore) + " Crore "
    if lakh:
        words += convert_upto_thousand(lakh) + " Lakh "
    if thousand:
        words += convert_upto_thousand(thousand) + " Thousand "
    if rest:
        words += convert_upto_thousand(rest)

    return f"Rupees {words.strip()} Only"


def _set_cell_background(cell, hex_color: str):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_color)
    tcPr.append(shd)


def _set_cell_borders(cell, top="CBD5E1", bottom="CBD5E1", left="none", right="none"):
    tcPr = cell._tc.get_or_add_tcPr()
    tcBorders = OxmlElement('w:tcBorders')
    for side, col in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{side}')
        if col == "none":
            node.set(qn('w:val'), 'none')
        else:
            node.set(qn('w:val'), 'single')
            node.set(qn('w:sz'), '4')
            node.set(qn('w:space'), '0')
            node.set(qn('w:color'), col)
        tcBorders.append(node)
    tcPr.append(tcBorders)


def _set_cell_margins(cell, top=120, bottom=120, left=160, right=160):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)


def _apply_replacements_to_paragraph(p: Any, replacements: Dict[str, str]):
    """
    Substitutes placeholder strings inside a paragraph run-by-run.
    Handles exact guillemet placeholders «...» cleanly while preserving run formatting.
    Also handles split-run placeholders (where «TAG starts in one run and » closes in another).
    """
    text = p.text
    if "«" not in text:
        return

    # Pass 1: Run-level substitution (preserves font, bold, color, size)
    for k, v in replacements.items():
        if k in text:
            for r in p.runs:
                if k in r.text:
                    r.text = r.text.replace(k, v)

    # Refresh text after pass 1
    text = p.text

    # Pass 2: If «...» placeholder spans multiple runs, rebuild paragraph text
    if "«" in text:
        updated = text
        for k, v in replacements.items():
            if k in updated:
                updated = updated.replace(k, v)
        if updated != text:
            # Preserve first run formatting and set text on paragraph
            if p.runs:
                first_run = p.runs[0]
                fmt = {
                    "name": first_run.font.name,
                    "size": first_run.font.size,
                    "bold": first_run.bold,
                }
                p.clear()
                r = p.add_run(updated)
                if fmt["name"]:
                    r.font.name = fmt["name"]
                if fmt["size"]:
                    r.font.size = fmt["size"]
                if fmt["bold"]:
                    r.bold = fmt["bold"]
            else:
                p.text = updated

    # Pass 3: Handle split-run placeholders where the open «TAG and the close » are in DIFFERENT runs
    # e.g. run1.text == "«BOS Warranty" and run2.text == "» more text"
    # We join consecutive runs and check for cross-run placeholders
    runs = p.runs
    if len(runs) > 1 and "«" in p.text:
        # Build a combined run-text map
        combined = "".join(r.text for r in runs)
        new_combined = combined
        for k, v in replacements.items():
            if k in new_combined:
                new_combined = new_combined.replace(k, v)
        if new_combined != combined and p.runs:
            # Set only the first run to the combined text and clear the rest
            p.runs[0].text = new_combined
            for r in p.runs[1:]:
                r.text = ""


def _apply_replacements_in_xml(element: Any, replacements: Dict[str, str]):
    """
    Applies replacements directly to all w:t nodes in an XML element subtree.
    Handles cases where placeholders span merged text nodes (e.g., in shapes/textboxes).
    """
    W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

    for t_node in element.iter("{%s}t" % W_NS):
        if t_node.text:
            for k, v in replacements.items():
                if k in t_node.text:
                    t_node.text = t_node.text.replace(k, v)

    # Also handle partially-split placeholders by scanning w:p nodes
    for p_elem in element.iter("{%s}p" % W_NS):
        t_nodes = list(p_elem.iter("{%s}t" % W_NS))
        if not t_nodes:
            continue
        combined = "".join(t.text or "" for t in t_nodes)
        if "«" not in combined:
            continue
        new_combined = combined
        for k, v in replacements.items():
            if k in new_combined:
                new_combined = new_combined.replace(k, v)
        if new_combined != combined:
            # Put all text in first t_node, clear the rest
            t_nodes[0].text = new_combined
            for t in t_nodes[1:]:
                t.text = ""



def _build_payment_terms_table(doc: Any, payment_terms: List[Dict[str, Any]], total_cost: float):
    """Creates a beautifully formatted Payment Terms table."""
    headers = ["Milestone / Stage", "Percentage", "Amount (₹)", "Payment Condition / Terms"]
    col_widths = [Inches(1.8), Inches(1.1), Inches(1.4), Inches(2.7)]

    table = doc.add_table(rows=len(payment_terms) + 1, cols=4)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    # Header Row
    hdr_cells = table.rows[0].cells
    for i, title in enumerate(headers):
        hdr_cells[i].text = title
        _set_cell_background(hdr_cells[i], "0F172A")
        _set_cell_margins(hdr_cells[i], top=140, bottom=140, left=160, right=160)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.RIGHT if i in (1, 2) else WD_ALIGN_PARAGRAPH.LEFT
        for r in p.runs:
            r.font.name = "Arial"
            r.font.size = Pt(8.5)
            r.font.bold = True
            r.font.color.rgb = RGBColor(255, 255, 255)

    # Data Rows
    for row_idx, item in enumerate(payment_terms):
        row_cells = table.rows[row_idx + 1].cells
        pct_val = float(item.get("percent") or 0)
        amount_val = item.get("amount")
        if amount_val is None or str(amount_val).strip() == "" or amount_val == 0:
            amount_val = round((total_cost * pct_val) / 100)

        bg_col = "F8FAFC" if row_idx % 2 == 1 else "FFFFFF"

        values = [
            str(item.get("stage") or f"Stage {row_idx + 1}"),
            f"{pct_val:g}%",
            format_inr(amount_val),
            str(item.get("description") or item.get("terms") or "As per agreement")
        ]

        for col_idx, val in enumerate(values):
            row_cells[col_idx].text = val
            _set_cell_background(row_cells[col_idx], bg_col)
            _set_cell_borders(row_cells[col_idx], top="E2E8F0", bottom="E2E8F0")
            _set_cell_margins(row_cells[col_idx], top=100, bottom=100, left=140, right=140)
            p = row_cells[col_idx].paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT if col_idx in (1, 2) else WD_ALIGN_PARAGRAPH.LEFT
            for r in p.runs:
                r.font.name = "Arial"
                r.font.size = Pt(8.5)
                if col_idx in (0, 2):
                    r.font.bold = True
                    r.font.color.rgb = RGBColor(15, 23, 42)
                else:
                    r.font.color.rgb = RGBColor(51, 65, 85)

    # Set column widths
    for row in table.rows:
        for idx, width in enumerate(col_widths):
            row.cells[idx].width = width

    return table


def _build_bom_table(doc: Any, bom_items: List[Dict[str, Any]]):
    """Creates a professional Bill of Materials (BOM) table."""
    headers = ["Sr.", "Item Name & Specification", "Make / Brand", "Qty", "Unit"]
    col_widths = [Inches(0.5), Inches(3.2), Inches(1.8), Inches(0.8), Inches(0.7)]

    table = doc.add_table(rows=len(bom_items) + 1, cols=5)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    hdr_cells = table.rows[0].cells
    for i, title in enumerate(headers):
        hdr_cells[i].text = title
        _set_cell_background(hdr_cells[i], "0F172A")
        _set_cell_margins(hdr_cells[i], top=140, bottom=140, left=140, right=140)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.RIGHT if i == 3 else (WD_ALIGN_PARAGRAPH.CENTER if i in (0, 4) else WD_ALIGN_PARAGRAPH.LEFT)
        for r in p.runs:
            r.font.name = "Arial"
            r.font.size = Pt(8.5)
            r.font.bold = True
            r.font.color.rgb = RGBColor(255, 255, 255)

    for row_idx, item in enumerate(bom_items):
        row_cells = table.rows[row_idx + 1].cells
        bg_col = "F8FAFC" if row_idx % 2 == 1 else "FFFFFF"

        name_spec = str(item.get("item") or "")
        spec = str(item.get("specification") or item.get("description") or "").strip()
        if spec and spec.lower() != name_spec.lower():
            name_spec = f"{name_spec} — {spec}"

        values = [
            str(row_idx + 1),
            name_spec,
            str(item.get("make") or item.get("brand") or "Tier-1 Standard"),
            str(item.get("quantity") or item.get("qty") or "1"),
            str(item.get("unit") or "Nos"),
        ]

        for col_idx, val in enumerate(values):
            row_cells[col_idx].text = val
            _set_cell_background(row_cells[col_idx], bg_col)
            _set_cell_borders(row_cells[col_idx], top="E2E8F0", bottom="E2E8F0")
            _set_cell_margins(row_cells[col_idx], top=100, bottom=100, left=120, right=120)
            p = row_cells[col_idx].paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT if col_idx == 3 else (WD_ALIGN_PARAGRAPH.CENTER if col_idx in (0, 4) else WD_ALIGN_PARAGRAPH.LEFT)
            for r in p.runs:
                r.font.name = "Arial"
                r.font.size = Pt(8.0)
                if col_idx == 1:
                    r.font.bold = True
                    r.font.color.rgb = RGBColor(15, 23, 42)
                else:
                    r.font.color.rgb = RGBColor(51, 65, 85)

    for row in table.rows:
        for idx, width in enumerate(col_widths):
            row.cells[idx].width = width

    return table


def _build_timeline_table(doc: Any, timeline_items: List[Dict[str, Any]]) -> Any:
    """Creates a clean Project Timeline table."""
    headers = ["#", "Project Stage / Milestone", "Target Duration"]
    col_widths = [Inches(0.5), Inches(4.2), Inches(2.3)]

    table = doc.add_table(rows=len(timeline_items) + 1, cols=3)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    hdr_cells = table.rows[0].cells
    for i, title in enumerate(headers):
        hdr_cells[i].text = title
        _set_cell_background(hdr_cells[i], "1E3A5F")
        _set_cell_margins(hdr_cells[i], top=120, bottom=120, left=140, right=140)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER if i == 0 else WD_ALIGN_PARAGRAPH.LEFT
        for r in p.runs:
            r.font.name = "Arial"
            r.font.size = Pt(8.5)
            r.font.bold = True
            r.font.color.rgb = RGBColor(255, 255, 255)

    for row_idx, item in enumerate(timeline_items):
        row_cells = table.rows[row_idx + 1].cells
        bg_col = "F0F4FF" if row_idx % 2 == 0 else "FFFFFF"

        seq = str(item.get("sequence") or item.get("seq") or row_idx + 1)
        stage = str(item.get("stage") or item.get("milestone") or f"Stage {row_idx + 1}")
        duration = str(item.get("duration") or item.get("days") or "TBD")

        values = [seq, stage, duration]
        for col_idx, val in enumerate(values):
            row_cells[col_idx].text = val
            _set_cell_background(row_cells[col_idx], bg_col)
            _set_cell_borders(row_cells[col_idx], top="CBD5E1", bottom="CBD5E1")
            _set_cell_margins(row_cells[col_idx], top=90, bottom=90, left=130, right=130)
            p = row_cells[col_idx].paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if col_idx == 0 else WD_ALIGN_PARAGRAPH.LEFT
            for r in p.runs:
                r.font.name = "Arial"
                r.font.size = Pt(8.5)
                if col_idx == 1:
                    r.font.bold = True
                    r.font.color.rgb = RGBColor(15, 23, 42)
                else:
                    r.font.color.rgb = RGBColor(51, 65, 85)

    for row in table.rows:
        for idx, width in enumerate(col_widths):
            row.cells[idx].width = width

    return table


def _build_bank_details_block(doc: Any, bank_details: Dict[str, Any], company_name: str) -> Any:
    """Generates a clean paragraph block for bank transfer details."""
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(8)
    p.paragraph_format.line_spacing = 1.25

    items = [
        ("Account Name", bank_details.get("account_name") or company_name),
        ("Bank Name", bank_details.get("bank_name") or "HDFC Bank Ltd"),
        ("Account Number", bank_details.get("account_number") or "50200000000000"),
        ("IFSC Code", bank_details.get("ifsc") or bank_details.get("ifsc_code") or "HDFC0000001"),
        ("Branch", bank_details.get("branch") or "Main Branch"),
    ]

    for label, val in items:
        r_lbl = p.add_run(f"•  {label}: ")
        r_lbl.font.name = "Arial"
        r_lbl.font.size = Pt(8.5)
        r_lbl.font.bold = True
        r_lbl.font.color.rgb = RGBColor(15, 23, 42)

        r_val = p.add_run(f"{val}    ")
        r_val.font.name = "Arial"
        r_val.font.size = Pt(8.5)
        r_val.font.color.rgb = RGBColor(51, 65, 85)

    return p


def _build_list_block(doc: Any, items: List[str], numbered: bool = False) -> List[Any]:
    """Appends styled bullet/numbered paragraphs."""
    paras = []
    for idx, item in enumerate(items):
        text = item.strip()
        if not text:
            continue
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(2)
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.line_spacing = 1.15
        p.paragraph_format.left_indent = Inches(0.25)

        prefix = f"{idx + 1}.  " if numbered else "•  "
        r_pre = p.add_run(prefix)
        r_pre.font.name = "Arial"
        r_pre.font.size = Pt(8.5)
        r_pre.font.bold = True
        r_pre.font.color.rgb = RGBColor(2, 132, 199) if not numbered else RGBColor(15, 23, 42)

        r_txt = p.add_run(text)
        r_txt.font.name = "Arial"
        r_txt.font.size = Pt(8.5)
        r_txt.font.color.rgb = RGBColor(51, 65, 85)
        paras.append(p)
    return paras


def generate_quotation_docx(quotation_data: Dict[str, Any], company_data: Dict[str, Any], template_type: str = "S1") -> bytes:
    """
    Generates a production-quality Word DOCX document from the centralized quotation object.
    Preserves 100% of the Word template structure, graphics, and styling.
    """
    tpl_type = (template_type or quotation_data.get("template") or "S1").upper().strip()
    if tpl_type not in ("S1", "S2"):
        tpl_type = "S1"

    template_path = _resolve_template_path(tpl_type)
    doc = _load_document(template_path)

    # 1. Extract and canonicalize data from centralized quotation data model
    cust = quotation_data.get("customer") or {}
    comp = quotation_data.get("company") or {}
    proj = quotation_data.get("project") or {}
    sys_data = quotation_data.get("solar_system") or quotation_data.get("solarSystem") or {}
    panel = sys_data.get("panel") or {}
    inv = sys_data.get("inverter") or {}
    cable = sys_data.get("cable") or {}
    struct = sys_data.get("structure") or {}
    bos = sys_data.get("bos") or {}
    fin = quotation_data.get("financials") or {}
    comm = quotation_data.get("commercial") or {}

    # Company fallbacks
    c_name = comp.get("name") or company_data.get("company_name") or company_data.get("name") or "GVP Solar"
    c_poc = comp.get("poc") or company_data.get("owner_name") or "Solar Solutions Manager"
    c_phone = comp.get("phone") or company_data.get("mobile") or company_data.get("phone") or "+91 98765 43210"
    c_mail = comp.get("email") or company_data.get("email") or "info@gvpsolar.com"
    c_addr = comp.get("address") or company_data.get("address") or "Pune, Maharashtra"
    c_gst = comp.get("gst") or comp.get("gst_number") or company_data.get("gst_number") or ""

    # Customer
    cust_name = cust.get("name") or quotation_data.get("customer_name") or "Valued Customer"
    cust_addr = cust.get("address") or quotation_data.get("address") or "Site Address, India"
    cust_phone = cust.get("phone") or quotation_data.get("mobile") or "—"
    cust_mail = cust.get("email") or quotation_data.get("email") or "—"

    # Reference & Date
    ref_no = quotation_data.get("reference_no") or quotation_data.get("quote_number") or "GVP/QTN/2026/0001"
    quote_date = quotation_data.get("date") or quotation_data.get("quote_date") or "29-09-2026"

    # Project
    raw_size_kw = proj.get("size_kw") or proj.get("sizeKW") or quotation_data.get("system_kw") or 100
    try:
        size_kw_num = float(raw_size_kw)
    except (ValueError, TypeError):
        size_kw_num = 100.0
    size_kw_str = f"{size_kw_num:g} kW"

    struct_type = proj.get("structure_type") or proj.get("structureType") or "HDGI Elevated Rooftop"
    sys_type = proj.get("system_type") or proj.get("systemType") or "Grid Connected Solar PV System"

    # Financials / Calculations
    price_per_kw = float(comm.get("price_per_kw") or comm.get("pricePerKW") or fin.get("price_per_kw") or 2600)
    calc_project_cost = round(size_kw_num * price_per_kw) if price_per_kw > 0 else 260000
    project_cost = float(comm.get("price") or comm.get("total_cost") or fin.get("project_cost") or calc_project_cost)

    payback_years = fin.get("payback_years") or fin.get("paybackYears") or 3.5
    try:
        payback_str = f"{float(payback_years):.1f}"
    except Exception:
        payback_str = str(payback_years)

    annual_gen = fin.get("annual_generation") or fin.get("annualGeneration") or round(size_kw_num * 1500)
    annual_saving = fin.get("annual_saving") or fin.get("annualSaving") or round(float(annual_gen) * 8.0)
    tree_saved = fin.get("tree_saved") or fin.get("treeSaved") or round(size_kw_num * 16)
    co2_red = fin.get("co2_reduction") or fin.get("co2Reduction") or round(size_kw_num * 1.4)

    # Equipment specs
    panel_wp = panel.get("watt_peak") or panel.get("wattPeak") or "590 Wp"
    if str(panel_wp).replace(".", "").isdigit():
        panel_wp = f"{panel_wp} Wp"
    panel_qty = str(panel.get("quantity") or panel.get("panelQuantity") or "170")
    panel_make = panel.get("make") or panel.get("brand") or "Adani Solar / Waaree"
    panel_type = panel.get("type") or "Mono PERC Bifacial"
    panel_warranty = panel.get("warranty") or "12 Years Product / 25 Years Performance"

    inv_size = inv.get("size_kw") or inv.get("sizeKW") or f"{size_kw_num:g} kW"
    if str(inv_size).replace(".", "").isdigit():
        inv_size = f"{inv_size} kW"
    inv_qty = str(inv.get("quantity") or "1")
    inv_make = inv.get("make") or inv.get("brand") or "Solis / Sungrow"
    inv_phase = inv.get("phase") or "Three Phase"
    inv_warranty = inv.get("warranty") or "5 Years Standard On-Site Warranty"

    cable_make = cable.get("make") or cable.get("brand") or "Polycab / Havells"
    cable_ac = cable.get("ac") or "4C x 50 sq.mm Aluminium Armoured Cable"
    cable_dc = cable.get("dc") or "1C x 4/6 sq.mm Copper Solar DC Cable"

    struct_desc = struct.get("description") or "HDGI Elevated Rooftop Structure with Stainless Steel Fasteners"
    bos_desc = bos.get("description") or "Complete ACDB, DCDB, Earthing Electrodes & Lightning Protection"
    bos_warranty = bos.get("warranty") or "5 Years Complete Balance of System Warranty"

    # 2. Build the Replacement Dictionary — ALL placeholders found in S1 & S2
    replacements = {
        # Core identity
        "«Reference No.»": ref_no,
        "«Date»": quote_date,
        "«Project Size (kW)»": size_kw_str,
        # Customer
        "«Customer Name»": cust_name,
        "«Customer Address»": cust_addr,
        "«Customer Phone»": cust_phone,
        "«Customer Mail»": cust_mail,
        # Company
        "«Company Name»": c_name,
        "«Company Address»": c_addr,
        "«Company Phone»": c_phone,
        "«Company Mail»": c_mail,
        "«Company POC»": c_poc,
        "«Company GST»": c_gst,
        # Project
        "«Structure Type»": struct_type,
        "«Type»": sys_type,
        # Financials
        "«Pay Back Period»": payback_str,
        "«Annual Generation»": format_indian_number(annual_gen),
        "«Annual Saving»": format_indian_number(annual_saving),
        "«Project Cost»": format_indian_number(project_cost),
        "«Tree Saved»": format_indian_number(tree_saved),
        "«Co2 Reduction»": format_indian_number(co2_red),
        # S2 equipment placeholders (also appear in drawing XML text nodes)
        "«Watt Peak»": panel_wp,
        "«No. of Panels»": panel_qty,
        "«Panel Make/Brand»": panel_make,
        "«Panel Type»": panel_type,
        "«Panel Warranty»": panel_warranty,
        "«Size (kW)»": inv_size,
        "«Quantity»": inv_qty,
        "«Inverter Make/Brand»": inv_make,
        "«Phase»": inv_phase,
        "«Inverter Warranty»": inv_warranty,
        "«Cable Make/Brand»": cable_make,
        "«AC»": cable_ac,
        "«DC»": cable_dc,
        "«Structure Description»": struct_desc,
        # BOS Warranty — appears WITHOUT closing » in S2 XML runs (split across paragraphs)
        # Map both full form and the partial form that appears in raw runs
        "«BOS Warranty»": bos_warranty,
        "«BOS Warranty": bos_warranty,   # partial without closing »
    }

    # 3. Replace placeholders across all paragraphs
    for p in doc.paragraphs:
        _apply_replacements_to_paragraph(p, replacements)

    # 4. Replace placeholders in all table cells
    for t in doc.tables:
        for row in t.rows:
            for cell in row.cells:
                for p in cell.paragraphs:
                    _apply_replacements_to_paragraph(p, replacements)

    # 5. Replace in all drawing/shape XML (textboxes, SmartArt, etc.)
    _apply_replacements_in_xml(doc.element, replacements)



    # 6. Populate Dynamic Sections by matching paragraph anchor text
    # Build default dynamic data
    payment_terms = comm.get("payment_terms") or comm.get("paymentTerms") or [
        {"stage": "Advance / Booking", "percent": 20, "description": "Along with purchase order & engineering sign-off"},
        {"stage": "Material Delivery", "percent": 60, "description": "Upon delivery of solar panels, inverter & structure at site"},
        {"stage": "Installation", "percent": 15, "description": "Upon completion of mechanical & electrical installation"},
        {"stage": "Commissioning", "percent": 5, "description": "Upon final testing, inspection & net-metering commissioning"},
    ]

    bom_items = quotation_data.get("bom") or quotation_data.get("bill_of_material") or [
        {"item": "Solar PV Modules", "specification": f"{panel_wp} {panel_type}", "make": panel_make, "quantity": panel_qty, "unit": "Nos"},
        {"item": "Grid-Tied Solar Inverter", "specification": f"{inv_size} {inv_phase}", "make": inv_make, "quantity": inv_qty, "unit": "Nos"},
        {"item": "Module Mounting Structure", "specification": struct_type, "make": "Standard Tier-1", "quantity": size_kw_str, "unit": "Set"},
        {"item": "DC Solar Cables", "specification": cable_dc, "make": cable_make, "quantity": "1", "unit": "Lot"},
        {"item": "AC Power Cables", "specification": cable_ac, "make": cable_make, "quantity": "1", "unit": "Lot"},
        {"item": "AC & DC Distribution Boxes", "specification": "With SPD & MCB Protection", "make": "Standard", "quantity": "1", "unit": "Set"},
        {"item": "Earthing & Lightning Arrestor", "specification": "Copper Bonded Chemical Earthing", "make": "Standard", "quantity": "1", "unit": "Set"},
        {"item": "Balance of System & Monitoring", "specification": bos_desc, "make": "Standard", "quantity": "1", "unit": "Lot"},
    ]

    bank_details = comm.get("bank_details") or comm.get("bankDetails") or {
        "account_name": c_name,
        "bank_name": "HDFC Bank Ltd",
        "account_number": "50200012345678",
        "ifsc": "HDFC0001234",
        "branch": "Main Commercial Branch"
    }

    timeline_items = quotation_data.get("timeline") or [
        {"sequence": 1, "stage": "Finalization of Design and Drawings", "duration": "7 Days"},
        {"sequence": 2, "stage": "Engineering, Procurement, and Supply of Material", "duration": "15 Days"},
        {"sequence": 3, "stage": "Solar Plant Installation", "duration": "20 Days"},
        {"sequence": 4, "stage": "Commissioning and Testing", "duration": "14 Days"},
    ]

    scope_items = quotation_data.get("scope_of_work") or quotation_data.get("scopeOfWork") or [
        "Site feasibility assessment, 3D shadow analysis, and detailed engineering design.",
        "Supply and delivery of Tier-1 Solar PV modules, inverter, and HDGI mounting structures.",
        "Complete mechanical assembly and civil foundation installation on designated roof area.",
        "DC and AC electrical cabling, inverter connections, distribution boards, and safety switches.",
        "Dedicated chemical earthing pits and high-grade lightning protection system installation.",
        "Pre-commissioning testing, insulation checks, and system quality assurance.",
        "Full documentation and assistance for DISCOM Net-Metering application and sanction.",
        "Integration of remote smartphone / web data monitoring portal and project handover.",
    ]

    terms_items = quotation_data.get("terms_and_conditions") or quotation_data.get("termsAndConditions") or [
        "Quotation Validity: This commercial offer is valid for 15 days from the date of quotation.",
        "Payment Terms: Payments shall be released milestone-wise in accordance with the agreed schedule.",
        "Site Readiness: The client shall ensure clear rooftop access, construction power, and water supply.",
        "Statutory Clearances: DISCOM net-metering approvals are subject to utility and CEIG timelines.",
        "Equipment Warranties: Module: 12-yr product / 25-yr performance; Inverter: 5-yr; Structure: 5-yr.",
        "Taxes & Levies: GST and applicable statutory duties are included as specified in the commercial offer.",
        "Force Majeure: Standard industry force majeure clauses apply to unpreventable natural delays.",
    ]

    # Inject dynamic content by matching paragraph anchor text
    paragraphs = list(doc.paragraphs)
    for i, p in enumerate(paragraphs):
        p_text = p.text.strip()
        # Normalize HTML entities that appear in template (e.g. &amp; -> &)
        p_text_norm = p_text.replace("&amp;", "&")

        # --- Commercial price summary (appears before payment table) ---
        if "Price Quote" in p_text and "Payment schedule" in p_text:
            p_price = doc.add_paragraph()
            p_price.paragraph_format.space_before = Pt(4)
            p_price.paragraph_format.space_after = Pt(6)
            run1 = p_price.add_run("System Size: ")
            run1.bold = True
            run1.font.name = "Arial"
            run1.font.size = Pt(9)
            p_price.add_run(f"{size_kw_str}   |   ").font.name = "Arial"
            run2 = p_price.add_run("Rate per kW: ")
            run2.bold = True
            run2.font.name = "Arial"
            run2.font.size = Pt(9)
            r2b = p_price.add_run(f"{format_inr(price_per_kw)}/kW   |   ")
            r2b.font.name = "Arial"
            run3 = p_price.add_run("Total Cost: ")
            run3.bold = True
            run3.font.name = "Arial"
            run3.font.size = Pt(9)
            run3.font.color.rgb = RGBColor(2, 132, 199)
            run4 = p_price.add_run(f"{format_inr(project_cost)} ({number_to_words_inr(project_cost)})")
            run4.bold = True
            run4.font.name = "Arial"
            run4.font.size = Pt(9)
            run4.font.color.rgb = RGBColor(2, 132, 199)
            p._p.addnext(p_price._p)

        # --- Payment Terms table ---
        elif p_text_norm == "Payment Terms:":
            tbl = _build_payment_terms_table(doc, payment_terms, project_cost)
            p._p.addnext(tbl._tbl)

        # --- Bank / Account details ---
        elif p_text_norm in ("Account Details:", "Bank Details:"):
            p_bank = _build_bank_details_block(doc, bank_details, c_name)
            p._p.addnext(p_bank._p)

        # --- Bill of Material (S1 only — S2 doesn't have a BOM section) ---
        elif p_text_norm == "Bill of Material" and tpl_type == "S1":
            tbl_bom = _build_bom_table(doc, bom_items)
            p._p.addnext(tbl_bom._tbl)

        # --- Scope of Work ---
        elif p_text_norm == "Scope of Work":
            paras_block = _build_list_block(doc, scope_items, numbered=False)
            curr = p
            for sp in paras_block:
                curr._p.addnext(sp._p)
                curr = sp

        # --- Terms & Conditions (both S1 "Terms & Conditions" and S2 "General Terms & Conditions") ---
        elif p_text_norm in ("Terms & Conditions", "General Terms & Conditions", "Terms &amp; Conditions", "General Terms &amp; Conditions"):
            paras_block = _build_list_block(doc, terms_items, numbered=True)
            curr = p
            for tp in paras_block:
                curr._p.addnext(tp._p)
                curr = tp

    # 7. Final Quality Assertion: Check for any remaining unresolved «...»
    unresolved = []
    for p in doc.paragraphs:
        matches = re.findall(r'«[^»]+»?', p.text)
        for m in matches:
            if m.startswith("«"):
                unresolved.append(m)

    if unresolved:
        logger.warning(f"Unresolved placeholders in {tpl_type}: {set(unresolved)}")
        # Clean up any leftover stray guillemets gracefully
        for p in doc.paragraphs:
            if "«" in p.text:
                cleaned = re.sub(r'«[^»]*»?', '', p.text)
                if p.runs:
                    p.runs[0].text = cleaned
                    for r in p.runs[1:]:
                        r.text = ""

        # Also clean in XML text nodes
        for t_node in doc.element.xpath('.//w:t', namespaces={'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}):
            if t_node.text and "«" in t_node.text:
                t_node.text = re.sub(r'«[^»]*»?', '', t_node.text)

    # 8. Save to Bytes
    out_buf = io.BytesIO()
    doc.save(out_buf)
    return out_buf.getvalue()


def generate_quotation_pdf(quotation_data: Dict[str, Any], company_data: Dict[str, Any], template_type: str = "S1") -> bytes:
    """
    Generates a PDF by first creating the DOCX and then converting via LibreOffice.
    Returns PDF bytes on success, raises RuntimeError if conversion fails.
    """
    docx_bytes = generate_quotation_docx(quotation_data, company_data, template_type)

    with tempfile.TemporaryDirectory() as tmpdir:
        docx_path = Path(tmpdir) / "quotation.docx"
        pdf_path = Path(tmpdir) / "quotation.pdf"
        docx_path.write_bytes(docx_bytes)

        # Try LibreOffice headless conversion
        lo_candidates = [
            "libreoffice",
            "soffice",
            "/Applications/LibreOffice.app/Contents/MacOS/soffice",
            "/usr/lib/libreoffice/program/soffice",
        ]
        converted = False
        for lo in lo_candidates:
            try:
                result = subprocess.run(
                    [lo, "--headless", "--convert-to", "pdf", "--outdir", tmpdir, str(docx_path)],
                    capture_output=True,
                    timeout=60,
                )
                if result.returncode == 0 and pdf_path.exists():
                    converted = True
                    break
            except (FileNotFoundError, subprocess.TimeoutExpired):
                continue

        if converted and pdf_path.exists():
            return pdf_path.read_bytes()

        # Fallback: try docx2pdf if installed
        try:
            from docx2pdf import convert as d2p_convert
            d2p_convert(str(docx_path), str(pdf_path))
            if pdf_path.exists():
                return pdf_path.read_bytes()
        except ImportError:
            pass
        except Exception as e:
            logger.warning(f"docx2pdf conversion failed: {e}")

    raise RuntimeError(
        "PDF conversion failed: LibreOffice is not installed or not found. "
        "Install with: brew install libreoffice  (macOS) or apt install libreoffice (Linux). "
        "DOCX download is available as an alternative."
    )
