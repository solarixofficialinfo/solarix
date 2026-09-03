"""
Solarix Proposal Generator — High-Resolution Vector PDF Builder
Dual Professional Proposal Templates:
  - Template 1: Solarix Premium (Modern solar EPC layout with deep navy/slate accents)
  - Template 2: Solarix Corporate (Directly follows uploaded SolarProof reference PDF)
Standardized 8-page architecture across both templates with 100% backward compatibility.
"""

import io
import os
import base64
import logging
from typing import Dict, Any, Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image as RLImage, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

logger = logging.getLogger(__name__)

# Register standard clean fonts
try:
    pdfmetrics.registerFont(TTFont('Helvetica', 'Helvetica.ttf'))
    pdfmetrics.registerFont(TTFont('Helvetica-Bold', 'Helvetica-Bold.ttf'))
    PDF_FONT = 'Helvetica'
    PDF_FONT_BOLD = 'Helvetica-Bold'
except Exception:
    PDF_FONT = 'Helvetica'
    PDF_FONT_BOLD = 'Helvetica-Bold'

styles = getSampleStyleSheet()

PRIMARY_COLOR = colors.HexColor('#0f172a')     # Dark Slate / Navy
ACCENT_BLUE   = colors.HexColor('#0284c7')     # Reference PDF Cyan / Solar Blue
ACCENT_GOLD   = colors.HexColor('#f59e0b')     # Amber Accent
LIGHT_BLUE    = colors.HexColor('#f0f9ff')     # Reference Soft Cyan Tint
BORDER_COLOR  = colors.HexColor('#cbd5e1')     # Slate 300
MUTED_TEXT    = colors.HexColor('#64748b')     # Slate 500
GREEN_COLOR   = colors.HexColor('#15803d')     # Emerald 700
GREEN_BG      = colors.HexColor('#f0fdf4')     # Emerald 50

PROP_TITLE = ParagraphStyle('PropTitle', parent=styles['Normal'], fontName=PDF_FONT_BOLD, fontSize=24, leading=28, textColor=PRIMARY_COLOR)
PROP_SUBTITLE = ParagraphStyle('PropSub', parent=styles['Normal'], fontName=PDF_FONT, fontSize=10, leading=14, textColor=MUTED_TEXT)
SECTION_TITLE = ParagraphStyle('PropSec', parent=styles['Normal'], fontName=PDF_FONT_BOLD, fontSize=16, leading=20, textColor=PRIMARY_COLOR, spaceAfter=4)
BODY_TEXT = ParagraphStyle('PropBody', parent=styles['Normal'], fontName=PDF_FONT, fontSize=8.5, leading=12, textColor=colors.HexColor('#1e293b'))
BODY_BOLD = ParagraphStyle('PropBodyBold', parent=styles['Normal'], fontName=PDF_FONT_BOLD, fontSize=8.5, leading=12, textColor=PRIMARY_COLOR)
SMALL_TEXT = ParagraphStyle('PropSmall', parent=styles['Normal'], fontName=PDF_FONT, fontSize=7.5, leading=10, textColor=MUTED_TEXT)
KPI_NUM = ParagraphStyle('PropKPINum', parent=styles['Normal'], fontSize=13, fontName=PDF_FONT_BOLD, textColor=ACCENT_BLUE, alignment=1, leading=16)
KPI_LABEL = ParagraphStyle('PropKPILbl', parent=styles['Normal'], fontSize=7.5, fontName=PDF_FONT_BOLD, textColor=MUTED_TEXT, alignment=1, leading=10)


class ProposalCanvas(canvas.Canvas):
    """Canvas with professional page numbers and template-specific header/footer decorations."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.pages = []
        self.template_id = "template1"
        self.company_name = "Solarix Solar"
        self.rep_name = "Solar Representative"
        self.rep_phone = "+91 98765 43210"
        self.rep_email = "info@solarix.energy"
        self.customer_name = "Valued Customer"

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

        if self.template_id == "template2":
            # ── TEMPLATE 02 (SOLARIX CORPORATE / REFERENCE PDF STYLE) ────────
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
            contact_parts = list(filter(None, [self.rep_name, self.rep_phone, self.rep_email, self.company_name]))
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
            # ── TEMPLATE 01 (SOLARIX PREMIUM) ────────────────────────────────
            # Top decorative navy line
            self.setStrokeColor(colors.HexColor('#0f172a'))
            self.setLineWidth(1.5)
            self.line(1.5 * cm, page_h - 1.2 * cm, page_w - 1.5 * cm, page_h - 1.2 * cm)

            # Header label
            self.setFont(PDF_FONT_BOLD, 7.5)
            self.setFillColor(colors.HexColor('#1e3a8a'))
            self.drawString(1.5 * cm, page_h - 1.0 * cm, f"{self.company_name.upper()} — SOLAR ROOFTOP PROPOSAL")

            # Bottom footer line
            self.setStrokeColor(colors.HexColor('#e2e8f0'))
            self.setLineWidth(0.75)
            self.line(1.5 * cm, 1.3 * cm, page_w - 1.5 * cm, 1.3 * cm)

            # Footer text
            self.setFont(PDF_FONT, 7.5)
            self.setFillColor(MUTED_TEXT)
            self.drawString(1.5 * cm, 0.9 * cm, f"Confidential — Prepared specifically for {self.customer_name}")
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
    """Generate complete 8-page professional customer proposal PDF."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm,
        topMargin=1.6 * cm,
        bottomMargin=1.8 * cm
    )

    story = []
    page_w, page_h = A4
    content_w = page_w - 3.0 * cm

    # Extract template choice (default to template1)
    template_id = doc_data.get("template_id") or "template1"

    # Extract Company Information
    company_name = company.get("company_name") or company.get("name") or "Solarix Solar Energy EPC"
    co_owner = company.get("owner_name") or "Chris Taeni"
    co_mobile = company.get("mobile") or company.get("phone") or "0411 549 054"
    co_email = company.get("email") or "chris@solarproof.com.au"
    co_addr = company.get("address") or "Brisbane City, QLD, 4000"
    co_gst = company.get("gst_number") or ""

    # Extract Proposal Information
    prop_number = doc_data.get("proposal_number") or "PROP-2026-001"
    prop_date = doc_data.get("proposal_date") or "2026-09-03"
    valid_until = doc_data.get("valid_until") or "20/10/26"
    customer_name = doc_data.get("customer_name") or "Billy Bines"
    mobile = doc_data.get("mobile") or "0444 444 444"
    email = doc_data.get("email") or "billybines@solarproof.com.au"
    site_address = doc_data.get("site_address") or "222 Margaret Street"
    city = doc_data.get("city") or "Brisbane City"
    state = doc_data.get("state") or "QLD"
    pincode = doc_data.get("pincode") or "4000"
    full_address = f"{site_address}, {city}, {state} {pincode}".strip(", ")
    project_type = doc_data.get("project_type") or "Residential"
    solar_system_type = doc_data.get("solar_system_type") or "Grid Connected / On Grid"
    prepared_by = doc_data.get("prepared_by") or co_owner
    rep_phone = doc_data.get("representative_phone") or co_mobile
    rep_email = doc_data.get("representative_email") or co_email
    retailer = doc_data.get("customer_retailer") or "Origin Energy"
    nmi = doc_data.get("customer_nmi") or "Essential Energy / 4001292991"
    project_notes = doc_data.get("proposal_notes") or "Standard rooftop installation. Inverter located with minimum 300mm ventilation clearance. Real-time smartphone monitoring included."

    # Technical Specs
    system_kw = float(doc_data.get("system_kw") or 8.32)
    roof_area = float(doc_data.get("roof_area_sqm") or 41.4)
    usable_area = float(doc_data.get("usable_area_sqm") or 35.0)
    tilt_deg = float(doc_data.get("tilt_deg") or 22)
    azimuth_deg = float(doc_data.get("azimuth_deg") or 317.5)

    # Equipment
    panel = doc_data.get("panel") or {}
    panel_make = panel.get("make") or "SunPower Corporation"
    panel_model = panel.get("model") or "SPR-E19-320"
    panel_watt = int(panel.get("wattage") or 320)
    panel_count = int(panel.get("quantity") or 26)

    inverter = doc_data.get("inverter") or {}
    inv_make = inverter.get("make") or "ABB Power-One Aurora"
    inv_cap = inverter.get("capacity") or "10kW"
    inv_model = inverter.get("model") or "PVI-10.0-TL-OUTD-FS"
    inv_phase = inverter.get("phase") or "Single Phase"
    inv_qty = int(inverter.get("quantity") or 1)

    battery_included = bool(doc_data.get("battery_included"))
    battery = doc_data.get("battery") or {}
    battery_make = battery.get("make") or "LiFePO4 Storage"
    battery_cap = battery.get("capacity") or "5.0 kWh"
    battery_qty = int(battery.get("quantity") or 1)
    battery_str = f"{battery_qty} × {battery_make} ({battery_cap})" if battery_included else "NA"

    structure = doc_data.get("structure") or {}
    struct_type = structure.get("type") or "Newest Clenergy"
    struct_height = structure.get("height") or "Flush / Standard Clearance"
    struct_mat = structure.get("material") or "Anodized Aluminium & SS304"

    # Warranties
    w_panel = doc_data.get("warranty_panel_performance") or "25 Years Guaranteed Performance 80% / 10 Years Material"
    w_inverter = doc_data.get("warranty_inverter") or "10 Years / 10 Years"
    w_battery = doc_data.get("warranty_battery") or ("10 Years Limited Warranty" if battery_included else "NA")
    w_mounting = doc_data.get("warranty_mounting") or "10 Years Racking"
    w_workmanship = doc_data.get("warranty_workmanship") or "5 Years Workmanship"

    # Financials & Metrics
    annual_kwh = float(doc_data.get("annual_kwh") or (system_kw * 1040))
    annual_savings = float(doc_data.get("annual_savings") or (annual_kwh * 14.5))
    lifetime_savings = float(doc_data.get("lifetime_savings") or (annual_savings * 25))
    payback_years = float(doc_data.get("payback_years") or 4.90)
    co2_tons = float(doc_data.get("co2_tons") or (annual_kwh * 0.82 / 1000.0))
    trees_count = int(doc_data.get("trees_count") or (co2_tons * 45))

    system_price = float(doc_data.get("system_price") or 450000)
    additional_charges = float(doc_data.get("additional_charges") or 0)
    net_meter_charges = float(doc_data.get("net_meter_charges") or 0)
    gst_pct = float(doc_data.get("gst_pct") or 13.8)
    gross_cost = float(doc_data.get("gross_cost") or (system_price + additional_charges + net_meter_charges))
    gst_amount = float(doc_data.get("gst_amount") or (gross_cost * gst_pct / 100.0))
    subsidy_applicable = bool(doc_data.get("subsidy_applicable"))
    subsidy_amount = float(doc_data.get("subsidy_amount") or 0) if subsidy_applicable else 0.0
    custom_discount = float(doc_data.get("custom_discount") or 0)
    net_customer_cost = float(doc_data.get("net_customer_cost") or (gross_cost - subsidy_amount - custom_discount))
    inv_roi_pct = (annual_savings / max(1.0, net_customer_cost) * 100.0)

    daily_usage = float(doc_data.get("daily_usage_kwh") or 20.0)
    annual_usage = float(doc_data.get("annual_usage_kwh") or 7301)
    current_qtr_bill = float(doc_data.get("current_quarterly_bill") or 68300)
    post_solar_qtr_bill = float(doc_data.get("post_solar_quarterly_bill") or 29700)
    self_consumption_pct = float(doc_data.get("self_consumption_pct") or 46.68)
    grid_export_pct = float(doc_data.get("grid_export_pct") or 53.32)

    # =========================================================================
    # PAGE 1: COVER PAGE / HERO
    # =========================================================================
    if template_id == "template2":
        # ── TEMPLATE 2: SOLARIX CORPORATE (REFERENCE PDF STYLE) ──────────────
        story.append(Spacer(1, 0.8 * cm))

        # Contact Details Header Table
        prep_html = f"""
        <font color='#0284c7'><b>Prepared by:</b></font><br/>
        <b>{prepared_by}</b><br/>
        {rep_phone}<br/>
        {rep_email}<br/>
        <font color='#0284c7'><b>{company_name}</b></font>
        """
        creat_html = f"""
        <font color='#0284c7'><b>Created for:</b></font><br/>
        <b>{customer_name}</b><br/>
        {mobile}<br/>
        {email}<br/>
        {full_address}<br/><br/>
        <b>Date:</b> {prop_date} &nbsp;·&nbsp; <b>Project No.:</b> {prop_number}
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

        # Title Block inspired by Reference PDF
        story.append(Paragraph("SOLAR POWER", ParagraphStyle('T2Sub', parent=PROP_SUBTITLE, fontSize=18, fontName=PDF_FONT_BOLD, textColor=colors.HexColor('#0284c7'), spaceAfter=2, leading=22)))
        story.append(Paragraph("PROPOSAL", ParagraphStyle('T2Main', parent=PROP_TITLE, fontSize=32, leading=36, textColor=PRIMARY_COLOR, spaceAfter=4)))
        story.append(Paragraph(f"<b>{system_kw:.2f}kW</b>", ParagraphStyle('T2Kw', parent=PROP_TITLE, fontSize=40, leading=44, textColor=colors.HexColor('#0284c7'))))
        story.append(Spacer(1, 1.2 * cm))

        # INVESTMENT SUMMARY BLOCK (Exact Reference PDF layout)
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

        val_tbl = Table([[
            Paragraph(f"<b>{company_name}</b> · {co_addr}", SMALL_TEXT),
            Paragraph(f"Proposal Valid Until: <b>{valid_until}</b>", ParagraphStyle('Val', parent=BODY_BOLD, alignment=2, textColor=colors.HexColor('#0284c7')))
        ]], colWidths=[content_w * 0.65, content_w * 0.35])
        val_tbl.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'MIDDLE')]))
        story.append(val_tbl)
        story.append(PageBreak())

    else:
        # ── TEMPLATE 1: SOLARIX PREMIUM COVER ────────────────────────────────
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
        story.append(HRFlowable(width="100%", thickness=2, color=PRIMARY_COLOR, spaceBefore=0, spaceAfter=20))

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
        story.append(Paragraph(f"<b>{company_name}</b> · {co_addr} · {rep_phone} · {rep_email}", ParagraphStyle('CoFt', parent=SMALL_TEXT, alignment=1)))
        story.append(PageBreak())

    # =========================================================================
    # PAGE 2: ABOUT US / COMPANY PROFILE
    # =========================================================================
    p2_color = colors.HexColor('#0284c7') if template_id == "template2" else PRIMARY_COLOR
    story.append(Paragraph("ABOUT US", ParagraphStyle('P2Title', parent=SECTION_TITLE, fontSize=18, textColor=p2_color)))
    story.append(Paragraph("We are an experienced solar installation company with a special focus on providing the best possible products to you with the best possible service.", PROP_SUBTITLE))
    story.append(Spacer(1, 14))

    about_text = f"""
    <b>OUR COMPANY: About {company_name}</b><br/>
    <b>{company_name}</b> is a dedicated clean energy engineering and EPC company focused on delivering dependable, long-term power generation. 
    Our mission is to make high-quality, high-yield solar rooftop installations transparent, affordable, and seamless. We work closely with each client to engineer a custom system that perfectly aligns with site geometry and electrical demand.
    <br/><br/>
    <b>Key Capabilities & Engineering Standards:</b>
    <br/>• Precision 3D rooftop modeling and multi-angle shadow analysis
    <br/>• Tier-1 high-efficiency solar modules with manufacturer backed performance warranty
    <br/>• Certified string inverters equipped with real-time cloud data-loggers
    <br/>• Comprehensive state DISCOM liaisoning for rapid Net-Metering and central subsidy settlement
    <br/>• Dedicated local maintenance teams providing 24-48 hour service turnaround
    """
    story.append(Paragraph(about_text, BODY_TEXT))
    story.append(Spacer(1, 16))

    # Contact Us Box
    contact_box = [
        [Paragraph(f"<b>CONTACT US</b>", ParagraphStyle('P2H', parent=BODY_BOLD, textColor=p2_color)), Paragraph("<b>YOUR REPRESENTATIVE</b>", ParagraphStyle('P2H2', parent=BODY_BOLD, textColor=p2_color))],
        [Paragraph(f"<b>{company_name}</b><br/>{co_addr}<br/>{rep_phone} · {rep_email}", BODY_TEXT), Paragraph(f"<b>{prepared_by}</b><br/>Phone: {rep_phone}<br/>Email: {rep_email}", BODY_TEXT)]
    ]
    ct_tbl = Table(contact_box, colWidths=[content_w * 0.5, content_w * 0.5])
    ct_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0,0), (-1,-1), 8),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]))
    story.append(ct_tbl)
    story.append(PageBreak())

    # =========================================================================
    # PAGE 3: SITE ANALYSIS
    # =========================================================================
    story.append(Paragraph("SITE ANALYSIS", ParagraphStyle('P3Title', parent=SECTION_TITLE, fontSize=18, textColor=p2_color)))
    story.append(Paragraph("We have reviewed your site and determined the below information to be correct and suitable for your premises.", PROP_SUBTITLE))
    story.append(Spacer(1, 10))

    # Rooftop Snapshot Image
    snap_3d = _decode_b64(doc_data.get("layout_snapshot_3d") or doc_data.get("snapshot_3d"))
    snap_2d = _decode_b64(doc_data.get("layout_snapshot_2d") or doc_data.get("snapshot_2d"))

    if snap_3d or snap_2d:
        img_to_use = snap_3d or snap_2d
        story.append(RLImage(img_to_use, width=content_w, height=8.0 * cm))
        story.append(Spacer(1, 12))
    else:
        story.append(Spacer(1, 3.0 * cm))

    # System Summary Table (Exact Reference PDF layout)
    story.append(Paragraph("<b>SYSTEM SUMMARY</b>", ParagraphStyle('SSH', parent=BODY_BOLD, textColor=p2_color, fontSize=11)))
    story.append(Spacer(1, 4))
    site_sum = [
        [Paragraph(f"<b>Site Address:</b> {full_address}", BODY_TEXT), "", ""],
        [Paragraph("<b>Array Capacity</b>", BODY_BOLD), Paragraph("<b>Tilt Angle</b>", BODY_BOLD), Paragraph("<b>Direction (from North)</b>", BODY_BOLD)],
        [Paragraph(f"<b>{system_kw:.2f}kW</b>", BODY_BOLD), Paragraph(f"{tilt_deg:.1f}°", BODY_TEXT), Paragraph(f"{azimuth_deg:.1f}°", BODY_TEXT)],
    ]
    ss_tbl = Table(site_sum, colWidths=[content_w * 0.40, content_w * 0.30, content_w * 0.30])
    ss_tbl.setStyle(TableStyle([
        ('SPAN', (0,0), (2,0)),
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f8fafc')),
        ('BACKGROUND', (0,1), (-1,1), colors.HexColor('#0284c7') if template_id == "template2" else colors.HexColor('#f1f5f9')),
        ('TEXTCOLOR', (0,1), (-1,1), colors.white if template_id == "template2" else PRIMARY_COLOR),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0,0), (-1,-1), 6),
        ('ALIGN', (0,1), (-1,-1), 'CENTER'),
    ]))
    story.append(ss_tbl)
    story.append(PageBreak())

    # =========================================================================
    # PAGE 4: ENERGY NEEDS
    # =========================================================================
    story.append(Paragraph("ENERGY NEEDS", ParagraphStyle('P4Title', parent=SECTION_TITLE, fontSize=18, textColor=p2_color)))
    story.append(Paragraph("We have thoroughly assessed your energy use to determine the best solar solution to fit your needs.", PROP_SUBTITLE))
    story.append(Spacer(1, 10))

    # Your Energy Use Card
    energy_use_card = [
        [Paragraph("<b>YOUR ENERGY USE</b>", ParagraphStyle('EH', parent=BODY_BOLD, textColor=p2_color))],
        [Paragraph(f"Current Energy Use Per Day: <b>{daily_usage:.1f} kWh/day</b><br/>Current Annual Use: <b>{annual_usage:,.0f} kWh</b>", BODY_TEXT)]
    ]
    eu_tbl = Table(energy_use_card, colWidths=[content_w])
    eu_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('PADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(eu_tbl)
    story.append(Spacer(1, 12))

    # Your Power Bill Card
    bill_card = [
        [Paragraph("<b>YOUR POWER BILL</b>", ParagraphStyle('BH', parent=BODY_BOLD, textColor=p2_color)), ""],
        [Paragraph("Current Quarterly Power Bill:", BODY_TEXT), Paragraph(f"<b>{format_currency(current_qtr_bill)} /quarter</b>", BODY_BOLD)],
        [Paragraph("Quarterly Power Bill After Solar:", BODY_TEXT), Paragraph(f"<b>{format_currency(post_solar_qtr_bill)} /quarter</b>", BODY_BOLD)],
        [Paragraph("<b>Your Overall (Lifetime) Power Bill Savings Estimate:</b>", BODY_BOLD), Paragraph(f"<b><font color='#15803d'>{format_currency(lifetime_savings)}</font></b>", BODY_BOLD)],
    ]
    b_tbl = Table(bill_card, colWidths=[content_w * 0.65, content_w * 0.35])
    b_tbl.setStyle(TableStyle([
        ('SPAN', (0,0), (1,0)),
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('INNERGRID', (0,1), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0,0), (-1,-1), 7),
    ]))
    story.append(b_tbl)
    story.append(PageBreak())

    # =========================================================================
    # PAGE 5: SOLAR SYSTEM & GENERATION ESTIMATES
    # =========================================================================
    story.append(Paragraph("SOLAR SYSTEM", ParagraphStyle('P5Title', parent=SECTION_TITLE, fontSize=18, textColor=p2_color)))
    story.append(Paragraph("The solar system we have proposed for your premises will decrease your reliance on fossil-fuel 'grid' energy and save you money on your power bill.", PROP_SUBTITLE))
    story.append(Spacer(1, 10))

    # System Performance
    perf_rows = [
        [Paragraph("<b>SYSTEM PERFORMANCE (MONTHLY)</b>", ParagraphStyle('PH', parent=BODY_BOLD, textColor=p2_color)), ""],
        [Paragraph(f"Average Solar Energy Produced: <b>{(annual_kwh / 365):.1f} kWh/day</b>", BODY_TEXT), Paragraph(f"Solar Energy Produced (Year 1): <b>{annual_kwh:,.0f} kWh</b>", BODY_TEXT)],
        [Paragraph(f"Solar Exported / Self-Consumed: <b>{grid_export_pct:.1f}% / {self_consumption_pct:.1f}%</b>", BODY_TEXT), Paragraph(f"Carbon Mitigation: <b>{co2_tons:.1f} Tonnes / Year</b>", BODY_TEXT)],
    ]
    p_tbl = Table(perf_rows, colWidths=[content_w * 0.5, content_w * 0.5])
    p_tbl.setStyle(TableStyle([
        ('SPAN', (0,0), (1,0)),
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('INNERGRID', (0,1), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0,0), (-1,-1), 7),
    ]))
    story.append(p_tbl)
    story.append(Spacer(1, 14))

    # Solar Generation Estimates Table (Jan - Dec)
    story.append(Paragraph("<b>Solar Generation Estimates (All Figures in kWhs)</b>", ParagraphStyle('SGH', parent=BODY_BOLD, textColor=p2_color)))
    story.append(Spacer(1, 4))
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    weights = [0.104, 0.083, 0.087, 0.073, 0.059, 0.057, 0.067, 0.080, 0.094, 0.093, 0.098, 0.105]
    days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    shades = [5, 4, 12, 11, 10, 23, 26, 33, 9, 10, 10, 6]

    tbl_headers = [Paragraph("<b>Month</b>", SMALL_TEXT)] + [Paragraph(f"<b>{m}</b>", SMALL_TEXT) for m in months]
    totals = [Paragraph("<b>Total</b>", SMALL_TEXT)] + [Paragraph(f"{int(annual_kwh * w)}", SMALL_TEXT) for w in weights]
    shade_row = [Paragraph("<b>Shade Losses</b>", SMALL_TEXT)] + [Paragraph(f"{s}", SMALL_TEXT) for s in shades]
    avg_row = [Paragraph("<b>Avg Daily</b>", SMALL_TEXT)] + [Paragraph(f"{(annual_kwh * w / d):.1f}", SMALL_TEXT) for w, d in zip(weights, days)]

    gen_matrix = [tbl_headers, totals, shade_row, avg_row]
    col_w = content_w / 13.0
    col_widths = [col_w * 1.6] + [col_w * 0.95] * 12
    gm_tbl = Table(gen_matrix, colWidths=col_widths)
    gm_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f1f5f9')),
        ('BOX', (0,0), (-1,-1), 0.75, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('PADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(gm_tbl)
    story.append(PageBreak())

    # =========================================================================
    # PAGE 6: FINANCIALS
    # =========================================================================
    story.append(Paragraph("FINANCIALS", ParagraphStyle('P6Title', parent=SECTION_TITLE, fontSize=18, textColor=p2_color)))
    story.append(Paragraph("We have determined the savings you will make from your solar system based on the information detailed in this proposal.", PROP_SUBTITLE))
    story.append(Spacer(1, 10))

    fin_card = [
        [Paragraph("<b>YOUR SAVINGS*</b>", ParagraphStyle('YSH', parent=BODY_BOLD, textColor=p2_color)), Paragraph("<b>YOUR RETURNS*</b>", ParagraphStyle('YRH', parent=BODY_BOLD, textColor=p2_color))],
        [
            Paragraph(f"Total Savings In Year 1: <b>{format_currency(annual_savings)}</b><br/>25 Year Savings Estimate: <b>{format_currency(lifetime_savings)}</b>", BODY_TEXT),
            Paragraph(f"Return On Investment: <b>{inv_roi_pct:.2f}% p.a.</b><br/>Payback Period: <b>{payback_years:.2f} years</b>", BODY_TEXT)
        ]
    ]
    f_tbl = Table(fin_card, colWidths=[content_w * 0.5, content_w * 0.5])
    f_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(f_tbl)
    story.append(Spacer(1, 14))

    # 5-Year Financial Return Table
    story.append(Paragraph("<b>Cumulative Solar Savings Schedule</b>", BODY_BOLD))
    story.append(Spacer(1, 4))
    ret_rows = [
        [Paragraph("<b>Projection Year</b>", BODY_BOLD), Paragraph("<b>Yearly Generation</b>", BODY_BOLD), Paragraph("<b>Yearly Savings</b>", BODY_BOLD), Paragraph("<b>Cumulative Value</b>", BODY_BOLD)],
    ]
    c_sav = 0.0
    for yr in range(1, 6):
        y_gen = annual_kwh * (1.0 - (yr - 1) * 0.007)
        y_sav = annual_savings * (1.0 + (yr - 1) * 0.03)
        c_sav += y_sav
        ret_rows.append([
            Paragraph(f"Year {yr}", BODY_TEXT),
            Paragraph(f"{y_gen:,.0f} kWh", BODY_TEXT),
            Paragraph(f"{format_currency(y_sav)}", BODY_TEXT),
            Paragraph(f"<b>{format_currency(c_sav)}</b>", BODY_BOLD)
        ])
    ret_tbl = Table(ret_rows, colWidths=[content_w * 0.25, content_w * 0.25, content_w * 0.25, content_w * 0.25])
    ret_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f1f5f9')),
        ('BOX', (0,0), (-1,-1), 0.75, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(ret_tbl)
    story.append(Spacer(1, 14))

    disclaimer = f"""
    *Disclaimer: The savings shown above assume total production as mentioned in the engineering estimate at current tariff rates. 
    Assuming self-consumption of {self_consumption_pct:.1f}% and remaining {grid_export_pct:.1f}% sent back to the grid based on solar yield profiles. 
    These figures are indicative to provide a realistic projection of returns over the 25-year system lifecycle.
    """
    story.append(Paragraph(disclaimer, SMALL_TEXT))
    story.append(PageBreak())

    # =========================================================================
    # PAGE 7: COMPONENTS & WARRANTY
    # =========================================================================
    story.append(Paragraph("COMPONENTS", ParagraphStyle('P7Title', parent=SECTION_TITLE, fontSize=18, textColor=p2_color)))
    story.append(Paragraph("Your system includes all of the components required to install your fully-functioning solar power system. We have made a list of inclusions below.", PROP_SUBTITLE))
    story.append(Spacer(1, 10))

    # Inclusions Table
    inc_data = [
        [Paragraph("<b>Solar System Inclusions</b>", ParagraphStyle('IH', parent=BODY_BOLD, textColor=p2_color)), ""],
        [Paragraph("Solar Panels", BODY_BOLD), Paragraph(f"{panel_count} × {panel_watt}W - {panel_make} ({panel_model})", BODY_TEXT)],
        [Paragraph("Inverters", BODY_BOLD), Paragraph(f"{inv_qty} × {inv_make} {inv_cap} ({inv_model})", BODY_TEXT)],
        [Paragraph("Batteries", BODY_BOLD), Paragraph(f"{battery_str}", BODY_TEXT)],
        [Paragraph("Mounting System", BODY_BOLD), Paragraph(f"{struct_type} ({struct_mat})", BODY_TEXT)],
    ]
    inc_tbl = Table(inc_data, colWidths=[content_w * 0.35, content_w * 0.65])
    inc_tbl.setStyle(TableStyle([
        ('SPAN', (0,0), (1,0)),
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('INNERGRID', (0,1), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(inc_tbl)
    story.append(Spacer(1, 10))

    # Customer Information & Notes
    info_data = [
        [Paragraph("<b>Customer Information</b>", ParagraphStyle('CIH', parent=BODY_BOLD, textColor=p2_color)), Paragraph("<b>Project Notes</b>", ParagraphStyle('PNH', parent=BODY_BOLD, textColor=p2_color))],
        [
            Paragraph(f"Energy Retailer: <b>{retailer}</b><br/>Distributor / NMI: <b>{nmi}</b><br/>Site Address: <b>{full_address}</b>", BODY_TEXT),
            Paragraph(f"{project_notes}", BODY_TEXT)
        ]
    ]
    info_tbl = Table(info_data, colWidths=[content_w * 0.5, content_w * 0.5])
    info_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0,0), (-1,-1), 6),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]))
    story.append(info_tbl)
    story.append(Spacer(1, 10))

    # Warranty Table
    warr_data = [
        [Paragraph("<b>Warranty Schedule</b>", ParagraphStyle('WH', parent=BODY_BOLD, textColor=p2_color)), ""],
        [Paragraph("Solar Panels", BODY_BOLD), Paragraph(f"{w_panel}", BODY_TEXT)],
        [Paragraph("Inverter / Battery", BODY_BOLD), Paragraph(f"{w_inverter} / {w_battery}", BODY_TEXT)],
        [Paragraph("Racking / Mounting", BODY_BOLD), Paragraph(f"{w_mounting}", BODY_TEXT)],
        [Paragraph("Workmanship", BODY_BOLD), Paragraph(f"{w_workmanship}", BODY_TEXT)],
    ]
    warr_tbl = Table(warr_data, colWidths=[content_w * 0.35, content_w * 0.65])
    warr_tbl.setStyle(TableStyle([
        ('SPAN', (0,0), (1,0)),
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('INNERGRID', (0,1), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(warr_tbl)
    story.append(PageBreak())

    # =========================================================================
    # PAGE 8: QUOTATION & ACCEPTANCE
    # =========================================================================
    story.append(Paragraph("QUOTATION", ParagraphStyle('P8Title', parent=SECTION_TITLE, fontSize=18, textColor=p2_color)))
    story.append(Paragraph("We have prepared a quotation for your consideration below.", PROP_SUBTITLE))
    story.append(Spacer(1, 10))

    quote_rows = [
        [Paragraph("<b>Description</b>", BODY_BOLD), Paragraph("<b>Qty</b>", BODY_BOLD), Paragraph("<b>Price Incl. GST</b>", BODY_BOLD)],
        [Paragraph(f"{system_kw:.2f}kW Solar Power System", BODY_TEXT), Paragraph("1 Unit", BODY_TEXT), Paragraph(format_currency(gross_cost), BODY_TEXT)],
        [Paragraph("Sub-Total", BODY_TEXT), "", Paragraph(format_currency(gross_cost - gst_amount), BODY_TEXT)],
        [Paragraph(f"GST Total ({gst_pct}%)", BODY_TEXT), "", Paragraph(format_currency(gst_amount), BODY_TEXT)],
    ]
    if subsidy_amount > 0:
        quote_rows.append([Paragraph("STC Financial Incentive / Govt Subsidy", BODY_TEXT), "", Paragraph(f"-{format_currency(subsidy_amount)}", BODY_BOLD)])
    if custom_discount > 0:
        quote_rows.append([Paragraph("Custom Discount", BODY_TEXT), "", Paragraph(f"-{format_currency(custom_discount)}", BODY_BOLD)])

    quote_rows.append([Paragraph("<b>Upfront Balance Total</b>", BODY_BOLD), "", Paragraph(f"<b><font size='11'>{format_currency(net_customer_cost)}</font></b>", BODY_BOLD)])

    q_tbl = Table(quote_rows, colWidths=[content_w * 0.6, content_w * 0.15, content_w * 0.25])
    q_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0284c7') if template_id == "template2" else colors.HexColor('#f1f5f9')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white if template_id == "template2" else PRIMARY_COLOR),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor('#f0f9ff') if template_id == "template2" else colors.HexColor('#eff6ff')),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0,0), (-1,-1), 6),
        ('ALIGN', (1,1), (1,-1), 'CENTER'),
        ('ALIGN', (2,1), (2,-1), 'RIGHT'),
    ]))
    story.append(q_tbl)
    story.append(Spacer(1, 14))

    # Customer Acceptance & Signature Block
    story.append(Paragraph(f"I <b>{customer_name}</b> accept the offer described in this document.", BODY_TEXT))
    story.append(Spacer(1, 10))

    sig_data = [
        [Paragraph(f"<b>FOR {company_name.upper()}:</b>", BODY_BOLD), Paragraph("<b>CUSTOMER ACCEPTANCE:</b>", BODY_BOLD)],
        [
            Paragraph(f"<br/><br/><br/>___________________________________<br/><b>{prepared_by}</b><br/>Authorized Signatory & Stamp", BODY_TEXT),
            Paragraph(f"<br/><br/><br/>___________________________________<br/><b>{customer_name}</b><br/>Date: {prop_date}", BODY_TEXT),
        ]
    ]
    sig_tbl = Table(sig_data, colWidths=[content_w * 0.5, content_w * 0.5])
    sig_tbl.setStyle(TableStyle([
        ('BOX', (0,0), (-1,-1), 0.75, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0,0), (-1,-1), 8),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]))
    story.append(sig_tbl)
    story.append(Spacer(1, 10))

    notes_text = f"* Note: This proposal is valid until {valid_until}. Grid connection, Net-Metering, and statutory central subsidy approval are subject to local DISCOM policies and approvals."
    story.append(Paragraph(notes_text, SMALL_TEXT))

    # Build Document with ProposalCanvas
    def canvas_factory(*args, **kwargs):
        c = ProposalCanvas(*args, **kwargs)
        c.template_id = template_id
        c.company_name = company_name
        c.rep_name = prepared_by
        c.rep_phone = rep_phone
        c.rep_email = rep_email
        c.customer_name = customer_name
        return c

    doc.build(story, canvasmaker=canvas_factory)
    return buf.getvalue()
