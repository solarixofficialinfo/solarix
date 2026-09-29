"""
Solarix Solar Quotation / Proposal Engine
Faithful generator for S1 and S2 Word (.docx / .dotx) proposal templates.
Preserves original template fonts, styling, layout, graphics, drawings, and headers/footers.
Removes legacy frozen OLE objects (old spreadsheet screenshots) and populates dynamic,
mathematically consistent data from ONE canonical quotation object.
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
    """Returns Indian Rupee formatted string without ₹ symbol."""
    return format_indian_number(n)


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


def _set_cell_margins(cell, top=100, bottom=100, left=140, right=140):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)


def _clean_stale_ole_objects(doc: Any, tpl_type: str):
    """
    Purges legacy frozen OLE objects (old spreadsheet screenshots) from S1 and S2 templates.
    These objects contain stale hardcoded data such as:
    - ICICI Bank Aashiana Lucknow 126005000610
    - Contradictory pricing (352850 / 640000)
    - Stale monthly generation tables (648 units)
    - Legacy terms ('Include lesining charges', 'within days')
    """
    W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    V_NS = "urn:schemas-microsoft-com:vml"

    rels_dict = {}
    for r_id, rel in doc.part.rels.items():
        rels_dict[r_id] = rel.target_ref

    if tpl_type == "S2":
        stale_targets = ["image14.", "image15.", "image17.", "image18.", "image19.", "image22.", "image23."]
    else:
        stale_targets = ["image19.", "image20.", "image21.", "image23.", "image26.", "image28."]

    for p in list(doc.paragraphs):
        objs = list(p._p.iter(f"{{{W_NS}}}object"))
        if objs:
            targets = []
            for img in p._p.iter(f"{{{V_NS}}}imagedata"):
                r_id = img.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
                targets.append(rels_dict.get(r_id, ""))

            is_stale = any(any(st in t for st in stale_targets) for t in targets if t)
            if is_stale:
                parent = p._p.getparent()
                if parent is not None:
                    parent.remove(p._p)


def _set_p_text(p_elem: Any, new_text: str):
    """Sets text in the first w:t node of an XML paragraph and clears remainder."""
    W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    t_nodes = list(p_elem.iter(f"{{{W_NS}}}t"))
    if t_nodes:
        t_nodes[0].text = new_text
        for t in t_nodes[1:]:
            t.text = ""


def _update_timeline_in_drawings(doc: Any, timeline_items: List[Dict[str, Any]], tpl_type: str):
    """
    Updates stage durations and titles inside the vector DrawingML graphic chevrons.
    Ensures user-customized timeline durations (e.g. 20 Days -> 25 Days) are reflected
    directly in the graphical chevrons without distorting the layout.
    """
    W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

    durations = []
    stages = []
    default_durations = ["7 Days", "15 Days", "20 Days", "14 Days"]
    default_stages = [
        "Finalization of Design and Drawings",
        "Engineering, Procurement, and Supply of Material",
        "Solar Plant Installation",
        "Commissioning and Testing"
    ]

    for idx in range(4):
        if idx < len(timeline_items):
            item = timeline_items[idx]
            durations.append(str(item.get("duration") or default_durations[idx]))
            stages.append(str(item.get("stage") or default_stages[idx]))
        else:
            durations.append(default_durations[idx])
            stages.append(default_stages[idx])

    for p in doc.paragraphs:
        w_p_list = list(p._p.iter(f"{{{W_NS}}}p"))
        if len(w_p_list) >= 17:
            if tpl_type == "S2":
                # S2 layout:
                # shape p1..p4 = Stage Titles
                # shape p5..p8 = Stage Durations
                # shape p9..p12 = Shadow Titles
                # shape p13..p16 = Shadow Durations
                for i in range(4):
                    _set_p_text(w_p_list[1 + i], stages[i])
                    _set_p_text(w_p_list[9 + i], stages[i])
                    _set_p_text(w_p_list[5 + i], durations[i])
                    _set_p_text(w_p_list[13 + i], durations[i])
                break
            elif tpl_type == "S1":
                # S1 layout: p1..p4 durations, p8..p11 shadow durations
                for i in range(4):
                    _set_p_text(w_p_list[1 + i], durations[i])
                    _set_p_text(w_p_list[8 + i], durations[i])
                break


def _build_commercial_table(doc: Any, comm_data: Dict[str, Any], size_kw_str: str) -> Any:
    """
    Builds a professional, clean Commercial Pricing & Scope Inclusions table.
    Eliminates all contradictory pricing and aligns 100% with the canonical quotation.
    """
    headers = ["Description / Milestone Item", "Specifications", "Amount (₹)"]
    col_widths = [Inches(3.3), Inches(2.2), Inches(1.5)]

    base_price = comm_data.get("base_price", 0)
    net_meter = comm_data.get("net_meter_charges", 0)
    gst_rate = comm_data.get("gst_rate", 0)
    gst_amount = comm_data.get("gst_amount", 0)
    subsidy = comm_data.get("subsidy", 0)
    final_cost = comm_data.get("final_cost", 0)

    rows_data = [
        ("Complete Solar PV Power Plant (Turnkey EPC)", f"{size_kw_str} Grid Connected Solar PV System", format_inr(base_price)),
        ("Net-Metering Liaisoning & Statutory Approvals", "DISCOM Application, CEIG & Net-Meter Liaisoning", "Included" if net_meter == 0 else format_inr(net_meter)),
        ("Taxes & Statutory Duties", "Goods & Services Tax (GST) Inclusive" if gst_rate == 0 else f"GST @ {gst_rate}%", "Included" if gst_rate == 0 else format_inr(gst_amount)),
    ]
    if subsidy > 0:
        rows_data.append(("Central Government Subsidy / Assistance", "Applicable Central Financial Assistance", f"-{format_inr(subsidy)}"))

    rows_data.append(("Total Project Cost / Net Customer Payable", "All-inclusive Turnkey Price (as per scope)", format_inr(final_cost)))

    table = doc.add_table(rows=len(rows_data) + 1, cols=3)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    # Header Row
    hdr_cells = table.rows[0].cells
    for i, title in enumerate(headers):
        hdr_cells[i].text = title
        _set_cell_background(hdr_cells[i], "0F172A")
        _set_cell_margins(hdr_cells[i], top=110, bottom=110, left=130, right=130)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.RIGHT if i == 2 else WD_ALIGN_PARAGRAPH.LEFT
        for r in p.runs:
            r.font.name = "Arial"
            r.font.size = Pt(8.5)
            r.font.bold = True
            r.font.color.rgb = RGBColor(255, 255, 255)

    for row_idx, (desc, spec, amt) in enumerate(rows_data):
        is_total_row = (row_idx == len(rows_data) - 1)
        row_cells = table.rows[row_idx + 1].cells
        bg_col = "EFF6FF" if is_total_row else ("F8FAFC" if row_idx % 2 == 1 else "FFFFFF")

        for col_idx, val in enumerate([desc, spec, amt]):
            row_cells[col_idx].text = val
            _set_cell_background(row_cells[col_idx], bg_col)
            _set_cell_borders(row_cells[col_idx],
                              top="0284C7" if is_total_row else "CBD5E1",
                              bottom="0284C7" if is_total_row else "CBD5E1")
            _set_cell_margins(row_cells[col_idx], top=80, bottom=80, left=120, right=120)
            p = row_cells[col_idx].paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT if col_idx == 2 else WD_ALIGN_PARAGRAPH.LEFT
            for r in p.runs:
                r.font.name = "Arial"
                r.font.size = Pt(8.5)
                if is_total_row or col_idx == 2:
                    r.font.bold = True
                    r.font.color.rgb = RGBColor(2, 132, 199) if is_total_row else (RGBColor(16, 185, 129) if "Subsidy" in desc else RGBColor(15, 23, 42))
                else:
                    r.font.color.rgb = RGBColor(51, 65, 85)

    for row in table.rows:
        for idx, width in enumerate(col_widths):
            row.cells[idx].width = width

    return table


def _build_monthly_table(doc: Any, monthly_data: List[Dict[str, Any]], annual_gen: float, annual_saving: float) -> Any:
    """
    Builds an elegant 12-Month Generation & Savings Table for S2 (replaces stale 648 table).
    Total generation and total savings match annual summary exactly.
    """
    headers = ["Month", "Solar Irradiance Season", "Estimated Generation (Units)", "Projected Savings (₹)"]
    col_widths = [Inches(1.8), Inches(2.4), Inches(1.4), Inches(1.4)]

    seasons = {
        "January": "Winter Clear Sun",
        "February": "Optimal Solar Hours",
        "March": "Spring Peak Sunshine",
        "April": "Summer High Irradiance",
        "May": "Peak Solar Generation",
        "June": "Pre-Monsoon Solar Hours",
        "July": "Monsoon Diffused Sun",
        "August": "Monsoon Diffused Sun",
        "September": "Post-Monsoon Clear Sun",
        "October": "Clear Autumn Skies",
        "November": "Mild Clear Sunshine",
        "December": "Winter Solstice Sun",
    }

    table = doc.add_table(rows=len(monthly_data) + 2, cols=4)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    # Header Row
    hdr_cells = table.rows[0].cells
    for i, title in enumerate(headers):
        hdr_cells[i].text = title
        _set_cell_background(hdr_cells[i], "0F172A")
        _set_cell_margins(hdr_cells[i], top=100, bottom=100, left=120, right=120)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.RIGHT if i in (2, 3) else WD_ALIGN_PARAGRAPH.LEFT
        for r in p.runs:
            r.font.name = "Arial"
            r.font.size = Pt(8.0)
            r.font.bold = True
            r.font.color.rgb = RGBColor(255, 255, 255)

    for row_idx, item in enumerate(monthly_data):
        m_name = item["month"]
        season = seasons.get(m_name, "Clear Solar Sun")
        gen_val = format_indian_number(item["generation"])
        sav_val = format_inr(item["savings"])

        row_cells = table.rows[row_idx + 1].cells
        bg_col = "F8FAFC" if row_idx % 2 == 1 else "FFFFFF"

        for col_idx, val in enumerate([m_name, season, gen_val, sav_val]):
            row_cells[col_idx].text = val
            _set_cell_background(row_cells[col_idx], bg_col)
            _set_cell_borders(row_cells[col_idx], top="E2E8F0", bottom="E2E8F0")
            _set_cell_margins(row_cells[col_idx], top=60, bottom=60, left=110, right=110)
            p = row_cells[col_idx].paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT if col_idx in (2, 3) else WD_ALIGN_PARAGRAPH.LEFT
            for r in p.runs:
                r.font.name = "Arial"
                r.font.size = Pt(7.5)
                if col_idx == 0:
                    r.font.bold = True
                    r.font.color.rgb = RGBColor(15, 23, 42)
                elif col_idx == 3:
                    r.font.bold = True
                    r.font.color.rgb = RGBColor(16, 185, 129)
                else:
                    r.font.color.rgb = RGBColor(51, 65, 85)

    # Total Row
    total_cells = table.rows[len(monthly_data) + 1].cells
    tot_values = [
        "Total Annual Summary",
        "12-Month Cumulative Projections",
        format_indian_number(annual_gen),
        format_inr(annual_saving)
    ]
    for col_idx, val in enumerate(tot_values):
        total_cells[col_idx].text = val
        _set_cell_background(total_cells[col_idx], "EFF6FF")
        _set_cell_borders(total_cells[col_idx], top="0284C7", bottom="0284C7", left="none", right="none")
        _set_cell_margins(total_cells[col_idx], top=80, bottom=80, left=110, right=110)
        p = total_cells[col_idx].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.RIGHT if col_idx in (2, 3) else WD_ALIGN_PARAGRAPH.LEFT
        for r in p.runs:
            r.font.name = "Arial"
            r.font.size = Pt(8.0)
            r.font.bold = True
            r.font.color.rgb = RGBColor(2, 132, 199) if col_idx < 3 else RGBColor(16, 185, 129)

    for row in table.rows:
        for idx, width in enumerate(col_widths):
            row.cells[idx].width = width

    return table


def _build_payment_terms_table(doc: Any, payment_terms: List[Dict[str, Any]], total_cost: float) -> Any:
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
        _set_cell_margins(hdr_cells[i], top=110, bottom=110, left=140, right=140)
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
            _set_cell_margins(row_cells[col_idx], top=80, bottom=80, left=120, right=120)
            p = row_cells[col_idx].paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT if col_idx in (1, 2) else WD_ALIGN_PARAGRAPH.LEFT
            for r in p.runs:
                r.font.name = "Arial"
                r.font.size = Pt(8.0)
                if col_idx in (0, 2):
                    r.font.bold = True
                    r.font.color.rgb = RGBColor(15, 23, 42)
                else:
                    r.font.color.rgb = RGBColor(51, 65, 85)

    for row in table.rows:
        for idx, width in enumerate(col_widths):
            row.cells[idx].width = width

    return table


def _build_bom_table(doc: Any, bom_items: List[Dict[str, Any]]) -> Any:
    """Creates a professional Bill of Materials (BOM) table."""
    headers = ["Sr.", "Item Name & Specification", "Make / Brand", "Qty", "Unit"]
    col_widths = [Inches(0.5), Inches(3.2), Inches(1.8), Inches(0.8), Inches(0.7)]

    table = doc.add_table(rows=len(bom_items) + 1, cols=5)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    hdr_cells = table.rows[0].cells
    for i, title in enumerate(headers):
        hdr_cells[i].text = title
        _set_cell_background(hdr_cells[i], "0F172A")
        _set_cell_margins(hdr_cells[i], top=120, bottom=120, left=130, right=130)
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
            _set_cell_margins(row_cells[col_idx], top=80, bottom=80, left=110, right=110)
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


def _build_bank_details_block(doc: Any, bank_details: Dict[str, Any], company_name: str) -> Any:
    """Generates a clean paragraph block for company bank remittance details."""
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.25

    items = [
        ("Account Name", bank_details.get("account_name") or company_name),
        ("Bank Name", bank_details.get("bank_name") or "HDFC Bank Ltd"),
        ("Account Number", bank_details.get("account_number") or "50200012345678"),
        ("IFSC Code", bank_details.get("ifsc") or bank_details.get("ifsc_code") or "HDFC0001234"),
        ("Branch", bank_details.get("branch") or "Main Commercial Branch"),
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


def _build_scope_table(doc: Any, scope_items: List[str]) -> Any:
    """Builds a professional 2-column Scope Matrix (Our Scope vs Customer Scope)."""
    headers = ["EPC Contractor Scope (Our Scope)", "Client / Customer Responsibilities"]
    col_widths = [Inches(3.8), Inches(3.2)]

    our_scope = scope_items if scope_items else [
        "Site feasibility assessment, 3D shadow analysis, and engineering layout design.",
        "Supply of Tier-1 Solar PV modules, inverter, and HDGI mounting structures.",
        "Civil structure fabrication, foundations, and robust mechanical mounting on designated rooftop.",
        "AC and DC electrical wiring, combiner boxes, circuit breakers, and inverter interconnection.",
        "Chemical earthing electrode installation and high-grade lightning protection system.",
        "Pre-commissioning testing, insulation checks, and quality assurance audit.",
        "Complete documentation and liaison for DISCOM Net-Metering application, sanction, and meter testing."
    ]

    customer_scope = [
        "Provide shadow-free, unencumbered rooftop area access for project installation.",
        "Provide single/three phase construction power and water during project execution.",
        "Provide secure lockable storage space for solar modules and BOS materials.",
        "Timely design approval and authorized signatory support for DISCOM application files."
    ]

    max_rows = max(len(our_scope), len(customer_scope))
    table = doc.add_table(rows=max_rows + 1, cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    # Header Row
    hdr_cells = table.rows[0].cells
    for i, title in enumerate(headers):
        hdr_cells[i].text = title
        _set_cell_background(hdr_cells[i], "0F172A")
        _set_cell_margins(hdr_cells[i], top=100, bottom=100, left=130, right=130)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        for r in p.runs:
            r.font.name = "Arial"
            r.font.size = Pt(8.5)
            r.font.bold = True
            r.font.color.rgb = RGBColor(255, 255, 255)

    for r_idx in range(max_rows):
        row_cells = table.rows[r_idx + 1].cells
        bg_col = "F8FAFC" if r_idx % 2 == 1 else "FFFFFF"

        our_txt = our_scope[r_idx] if r_idx < len(our_scope) else ""
        cust_txt = customer_scope[r_idx] if r_idx < len(customer_scope) else ""

        for c_idx, txt in enumerate([our_txt, cust_txt]):
            row_cells[c_idx].text = f"•  {txt}" if txt else ""
            _set_cell_background(row_cells[c_idx], bg_col)
            _set_cell_borders(row_cells[c_idx], top="E2E8F0", bottom="E2E8F0")
            _set_cell_margins(row_cells[c_idx], top=70, bottom=70, left=120, right=120)
            p = row_cells[c_idx].paragraphs[0]
            for r in p.runs:
                r.font.name = "Arial"
                r.font.size = Pt(8.0)
                r.font.color.rgb = RGBColor(51, 65, 85)

    for row in table.rows:
        for idx, width in enumerate(col_widths):
            row.cells[idx].width = width

    return table


def _build_terms_table(doc: Any, terms_items: List[str]) -> Any:
    """Builds a clean, styled Terms & Conditions table without any broken/legacy remnants."""
    headers = ["#", "Commercial & General Terms & Conditions"]
    col_widths = [Inches(0.4), Inches(6.6)]

    clean_terms = []
    for t in terms_items:
        t_clean = t.strip()
        if t_clean and "lesining" not in t_clean.lower() and "within days" not in t_clean.lower() and "inr, or %" not in t_clean.lower():
            clean_terms.append(t_clean)

    if not clean_terms:
        clean_terms = [
            "Quotation Validity: This commercial proposal is valid for 15 days from the date of issuance.",
            "Payment Schedule: Payments shall be released milestone-wise in accordance with the commercial schedule.",
            "Site Readiness: The client shall ensure clear, shadow-free rooftop access, construction power, and water.",
            "Statutory Clearances: DISCOM net-metering approvals and CEIG inspections follow utility statutory timelines.",
            "Warranties: Module: 12-yr product / 25-yr performance; Inverter: 5-yr; Structure & Workmanship: 5-yr.",
            "Taxes & Duties: Applicable GST and statutory levies are as specified in the commercial offer.",
            "Force Majeure: Standard industry force majeure clauses apply to unpreventable natural delays."
        ]

    table = doc.add_table(rows=len(clean_terms) + 1, cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    # Header Row
    hdr_cells = table.rows[0].cells
    for i, title in enumerate(headers):
        hdr_cells[i].text = title
        _set_cell_background(hdr_cells[i], "0F172A")
        _set_cell_margins(hdr_cells[i], top=100, bottom=100, left=120, right=120)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER if i == 0 else WD_ALIGN_PARAGRAPH.LEFT
        for r in p.runs:
            r.font.name = "Arial"
            r.font.size = Pt(8.5)
            r.font.bold = True
            r.font.color.rgb = RGBColor(255, 255, 255)

    for idx, term in enumerate(clean_terms):
        row_cells = table.rows[idx + 1].cells
        bg_col = "F8FAFC" if idx % 2 == 1 else "FFFFFF"

        row_cells[0].text = f"{idx + 1}"
        row_cells[1].text = term

        for c_idx in (0, 1):
            _set_cell_background(row_cells[c_idx], bg_col)
            _set_cell_borders(row_cells[c_idx], top="E2E8F0", bottom="E2E8F0")
            _set_cell_margins(row_cells[c_idx], top=65, bottom=65, left=110, right=110)
            p = row_cells[c_idx].paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if c_idx == 0 else WD_ALIGN_PARAGRAPH.LEFT
            for r in p.runs:
                r.font.name = "Arial"
                r.font.size = Pt(8.0)
                if c_idx == 0:
                    r.font.bold = True
                    r.font.color.rgb = RGBColor(2, 132, 199)
                else:
                    r.font.color.rgb = RGBColor(51, 65, 85)

    for row in table.rows:
        for idx, width in enumerate(col_widths):
            row.cells[idx].width = width

    return table


def _apply_replacements_to_paragraph(p: Any, replacements: Dict[str, str]):
    """
    Substitutes placeholder strings inside a paragraph run-by-run.
    Handles exact guillemet placeholders «...» cleanly while preserving run formatting.
    Also handles split-run placeholders.
    """
    text = p.text
    if "«" not in text:
        return

    # Pass 1: Run-level substitution
    for k, v in replacements.items():
        if k in text:
            for r in p.runs:
                if k in r.text:
                    r.text = r.text.replace(k, v)

    # Refresh text
    text = p.text

    # Pass 2: Paragraph-level substitution if placeholder spans runs
    if "«" in text:
        updated = text
        for k, v in replacements.items():
            if k in updated:
                updated = updated.replace(k, v)
        if updated != text:
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

    # Pass 3: Cross-run placeholders
    runs = p.runs
    if len(runs) > 1 and "«" in p.text:
        combined = "".join(r.text for r in runs)
        new_combined = combined
        for k, v in replacements.items():
            if k in new_combined:
                new_combined = new_combined.replace(k, v)
        if new_combined != combined and p.runs:
            p.runs[0].text = new_combined
            for r in p.runs[1:]:
                r.text = ""


def _apply_replacements_in_xml(element: Any, replacements: Dict[str, str]):
    """Applies replacements directly to all w:t nodes in an XML element subtree."""
    W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

    for t_node in element.iter("{%s}t" % W_NS):
        if t_node.text:
            for k, v in replacements.items():
                if k in t_node.text:
                    t_node.text = t_node.text.replace(k, v)

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
            t_nodes[0].text = new_combined
            for t in t_nodes[1:]:
                t.text = ""


def generate_quotation_docx(quotation_data: Dict[str, Any], company_data: Dict[str, Any], template_type: str = "S1") -> bytes:
    """
    Generates a production-quality Word DOCX document from the centralized quotation object.
    Preserves 100% of the Word template structure, graphics, and styling.
    Purges stale frozen OLE objects and inserts mathematically consistent dynamic tables.
    """
    tpl_type = (template_type or quotation_data.get("template") or "S1").upper().strip()
    if tpl_type not in ("S1", "S2"):
        tpl_type = "S1"

    template_path = _resolve_template_path(tpl_type)
    doc = _load_document(template_path)

    # 1. Canonical data model extraction
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

    # Company
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

    # Project Size
    raw_size_kw = proj.get("size_kw") or proj.get("sizeKW") or quotation_data.get("system_kw") or 100
    try:
        size_kw_num = float(raw_size_kw)
    except (ValueError, TypeError):
        size_kw_num = 100.0
    size_kw_str = f"{size_kw_num:g} kW"

    struct_type = proj.get("structure_type") or proj.get("structureType") or "HDGI Elevated Rooftop Superstructure"
    sys_type = proj.get("system_type") or proj.get("systemType") or "Grid Connected Solar PV System"

    # 2. Canonical Commercial Calculations
    price_per_kw = float(comm.get("price_per_kw") or comm.get("pricePerKW") or fin.get("price_per_kw") or 2600)
    base_price = float(comm.get("base_price")) if comm.get("base_price") is not None else round(size_kw_num * price_per_kw)
    additional_charges = float(comm.get("additional_charges") or comm.get("additionalCharges") or 0)
    net_meter_charges = float(comm.get("net_meter_charges") or comm.get("netMeterCharges") or 0)
    gst_rate = float(comm.get("gst_rate") or comm.get("gstRate") or 0)
    taxable_amount = base_price + additional_charges + net_meter_charges
    gst_amount = round((taxable_amount * gst_rate) / 100) if gst_rate > 0 else float(comm.get("gst_amount") or 0)
    gross_total = float(comm.get("price") or comm.get("total_cost") or fin.get("project_cost")) if comm.get("price") else (taxable_amount + gst_amount)
    subsidy = float(comm.get("subsidy") or comm.get("subsidy_amount") or comm.get("subsidyAmount") or 0)
    final_cost = max(0.0, gross_total - subsidy)
    project_cost = final_cost

    comm_data = {
        "size_kw": size_kw_num,
        "rate_per_kw": price_per_kw,
        "base_price": base_price,
        "additional_charges": additional_charges,
        "net_meter_charges": net_meter_charges,
        "taxable_amount": taxable_amount,
        "gst_rate": gst_rate,
        "gst_amount": gst_amount,
        "gross_total": gross_total,
        "subsidy": subsidy,
        "final_cost": final_cost,
    }

    # 3. Canonical Financial Calculations
    tariff_rate = float(fin.get("tariff_rate") or 8.0)
    annual_gen = float(fin.get("annual_generation") or fin.get("annualGeneration") or round(size_kw_num * 1500))
    annual_saving = float(fin.get("annual_saving") or fin.get("annualSaving") or round(annual_gen * tariff_rate))

    if annual_saving > 0 and project_cost > 0:
        payback_years = round((project_cost / annual_saving) * 10) / 10
    else:
        payback_years = float(fin.get("payback_years") or fin.get("paybackYears") or 3.5)
    payback_str = f"{payback_years:.1f}"

    # 12-Month distribution synchronized with annual totals
    weights = [0.082, 0.087, 0.098, 0.102, 0.105, 0.076, 0.065, 0.068, 0.078, 0.085, 0.079, 0.075]
    month_names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    monthly_data = []
    gen_acc = 0
    sav_acc = 0
    for idx, (m_name, w) in enumerate(zip(month_names, weights)):
        if idx == 11:
            m_gen = int(round(annual_gen - gen_acc))
            m_sav = int(round(annual_saving - sav_acc))
        else:
            m_gen = int(round(annual_gen * w))
            m_sav = int(round(annual_saving * w))
            gen_acc += m_gen
            sav_acc += m_sav
        monthly_data.append({"month": m_name, "generation": m_gen, "savings": m_sav})

    tree_saved = int(fin.get("tree_saved") or fin.get("treeSaved") or round(size_kw_num * 16))
    co2_red = float(fin.get("co2_reduction") or fin.get("co2Reduction") or round(size_kw_num * 1.4 * 10) / 10)

    # Equipment specs
    panel_wp = panel.get("watt_peak") or panel.get("wattPeak") or "590 Wp"
    if str(panel_wp).replace(".", "").isdigit():
        panel_wp = f"{panel_wp} Wp"
    panel_qty = str(panel.get("quantity") or panel.get("panelQuantity") or "170")
    panel_make = panel.get("make") or panel.get("brand") or "Adani Solar"
    panel_type = panel.get("type") or "Mono PERC Bifacial"
    panel_warranty = panel.get("warranty") or "12 Years Product / 25 Years Performance"

    inv_size = inv.get("size_kw") or inv.get("sizeKW") or size_kw_str
    if str(inv_size).replace(".", "").isdigit():
        inv_size = f"{inv_size} kW"
    inv_qty = str(inv.get("quantity") or "1")
    inv_make = inv.get("make") or inv.get("brand") or "Solis"
    inv_phase = inv.get("phase") or "Three Phase"
    inv_warranty = inv.get("warranty") or "5 Years Standard Warranty"

    cable_make = cable.get("make") or cable.get("brand") or "Polycab"
    cable_ac = cable.get("ac") or "4C x 50 sq.mm Aluminium Armoured Cable"
    cable_dc = cable.get("dc") or "1C x 4 sq.mm Copper Solar Cable"

    struct_desc = struct.get("description") or "HDGI Elevated Rooftop Structure with SS304 Fasteners"
    bos_desc = bos.get("description") or "Complete ACDB, DCDB, Earthing & Lightning Protection"
    bos_warranty = bos.get("warranty") or "5 Years Complete Balance of System Warranty"

    # 4. Replacement Dictionary (exact placeholders)
    replacements = {
        "«Reference No.»": ref_no,
        "«Date»": quote_date,
        "«Project Size (kW)»": size_kw_str,
        "«Customer Name»": cust_name,
        "«Customer Address»": cust_addr,
        "«Customer Phone»": cust_phone,
        "«Customer Mail»": cust_mail,
        "«Company Name»": c_name,
        "«Company Address»": c_addr,
        "«Company Phone»": c_phone,
        "«Company Mail»": c_mail,
        "«Company POC»": c_poc,
        "«Company GST»": c_gst,
        "«Structure Type»": struct_type,
        "«Type»": sys_type,
        "«Pay Back Period»": payback_str,
        "«Annual Generation»": format_indian_number(annual_gen),
        "«Annual Saving»": format_indian_number(annual_saving),
        "«Project Cost»": format_indian_number(project_cost),
        "«Tree Saved»": format_indian_number(tree_saved),
        "«Co2 Reduction»": f"{co2_red:g}",
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
        "«BOS Warranty»": bos_warranty,
        "«BOS Warranty": bos_warranty,
    }

    # 5. Substitute placeholders across all paragraphs and shapes
    for p in doc.paragraphs:
        _apply_replacements_to_paragraph(p, replacements)

    for t in doc.tables:
        for row in t.rows:
            for cell in row.cells:
                for p in cell.paragraphs:
                    _apply_replacements_to_paragraph(p, replacements)

    _apply_replacements_in_xml(doc.element, replacements)

    # 6. Purge all stale frozen OLE objects from template before inserting dynamic tables
    _clean_stale_ole_objects(doc, tpl_type)

    # 7. Update timeline graphic chevrons with user-configured durations and titles
    timeline_items = quotation_data.get("timeline") or [
        {"sequence": 1, "stage": "Finalization of Design and Drawings", "duration": "7 Days"},
        {"sequence": 2, "stage": "Engineering, Procurement, and Supply of Material", "duration": "15 Days"},
        {"sequence": 3, "stage": "Solar Plant Installation", "duration": "20 Days"},
        {"sequence": 4, "stage": "Commissioning and Testing", "duration": "14 Days"},
    ]
    _update_timeline_in_drawings(doc, timeline_items, tpl_type)

    # 8. Dynamic Tables Data Preparation
    payment_terms = comm.get("payment_terms") or comm.get("paymentTerms") or [
        {"stage": "Advance / Booking", "percent": 20, "amount": round((project_cost * 20) / 100), "description": "Along with purchase order & design sign-off"},
        {"stage": "Material Delivery", "percent": 60, "amount": round((project_cost * 60) / 100), "description": "Upon delivery of modules, inverter & structure at site"},
        {"stage": "Installation", "percent": 15, "amount": round((project_cost * 15) / 100), "description": "Upon completion of mechanical & electrical installation"},
        {"stage": "Commissioning", "percent": 5, "amount": round((project_cost * 5) / 100), "description": "Upon DISCOM testing, net metering & final commissioning"},
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

    scope_items = quotation_data.get("scope_of_work") or quotation_data.get("scopeOfWork") or []
    terms_items = quotation_data.get("terms_and_conditions") or quotation_data.get("termsAndConditions") or []

    # 9. Insert dynamic tables into their clean anchor positions
    paragraphs = list(doc.paragraphs)
    for p in paragraphs:
        p_text = p.text.strip().replace("&amp;", "&")

        # --- S2: Expected Monthly Generation & Savings table ---
        if p_text == "Expected Monthly Generation & Savings" and tpl_type == "S2":
            tbl_monthly = _build_monthly_table(doc, monthly_data, annual_gen, annual_saving)
            p._p.addnext(tbl_monthly._tbl)

        # --- Commercial Offer Table ---
        elif "Price Quote" in p_text and "Payment schedule" in p_text:
            tbl_comm = _build_commercial_table(doc, comm_data, size_kw_str)
            p._p.addnext(tbl_comm._tbl)

        # --- Payment Terms Table ---
        elif p_text == "Payment Terms:":
            tbl_pay = _build_payment_terms_table(doc, payment_terms, project_cost)
            p._p.addnext(tbl_pay._tbl)

        # --- Bank Details Block ---
        elif p_text in ("Account Details:", "Bank Details:"):
            p_bank = _build_bank_details_block(doc, bank_details, c_name)
            p._p.addnext(p_bank._p)

        # --- BOM Table (S1 only) ---
        elif p_text == "Bill of Material" and tpl_type == "S1":
            tbl_bom = _build_bom_table(doc, bom_items)
            p._p.addnext(tbl_bom._tbl)

        # --- Scope of Work ---
        elif p_text == "Scope of Work":
            tbl_scope = _build_scope_table(doc, scope_items)
            p._p.addnext(tbl_scope._tbl)

        # --- Terms & Conditions ---
        elif p_text in ("Terms & Conditions", "General Terms & Conditions"):
            tbl_terms = _build_terms_table(doc, terms_items)
            p._p.addnext(tbl_terms._tbl)

    # 10. Clean up any leftover stray guillemets
    for p in doc.paragraphs:
        if "«" in p.text:
            cleaned = re.sub(r'«[^»]*»?', '', p.text)
            if p.runs:
                p.runs[0].text = cleaned
                for r in p.runs[1:]:
                    r.text = ""

    W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    for t_node in doc.element.iter(f"{{{W_NS}}}t"):
        if t_node.text and "«" in t_node.text:
            t_node.text = re.sub(r'«[^»]*»?', '', t_node.text)

    # 11. Save to Bytes
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
            import importlib
            d2p = importlib.import_module("docx2pdf")
            d2p.convert(str(docx_path), str(pdf_path))
            if pdf_path.exists():
                return pdf_path.read_bytes()
        except ImportError:
            pass
        except Exception as e:
            logger.warning(f"docx2pdf conversion failed: {e}")

    raise RuntimeError(
        "PDF conversion failed: LibreOffice is not installed or not found. "
        "Install with: brew install libreoffice (macOS) or apt install libreoffice (Linux). "
        "DOCX download is available as an alternative."
    )
