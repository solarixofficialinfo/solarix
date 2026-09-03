from __future__ import annotations
import os
import io
import base64
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, Image as RLImage, HRFlowable
)
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

logger = logging.getLogger(__name__)

# Register PDF-safe Unicode font supporting the Indian Rupee symbol
FONTS_DIR = os.path.join(os.path.dirname(__file__), "fonts")
REGULAR_FONT_PATH = os.path.join(FONTS_DIR, "NotoSans-Regular.ttf")
BOLD_FONT_PATH = os.path.join(FONTS_DIR, "NotoSans-Bold.ttf")

PDF_FONT = "Helvetica"
PDF_FONT_BOLD = "Helvetica-Bold"

try:
    if os.path.exists(REGULAR_FONT_PATH) and os.path.exists(BOLD_FONT_PATH):
        pdfmetrics.registerFont(TTFont("NotoSans", REGULAR_FONT_PATH))
        pdfmetrics.registerFont(TTFont("NotoSans-Bold", BOLD_FONT_PATH))
        pdfmetrics.registerFontFamily("NotoSans", normal="NotoSans", bold="NotoSans-Bold")
        PDF_FONT = "NotoSans"
        PDF_FONT_BOLD = "NotoSans-Bold"
    elif os.path.exists("/Library/Fonts/Arial Unicode.ttf"):
        pdfmetrics.registerFont(TTFont("NotoSans", "/Library/Fonts/Arial Unicode.ttf"))
        pdfmetrics.registerFont(TTFont("NotoSans-Bold", "/Library/Fonts/Arial Unicode.ttf"))
        pdfmetrics.registerFontFamily("NotoSans", normal="NotoSans", bold="NotoSans-Bold")
        PDF_FONT = "NotoSans"
        PDF_FONT_BOLD = "NotoSans-Bold"
except Exception as e:
    logger.warning(f"Proposal generator font warning: {e}")

styles = getSampleStyleSheet()

PRIMARY_COLOR = colors.HexColor('#0f172a')     # Navy 900
ACCENT_BLUE = colors.HexColor('#1d4ed8')       # Blue 700
LIGHT_BLUE = colors.HexColor('#eff6ff')        # Blue 50
BORDER_COLOR = colors.HexColor('#cbd5e1')      # Slate 300
MUTED_TEXT = colors.HexColor('#64748b')        # Slate 500
GREEN_COLOR = colors.HexColor('#15803d')       # Green 700
GREEN_BG = colors.HexColor('#f0fdf4')          # Green 50

PROP_TITLE = ParagraphStyle('PropTitle', parent=styles['Heading1'], fontSize=18, fontName=PDF_FONT_BOLD, textColor=PRIMARY_COLOR, spaceAfter=4, leading=22)
PROP_SUBTITLE = ParagraphStyle('PropSubtitle', parent=styles['Normal'], fontSize=9, fontName=PDF_FONT, textColor=MUTED_TEXT, spaceAfter=8, leading=12)
SECTION_TITLE = ParagraphStyle('SecTitle', parent=styles['Heading2'], fontSize=12, fontName=PDF_FONT_BOLD, textColor=ACCENT_BLUE, spaceBefore=8, spaceAfter=4, leading=15)
BODY_TEXT = ParagraphStyle('PropBody', parent=styles['BodyText'], fontSize=8.5, fontName=PDF_FONT, textColor=colors.HexColor('#1e293b'), leading=12)
BODY_BOLD = ParagraphStyle('PropBodyBold', parent=styles['BodyText'], fontSize=8.5, fontName=PDF_FONT_BOLD, textColor=PRIMARY_COLOR, leading=12)
SMALL_TEXT = ParagraphStyle('PropSmall', parent=styles['Normal'], fontSize=7.5, fontName=PDF_FONT, textColor=MUTED_TEXT, leading=10)
KPI_NUM = ParagraphStyle('PropKPINum', parent=styles['Normal'], fontSize=14, fontName=PDF_FONT_BOLD, textColor=ACCENT_BLUE, alignment=1, leading=17)
KPI_LABEL = ParagraphStyle('PropKPILbl', parent=styles['Normal'], fontSize=7.5, fontName=PDF_FONT_BOLD, textColor=MUTED_TEXT, alignment=1, leading=10)


class ProposalCanvas(canvas.Canvas):
    """Canvas with professional page numbers and branded header/footer lines."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.pages = []
        self.template_id = "template1"
        self.company_name = "Solarix Solar"
        self.co_owner = ""
        self.co_mobile = ""
        self.co_email = ""

    def showPage(self):
        self.pages.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self.pages)
        for page in self.pages:
            self.__dict__.update(page)
            # Suppress header/footer on cover page (page 1)
            if self._pageNumber > 1:
                self.draw_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_decorations(self, page_count: int):
        self.saveState()
        page_w, page_h = A4

        if self.template_id == "template1":
            # ── TEMPLATE 01 (SOLAR PROOF REFERENCE STYLE) ───────────────────
            # Top cyan/sky blue accent line
            self.setStrokeColor(colors.HexColor('#0284c7'))
            self.setLineWidth(2.0)
            self.line(1.5 * cm, page_h - 1.2 * cm, page_w - 1.5 * cm, page_h - 1.2 * cm)

            # Top header text
            self.setFont(PDF_FONT_BOLD, 8)
            self.setFillColor(colors.HexColor('#0369a1'))
            self.drawString(1.5 * cm, page_h - 1.0 * cm, f"{self.company_name.upper()} — SOLAR PV TECHNICAL PROPOSAL")

            # Bottom footer line
            self.setStrokeColor(colors.HexColor('#e2e8f0'))
            self.setLineWidth(0.75)
            self.line(1.5 * cm, 1.4 * cm, page_w - 1.5 * cm, 1.4 * cm)

            # Footer contact info on left
            self.setFont(PDF_FONT, 7.5)
            self.setFillColor(MUTED_TEXT)
            contact_parts = list(filter(None, [self.co_owner, self.co_mobile, self.co_email, self.company_name]))
            contact_str = " | ".join(contact_parts) or self.company_name
            self.drawString(1.5 * cm, 0.9 * cm, contact_str)

            # Bottom-right: Distinctive solid cyan square tab with bold white page number (matching Solar Proof reference PDF!)
            tab_w = 0.75 * cm
            tab_h = 0.75 * cm
            tab_x = page_w - 1.5 * cm - tab_w
            tab_y = 0.65 * cm
            self.setFillColor(colors.HexColor('#0284c7'))
            self.rect(tab_x, tab_y, tab_w, tab_h, fill=1, stroke=0)
            self.setFillColor(colors.white)
            self.setFont(PDF_FONT_BOLD, 10)
            self.drawCentredString(tab_x + (tab_w / 2.0), tab_y + 0.22 * cm, str(self._pageNumber))

        else:
            # ── TEMPLATE 02 (MODERN SOLAR STYLE) ─────────────────────────────
            # Top decorative navy line
            self.setStrokeColor(colors.HexColor('#0f172a'))
            self.setLineWidth(1.5)
            self.line(1.5 * cm, page_h - 1.2 * cm, page_w - 1.5 * cm, page_h - 1.2 * cm)

            # Header small label
            self.setFont(PDF_FONT_BOLD, 7.5)
            self.setFillColor(colors.HexColor('#1e3a8a'))
            self.drawString(1.5 * cm, page_h - 1.0 * cm, "SOLARIX — Modern Rooftop Solar PV Proposal")

            # Bottom footer line
            self.setStrokeColor(colors.HexColor('#e2e8f0'))
            self.setLineWidth(0.75)
            self.line(1.5 * cm, 1.3 * cm, page_w - 1.5 * cm, 1.3 * cm)

            # Footer text
            self.setFont(PDF_FONT, 7.5)
            self.setFillColor(MUTED_TEXT)
            self.drawString(1.5 * cm, 0.9 * cm, "Confidential — Prepared for Customer Evaluation")
            pg_str = f"Page {self._pageNumber} of {page_count}"
            self.drawRightString(page_w - 1.5 * cm, 0.9 * cm, pg_str)

        self.restoreState()


def _decode_b64(data_uri_or_b64: Optional[str]) -> Optional[io.BytesIO]:
    if not data_uri_or_b64 or not isinstance(data_uri_or_b64, str):
        return None
    try:
        b64_str = data_uri_or_b64.split("base64,")[1] if "base64," in data_uri_or_b64 else data_uri_or_b64
        return io.BytesIO(base64.b64decode(b64_str.strip()))
    except Exception as e:
        logger.warning(f"Error decoding base64 image: {e}")
        return None


def format_currency(val: Any) -> str:
    try:
        n = float(val or 0)
        return f"Rs. {n:,.0f}"
    except (ValueError, TypeError):
        return str(val or "0")


def generate_proposal_pdf(doc_data: Dict[str, Any], company: Dict[str, Any]) -> bytes:
    """Generate complete professional multi-page customer proposal PDF."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm,
        topMargin=1.8 * cm,
        bottomMargin=1.8 * cm,
    )

    story = []
    page_w, _ = A4
    content_w = page_w - 3.0 * cm

    # Data extraction with safe fallbacks
    customer_name = doc_data.get("customer_name") or (doc_data.get("client") or {}).get("full_name") or "Valued Customer"
    mobile = doc_data.get("mobile") or (doc_data.get("client") or {}).get("mobile") or ""
    email = doc_data.get("email") or (doc_data.get("client") or {}).get("email") or ""
    site_address = doc_data.get("site_address") or (doc_data.get("client") or {}).get("address") or "Site Address"
    city = doc_data.get("city") or (doc_data.get("client") or {}).get("city") or ""
    state = doc_data.get("state") or (doc_data.get("client") or {}).get("state") or ""
    pincode = doc_data.get("pincode") or (doc_data.get("client") or {}).get("pincode") or ""
    full_address = ", ".join(filter(None, [site_address, city, state, pincode])) or site_address

    prop_number = doc_data.get("proposal_number") or doc_data.get("quote_number") or f"PROP-{datetime.now().strftime('%y%m%d-%H%M')}"
    prop_date = doc_data.get("proposal_date") or doc_data.get("quote_date") or datetime.now().strftime("%Y-%m-%d")
    system_kw = float(doc_data.get("system_kw") or doc_data.get("system_capacity") or 5.0)
    project_type = doc_data.get("project_type") or "Residential Rooftop"
    solar_system_type = doc_data.get("solar_system_type") or "Grid Connected / On-Grid Solar PV"
    prepared_by = doc_data.get("prepared_by") or company.get("owner_name") or "Solar Engineer"

    # Company info
    company_name = company.get("company_name") or company.get("name") or "GVP Solar Energy Solutions"
    co_owner = company.get("owner_name") or ""
    co_mobile = company.get("mobile") or company.get("phone") or ""
    co_email = company.get("email") or ""
    co_gst = company.get("gst_number") or company.get("gstin") or ""
    co_address = company.get("address") or ""
    co_city = company.get("city") or ""
    co_state = company.get("state") or ""
    co_pincode = company.get("pincode") or ""
    co_full_addr = ", ".join(filter(None, [co_address, co_city, co_state, co_pincode])) or "India"

    # Financials
    system_price = float(doc_data.get("system_price") or doc_data.get("base_price") or 250000)
    additional_charges = float(doc_data.get("additional_charges") or 0)
    net_meter_charges = float(doc_data.get("net_meter_charges") or 0)
    gst_pct = float(doc_data.get("gst_pct") or 13.8)
    gst_amount = float(doc_data.get("gst_amount") or (system_price * gst_pct / 100.0))
    gross_cost = system_price + additional_charges + net_meter_charges + gst_amount
    subsidy_applicable = bool(doc_data.get("subsidy_applicable", True))
    subsidy_amount = float(doc_data.get("subsidy_amount") or 78000) if subsidy_applicable else 0.0
    net_customer_cost = float(doc_data.get("net_customer_cost") or max(0, gross_cost - subsidy_amount))

    # Metrics
    annual_kwh = float(doc_data.get("annual_kwh") or (system_kw * 1450))
    annual_savings = float(doc_data.get("annual_savings") or (annual_kwh * 8.5))
    payback_years = float(doc_data.get("payback_years") or (net_customer_cost / max(1, annual_savings)))
    lifetime_savings = float(doc_data.get("lifetime_savings") or (annual_savings * 25))
    co2_tons = float(doc_data.get("co2_tons") or (annual_kwh * 0.82 / 1000.0))
    trees_count = int(doc_data.get("trees_count") or round(co2_tons * 45))

    # Equipment
    panel = doc_data.get("panel") or {}
    panel_make = panel.get("make") or doc_data.get("panel_make") or "INA / Tier-1 Mono PERC"
    panel_model = panel.get("model") or "555 WP DCR TOPCon Bifacial"
    panel_watt = int(panel.get("wattage") or doc_data.get("panel_wattage") or 555)
    panel_count = int(panel.get("quantity") or doc_data.get("panel_count") or round(system_kw * 1000 / panel_watt))

    inverter = doc_data.get("inverter") or {}
    inv_make = inverter.get("make") or "UTL / Tier-1 On-Grid"
    inv_cap = inverter.get("capacity") or f"{system_kw:.1f} kW"
    inv_phase = inverter.get("phase") or ("Single Phase" if system_kw <= 5 else "Three Phase")
    inv_qty = int(inverter.get("quantity") or 1)

    structure = doc_data.get("structure") or {}
    struct_type = structure.get("type") or "Elevated Super Structure"
    struct_height = structure.get("height") or "1.8m Clearance"
    struct_mat = structure.get("material") or "Aluminium 6063-T6 & Hot Dip Galvanized Iron"

    cables = doc_data.get("cables") or {}
    dc_cable = cables.get("dc") or "4 / 6 sq.mm UV Protected Solar DC Cable"
    ac_cable = cables.get("ac") or "4-Core Armoured Copper AC Cable"
    cable_brand = cables.get("brand") or "Polycab / Havells / Siechem"

    template_id = doc_data.get("template_id") or "template1"

    # =========================================================================
    # PAGE 1: COVER PAGE / HERO
    # =========================================================================
    if template_id == "template1":
        # ── TEMPLATE 01: SOLAR PROOF / REFERENCE PDF STYLE COVER ─────────────
        story.append(Spacer(1, 1.2 * cm))
        
        # Reference PDF Contact Details Header Table
        prep_html = f"""
        <font color='#0284c7'><b>Prepared by:</b></font><br/>
        <b>{co_owner or 'Solar EPC Specialist'}</b><br/>
        {co_mobile or '+91 98765 43210'}<br/>
        {co_email or 'info@solarix.energy'}<br/>
        <font color='#0284c7'><b>{company_name}</b></font>
        """
        creat_html = f"""
        <font color='#0284c7'><b>Created for:</b></font><br/>
        <b>{customer_name}</b><br/>
        {mobile}<br/>
        {email}<br/>
        {full_address}<br/><br/>
        <b>Date:</b> {prop_date} &nbsp;·&nbsp; <b>Project Ref No.:</b> {prop_number}
        """
        contact_tbl = Table([
            [Paragraph(prep_html, BODY_TEXT), Paragraph(creat_html, BODY_TEXT)]
        ], colWidths=[content_w * 0.5, content_w * 0.5])
        contact_tbl.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('LINEBELOW', (0,0), (-1,-1), 1, colors.HexColor('#e2e8f0')),
            ('BOTTOMPADDING', (0,0), (-1,-1), 12),
        ]))
        story.append(contact_tbl)
        story.append(Spacer(1, 1.2 * cm))

        # Title Block inspired by reference PDF
        story.append(Paragraph("SOLAR POWER", ParagraphStyle('T1Sub', parent=PROP_SUBTITLE, fontSize=18, fontName=PDF_FONT_BOLD, textColor=colors.HexColor('#0284c7'), spaceAfter=2, leading=22)))
        story.append(Paragraph("PROPOSAL", ParagraphStyle('T1Main', parent=PROP_TITLE, fontSize=32, leading=36, textColor=PRIMARY_COLOR, spaceAfter=4)))
        story.append(Paragraph(f"<b>{system_kw:.2f} kWp</b>", ParagraphStyle('T1Kw', parent=PROP_TITLE, fontSize=38, leading=42, textColor=colors.HexColor('#0284c7'))))
        story.append(Spacer(1, 1.2 * cm))

        # INVESTMENT SUMMARY BLOCK (Exact reference PDF layout)
        inv_roi_pct = (annual_savings / max(1, net_customer_cost) * 100)
        inv_rows = [
            [Paragraph("<b>INVESTMENT SUMMARY</b>", ParagraphStyle('InvH', parent=BODY_BOLD, fontSize=11, textColor=colors.white)), ""],
            [Paragraph("<b>ESTIMATED SAVINGS (YEAR 1):</b>", BODY_TEXT), Paragraph(f"<b>{format_currency(annual_savings)}</b>", BODY_BOLD)],
            [Paragraph("<b>RETURN ON INVESTMENT:</b>", BODY_TEXT), Paragraph(f"<b>{inv_roi_pct:.2f}%</b>", BODY_BOLD)],
            [Paragraph("<b>PAYBACK PERIOD:</b>", BODY_TEXT), Paragraph(f"<b>{payback_years:.2f} years</b>", BODY_BOLD)],
            [Paragraph("<b>NET PROJECT INVESTMENT:</b>", BODY_TEXT), Paragraph(f"<b>{format_currency(net_customer_cost)}</b>", BODY_BOLD)],
        ]
        inv_tbl = Table(inv_rows, colWidths=[content_w * 0.6, content_w * 0.4])
        inv_tbl.setStyle(TableStyle([
            ('SPAN', (0,0), (1,0)),
            ('BACKGROUND', (0,0), (1,0), colors.HexColor('#0284c7')),
            ('PADDING', (0,0), (1,0), 6),
            ('BACKGROUND', (0,1), (-1,-1), colors.HexColor('#f0f9ff')),
            ('BOX', (0,0), (-1,-1), 1.5, colors.HexColor('#0284c7')),
            ('INNERGRID', (0,1), (-1,-1), 0.5, colors.HexColor('#bae6fd')),
            ('PADDING', (0,1), (-1,-1), 7),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ]))
        story.append(inv_tbl)
        story.append(Spacer(1, 1.8 * cm))

        # Validity footer
        val_tbl = Table([[
            Paragraph(f"<b>{company_name}</b> · {co_full_addr}", SMALL_TEXT),
            Paragraph("Proposal Valid for 15 Days", ParagraphStyle('Val', parent=BODY_BOLD, alignment=2, textColor=colors.HexColor('#0284c7')))
        ]], colWidths=[content_w * 0.7, content_w * 0.3])
        val_tbl.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'MIDDLE')]))
        story.append(val_tbl)
        story.append(PageBreak())

    else:
        # ── TEMPLATE 02: MODERN SOLAR THEME COVER ─────────────────────────────
        story.append(Spacer(1, 2.5 * cm))
        badge_table = Table([[
            Paragraph(f"<b>{company_name.upper()}</b>", ParagraphStyle('CoHd', parent=PROP_TITLE, fontSize=16, textColor=ACCENT_BLUE)),
            Paragraph(f"Ref: <b>{prop_number}</b><br/>Date: <b>{prop_date}</b>", ParagraphStyle('RefHd', parent=BODY_TEXT, alignment=2))
        ]], colWidths=[content_w * 0.65, content_w * 0.35])
        badge_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('BOTTOMPADDING', (0,0), (-1,-1), 12),
        ]))
        story.append(badge_table)
        story.append(HRFlowable(width="100%", thickness=2, color=ACCENT_BLUE, spaceBefore=0, spaceAfter=20))

        story.append(Paragraph("GRID CONNECTED SOLAR PV SYSTEM", ParagraphStyle('CovSub', parent=PROP_SUBTITLE, fontSize=11, fontName=PDF_FONT_BOLD, textColor=colors.HexColor('#d97706'))))
        story.append(Paragraph("COMMERCIAL & TECHNICAL PROPOSAL", ParagraphStyle('CovMain', parent=PROP_TITLE, fontSize=24, leading=28, textColor=PRIMARY_COLOR)))
        story.append(Paragraph(f"ENGINEERING-GRADE ROOFTOP SOLAR INSTALLATION ({system_kw:.2f} kWp)", ParagraphStyle('CovPwr', parent=PROP_TITLE, fontSize=14, leading=18, textColor=ACCENT_BLUE)))
        story.append(Spacer(1, 1.5 * cm))

        cust_card = [
            [Paragraph("<b>PROPOSAL PREPARED FOR:</b>", ParagraphStyle('CH', parent=BODY_BOLD, textColor=ACCENT_BLUE)), Paragraph("<b>PROJECT SPECIFICATIONS:</b>", ParagraphStyle('CH2', parent=BODY_BOLD, textColor=ACCENT_BLUE))],
            [Paragraph(f"<b>{customer_name}</b>", ParagraphStyle('CN', parent=PROP_TITLE, fontSize=14, leading=16)), Paragraph(f"System Capacity: <b>{system_kw:.2f} kWp DC</b>", BODY_TEXT)],
            [Paragraph(f"Phone: {mobile}<br/>Email: {email}", BODY_TEXT), Paragraph(f"Project Type: <b>{project_type}</b>", BODY_TEXT)],
            [Paragraph(f"Site Address:<br/>{full_address}", BODY_TEXT), Paragraph(f"Grid Connection: <b>{solar_system_type}</b>", BODY_TEXT)],
            [Paragraph(f"Prepared By: <b>{prepared_by}</b>", BODY_TEXT), Paragraph(f"Govt Subsidy: <b>{'Eligible (PM Surya Ghar)' if subsidy_applicable else 'Not Applicable'}</b>", BODY_TEXT)]
        ]
        cust_tbl = Table(cust_card, colWidths=[content_w * 0.5, content_w * 0.5])
        cust_tbl.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), LIGHT_BLUE),
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#bfdbfe')),
            ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#dbeafe')),
            ('PADDING', (0,0), (-1,-1), 8),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ]))
        story.append(cust_tbl)

        story.append(Spacer(1, 3.0 * cm))
        story.append(Paragraph(f"<b>{company_name}</b> · {co_full_addr} · {co_mobile} · {co_email}", ParagraphStyle('CoFt', parent=SMALL_TEXT, alignment=1)))
        story.append(PageBreak())

    # =========================================================================
    # PAGE 2: EXECUTIVE SUMMARY
    # =========================================================================
    story.append(Paragraph("Executive Summary", SECTION_TITLE))
    story.append(Paragraph("High-level engineering metrics, solar energy harvest projections, and financial returns.", PROP_SUBTITLE))
    story.append(Spacer(1, 4))

    # 4-Box Top KPI Table
    kpis = [
        [
            [Paragraph(f"{system_kw:.2f} kWp", KPI_NUM), Paragraph("PLANT CAPACITY", KPI_LABEL)],
            [Paragraph(f"{annual_kwh:,.0f} kWh", KPI_NUM), Paragraph("ANNUAL GENERATION", KPI_LABEL)],
            [Paragraph(format_currency(annual_savings), KPI_NUM), Paragraph("ANNUAL SAVINGS", KPI_LABEL)],
            [Paragraph(f"{payback_years:.1f} Yrs", KPI_NUM), Paragraph("EST. PAYBACK", KPI_LABEL)],
        ]
    ]
    kpi_tbl = Table(kpis, colWidths=[content_w / 4.0] * 4)
    kpi_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#cbd5e1')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0,0), (-1,-1), 8),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(kpi_tbl)
    story.append(Spacer(1, 14))

    # Executive Narrative
    exec_text = f"""
    We are pleased to present this comprehensive solar photovoltaic proposal for <b>{customer_name}</b> at <b>{full_address}</b>. 
    Our certified engineering team has designed a premium <b>{system_kw:.2f} kWp grid-connected solar power plant</b> utilizing 
    high-efficiency <b>{panel_watt}W Tier-1 solar modules</b> and a smart string inverter.
    <br/><br/>
    The proposed solar system will produce approximately <b>{annual_kwh:,.0f} units (kWh) of clean electricity annually</b>, 
    delivering estimated yearly electricity bill savings of <b>{format_currency(annual_savings)}</b>. 
    Over its 25-year design lifecycle, the system will generate over <b>{format_currency(lifetime_savings)}</b> in cumulative savings, 
    with a projected capital payback period of <b>{payback_years:.1f} years</b>.
    """
    story.append(Paragraph(exec_text, BODY_TEXT))
    story.append(Spacer(1, 14))

    # Quick Summary Comparison Table
    sum_data = [
        [Paragraph("<b>Parameter</b>", BODY_BOLD), Paragraph("<b>Specification / Value</b>", BODY_BOLD)],
        [Paragraph("Customer Name & Site", BODY_TEXT), Paragraph(f"{customer_name} ({full_address})", BODY_TEXT)],
        [Paragraph("Solar Plant Rating (DC)", BODY_TEXT), Paragraph(f"<b>{system_kw:.2f} kWp</b> ({panel_count} Modules × {panel_watt}W)", BODY_TEXT)],
        [Paragraph("Solar Inverter Rating", BODY_TEXT), Paragraph(f"<b>{inv_cap}</b> ({inv_make}, {inv_phase})", BODY_TEXT)],
        [Paragraph("Gross Project Cost", BODY_TEXT), Paragraph(f"{format_currency(gross_cost)} (Incl. GST)", BODY_TEXT)],
        [Paragraph("Govt. Subsidy Benefit", BODY_TEXT), Paragraph(f"<b>{format_currency(subsidy_amount)}</b> {'(PM Surya Ghar Muft Bijli Yojana)' if subsidy_applicable else '(None)'}", BODY_BOLD)],
        [Paragraph("<b>Net Cost to Customer</b>", BODY_BOLD), Paragraph(f"<b><font color='#1d4ed8' size='11'>{format_currency(net_customer_cost)}</font></b>", BODY_BOLD)],
        [Paragraph("25-Year Cumulative Savings", BODY_TEXT), Paragraph(f"<b>{format_currency(lifetime_savings)}</b>", BODY_BOLD)],
        [Paragraph("CO₂ Emissions Offset", BODY_TEXT), Paragraph(f"<b>{co2_tons:.1f} Tonnes / Year</b> (Eqv. {trees_count} Trees)", BODY_TEXT)]
    ]
    sum_tbl = Table(sum_data, colWidths=[content_w * 0.45, content_w * 0.55])
    sum_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f1f5f9')),
        ('BOX', (0,0), (-1,-1), 0.75, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0,0), (-1,-1), 4.5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')]),
    ]))
    story.append(sum_tbl)
    story.append(PageBreak())

    # =========================================================================
    # PAGE 3: WHY CHOOSE US (GVP SOLAR ADVANTAGE)
    # =========================================================================
    story.append(Paragraph(f"Why Choose {company_name}", SECTION_TITLE))
    story.append(Paragraph("Excellence in solar EPC engineering, quality components, and long-term customer commitment.", PROP_SUBTITLE))
    story.append(Spacer(1, 6))

    advantages = [
        ("MNRE Approved Solar EPC", "Recognized and certified under Ministry of New & Renewable Energy channel partner standards with verified engineering quality."),
        ("Comprehensive Energy Audit", "Detailed site assessment and energy requirement auditing to design optimal solar capacity without over-sizing or under-sizing."),
        ("Customized Engineering Solutions", "Tailored rooftop structural designs engineered specifically for wind loads up to 150 km/h with zero roof puncture options."),
        ("End-to-End Net-Metering Support", "Complete liaisoning with state DISCOM for solar application, sanction, meter testing, and bi-directional meter commissioning."),
        ("Direct Government Subsidy Assistance", "Dedicated team assisting in PM Surya Ghar / National Portal registration, document verification, and subsidy release."),
        ("Accelerated Tax Depreciation Benefit", "For commercial entities, solar assets qualify for 40% accelerated depreciation benefit under Section 32 of Income Tax Act."),
        ("Tier-1 Certified Components", "Strict adherence to ALMM listed DCR solar modules, high-efficiency MPPT string inverters, and UV-resistant fire-retardant cabling."),
        ("24/7 Mobile Cloud Monitoring", "Real-time generation tracking, fault detection, and performance analytics directly via smartphone application."),
        ("Prompt Local After-Sales Support", "Rapid-response service technicians guaranteeing turnaround within 24-48 hours for system troubleshooting and maintenance.")
    ]

    adv_cells = []
    for title, desc in advantages:
        adv_cells.append([
            Paragraph(f"<b>✓ {title}</b>", BODY_BOLD),
            Paragraph(f"{desc}", SMALL_TEXT)
        ])
    adv_tbl = Table(adv_cells, colWidths=[content_w * 0.35, content_w * 0.65])
    adv_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#ffffff')),
        ('BOX', (0,0), (-1,-1), 0.75, colors.HexColor('#bfdbfe')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0,0), (-1,-1), 6),
        ('ROWBACKGROUNDS', (0,0), (-1,-1), [colors.white, LIGHT_BLUE]),
    ]))
    story.append(adv_tbl)
    story.append(PageBreak())

    # =========================================================================
    # PAGE 4: SYSTEM DESIGN & ENGINEERING
    # =========================================================================
    story.append(Paragraph("System Design & Rooftop Engineering", SECTION_TITLE))
    story.append(Paragraph("Technical arrangement, module orientation, structural layout, and preliminary drawings.", PROP_SUBTITLE))
    story.append(Spacer(1, 6))

    # Embed snapshot images if available from 3D Solar Designer
    snap_2d = _decode_b64(doc_data.get("layout_snapshot_2d") or doc_data.get("snapshot_2d"))
    snap_3d = _decode_b64(doc_data.get("layout_snapshot_3d") or doc_data.get("snapshot_3d"))

    if snap_2d and snap_3d:
        img_row = [[
            [Paragraph("<b>2D Rooftop Layout & Panel Matrix</b>", SMALL_TEXT), Spacer(1, 2), RLImage(snap_2d, width=content_w * 0.48, height=6.0 * cm)],
            [Paragraph("<b>3D Simulation & Structural View</b>", SMALL_TEXT), Spacer(1, 2), RLImage(snap_3d, width=content_w * 0.48, height=6.0 * cm)]
        ]]
        img_tbl = Table(img_row, colWidths=[content_w * 0.5, content_w * 0.5])
        img_tbl.setStyle(TableStyle([('PADDING', (0,0), (-1,-1), 2), ('VALIGN', (0,0), (-1,-1), 'TOP')]))
        story.append(img_tbl)
        story.append(Spacer(1, 10))
    elif snap_3d:
        story.append(RLImage(snap_3d, width=content_w, height=7.5 * cm))
        story.append(Spacer(1, 10))
    elif snap_2d:
        story.append(RLImage(snap_2d, width=content_w, height=7.5 * cm))
        story.append(Spacer(1, 10))

    # Design Specifications Table
    design_specs = [
        [Paragraph("<b>System Parameter</b>", BODY_BOLD), Paragraph("<b>Engineering Detail</b>", BODY_BOLD), Paragraph("<b>Parameter</b>", BODY_BOLD), Paragraph("<b>Engineering Detail</b>", BODY_BOLD)],
        [Paragraph("System Rating (DC)", BODY_TEXT), Paragraph(f"<b>{system_kw:.2f} kWp</b>", BODY_BOLD), Paragraph("Total Module Area", BODY_TEXT), Paragraph(f"~{(panel_count * 2.3):.1f} m²", BODY_TEXT)],
        [Paragraph("Module Orientation", BODY_TEXT), Paragraph("Portrait (Shadow Optimized)", BODY_TEXT), Paragraph("Installation Tilt", BODY_TEXT), Paragraph("15° Fixed (True South)", BODY_TEXT)],
        [Paragraph("Structure Framework", BODY_TEXT), Paragraph(f"{struct_type}", BODY_TEXT), Paragraph("Clearance Height", BODY_TEXT), Paragraph(f"{struct_height}", BODY_TEXT)],
        [Paragraph("Module Mid/End Clamps", BODY_TEXT), Paragraph("Aluminium Anodized SS304", BODY_TEXT), Paragraph("Wind Resistance", BODY_TEXT), Paragraph("Up to 150 km/h rated", BODY_TEXT)],
        [Paragraph("Inverter Enclosure", BODY_TEXT), Paragraph("IP65 Weatherproof Exterior", BODY_TEXT), Paragraph("Grid Synchronization", BODY_TEXT), Paragraph("50 Hz ± 5%, Pure Sine Wave", BODY_TEXT)],
    ]
    des_tbl = Table(design_specs, colWidths=[content_w * 0.25, content_w * 0.25, content_w * 0.25, content_w * 0.25])
    des_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f1f5f9')),
        ('BOX', (0,0), (-1,-1), 0.75, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0,0), (-1,-1), 4.5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')]),
    ]))
    story.append(des_tbl)
    story.append(PageBreak())

    # =========================================================================
    # PAGE 5: EQUIPMENT & WARRANTIES
    # =========================================================================
    story.append(Paragraph("Equipment Specifications & Warranty Schedule", SECTION_TITLE))
    story.append(Paragraph("Tier-1 solar equipment, certified balance of system, and manufacturer warranty coverage.", PROP_SUBTITLE))
    story.append(Spacer(1, 6))

    equip_rows = [
        [Paragraph("<b>Equipment / Item</b>", BODY_BOLD), Paragraph("<b>Make & Specification</b>", BODY_BOLD), Paragraph("<b>Qty</b>", BODY_BOLD), Paragraph("<b>Warranty Coverage</b>", BODY_BOLD)],
        [Paragraph("Solar PV Modules", BODY_BOLD), Paragraph(f"<b>{panel_make}</b><br/>{panel_model} ({panel_watt}W)", BODY_TEXT), Paragraph(f"<b>{panel_count} Nos</b>", BODY_TEXT), Paragraph("<b>12 Yrs Product</b><br/>30 Yrs Performance (85%)", BODY_BOLD)],
        [Paragraph("Solar String Inverter", BODY_BOLD), Paragraph(f"<b>{inv_make}</b><br/>Rating: {inv_cap} ({inv_phase})", BODY_TEXT), Paragraph(f"<b>{inv_qty} Nos</b>", BODY_TEXT), Paragraph("<b>10 Yrs Product Warranty</b><br/>With built-in Wi-Fi Logger", BODY_BOLD)],
        [Paragraph("Mounting Framework", BODY_BOLD), Paragraph(f"{struct_type}<br/>{struct_mat}", BODY_TEXT), Paragraph("1 Set", BODY_TEXT), Paragraph("<b>5 Years Structural</b><br/>Corrosion resistance warranty", BODY_TEXT)],
        [Paragraph("Solar DC Cable", BODY_TEXT), Paragraph(f"{cable_brand}<br/>{dc_cable}", BODY_TEXT), Paragraph(f"~{(panel_count * 5 + 20)} m", BODY_TEXT), Paragraph("18 Months Workmanship", BODY_TEXT)],
        [Paragraph("Armoured AC Cable", BODY_TEXT), Paragraph(f"{cable_brand}<br/>{ac_cable}", BODY_TEXT), Paragraph("As per site", BODY_TEXT), Paragraph("18 Months Workmanship", BODY_TEXT)],
        [Paragraph("Array Junction Box (DCDB)", BODY_TEXT), Paragraph("IP65 Enclosure with 1000V DC SPD & Fuses", BODY_TEXT), Paragraph("1 Set", BODY_TEXT), Paragraph("1 Year System Warranty", BODY_TEXT)],
        [Paragraph("Main AC Distribution (ACDB)", BODY_TEXT), Paragraph("IP65 Enclosure with MCB, Isolator & Type-2 SPD", BODY_TEXT), Paragraph("1 Set", BODY_TEXT), Paragraph("1 Year System Warranty", BODY_TEXT)],
        [Paragraph("Earthing Protection", BODY_TEXT), Paragraph("Dual Maintenance-Free Chemical Earth Pits", BODY_TEXT), Paragraph("2 Sets", BODY_TEXT), Paragraph("1 Year System Warranty", BODY_TEXT)],
        [Paragraph("Lightning Arrestor (LA)", BODY_TEXT), Paragraph("Class-I Copper Spike Arrestor with Base Plate", BODY_TEXT), Paragraph("1 Set", BODY_TEXT), Paragraph("1 Year System Warranty", BODY_TEXT)],
    ]
    eq_tbl = Table(equip_rows, colWidths=[content_w * 0.25, content_w * 0.40, content_w * 0.12, content_w * 0.23])
    eq_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f1f5f9')),
        ('BOX', (0,0), (-1,-1), 0.75, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0,0), (-1,-1), 4.5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')]),
    ]))
    story.append(eq_tbl)
    story.append(PageBreak())

    # =========================================================================
    # PAGE 6: SOLAR SAVINGS & ENVIRONMENTAL RETURN (ROI)
    # =========================================================================
    story.append(Paragraph("Solar Savings & Financial Returns (ROI)", SECTION_TITLE))
    story.append(Paragraph("Analysis of energy generation, lifetime bill savings, and green footprint reduction.", PROP_SUBTITLE))
    story.append(Spacer(1, 6))

    # Environmental Green Card
    green_card = [
        [
            [Paragraph(f"{annual_kwh:,.0f} kWh", ParagraphStyle('GNum', parent=KPI_NUM, textColor=GREEN_COLOR)), Paragraph("ANNUAL ENERGY", KPI_LABEL)],
            [Paragraph(format_currency(annual_savings), ParagraphStyle('GNum2', parent=KPI_NUM, textColor=GREEN_COLOR)), Paragraph("YEAR 1 SAVINGS", KPI_LABEL)],
            [Paragraph(f"{co2_tons:.1f} T", ParagraphStyle('GNum3', parent=KPI_NUM, textColor=GREEN_COLOR)), Paragraph("CO₂ MITIGATED / YR", KPI_LABEL)],
            [Paragraph(f"{trees_count} Trees", ParagraphStyle('GNum4', parent=KPI_NUM, textColor=GREEN_COLOR)), Paragraph("TREES EQUIVALENT", KPI_LABEL)],
        ]
    ]
    green_tbl = Table(green_card, colWidths=[content_w / 4.0] * 4)
    green_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), GREEN_BG),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#bbf7d0')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#86efac')),
        ('PADDING', (0,0), (-1,-1), 8),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(green_tbl)
    story.append(Spacer(1, 14))

    # 10-Year Savings Table
    roi_rows = [
        [Paragraph("<b>Year</b>", BODY_BOLD), Paragraph("<b>Generation (kWh)</b>", BODY_BOLD), Paragraph("<b>Tariff (Rs/kWh)</b>", BODY_BOLD), Paragraph("<b>Annual Savings</b>", BODY_BOLD), Paragraph("<b>Cumulative Savings</b>", BODY_BOLD)],
    ]
    cum_sav = 0.0
    tariff_rate = 8.5
    for yr in range(1, 11):
        gen = annual_kwh * (1.0 - (yr - 1) * 0.007)  # 0.7% annual degradation
        sav = gen * tariff_rate
        cum_sav += sav
        roi_rows.append([
            Paragraph(f"Year {yr}", BODY_TEXT),
            Paragraph(f"{gen:,.0f} units", BODY_TEXT),
            Paragraph(f"Rs. {tariff_rate:.2f}", BODY_TEXT),
            Paragraph(f"{format_currency(sav)}", BODY_TEXT),
            Paragraph(f"<b>{format_currency(cum_sav)}</b>", BODY_BOLD),
        ])
        tariff_rate *= 1.03  # 3% annual tariff escalation

    roi_tbl = Table(roi_rows, colWidths=[content_w * 0.15, content_w * 0.22, content_w * 0.18, content_w * 0.22, content_w * 0.23])
    roi_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f1f5f9')),
        ('BOX', (0,0), (-1,-1), 0.75, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0,0), (-1,-1), 3.5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')]),
    ]))
    story.append(roi_tbl)
    story.append(PageBreak())

    # =========================================================================
    # PAGE 7: MONTHLY GENERATION & SAVINGS
    # =========================================================================
    story.append(Paragraph("Monthly Generation & Savings Profile", SECTION_TITLE))
    story.append(Paragraph("Seasonal solar irradiance curves and monthly electricity production breakdown.", PROP_SUBTITLE))
    story.append(Spacer(1, 6))

    months_data = [
        ("January", 0.082), ("February", 0.087), ("March", 0.098),
        ("April", 0.102), ("May", 0.105), ("June", 0.076),
        ("July", 0.065), ("August", 0.068), ("September", 0.078),
        ("October", 0.085), ("November", 0.079), ("December", 0.075)
    ]

    m_rows = [
        [Paragraph("<b>Month</b>", BODY_BOLD), Paragraph("<b>Expected Generation (kWh)</b>", BODY_BOLD), Paragraph("<b>Estimated Savings</b>", BODY_BOLD), Paragraph("<b>Season / Irradiance</b>", BODY_BOLD)],
    ]
    for m_name, pct in months_data:
        m_gen = annual_kwh * pct
        m_sav = m_gen * 8.5
        season_tag = "Summer Peak" if pct >= 0.095 else ("Monsoon Low" if pct <= 0.070 else "Normal Sunshine")
        m_rows.append([
            Paragraph(f"<b>{m_name}</b>", BODY_TEXT),
            Paragraph(f"{m_gen:,.0f} units", BODY_TEXT),
            Paragraph(f"{format_currency(m_sav)}", BODY_TEXT),
            Paragraph(f"{season_tag}", SMALL_TEXT),
        ])
    m_rows.append([
        Paragraph("<b>Total (12 Months)</b>", BODY_BOLD),
        Paragraph(f"<b>{annual_kwh:,.0f} units</b>", BODY_BOLD),
        Paragraph(f"<b>{format_currency(annual_savings)}</b>", BODY_BOLD),
        Paragraph("<b>Annual Summary</b>", BODY_BOLD),
    ])

    m_tbl = Table(m_rows, colWidths=[content_w * 0.25, content_w * 0.30, content_w * 0.25, content_w * 0.20])
    m_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f1f5f9')),
        ('BACKGROUND', (0,-1), (-1,-1), LIGHT_BLUE),
        ('BOX', (0,0), (-1,-1), 0.75, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0,0), (-1,-1), 3.5),
        ('ROWBACKGROUNDS', (0,1), (-1,-2), [colors.white, colors.HexColor('#f8fafc')]),
    ]))
    story.append(m_tbl)
    story.append(PageBreak())

    # =========================================================================
    # PAGE 8: COMMERCIAL OFFER & PAYMENT SCHEDULE
    # =========================================================================
    story.append(Paragraph("Commercial Offer & Payment Milestones", SECTION_TITLE))
    story.append(Paragraph("System investment breakdown, applicable subsidy deduction, and project milestones.", PROP_SUBTITLE))
    story.append(Spacer(1, 6))

    comm_rows = [
        [Paragraph("<b>Component / Charge Description</b>", BODY_BOLD), Paragraph("<b>Amount (Rs.)</b>", BODY_BOLD)],
        [Paragraph(f"Solar PV System Base Package ({system_kw:.2f} kWp with Modules, Inverter, Structure & Cables)", BODY_TEXT), Paragraph(format_currency(system_price), BODY_TEXT)],
        [Paragraph("Additional Structural / Civil Charges (if applicable)", BODY_TEXT), Paragraph(format_currency(additional_charges), BODY_TEXT)],
        [Paragraph("DISCOM Net-Metering & Liaisoning Charges", BODY_TEXT), Paragraph(format_currency(net_meter_charges), BODY_TEXT)],
        [Paragraph(f"Goods & Services Tax (GST @ {gst_pct}%)", BODY_TEXT), Paragraph(format_currency(gst_amount), BODY_TEXT)],
        [Paragraph("<b>Gross Project Cost (Incl. GST)</b>", BODY_BOLD), Paragraph(f"<b>{format_currency(gross_cost)}</b>", BODY_BOLD)],
        [
            Paragraph("<b>Government Subsidy (PM Surya Ghar Muft Bijli Yojana)</b><br/><font color='#64748b' size='7.5'>Credited directly to customer bank account post-commissioning</font>", BODY_TEXT),
            Paragraph(f"<b><font color='#15803d'>- {format_currency(subsidy_amount)}</font></b>", BODY_BOLD)
        ],
        [
            Paragraph("<b><font size='11'>FINAL NET COST TO CUSTOMER</font></b>", BODY_BOLD),
            Paragraph(f"<b><font color='#1d4ed8' size='13'>{format_currency(net_customer_cost)}</font></b>", BODY_BOLD)
        ]
    ]
    comm_tbl = Table(comm_rows, colWidths=[content_w * 0.70, content_w * 0.30])
    comm_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f1f5f9')),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor('#eff6ff')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#93c5fd')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(comm_tbl)
    story.append(Spacer(1, 14))

    # Payment Schedule Table
    story.append(Paragraph("<b>Project Payment Milestones</b>", BODY_BOLD))
    story.append(Spacer(1, 4))
    milestones = [
        ("Milestone 1", "Advance along with confirmed Work Order", 0.20),
        ("Milestone 2", "Upon material dispatch readiness / delivery at site", 0.70),
        ("Milestone 3", "Upon complete mechanical & electrical installation", 0.05),
        ("Milestone 4", "Upon Net-Meter installation & solar commissioning", 0.05),
    ]
    m_rows = [
        [Paragraph("<b>Stage</b>", BODY_BOLD), Paragraph("<b>Milestone Description</b>", BODY_BOLD), Paragraph("<b>Share (%)</b>", BODY_BOLD), Paragraph("<b>Payable Amount</b>", BODY_BOLD)],
    ]
    for stage, desc, pct in milestones:
        m_amt = net_customer_cost * pct
        m_rows.append([
            Paragraph(f"<b>{stage}</b>", BODY_TEXT),
            Paragraph(f"{desc}", BODY_TEXT),
            Paragraph(f"{int(pct * 100)}%", BODY_TEXT),
            Paragraph(f"<b>{format_currency(m_amt)}</b>", BODY_BOLD),
        ])
    m_tbl2 = Table(m_rows, colWidths=[content_w * 0.18, content_w * 0.50, content_w * 0.12, content_w * 0.20])
    m_tbl2.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f1f5f9')),
        ('BOX', (0,0), (-1,-1), 0.75, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0,0), (-1,-1), 4.5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')]),
    ]))
    story.append(m_tbl2)
    story.append(PageBreak())

    # =========================================================================
    # PAGE 9: PROJECT TIMELINE & SCOPE MATRIX
    # =========================================================================
    story.append(Paragraph("Project Timeline & Scope Matrix", SECTION_TITLE))
    story.append(Paragraph("Step-by-step project delivery schedule and boundary of technical responsibilities.", PROP_SUBTITLE))
    story.append(Spacer(1, 6))

    # Timeline Table
    time_rows = [
        [Paragraph("<b>Stage / Phase</b>", BODY_BOLD), Paragraph("<b>Scope Activity</b>", BODY_BOLD), Paragraph("<b>Target Duration</b>", BODY_BOLD)],
        [Paragraph("Phase 1", BODY_BOLD), Paragraph("Finalization of Design, Structural Drawings & Shadow Modeling", BODY_TEXT), Paragraph("<b>7 Days</b>", BODY_BOLD)],
        [Paragraph("Phase 2", BODY_BOLD), Paragraph("Engineering, Procurement & Material Dispatch to Site", BODY_TEXT), Paragraph("<b>15 Days</b>", BODY_BOLD)],
        [Paragraph("Phase 3", BODY_BOLD), Paragraph("Rooftop Structure Installation, Module Mounting & Cabling", BODY_TEXT), Paragraph("<b>20 Days</b>", BODY_BOLD)],
        [Paragraph("Phase 4", BODY_BOLD), Paragraph("DISCOM Inspection, Net Metering & Plant Handover", BODY_TEXT), Paragraph("<b>14 Days</b>", BODY_BOLD)],
        [Paragraph("<b>Total Cycle</b>", BODY_BOLD), Paragraph("<b>Complete Turnkey Plant Commissioning</b>", BODY_BOLD), Paragraph("<b>~56 Days</b>", BODY_BOLD)]
    ]
    time_tbl = Table(time_rows, colWidths=[content_w * 0.20, content_w * 0.60, content_w * 0.20])
    time_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f1f5f9')),
        ('BACKGROUND', (0,-1), (-1,-1), LIGHT_BLUE),
        ('BOX', (0,0), (-1,-1), 0.75, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(time_tbl)
    story.append(Spacer(1, 14))

    # Scope Matrix (Our Scope vs Customer Scope)
    scope_data = [
        [
            Paragraph(f"<b>SCOPE OF WORK ({company_name.upper()})</b>", ParagraphStyle('Sc1', parent=BODY_BOLD, textColor=ACCENT_BLUE)),
            Paragraph("<b>CUSTOMER SCOPE OF RESPONSIBILITY</b>", ParagraphStyle('Sc2', parent=BODY_BOLD, textColor=colors.HexColor('#d97706')))
        ],
        [
            Paragraph("""
            ✓ Detailed site survey and shadow analysis<br/>
            ✓ Supply of Tier-1 solar modules & inverter<br/>
            ✓ Mounting structure supply and installation<br/>
            ✓ DC & AC cabling with conduits<br/>
            ✓ ACDB, DCDB & Lightning protection system<br/>
            ✓ Dual maintenance-free chemical earthing<br/>
            ✓ Complete mechanical & electrical wiring<br/>
            ✓ DISCOM Net-Metering liaisoning & paperwork<br/>
            ✓ Plant testing, pre-commissioning & handover<br/>
            ✓ Mobile app monitoring configuration
            """, BODY_TEXT),
            Paragraph("""
            ✓ Provide clear, shadow-free rooftop space<br/>
            ✓ Safe & lockable storage for delivered goods<br/>
            ✓ Continuous electricity & water for installation<br/>
            ✓ Timely design review and documentation signoff<br/>
            ✓ Timely milestone payments as per schedule<br/>
            ✓ Statutory DISCOM meter fees (paid directly)<br/>
            ✓ Reasonable roof access for service engineers
            """, BODY_TEXT)
        ]
    ]
    scope_tbl = Table(scope_data, colWidths=[content_w * 0.5, content_w * 0.5])
    scope_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (0,0), LIGHT_BLUE),
        ('BACKGROUND', (1,0), (1,0), colors.HexColor('#fef3c7')),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0,0), (-1,-1), 6),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]))
    story.append(scope_tbl)
    story.append(PageBreak())

    # =========================================================================
    # PAGE 10: TERMS & CONDITIONS
    # =========================================================================
    story.append(Paragraph("General Terms & Conditions", SECTION_TITLE))
    story.append(Paragraph("Commercial guidelines, delivery terms, and operational warranties.", PROP_SUBTITLE))
    story.append(Spacer(1, 6))

    terms_list = [
        ("1. Price Validity", f"This commercial quotation is valid for a period of 15 calendar days from the date of issuance ({prop_date}). Prices are subject to revision thereafter based on prevailing raw material and module costs."),
        ("2. Taxes & Duties", "Goods and Services Tax (GST) is charged at current applicable rates for solar power projects. Any statutory variation in government taxes or duties at the time of supply shall be to the customer's account."),
        ("3. Packing & Transportation", "Standard packing, handling, and freight charges for delivery up to the project site boundary are included in the quoted price unless specifically excluded."),
        ("4. Storage & Custody", "Safe, covered, and weatherproof storage at the site is the custodial responsibility of the customer once materials are delivered."),
        ("5. Civil & Roof Penetration", "Standard civil grouting and non-penetrating rooftop ballast mountings are covered. Heavy structural alterations or roof slab reinforcement if required by site conditions will be billed extra at actuals."),
        ("6. Water & Power Supply", "Continuous water supply (for civil curing and module washing) and electrical power for power tools during erection must be provided free of charge by the customer."),
        ("7. Net Metering & Grid Availability", "Net-metering sanctions are subject to DISCOM feeder capacity and regulatory approval. The company will act as liaison partner, but grid availability and DISCOM processing timelines are beyond company control."),
        ("8. Force Majeure", "Delivery and completion schedules are subject to Force Majeure circumstances including natural calamities, severe weather events, strikes, grid outages, or governmental restrictions.")
    ]

    t_cells = []
    for t_head, t_desc in terms_list:
        t_cells.append([
            Paragraph(f"<b>{t_head}</b>", BODY_BOLD),
            Paragraph(f"{t_desc}", SMALL_TEXT)
        ])
    t_tbl = Table(t_cells, colWidths=[content_w * 0.28, content_w * 0.72])
    t_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#ffffff')),
        ('BOX', (0,0), (-1,-1), 0.75, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0,0), (-1,-1), 5),
        ('ROWBACKGROUNDS', (0,0), (-1,-1), [colors.white, colors.HexColor('#f8fafc')]),
    ]))
    story.append(t_tbl)
    story.append(PageBreak())

    # =========================================================================
    # PAGE 11: THANK YOU & CONTACT / ACCEPTANCE
    # =========================================================================
    story.append(Paragraph("Project Acceptance & Signoff", SECTION_TITLE))
    story.append(Paragraph("Company contact details, banking instructions, and formal proposal acceptance.", PROP_SUBTITLE))
    story.append(Spacer(1, 10))

    # Bank Details Box
    bank_name = company.get("bank_name") or "State Bank of India / HDFC Bank"
    acc_name = company.get("account_name") or company_name
    acc_no = company.get("account_number") or company.get("acc_number") or "XXXXXXXXXX (Available on Request)"
    ifsc = company.get("ifsc_code") or company.get("ifsc") or "SBIN000XXXX"
    branch = company.get("branch") or "Main Branch"

    bank_data = [
        [Paragraph("<b>OFFICIAL PAYMENT & BANK DETAILS:</b>", ParagraphStyle('BH', parent=BODY_BOLD, textColor=ACCENT_BLUE)), Paragraph("<b>AUTHORIZED COMPANY SIGNATORY:</b>", ParagraphStyle('BH2', parent=BODY_BOLD, textColor=ACCENT_BLUE))],
        [Paragraph(f"Account Name: <b>{acc_name}</b>", BODY_TEXT), Paragraph(f"Company: <b>{company_name}</b>", BODY_TEXT)],
        [Paragraph(f"Bank Name: <b>{bank_name}</b>", BODY_TEXT), Paragraph(f"Authorized Person: <b>{co_owner or prepared_by}</b>", BODY_TEXT)],
        [Paragraph(f"Account Number: <b>{acc_no}</b>", BODY_TEXT), Paragraph(f"GSTIN: <b>{co_gst}</b>", BODY_TEXT)],
        [Paragraph(f"IFSC Code: <b>{ifsc}</b> (Branch: {branch})", BODY_TEXT), Paragraph(f"Contact: <b>{co_mobile}</b>", BODY_TEXT)]
    ]
    b_tbl = Table(bank_data, colWidths=[content_w * 0.5, content_w * 0.5])
    b_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#cbd5e1')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0,0), (-1,-1), 7),
    ]))
    story.append(b_tbl)
    story.append(Spacer(1, 2.0 * cm))

    # Signature Acceptance Block
    sig_data = [
        [
            Paragraph("<b>FOR {}:</b><br/><br/><br/><br/>___________________________________<br/>Authorized Signatory & Stamp".format(company_name.upper()), BODY_TEXT),
            Paragraph("<b>CUSTOMER ACCEPTANCE:</b><br/><br/><br/><br/>___________________________________<br/>Signature & Date ({})".format(customer_name), BODY_TEXT)
        ]
    ]
    sig_tbl = Table(sig_data, colWidths=[content_w * 0.5, content_w * 0.5])
    sig_tbl.setStyle(TableStyle([
        ('BOX', (0,0), (-1,-1), 0.75, BORDER_COLOR),
        ('PADDING', (0,0), (-1,-1), 12),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]))
    story.append(sig_tbl)
    story.append(Spacer(1, 1.5 * cm))

    story.append(Paragraph(f"Thank you for choosing <b>{company_name}</b> as your clean energy partner.", ParagraphStyle('Ty', parent=BODY_BOLD, alignment=1, textColor=ACCENT_BLUE)))

    # Build Document with ProposalCanvas carrying template settings
    def canvas_factory(*args, **kwargs):
        c = ProposalCanvas(*args, **kwargs)
        c.template_id = template_id
        c.company_name = company_name
        c.co_owner = co_owner
        c.co_mobile = co_mobile
        c.co_email = co_email
        return c

    doc.build(story, canvasmaker=canvas_factory)
    return buf.getvalue()
