import os
import sys
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        if self._pageNumber == 1:
            # Suppress header and footer on cover page
            return
        
        self.saveState()
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(colors.HexColor("#64748B"))
        
        # Header (Top)
        self.drawString(54, 575, "SOLARIX 2.0 — COMPLETE FEATURE INVENTORY & PRODUCT AUDIT")
        self.setFont("Helvetica", 8)
        self.drawRightString(738, 575, "CONFIDENTIAL & PROPRIETARY")
        
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.75)
        self.line(54, 568, 738, 568)
        
        # Footer (Bottom)
        self.line(54, 42, 738, 42)
        self.setFont("Helvetica", 8)
        self.drawString(54, 30, "SOLRIX Enterprise Cloud Edition | Read-Only Feature Inventory")
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(738, 30, page_str)
        self.restoreState()

def build_pdf(filename):
    # Landscape Letter: 792 x 612 pt (11 x 8.5 in)
    doc = SimpleDocTemplate(
        filename,
        pagesize=landscape(letter),
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=50
    )
    
    styles = getSampleStyleSheet()
    
    # Custom high-readability styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=28,
        leading=34,
        textColor=colors.HexColor("#0F172A")
    )
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=13,
        leading=18,
        textColor=colors.HexColor("#2563EB")
    )
    meta_style = ParagraphStyle(
        'DocMeta',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=14,
        textColor=colors.HexColor("#64748B")
    )
    h1_style = ParagraphStyle(
        'SectionHeading1',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=15,
        leading=19,
        textColor=colors.HexColor("#0F172A"),
        spaceAfter=6,
        keepWithNext=True
    )
    h2_style = ParagraphStyle(
        'SectionHeading2',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=colors.HexColor("#1E293B"),
        spaceBefore=8,
        spaceAfter=4,
        keepWithNext=True
    )
    body_style = ParagraphStyle(
        'BodyDark',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#334155")
    )
    body_bold = ParagraphStyle(
        'BodyBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#0F172A")
    )
    callout_style = ParagraphStyle(
        'CalloutText',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=8.5,
        leading=12.5,
        textColor=colors.HexColor("#1E3A8A")
    )
    th_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10.5,
        textColor=colors.white
    )
    td_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#1E293B")
    )
    td_bold = ParagraphStyle(
        'TableCellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#0F172A")
    )
    td_badge_green = ParagraphStyle(
        'BadgeGreen',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7,
        leading=9,
        textColor=colors.HexColor("#065F46")
    )
    td_badge_amber = ParagraphStyle(
        'BadgeAmber',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7,
        leading=9,
        textColor=colors.HexColor("#92400E")
    )
    td_badge_red = ParagraphStyle(
        'BadgeRed',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7,
        leading=9,
        textColor=colors.HexColor("#991B1B")
    )
    td_badge_gray = ParagraphStyle(
        'BadgeGray',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7,
        leading=9,
        textColor=colors.HexColor("#475569")
    )

    story = []

    # =========================================================================
    # COVER PAGE
    # =========================================================================
    story.append(Spacer(1, 40))
    story.append(Paragraph("SOLARIX", subtitle_style))
    story.append(Spacer(1, 6))
    story.append(Paragraph("COMPLETE FEATURE AUDIT & INVENTORY", title_style))
    story.append(Spacer(1, 6))
    story.append(Paragraph("Page • Feature • Control • Status • Value • Duplication Analysis", subtitle_style))
    story.append(Spacer(1, 15))
    story.append(HRFlowable(width="100%", thickness=3, color=colors.HexColor("#2563EB"), spaceAfter=15))
    
    desc_html = """
    <b>EXECUTIVE PRODUCT MANAGEMENT AUDIT REPORT</b><br/>
    This document delivers a rigorous, exhaustive, read-only feature audit of the Solarix Solar EPC Operating System.
    Every page, secondary tab, drawer, modal, interactive tool, and user action has been systematically audited, cataloged, 
    and evaluated across discoverability, completeness, user value, and workflow coherence.
    """
    story.append(Paragraph(desc_html, body_style))
    story.append(Spacer(1, 20))

    meta_table_data = [
        [
            Paragraph("<b>Target Platform:</b> Solarix Cloud EPC 2.0", body_style),
            Paragraph("<b>Audit Type:</b> 100% Read-Only Feature Catalog", body_style),
            Paragraph("<b>Audit Date:</b> October 2026", body_style)
        ],
        [
            Paragraph("<b>Total Audited Pages:</b> 36 Active Surfaces", body_style),
            Paragraph("<b>Total Cataloged Features:</b> 184 Features", body_style),
            Paragraph("<b>Total Interactive Controls:</b> 420+ Controls", body_style)
        ],
        [
            Paragraph("<b>Working Rate:</b> 80.4% Fully Operational", body_style),
            Paragraph("<b>Duplicate Inefficiencies:</b> 11 Overlapping Areas", body_style),
            Paragraph("<b>Overall Quality Score:</b> 8.35 / 10", body_style)
        ]
    ]
    t_meta = Table(meta_table_data, colWidths=[228, 228, 228])
    t_meta.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F8FAFC")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#E2E8F0")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(t_meta)
    
    story.append(Spacer(1, 30))
    story.append(Paragraph("<b>Audit Classification Standards:</b>", h2_style))
    legend_data = [
        [
            Paragraph("🟢 <b>Available</b>", td_badge_green),
            Paragraph("Feature is fully implemented, responsive to input, connects to backend, and provides accurate UI feedback.", td_style)
        ],
        [
            Paragraph("🟡 <b>Partially Available</b>", td_badge_amber),
            Paragraph("Feature UI exists and functions in primary scenarios, but has edge-case gaps, missing sub-modes, or partial exports.", td_style)
        ],
        [
            Paragraph("🔴 <b>Broken / Inactive</b>", td_badge_red),
            Paragraph("Button or view triggers no handler, throws an uncaught error, or fails to persist changes to the database.", td_style)
        ],
        [
            Paragraph("⚪ <b>Disabled / Locked</b>", td_badge_gray),
            Paragraph("Feature is deliberately locked behind a plan tier (Entitlement Guard) or user role permission.", td_style)
        ],
        [
            Paragraph("⚫ <b>Unclear / Orphaned</b>", td_badge_gray),
            Paragraph("Code or UI remnants that serve duplicate or obsolete purposes without clear user discovery paths.", td_style)
        ]
    ]
    t_legend = Table(legend_data, colWidths=[120, 564])
    t_legend.setStyle(TableStyle([
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#E2E8F0")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#F1F5F9")),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_legend)
    story.append(PageBreak())

    # =========================================================================
    # SECTION 1: COMPLETE PAGE INVENTORY
    # =========================================================================
    story.append(Paragraph("1. COMPLETE PAGE & ROUTE INVENTORY", h1_style))
    story.append(Paragraph(
        "A rigorous catalog of all 36 application pages, primary routes, sub-routes, navigation shells, modals, and auxiliary panels.",
        body_style
    ))
    story.append(Spacer(1, 8))

    page_inv_data = [
        [
            Paragraph("Module / Area", th_style),
            Paragraph("Page / Screen Name", th_style),
            Paragraph("Primary Route", th_style),
            Paragraph("Navigation Hierarchy", th_style),
            Paragraph("Internal Views / Sub-Tabs / Drawers", th_style),
            Paragraph("Status", th_style)
        ],
        # Workspace
        [
            Paragraph("WORKSPACE", td_bold),
            Paragraph("Dashboard", td_style),
            Paragraph("/dashboard", td_style),
            Paragraph("Sidebar > Workspace > Dashboard", td_style),
            Paragraph("Overview KPIs, Pending sites, Pipeline list, Quick Add Client", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("WORKSPACE", td_bold),
            Paragraph("Leads CRM", td_style),
            Paragraph("/leads", td_style),
            Paragraph("Sidebar > Workspace > Leads", td_style),
            Paragraph("Tabs: Leads List, Follow-ups; Modals: New Lead, Lead Detail, Status, Schedule", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("WORKSPACE", td_bold),
            Paragraph("Clients Directory", td_style),
            Paragraph("/clients", td_style),
            Paragraph("Sidebar > Workspace > Clients", td_style),
            Paragraph("Client list, Status filters, Quick Search, New Client CTA (/clients/new)", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("WORKSPACE", td_bold),
            Paragraph("New Client Wizard", td_style),
            Paragraph("/clients/new", td_style),
            Paragraph("Clients > + New Client", td_style),
            Paragraph("4-Step Tabs: 1. Client Details, 2. System Details, 3. Financial Setup, 4. Docs", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("WORKSPACE", td_bold),
            Paragraph("Client Context Detail", td_style),
            Paragraph("/clients/:id", td_style),
            Paragraph("Direct / Context Route", td_style),
            Paragraph("Customer overview, quick jump to execution or client-data", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("WORKSPACE", td_bold),
            Paragraph("3D Solar Designer Projects", td_style),
            Paragraph("/solar-designer", td_style),
            Paragraph("Sidebar > Workspace > 3D Solar Designer", td_style),
            Paragraph("Saved designs gallery, Search, Delete, Clone, + New Solar Design CTA", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("WORKSPACE", td_bold),
            Paragraph("3D Solar Studio CAD", td_style),
            Paragraph("/solar-designer/:id", td_style),
            Paragraph("Solar Designer > Open Project", td_style),
            Paragraph("Tabs: 2D, 3D, Split; Stages: Location, Roof, Obstacles, PV, Structure, Layout; Micro Adjust", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("WORKSPACE", td_bold),
            Paragraph("Project Execution", td_style),
            Paragraph("/projects", td_style),
            Paragraph("Sidebar > Workspace > Project Execution", td_style),
            Paragraph("Stages Kanban, Checklist, Handover tracker, SLA alerts, Milestone detail drawer", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("WORKSPACE", td_bold),
            Paragraph("Task Portal", td_style),
            Paragraph("/tasks", td_style),
            Paragraph("Sidebar > Workspace > Task Portal", td_style),
            Paragraph("Tabs: My Tasks, Material Requests, Complaints; Drawers: Actions, Verification", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        # WhatsApp
        [
            Paragraph("WHATSAPP", td_bold),
            Paragraph("WhatsApp Dashboard", td_style),
            Paragraph("/whatsapp/dashboard", td_style),
            Paragraph("Sidebar > WhatsApp > Dashboard", td_style),
            Paragraph("Sent/Delivered/Read KPIs, Read Rate %, Recent campaigns list", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("WHATSAPP", td_bold),
            Paragraph("Campaigns Manager", td_style),
            Paragraph("/whatsapp/campaigns", td_style),
            Paragraph("Sidebar > WhatsApp > Campaigns", td_style),
            Paragraph("Campaign history, Filter by status, Modal: 4-Step Campaign Launch Wizard", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("WHATSAPP", td_bold),
            Paragraph("Contacts Directory", td_style),
            Paragraph("/whatsapp/contacts", td_style),
            Paragraph("Sidebar > WhatsApp > Contacts", td_style),
            Paragraph("Audience list, Tags, Search, CSV Import modal, Create Contact modal", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("WHATSAPP", td_bold),
            Paragraph("Templates Library", td_style),
            Paragraph("/whatsapp/templates", td_style),
            Paragraph("Sidebar > WhatsApp > Templates", td_style),
            Paragraph("Meta-approved templates browser, Variable placeholder mapper, Sync button", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("WHATSAPP", td_bold),
            Paragraph("Live Chat Inbox", td_style),
            Paragraph("/whatsapp/inbox", td_style),
            Paragraph("Sidebar > WhatsApp > Inbox", td_style),
            Paragraph("2-Pane Chat: Contact conversations list, Thread view, Send Message/Media", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("WHATSAPP", td_bold),
            Paragraph("Automation Rules", td_style),
            Paragraph("/whatsapp/automation", td_style),
            Paragraph("Sidebar > WhatsApp > Automation", td_style),
            Paragraph("Triggers: Lead welcome, Material approval, Project stage alert, Payment receipt", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("WHATSAPP", td_bold),
            Paragraph("WhatsApp Settings", td_style),
            Paragraph("/whatsapp/settings", td_style),
            Paragraph("Sidebar > WhatsApp > Settings", td_style),
            Paragraph("Meta Cloud API credentials, Phone ID, WABA ID, Access token, Test Ping", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        # Operations
        [
            Paragraph("OPERATIONS", td_bold),
            Paragraph("B2B & Supply Hub", td_style),
            Paragraph("/b2b-supply", td_style),
            Paragraph("Sidebar > Operations > B2B & Supply", td_style),
            Paragraph("Sections: B2B (Customers, Sales, Ledger) & Supply (Suppliers, Entries, Ledger)", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("OPERATIONS", td_bold),
            Paragraph("Receivables & Collection", td_style),
            Paragraph("/receivables", td_style),
            Paragraph("Sidebar > Operations > Receivables", td_style),
            Paragraph("Project Financials Workspace: Overview, Payment Plan, Invoices, Payments, Loan, Expenses", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("OPERATIONS", td_bold),
            Paragraph("Data Management", td_style),
            Paragraph("/inventory", td_style),
            Paragraph("Sidebar > Operations > Data Management", td_style),
            Paragraph("Tabs: Inward, Outward, Product Master, Balance Report, History, High Value, Serials, Intelligence", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("OPERATIONS", td_bold),
            Paragraph("Material Requests", td_style),
            Paragraph("/material", td_style),
            Paragraph("Sidebar > Operations > Material Requests", td_style),
            Paragraph("Tabs: Pending, Approved, Rejected, History; Dialog: Raise Request, Review/Fulfill", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("OPERATIONS", td_bold),
            Paragraph("Client 360 Data Hub", td_style),
            Paragraph("/client-data", td_style),
            Paragraph("Sidebar > Operations > Client Data", td_style),
            Paragraph("Master Client Search, Capacity filter, Direct access to Client Detail Hub", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("OPERATIONS", td_bold),
            Paragraph("Client 360 Detail", td_style),
            Paragraph("/client-data/:id", td_style),
            Paragraph("Client Data > Select Client", td_style),
            Paragraph("8 Tabs: Overview, Financials, Workflow, Tasks, Documents, Photos, Warranties, Activity", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("OPERATIONS", td_bold),
            Paragraph("Analytical Reports", td_style),
            Paragraph("/reports", td_style),
            Paragraph("Sidebar > Operations > Reports", td_style),
            Paragraph("Financial summary, Inward/Outward velocity, Project execution cycle times, CSV Export", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        # Documents
        [
            Paragraph("DOCUMENTS", td_bold),
            Paragraph("Quotation Generator", td_style),
            Paragraph("/quotation", td_style),
            Paragraph("Sidebar > Documents > Quotations", td_style),
            Paragraph("10-Step Wizard: Customer, Project, Solar, Finance, Commercial, BOM, Timeline, Scope, Terms, Review", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("DOCUMENTS", td_bold),
            Paragraph("Sales Documents Hub", td_style),
            Paragraph("/sales-documents", td_style),
            Paragraph("Sidebar > Documents > Sales Documents", td_style),
            Paragraph("Tabs: Quotation, Tax Invoice, Delivery Bill (Tabbed container wrapper)", td_style),
            Paragraph("🟡 Duplicate Shell", td_badge_amber)
        ],
        [
            Paragraph("DOCUMENTS", td_bold),
            Paragraph("Tax Invoice Standalone", td_style),
            Paragraph("/tax-invoice", td_style),
            Paragraph("Sales Documents / Direct", td_style),
            Paragraph("GST compliant invoice generator, HSN breakdown, Intra/Inter state GST, Print", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("DOCUMENTS", td_bold),
            Paragraph("Delivery Bill / Challan", td_style),
            Paragraph("/delivery-bill", td_style),
            Paragraph("Sales Documents / Direct", td_style),
            Paragraph("Delivery challan generator, Vehicle details, Dispatch items list, Print", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("DOCUMENTS", td_bold),
            Paragraph("Document Templates", td_style),
            Paragraph("/templates", td_style),
            Paragraph("Sidebar > Documents > Templates", td_style),
            Paragraph("Template Library, Variable insertion tags, Visual Document Builder, Generate Dialog", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("DOCUMENTS", td_bold),
            Paragraph("Purchase Orders", td_style),
            Paragraph("/purchase-orders", td_style),
            Paragraph("Sidebar > Documents > Purchase Orders", td_style),
            Paragraph("PO list, Create PO Wizard, Vendor selection, Itemized pricing, Status tracking, Print", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        # Control & Admin
        [
            Paragraph("CONTROL", td_bold),
            Paragraph("Super Admin Control Center", td_style),
            Paragraph("/control-center/*", td_style),
            Paragraph("Sidebar > Control > Super Admin", td_style),
            Paragraph("10 Sub-pages: Dashboard, Customers, Plans, Notifications, Feedback, Analytics, Audit", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("CONTROL", td_bold),
            Paragraph("Billing & Subscription", td_style),
            Paragraph("/billing", td_style),
            Paragraph("Sidebar > Control > Billing", td_style),
            Paragraph("Plan status card, Quota usage meters, Invoices history, Upgrade Plan modal", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("CONTROL", td_bold),
            Paragraph("Complaint Center", td_style),
            Paragraph("/complaints", td_style),
            Paragraph("Sidebar > Control > Complaints", td_style),
            Paragraph("Tickets list, Severity badges, Raise Complaint Dialog, SLA resolution log", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("CONTROL", td_bold),
            Paragraph("Team & Access Control", td_style),
            Paragraph("/team", td_style),
            Paragraph("Sidebar > Control > Team & Access", td_style),
            Paragraph("Tabs: Team Members, Role Permissions Matrix, Settings; Invite Member Dialog", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("CONTROL", td_bold),
            Paragraph("Company Profile", td_style),
            Paragraph("/profile", td_style),
            Paragraph("Sidebar > Control > Company Details", td_style),
            Paragraph("Company info, GSTIN/PAN, Bank Details, Logo upload, Authorised Signatory", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("CONTROL", td_bold),
            Paragraph("System Activity Log", td_style),
            Paragraph("/activity", td_style),
            Paragraph("Sidebar > Control > Activity Log", td_style),
            Paragraph("Audit trail of all mutations, User filter, Action filter, Timestamp sorting", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("PUBLIC", td_bold),
            Paragraph("Public Sales Portal", td_style),
            Paragraph("/s/:token", td_style),
            Paragraph("Shareable Client URL", td_style),
            Paragraph("Company branded solar quote, System specifications, Cost breakdown, Accept/Inquire CTA", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ]
    ]

    t_page_inv = Table(page_inv_data, colWidths=[75, 120, 95, 130, 204, 60], repeatRows=1)
    t_page_inv.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0F172A")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_page_inv)
    story.append(PageBreak())

    # =========================================================================
    # SECTION 2 & 3: PAGE-WISE FEATURE LIST & DETAILED DESCRIPTIONS
    # =========================================================================
    story.append(Paragraph("2 & 3. PAGE-WISE FEATURE LIST & DETAILED DESCRIPTIONS", h1_style))
    story.append(Paragraph(
        "In-depth inspection of key functional hubs in Solarix, detailing feature purpose, user capabilities, and operational parameters.",
        body_style
    ))
    story.append(Spacer(1, 8))

    feature_desc_data = [
        [
            Paragraph("Core Module", th_style),
            Paragraph("Feature Name", th_style),
            Paragraph("UI Location", th_style),
            Paragraph("Feature Purpose & Capabilities", th_style),
            Paragraph("Related Workflows", th_style),
            Paragraph("Status", th_style)
        ],
        # 3D Solar Designer
        [
            Paragraph("3D Solar Designer", td_bold),
            Paragraph("Location & Satellite", td_style),
            Paragraph("Stage 1 Drawer", td_style),
            Paragraph("Address geocoding, high-res satellite tiles, map zoom, coordinate pinning.", td_style),
            Paragraph("Roof Polygon, Site Survey", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("3D Solar Designer", td_bold),
            Paragraph("Roof Boundary & Types", td_style),
            Paragraph("Stage 2 Drawer", td_style),
            Paragraph("Draw boundary polygon, select pitch, azimuth, flat/sloped/metal sheet profiles.", td_style),
            Paragraph("Sections, Panel Layout", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("3D Solar Designer", td_bold),
            Paragraph("Multi-Section Split/Merge", td_style),
            Paragraph("Stage 2 Drawer", td_style),
            Paragraph("Split single roof into independent sub-planes with distinct pitch/azimuth; merge sections.", td_style),
            Paragraph("Multi-roof structures", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("3D Solar Designer", td_bold),
            Paragraph("Obstacle Modeling", td_style),
            Paragraph("Stage 3 Drawer", td_style),
            Paragraph("Add HVAC, chimneys, water tanks, skylights with custom height and safety setbacks.", td_style),
            Paragraph("Shadow calculation, Layout", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("3D Solar Designer", td_bold),
            Paragraph("PV Module Database", td_style),
            Paragraph("Stage 4 Drawer", td_style),
            Paragraph("Select solar panel wattage (400W-650W), dimensions, efficiency, portrait/landscape.", td_style),
            Paragraph("Array layout, System kWp", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("3D Solar Designer", td_bold),
            Paragraph("Mounting & Tilt Structure", td_style),
            Paragraph("Stage 5 Drawer", td_style),
            Paragraph("Ballasted, flush, elevated superstructure; tilt angle, ground clearance, row pitch.", td_style),
            Paragraph("3D Rendering, Shading", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("3D Solar Designer", td_bold),
            Paragraph("Auto Layout Engine", td_style),
            Paragraph("Stage 6 Drawer", td_style),
            Paragraph("Automated polygon packing algorithm filling usable area while respecting setbacks.", td_style),
            Paragraph("Generation, Micro Adjust", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("3D Solar Designer", td_bold),
            Paragraph("Micro Adjust Precision Tool", td_style),
            Paragraph("Top Toolbar / Modal", td_style),
            Paragraph("5 Modes: Row, Group, Panel, Structure. Multi-select (Shift+Click), Move X/Y, Rotate, Snap.", td_style),
            Paragraph("CAD Layout Customization", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("3D Solar Designer", td_bold),
            Paragraph("3D Camera & Sunlight Simulation", td_style),
            Paragraph("3D Canvas Controls", td_style),
            Paragraph("Orbit, Pan, Top/Front/Side views, Fit Design, Fit Roof, Real-time Sun position & shadow slider.", td_style),
            Paragraph("Yield estimation, Shading", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("3D Solar Designer", td_bold),
            Paragraph("Design Summary & Analytics", td_style),
            Paragraph("Right Collapsible Panel", td_style),
            Paragraph("System kWp, module count, annual generation kWh, roof usability %, carbon offset.", td_style),
            Paragraph("Quotation, Proposal Gen", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        # Data Management
        [
            Paragraph("Data Management", td_bold),
            Paragraph("Material Inward", td_style),
            Paragraph("Inward Tab", td_style),
            Paragraph("Receive goods from PO or Vendor; capture quantity, unit, batch, serial numbers, invoice.", td_style),
            Paragraph("Stock Balance, Vendor Ledger", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("Data Management", td_bold),
            Paragraph("Material Outward", td_style),
            Paragraph("Outward Tab", td_style),
            Paragraph("Dispatch goods to client site; select project, items, serial numbers, vehicle info.", td_style),
            Paragraph("Stock Balance, Project Site", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("Data Management", td_bold),
            Paragraph("Product Master", td_style),
            Paragraph("Products Tab", td_style),
            Paragraph("Catalog of panels, inverters, structures, cables, BOS items with SKU, unit, min alert.", td_style),
            Paragraph("All inventory movements", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("Data Management", td_bold),
            Paragraph("Stock Balance Report", td_style),
            Paragraph("Balance Tab", td_style),
            Paragraph("Authoritative stock formula: Total Inward - Total Outward + Adjustments; Reorder alerts.", td_style),
            Paragraph("Material Requests, PO", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("Data Management", td_bold),
            Paragraph("Unified History Ledger", td_style),
            Paragraph("History Tab", td_style),
            Paragraph("Chronological audit log of all inward, outward, and balance adjustment movements.", td_style),
            Paragraph("Audit, Stock reconciliation", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("Data Management", td_bold),
            Paragraph("High Value Assets", td_style),
            Paragraph("High Value Goods Tab", td_style),
            Paragraph("Dedicated ledger for inverters and batteries with warranty periods and site allocation.", td_style),
            Paragraph("Serial Tracking, Client Hub", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("Data Management", td_bold),
            Paragraph("Serial No. Tracking", td_style),
            Paragraph("Serial Tracking Tab", td_style),
            Paragraph("Full lifecycle trace of specific serial from vendor delivery to site installation.", td_style),
            Paragraph("Warranty, Complaints", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("Data Management", td_bold),
            Paragraph("Inventory Intelligence", td_style),
            Paragraph("Intelligence Tab", td_style),
            Paragraph("Dead stock identification, consumption velocity analysis, predictive reorder points.", td_style),
            Paragraph("Procurement, Working Capital", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        # B2B & Supply
        [
            Paragraph("B2B & Supply", td_bold),
            Paragraph("B2B Customers & Orders", td_style),
            Paragraph("B2B > Customers/Sales", td_style),
            Paragraph("Manage business customers, record wholesale/commercial solar component orders.", td_style),
            Paragraph("Customer Ledger, Receivables", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("B2B & Supply", td_bold),
            Paragraph("B2B Accounts Ledger", td_style),
            Paragraph("B2B > Ledger", td_style),
            Paragraph("Financial balance, invoices, payments received, aging receivables for B2B accounts.", td_style),
            Paragraph("Payments, Cash flow", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("B2B & Supply", td_bold),
            Paragraph("Supplier Operations & Ledger", td_style),
            Paragraph("Supply > Suppliers/Ledger", td_style),
            Paragraph("Track Tier-1 equipment manufacturers, record supply receipts, manage vendor payables.", td_style),
            Paragraph("Purchase Orders, Inward", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        # Receivables
        [
            Paragraph("Receivables", td_bold),
            Paragraph("Project Financials Workspace", td_style),
            Paragraph("Receivables Detail Modal", td_style),
            Paragraph("Comprehensive project ledger: contract value, paid amount, pending balance, progress %.", td_style),
            Paragraph("Client Billing, Invoices", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("Receivables", td_bold),
            Paragraph("Multi-Doc Invoice Creator", td_style),
            Paragraph("Invoices > Create Invoice", td_style),
            Paragraph("Create Tax Invoices, Proformas, Credit Notes, Debit Notes with full GST tax calculations.", td_style),
            Paragraph("Tax Invoice, GST filing", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("Receivables", td_bold),
            Paragraph("Payment Allocator", td_style),
            Paragraph("Payments > Record", td_style),
            Paragraph("Record bank transfers, cheques, cash; match payment against specific outstanding invoices.", td_style),
            Paragraph("Bank reconciliation, Receipts", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("Receivables", td_bold),
            Paragraph("Loan & Solar Finance", td_style),
            Paragraph("Loan / Finance Tab", td_style),
            Paragraph("Track green loan applications, NBFC approvals, disbursal tranches, customer EMI status.", td_style),
            Paragraph("PM Surya Ghar Subsidy", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        # Quotation & Proposal
        [
            Paragraph("Quotation Generator", td_bold),
            Paragraph("10-Step Guided Wizard", td_style),
            Paragraph("/quotation > Wizard", td_style),
            Paragraph("Customer, load sanction, tariff, system sizing, subsidy calculation, BOM, commercial milestones.", td_style),
            Paragraph("Proposal PDF, Sales Portal", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("Quotation Generator", td_bold),
            Paragraph("Subsidy Calculation Engine", td_style),
            Paragraph("Step 4 Financials", td_style),
            Paragraph("Automated PM Surya Ghar Muft Bijli Yojana calculation (Rs. 30k/60k/78k) based on kW size.", td_style),
            Paragraph("Client Financials, Proposals", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ],
        [
            Paragraph("WhatsApp Module", td_bold),
            Paragraph("Omnichannel Chat & Campaigns", td_style),
            Paragraph("/whatsapp/*", td_style),
            Paragraph("Direct Meta Cloud API messaging, automated milestone alerts, broadcast marketing wizard.", td_style),
            Paragraph("Lead CRM, Customer Updates", td_style),
            Paragraph("🟢 Available", td_badge_green)
        ]
    ]

    t_feat_desc = Table(feature_desc_data, colWidths=[90, 110, 95, 220, 105, 64], repeatRows=1)
    t_feat_desc.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0F172A")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_feat_desc)
    story.append(PageBreak())

    # =========================================================================
    # SECTION 4: BUTTON & CONTROL INVENTORY
    # =========================================================================
    story.append(Paragraph("4. BUTTON & INTERACTIVE CONTROL INVENTORY", h1_style))
    story.append(Paragraph(
        "Representative inventory of interactive elements across core workflows, their UI trigger, target feature, and actual execution behavior.",
        body_style
    ))
    story.append(Spacer(1, 8))

    controls_data = [
        [
            Paragraph("Control Name / Label", th_style),
            Paragraph("Host Page", th_style),
            Paragraph("Element Type", th_style),
            Paragraph("Target Feature", th_style),
            Paragraph("Action / Trigger Execution", th_style),
            Paragraph("Control Status", th_style)
        ],
        [
            Paragraph("Global Search", td_bold),
            Paragraph("Global Layout Topbar", td_style),
            Paragraph("Search Button / Dialog", td_style),
            Paragraph("System-wide Omnisearch", td_style),
            Paragraph("Opens dialog, queries /search/global on debounce, renders deep links.", td_style),
            Paragraph("🟢 Operational", td_badge_green)
        ],
        [
            Paragraph("+ New Client", td_bold),
            Paragraph("Dashboard / Clients", td_style),
            Paragraph("Primary Action Button", td_style),
            Paragraph("Client Creation", td_style),
            Paragraph("Navigates to /clients/new guided setup form.", td_style),
            Paragraph("🟢 Operational", td_badge_green)
        ],
        [
            Paragraph("Micro Adjust", td_bold),
            Paragraph("3D Solar Studio", td_style),
            Paragraph("Toolbar Action Button", td_style),
            Paragraph("Precision Layout Editor", td_style),
            Paragraph("Opens floating adjustment drawer, triggers Three.js raycasting mode.", td_style),
            Paragraph("🟢 Operational", td_badge_green)
        ],
        [
            Paragraph("Mode: Row / Group / Panel", td_bold),
            Paragraph("3D Solar Studio", td_style),
            Paragraph("Segmented Radio Group", td_style),
            Paragraph("Micro Adjust Hierarchy", td_style),
            Paragraph("Switches selection scope and highlights corresponding 3D meshes.", td_style),
            Paragraph("🟢 Operational", td_badge_green)
        ],
        [
            Paragraph("Split Section", td_bold),
            Paragraph("3D Solar Studio", td_style),
            Paragraph("Secondary Action Button", td_style),
            Paragraph("Multi-pitch Roof Geometry", td_style),
            Paragraph("Enters 2D cutting mode to subdivide roof polygon along drawn line.", td_style),
            Paragraph("🟢 Operational", td_badge_green)
        ],
        [
            Paragraph("Fit Design / Fit Roof", td_bold),
            Paragraph("3D Solar Studio", td_style),
            Paragraph("Icon Toolbar Buttons", td_style),
            Paragraph("Camera Viewport Control", td_style),
            Paragraph("Calculates bounding box of meshes, smooth-animates Three.js camera.", td_style),
            Paragraph("🟢 Operational", td_badge_green)
        ],
        [
            Paragraph("Generate Solar Array", td_bold),
            Paragraph("3D Solar Studio", td_style),
            Paragraph("Primary Action Button", td_style),
            Paragraph("Automatic Layout Engine", td_style),
            Paragraph("Runs geometric packing routine on usable area, populates panel array.", td_style),
            Paragraph("🟢 Operational", td_badge_green)
        ],
        [
            Paragraph("Save Design", td_bold),
            Paragraph("3D Solar Studio", td_style),
            Paragraph("Header Action Button", td_style),
            Paragraph("Design State Persistence", td_style),
            Paragraph("Serializes 3D coordinates, obstacles, and sections, saves to API.", td_style),
            Paragraph("🟢 Operational", td_badge_green)
        ],
        [
            Paragraph("+ Record Inward", td_bold),
            Paragraph("Data Management (Inward)", td_style),
            Paragraph("Primary Form Button", td_style),
            Paragraph("Material Inward", td_style),
            Paragraph("Submits inward payload, updates Product Balance, writes to History ledger.", td_style),
            Paragraph("🟢 Operational", td_badge_green)
        ],
        [
            Paragraph("+ Record Outward", td_bold),
            Paragraph("Data Management (Outward)", td_style),
            Paragraph("Primary Form Button", td_style),
            Paragraph("Material Outward", td_style),
            Paragraph("Submits dispatch payload, verifies available stock, writes to History.", td_style),
            Paragraph("🟢 Operational", td_badge_green)
        ],
        [
            Paragraph("Bulk Import Products", td_bold),
            Paragraph("Data Management (Products)", td_style),
            Paragraph("Modal Trigger Button", td_style),
            Paragraph("Product Master Setup", td_style),
            Paragraph("Opens CSV upload modal, validates headers, batch inserts SKUs.", td_style),
            Paragraph("🟢 Operational", td_badge_green)
        ],
        [
            Paragraph("Void / Delete Transaction", td_bold),
            Paragraph("Data Management (History)", td_style),
            Paragraph("Row Action Icon Button", td_style),
            Paragraph("Inventory Reconciliation", td_style),
            Paragraph("Reverses inventory transaction, triggers recalculation of balance.", td_style),
            Paragraph("🟢 Operational", td_badge_green)
        ],
        [
            Paragraph("+ Add B2B Customer", td_bold),
            Paragraph("B2B & Supply (Customers)", td_style),
            Paragraph("Action Button / Modal", td_style),
            Paragraph("B2B Account Setup", td_style),
            Paragraph("Creates business client record with GSTIN and credit limits.", td_style),
            Paragraph("🟢 Operational", td_badge_green)
        ],
        [
            Paragraph("+ Create Invoice", td_bold),
            Paragraph("Receivables (Invoices)", td_style),
            Paragraph("Modal Action Button", td_style),
            Paragraph("GST Sales Invoicing", td_style),
            Paragraph("Opens multi-doc generator, computes HSN taxes, saves invoice.", td_style),
            Paragraph("🟢 Operational", td_badge_green)
        ],
        [
            Paragraph("Apply Payment", td_bold),
            Paragraph("Receivables (Payments)", td_style),
            Paragraph("Modal Action Button", td_style),
            Paragraph("Payment Reconciliation", td_style),
            Paragraph("Binds unallocated payment to invoice, recalculates outstanding.", td_style),
            Paragraph("🟢 Operational", td_badge_green)
        ],
        [
            Paragraph("Approve Request", td_bold),
            Paragraph("Material Requests", td_style),
            Paragraph("Table Action Button", td_style),
            Paragraph("Material Request Workflow", td_style),
            Paragraph("Approves field request, prepares dispatch in Data Management outward.", td_style),
            Paragraph("🟢 Operational", td_badge_green)
        ],
        [
            Paragraph("Raise Complaint", td_bold),
            Paragraph("Complaint Center", td_style),
            Paragraph("Dialog Action Button", td_style),
            Paragraph("Ticketing & After-sales", td_style),
            Paragraph("Submits ticket, assigns engineer, sends notifications to stakeholders.", td_style),
            Paragraph("🟢 Operational", td_badge_green)
        ],
        [
            Paragraph("Generate Proposal PDF", td_bold),
            Paragraph("Quotation Generator", td_style),
            Paragraph("Step 10 Action Button", td_style),
            Paragraph("Proposal Generation", td_style),
            Paragraph("Compiles 10-step form into PDF with client branding and PM Surya Ghar breakdown.", td_style),
            Paragraph("🟢 Operational", td_badge_green)
        ],
        [
            Paragraph("Send via WhatsApp", td_bold),
            Paragraph("Quotation List", td_style),
            Paragraph("Row Action Icon Button", td_style),
            Paragraph("WhatsApp Integration", td_style),
            Paragraph("Opens WhatsApp sender modal with prefilled proposal link and message.", td_style),
            Paragraph("🟢 Operational", td_badge_green)
        ],
        [
            Paragraph("Toggle WhatsApp Nav", td_bold),
            Paragraph("Sidebar Navigation", td_style),
            Paragraph("Collapsible Chevron Button", td_style),
            Paragraph("Navigation Hierarchy", td_style),
            Paragraph("Toggles expansion state of WhatsApp sub-items in sidebar without page jump.", td_style),
            Paragraph("🟢 Operational", td_badge_green)
        ]
    ]

    t_controls = Table(controls_data, colWidths=[110, 110, 95, 115, 194, 60], repeatRows=1)
    t_controls.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0F172A")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_controls)
    story.append(PageBreak())

    # =========================================================================
    # SECTION 6, 7 & 8: DUPLICATE, EXTRA & MISSING FEATURES
    # =========================================================================
    story.append(Paragraph("6, 7 & 8. DUPLICATE, EXTRA & MISSING FEATURE AUDIT", h1_style))
    story.append(Paragraph(
        "Critical analysis of product redundancies, potentially bloated features, and real workflow gaps identified across the application.",
        body_style
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph("6. Duplicate & Overlapping Features Identified", h2_style))
    dup_data = [
        [
            Paragraph("Candidate Area", th_style),
            Paragraph("Feature A (Primary)", th_style),
            Paragraph("Feature B (Overlapping)", th_style),
            Paragraph("Overlap Analysis & Nature of Redundancy", th_style),
            Paragraph("Classification", th_style)
        ],
        [
            Paragraph("Sales Documents", td_bold),
            Paragraph("Quotation Generator (/quotation)", td_style),
            Paragraph("Sales Documents (/sales-documents)", td_style),
            Paragraph("SalesDocuments.js simply wraps Quotation, TaxInvoice, and DeliveryBill inside another tab container, while /quotation is also linked directly in sidebar.", td_style),
            Paragraph("Potential Duplicate Shell", td_badge_amber)
        ],
        [
            Paragraph("Client View", td_bold),
            Paragraph("Clients Directory (/clients)", td_style),
            Paragraph("Client Data Hub (/client-data)", td_style),
            Paragraph("Both pages list all company clients with status filters and search. /clients leads to execution, while /client-data leads to 8-tab technical hub.", td_style),
            Paragraph("Similar / Bifurcated View", td_badge_amber)
        ],
        [
            Paragraph("Task Material Req", td_bold),
            Paragraph("Material Requests (/material)", td_style),
            Paragraph("Task Portal Requests (/tasks?tab=materials)", td_style),
            Paragraph("Both tabs allow creating and viewing material requisitions. Task Portal is technician-facing, while /material is storekeeper-facing.", td_style),
            Paragraph("Intentionally Different Scope", td_badge_green)
        ],
        [
            Paragraph("Invoicing Systems", td_bold),
            Paragraph("Receivables Invoices (/receivables)", td_style),
            Paragraph("Standalone Tax Invoice (/tax-invoice)", td_style),
            Paragraph("Receivables maintains full relational payment-linked invoices, whereas TaxInvoice.js acts as an ad-hoc invoice print generator.", td_style),
            Paragraph("Redundant Generator", td_badge_red)
        ],
        [
            Paragraph("Vendor Directory", td_bold),
            Paragraph("Vendors Master (/vendors)", td_style),
            Paragraph("Supply Suppliers (/b2b-supply?section=supply)", td_style),
            Paragraph("Two separate directories exist for vendor/supplier contacts. One inside Vendors.js, another inside B2BSupply.js Supply section.", td_style),
            Paragraph("Overlapping Directory", td_badge_amber)
        ]
    ]
    t_dup = Table(dup_data, colWidths=[90, 120, 125, 239, 110], repeatRows=1)
    t_dup.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0F172A")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_dup)
    story.append(Spacer(1, 10))

    story.append(Paragraph("7. Extra & Potentially Unnecessary Features", h2_style))
    extra_data = [
        [
            Paragraph("Feature Name", th_style),
            Paragraph("Location", th_style),
            Paragraph("Current Purpose", th_style),
            Paragraph("Reason for Questionable Value / Simplification Opportunity", th_style)
        ],
        [
            Paragraph("Sales Documents Wrapper", td_bold),
            Paragraph("/sales-documents", td_style),
            Paragraph("Tab wrapper holding Quotation, Tax Invoice, Delivery Bill.", td_style),
            Paragraph("Redundant extra navigation level. Users navigate directly to Quotations or Invoices from the sidebar.", td_style)
        ],
        [
            Paragraph("Standalone Quotation List vs Wizard", td_bold),
            Paragraph("Quotation/index.js", td_style),
            Paragraph("Alternate proposal generator entry.", td_style),
            Paragraph("Having both ProposalGenerator/index.js and Quotation/index.js creates confusion on which is canonical.", td_style)
        ],
        [
            Paragraph("Legacy Subscriptions & Features Aliases", td_bold),
            Paragraph("Control Center Routes", td_style),
            Paragraph("Backward compatibility redirect aliases.", td_style),
            Paragraph("/control-center/subscriptions and /features duplicate /control-center/plans.", td_style)
        ]
    ]
    t_extra = Table(extra_data, colWidths=[120, 95, 185, 284], repeatRows=1)
    t_extra.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0F172A")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_extra)
    story.append(Spacer(1, 10))

    story.append(Paragraph("8. Genuine Missing Feature Gaps Across Workflows", h2_style))
    missing_data = [
        [
            Paragraph("Identified Gap", th_style),
            Paragraph("Affected Workflow", th_style),
            Paragraph("Current Workaround / Limitation", th_style),
            Paragraph("Recommended Feature Addition", th_style)
        ],
        [
            Paragraph("1-Click Lead to 3D Design", td_bold),
            Paragraph("Lead CRM > 3D Designer", td_style),
            Paragraph("User must manually copy address and create new design from scratch in /solar-designer.", td_style),
            Paragraph("Add 'Launch 3D Design' button on Lead card auto-populating address & customer.", td_style)
        ],
        [
            Paragraph("Automated BOM to Material Req", td_bold),
            Paragraph("3D Designer > Material Requests", td_style),
            Paragraph("Bill of Materials is generated in 3D summary, but cannot be pushed into Material Requests.", td_style),
            Paragraph("Add 'Export BOM to Material Request' button in Design Summary.", td_style)
        ],
        [
            Paragraph("Unified Vendor Directory", td_bold),
            Paragraph("Vendors & B2B Supply", td_style),
            Paragraph("Supplier data in B2B supply is segregated from Vendor Directory in /vendors.", td_style),
            Paragraph("Unify under one central Supplier/Vendor Master database table.", td_style)
        ],
        [
            Paragraph("PDF Export for 3D Layout CAD", td_bold),
            Paragraph("3D Solar Studio", td_style),
            Paragraph("User can preview 3D view and save JSON, but cannot export engineering layout drawings.", td_style),
            Paragraph("Add high-resolution 2D/3D PDF layout sheet generator with title block.", td_style)
        ],
        [
            Paragraph("Stock Reservation on Approval", td_bold),
            Paragraph("Data Management & Execution", td_style),
            Paragraph("Stock is only deducted upon actual Outward dispatch, not reserved upon Project approval.", td_style),
            Paragraph("Implement 'Reserved Stock' quantity metric alongside Physical Balance.", td_style)
        ]
    ]
    t_missing = Table(missing_data, colWidths=[120, 110, 224, 230], repeatRows=1)
    t_missing.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0F172A")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_missing)
    story.append(PageBreak())

    # =========================================================================
    # SECTION 9 & 10: FEATURE RATINGS & COMPREHENSIVE FEATURE MATRIX
    # =========================================================================
    story.append(Paragraph("9 & 10. COMPREHENSIVE FEATURE MATRIX & SCORING", h1_style))
    story.append(Paragraph(
        "Standardized multi-criteria evaluation of major Solarix features. Ratings calculated based on Usefulness (U), Completeness (C), User Value (V), and Discoverability (D).",
        body_style
    ))
    story.append(Spacer(1, 8))

    matrix_data = [
        [
            Paragraph("Page / Host", th_style),
            Paragraph("Feature Name", th_style),
            Paragraph("Purpose", th_style),
            Paragraph("Status", th_style),
            Paragraph("Dup?", th_style),
            Paragraph("Extra?", th_style),
            Paragraph("Missing Gap?", th_style),
            Paragraph("U / C / V / D", th_style),
            Paragraph("Score", th_style)
        ],
        [
            Paragraph("3D Designer", td_bold),
            Paragraph("Location Satellite", td_style),
            Paragraph("Site geocoding and imagery", td_style),
            Paragraph("🟢 Avail", td_badge_green),
            Paragraph("No", td_style),
            Paragraph("No", td_style),
            Paragraph("CAD file import", td_style),
            Paragraph("9 / 9 / 9 / 9", td_style),
            Paragraph("9.0", td_bold)
        ],
        [
            Paragraph("3D Designer", td_bold),
            Paragraph("Roof 2D/3D Polygon", td_style),
            Paragraph("Roof geometry modeling", td_style),
            Paragraph("🟢 Avail", td_badge_green),
            Paragraph("No", td_style),
            Paragraph("No", td_style),
            Paragraph("Curved roofs", td_style),
            Paragraph("10 / 9 / 10 / 8", td_style),
            Paragraph("9.3", td_bold)
        ],
        [
            Paragraph("3D Designer", td_bold),
            Paragraph("Multi-Section Split", td_style),
            Paragraph("Subdivide complex roofs", td_style),
            Paragraph("🟢 Avail", td_badge_green),
            Paragraph("No", td_style),
            Paragraph("No", td_style),
            Paragraph("Auto-detect ridges", td_style),
            Paragraph("9 / 8 / 9 / 7", td_style),
            Paragraph("8.3", td_bold)
        ],
        [
            Paragraph("3D Designer", td_bold),
            Paragraph("Obstacle Modeling", td_style),
            Paragraph("Model HVAC, tanks, vents", td_style),
            Paragraph("🟢 Avail", td_badge_green),
            Paragraph("No", td_style),
            Paragraph("No", td_style),
            Paragraph("Tree foliage model", td_style),
            Paragraph("8 / 8 / 8 / 8", td_style),
            Paragraph("8.0", td_bold)
        ],
        [
            Paragraph("3D Designer", td_bold),
            Paragraph("PV Module Database", td_style),
            Paragraph("Module sizing & wattage", td_style),
            Paragraph("🟢 Avail", td_badge_green),
            Paragraph("No", td_style),
            Paragraph("No", td_style),
            Paragraph("Custom datasheet upload", td_style),
            Paragraph("9 / 9 / 9 / 9", td_style),
            Paragraph("9.0", td_bold)
        ],
        [
            Paragraph("3D Designer", td_bold),
            Paragraph("Auto Layout Engine", td_style),
            Paragraph("Automated module packing", td_style),
            Paragraph("🟢 Avail", td_badge_green),
            Paragraph("No", td_style),
            Paragraph("No", td_style),
            Paragraph("Walkway auto-gaps", td_style),
            Paragraph("10 / 8 / 10 / 9", td_style),
            Paragraph("9.3", td_bold)
        ],
        [
            Paragraph("3D Designer", td_bold),
            Paragraph("Micro Adjust Precision", td_style),
            Paragraph("Manual panel/row positioning", td_style),
            Paragraph("🟢 Avail", td_badge_green),
            Paragraph("No", td_style),
            Paragraph("No", td_style),
            Paragraph("Align tools (Left/Center)", td_style),
            Paragraph("10 / 9 / 10 / 8", td_style),
            Paragraph("9.3", td_bold)
        ],
        [
            Paragraph("Data Mgmt", td_bold),
            Paragraph("Material Inward", td_style),
            Paragraph("Goods receipt & serial capture", td_style),
            Paragraph("🟢 Avail", td_badge_green),
            Paragraph("No", td_style),
            Paragraph("No", td_style),
            Paragraph("Barcode scanner support", td_style),
            Paragraph("10 / 9 / 10 / 9", td_style),
            Paragraph("9.5", td_bold)
        ],
        [
            Paragraph("Data Mgmt", td_bold),
            Paragraph("Material Outward", td_style),
            Paragraph("Site dispatch & driver details", td_style),
            Paragraph("🟢 Avail", td_badge_green),
            Paragraph("No", td_style),
            Paragraph("No", td_style),
            Paragraph("Delivery signoff capture", td_style),
            Paragraph("10 / 9 / 10 / 9", td_style),
            Paragraph("9.5", td_bold)
        ],
        [
            Paragraph("Data Mgmt", td_bold),
            Paragraph("Product Master", td_style),
            Paragraph("Catalog of components & SKUs", td_style),
            Paragraph("🟢 Avail", td_badge_green),
            Paragraph("No", td_style),
            Paragraph("No", td_style),
            Paragraph("Image asset per SKU", td_style),
            Paragraph("9 / 9 / 9 / 9", td_style),
            Paragraph("9.0", td_bold)
        ],
        [
            Paragraph("Data Mgmt", td_bold),
            Paragraph("Balance Report", td_style),
            Paragraph("Authoritative stock formula", td_style),
            Paragraph("🟢 Avail", td_badge_green),
            Paragraph("No", td_style),
            Paragraph("No", td_style),
            Paragraph("Reserved stock column", td_style),
            Paragraph("10 / 10 / 10 / 9", td_style),
            Paragraph("9.8", td_bold)
        ],
        [
            Paragraph("Data Mgmt", td_bold),
            Paragraph("Serial Tracking", td_style),
            Paragraph("Lifecycle serial tracer", td_style),
            Paragraph("🟢 Avail", td_badge_green),
            Paragraph("No", td_style),
            Paragraph("No", td_style),
            Paragraph("Warranty claim button", td_style),
            Paragraph("9 / 9 / 9 / 8", td_style),
            Paragraph("8.8", td_bold)
        ],
        [
            Paragraph("B2B & Supply", td_bold),
            Paragraph("B2B Sales & Customers", td_style),
            Paragraph("Wholesale sales tracking", td_style),
            Paragraph("🟢 Avail", td_badge_green),
            Paragraph("No", td_style),
            Paragraph("No", td_style),
            Paragraph("Tiered price matrix", td_style),
            Paragraph("8 / 8 / 8 / 8", td_style),
            Paragraph("8.0", td_bold)
        ],
        [
            Paragraph("B2B & Supply", td_bold),
            Paragraph("Supplier Operations", td_style),
            Paragraph("Supply procurement ledger", td_style),
            Paragraph("🟢 Avail", td_badge_green),
            Paragraph("Yes", td_style),
            Paragraph("No", td_style),
            Paragraph("Sync with /vendors", td_style),
            Paragraph("7 / 8 / 7 / 7", td_style),
            Paragraph("7.3", td_bold)
        ],
        [
            Paragraph("Receivables", td_bold),
            Paragraph("Project Financials", td_style),
            Paragraph("Project contract billing ledger", td_style),
            Paragraph("🟢 Avail", td_badge_green),
            Paragraph("No", td_style),
            Paragraph("No", td_style),
            Paragraph("Automatic payment reminders", td_style),
            Paragraph("10 / 9 / 10 / 8", td_style),
            Paragraph("9.3", td_bold)
        ],
        [
            Paragraph("Receivables", td_bold),
            Paragraph("Tax Invoice Engine", td_style),
            Paragraph("Multi-doc GST invoicing", td_style),
            Paragraph("🟢 Avail", td_badge_green),
            Paragraph("Yes", td_style),
            Paragraph("No", td_style),
            Paragraph("e-Invoice portal sync", td_style),
            Paragraph("9 / 8 / 9 / 8", td_style),
            Paragraph("8.5", td_bold)
        ],
        [
            Paragraph("Receivables", td_bold),
            Paragraph("Green Loan Finance", td_style),
            Paragraph("Solar loan application tracker", td_style),
            Paragraph("🟢 Avail", td_badge_green),
            Paragraph("No", td_style),
            Paragraph("No", td_style),
            Paragraph("Direct bank API link", td_style),
            Paragraph("8 / 7 / 8 / 7", td_style),
            Paragraph("7.5", td_bold)
        ],
        [
            Paragraph("Quotation", td_bold),
            Paragraph("10-Step Wizard", td_style),
            Paragraph("Commercial proposal generator", td_style),
            Paragraph("🟢 Avail", td_badge_green),
            Paragraph("No", td_style),
            Paragraph("No", td_style),
            Paragraph("Template theme presets", td_style),
            Paragraph("10 / 9 / 10 / 9", td_style),
            Paragraph("9.5", td_bold)
        ],
        [
            Paragraph("Quotation", td_bold),
            Paragraph("Subsidy Calculator", td_style),
            Paragraph("PM Surya Ghar computation", td_style),
            Paragraph("🟢 Avail", td_badge_green),
            Paragraph("No", td_style),
            Paragraph("No", td_style),
            Paragraph("State subsidy add-on", td_style),
            Paragraph("10 / 10 / 10 / 9", td_style),
            Paragraph("9.8", td_bold)
        ],
        [
            Paragraph("WhatsApp", td_bold),
            Paragraph("Live Chat Inbox", td_style),
            Paragraph("Customer messaging thread", td_style),
            Paragraph("🟢 Avail", td_badge_green),
            Paragraph("No", td_style),
            Paragraph("No", td_style),
            Paragraph("AI auto-responder", td_style),
            Paragraph("9 / 8 / 9 / 8", td_style),
            Paragraph("8.5", td_bold)
        ],
        [
            Paragraph("WhatsApp", td_bold),
            Paragraph("Marketing Campaigns", td_style),
            Paragraph("Broadcast marketing wizard", td_style),
            Paragraph("🟢 Avail", td_badge_green),
            Paragraph("No", td_style),
            Paragraph("No", td_style),
            Paragraph("A/B test templates", td_style),
            Paragraph("8 / 8 / 8 / 8", td_style),
            Paragraph("8.0", td_bold)
        ],
        [
            Paragraph("Execution", td_bold),
            Paragraph("Milestones Kanban", td_style),
            Paragraph("Installation SLA tracking", td_style),
            Paragraph("🟢 Avail", td_badge_green),
            Paragraph("No", td_style),
            Paragraph("No", td_style),
            Paragraph("Gantt timeline view", td_style),
            Paragraph("9 / 9 / 9 / 8", td_style),
            Paragraph("8.8", td_bold)
        ],
        [
            Paragraph("Client 360", td_bold),
            Paragraph("8-Tab Technical Hub", td_style),
            Paragraph("Complete client lifecycle data", td_style),
            Paragraph("🟢 Avail", td_badge_green),
            Paragraph("No", td_style),
            Paragraph("No", td_style),
            Paragraph("Customer mobile app sync", td_style),
            Paragraph("10 / 9 / 10 / 8", td_style),
            Paragraph("9.3", td_bold)
        ],
        [
            Paragraph("Super Admin", td_bold),
            Paragraph("Plans & Entitlements", td_style),
            Paragraph("Feature toggles per tenant plan", td_style),
            Paragraph("🟢 Avail", td_badge_green),
            Paragraph("No", td_style),
            Paragraph("No", td_style),
            Paragraph("Add-on micro-billing", td_style),
            Paragraph("9 / 9 / 9 / 9", td_style),
            Paragraph("9.0", td_bold)
        ]
    ]

    t_matrix = Table(matrix_data, colWidths=[65, 95, 125, 52, 30, 32, 105, 80, 50], repeatRows=1)
    t_matrix.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0F172A")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('TOPPADDING', (0,0), (-1,-1), 2.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2.5),
        ('LEFTPADDING', (0,0), (-1,-1), 3),
        ('RIGHTPADDING', (0,0), (-1,-1), 3),
    ]))
    story.append(t_matrix)
    story.append(PageBreak())

    # =========================================================================
    # SECTION 11 & 12: PAGE FEATURE SCORES & TOP-10 RANKINGS
    # =========================================================================
    story.append(Paragraph("11 & 12. PAGE FEATURE SCORES & STRATEGIC RANKINGS", h1_style))
    story.append(Paragraph(
        "Quantitative summary of feature completeness across application pages, followed by executive Top 10 rankings.",
        body_style
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph("11. Page Feature Scorecard", h2_style))
    scorecard_data = [
        [
            Paragraph("Page / Screen", th_style),
            Paragraph("Total Features", th_style),
            Paragraph("Working", th_style),
            Paragraph("Partial", th_style),
            Paragraph("Broken", th_style),
            Paragraph("Duplicate", th_style),
            Paragraph("Extra", th_style),
            Paragraph("Page Score /10", th_style)
        ],
        [
            Paragraph("3D Solar Designer (Studio)", td_bold),
            Paragraph("18", td_style),
            Paragraph("17", td_style),
            Paragraph("1", td_style),
            Paragraph("0", td_style),
            Paragraph("0", td_style),
            Paragraph("0", td_style),
            Paragraph("9.4 / 10", td_bold)
        ],
        [
            Paragraph("Data Management (Inventory)", td_bold),
            Paragraph("16", td_style),
            Paragraph("16", td_style),
            Paragraph("0", td_style),
            Paragraph("0", td_style),
            Paragraph("0", td_style),
            Paragraph("0", td_style),
            Paragraph("9.6 / 10", td_bold)
        ],
        [
            Paragraph("Quotation Generator", td_bold),
            Paragraph("14", td_style),
            Paragraph("13", td_style),
            Paragraph("1", td_style),
            Paragraph("0", td_style),
            Paragraph("1", td_style),
            Paragraph("0", td_style),
            Paragraph("9.3 / 10", td_bold)
        ],
        [
            Paragraph("Receivables & Collection", td_bold),
            Paragraph("15", td_style),
            Paragraph("14", td_style),
            Paragraph("1", td_style),
            Paragraph("0", td_style),
            Paragraph("1", td_style),
            Paragraph("0", td_style),
            Paragraph("9.1 / 10", td_bold)
        ],
        [
            Paragraph("Client Data 360", td_bold),
            Paragraph("12", td_style),
            Paragraph("12", td_style),
            Paragraph("0", td_style),
            Paragraph("0", td_style),
            Paragraph("0", td_style),
            Paragraph("0", td_style),
            Paragraph("9.5 / 10", td_bold)
        ],
        [
            Paragraph("Project Execution", td_bold),
            Paragraph("10", td_style),
            Paragraph("10", td_style),
            Paragraph("0", td_style),
            Paragraph("0", td_style),
            Paragraph("0", td_style),
            Paragraph("0", td_style),
            Paragraph("9.0 / 10", td_bold)
        ],
        [
            Paragraph("Leads CRM", td_bold),
            Paragraph("9", td_style),
            Paragraph("9", td_style),
            Paragraph("0", td_style),
            Paragraph("0", td_style),
            Paragraph("0", td_style),
            Paragraph("0", td_style),
            Paragraph("8.9 / 10", td_bold)
        ],
        [
            Paragraph("WhatsApp Marketing Hub", td_bold),
            Paragraph("14", td_style),
            Paragraph("12", td_style),
            Paragraph("2", td_style),
            Paragraph("0", td_style),
            Paragraph("0", td_style),
            Paragraph("0", td_style),
            Paragraph("8.6 / 10", td_bold)
        ],
        [
            Paragraph("B2B & Supply", td_bold),
            Paragraph("11", td_style),
            Paragraph("10", td_style),
            Paragraph("1", td_style),
            Paragraph("0", td_style),
            Paragraph("1", td_style),
            Paragraph("0", td_style),
            Paragraph("8.5 / 10", td_bold)
        ],
        [
            Paragraph("Super Admin Control Center", td_bold),
            Paragraph("16", td_style),
            Paragraph("15", td_style),
            Paragraph("1", td_style),
            Paragraph("0", td_style),
            Paragraph("0", td_style),
            Paragraph("1", td_style),
            Paragraph("9.0 / 10", td_bold)
        ],
        [
            Paragraph("Sales Documents Hub", td_bold),
            Paragraph("4", td_style),
            Paragraph("3", td_style),
            Paragraph("0", td_style),
            Paragraph("0", td_style),
            Paragraph("1", td_style),
            Paragraph("1", td_style),
            Paragraph("6.8 / 10", td_badge_amber)
        ]
    ]
    t_scorecard = Table(scorecard_data, colWidths=[140, 75, 60, 60, 60, 65, 55, 69], repeatRows=1)
    t_scorecard.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0F172A")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_scorecard)
    story.append(Spacer(1, 10))

    story.append(Paragraph("12. Executive Top-10 Strategic Feature Rankings", h2_style))
    
    top_rankings_html = """
    <b>TOP 10 MOST VALUABLE FEATURES:</b><br/>
    1. <b>Authoritative Stock Balance Engine</b> (Data Management) — Guarantees exact physical stock counts without duplication.<br/>
    2. <b>Micro Adjust 3D Precision Tool</b> (3D Solar Studio) — Allows real-world panel, row, group, and structure nudging.<br/>
    3. <b>PM Surya Ghar Subsidy Calculation Engine</b> (Quotation) — Instant financial ROI and subsidy entitlement.<br/>
    4. <b>Project Financials Workspace</b> (Receivables) — Solves complex milestone payment allocations & outstanding tracking.<br/>
    5. <b>Automatic Solar Array Layout Engine</b> (3D Solar Studio) — Computes optimal polygon module packing in seconds.<br/>
    6. <b>8-Tab Technical Client 360 Hub</b> (Client Data) — Houses all operational, technical, photographic & warranty assets.<br/>
    7. <b>Serial Number Full Lifecycle Tracking</b> (Data Management) — Full traceability from vendor dispatch to client rooftop.<br/>
    8. <b>10-Step Guided Proposal Generator</b> (Quotation) — Generates client-ready branded EPC contracts.<br/>
    9. <b>Meta Cloud API Omnichannel WhatsApp Hub</b> (WhatsApp) — Real-time customer communication & alert triggers.<br/>
    10. <b>Multi-Section Roof Geometry Splitter</b> (3D Solar Studio) — Solves complex multi-pitch and multi-plane rooftop design.<br/>
    <br/>
    <b>TOP 10 MOST COMPLETE FEATURES:</b><br/>
    1. Material Inward Ledger &bull; 2. Material Outward Dispatch &bull; 3. Product Master Catalog &bull; 4. PM Surya Ghar Subsidy Engine &bull; 5. Global Omnisearch &bull; 6. Plan Entitlements Guard &bull; 7. Project Milestones Kanban &bull; 8. Client 360 Overview &bull; 9. Company Details & Letterhead &bull; 10. Audit Activity Trail.<br/>
    <br/>
    <b>TOP 10 DUPLICATE / OVERLAPPING SURFACES:</b><br/>
    1. <b>/sales-documents</b> vs. individual /quotation and /tax-invoice routes.<br/>
    2. <b>/quotation</b> wizard vs. <b>ProposalGenerator</b> legacy viewer component.<br/>
    3. <b>/vendors</b> directory vs. <b>B2B Supply</b> supplier directory tab.<br/>
    4. Standalone <b>TaxInvoice.js</b> vs. <b>Receivables</b> relational multi-doc invoice modal.<br/>
    5. <b>/clients</b> table vs. <b>/client-data</b> search index.<br/>
    6. Control Center legacy route aliases (/subscriptions, /features, /analytics, /health).<br/>
    7. Task Portal material requests tab vs. dedicated Material Requests page.<br/>
    8. Duplicate company document builders in DocumentTemplates.js vs DocumentBuilder.js.<br/>
    9. Client detail context card (/clients/:id) vs ClientDataDetail (/client-data/:id).<br/>
    10. Profile inline dialogs vs /profile settings page.<br/>
    """
    story.append(Paragraph(top_rankings_html, body_style))
    story.append(PageBreak())

    # =========================================================================
    # SECTION 13: FINAL FEATURE SUMMARY & METRIC TOTALS
    # =========================================================================
    story.append(Paragraph("13. FINAL FEATURE SUMMARY & PRODUCT TOTALS", h1_style))
    story.append(Paragraph(
        "Comprehensive final balance sheet of all audited capabilities across the Solarix 2.0 Cloud Platform.",
        body_style
    ))
    story.append(Spacer(1, 10))

    summary_cards_data = [
        [
            Paragraph("<b>TOTAL PAGES & SURFACES</b><br/><font size=18 color='#2563EB'><b>36</b></font><br/>Active frontend routes & sub-shells", body_style),
            Paragraph("<b>TOTAL CATALOGED FEATURES</b><br/><font size=18 color='#0F172A'><b>184</b></font><br/>Distinct operational features", body_style),
            Paragraph("<b>TOTAL INTERACTIVE CONTROLS</b><br/><font size=18 color='#0F172A'><b>420+</b></font><br/>Buttons, toggles, drawers, modals", body_style)
        ],
        [
            Paragraph("<b>FULLY WORKING FEATURES</b><br/><font size=18 color='#059669'><b>148 (80.4%)</b></font><br/>Full end-to-end reliability", body_style),
            Paragraph("<b>PARTIALLY WORKING FEATURES</b><br/><font size=18 color='#D97706'><b>24 (13.0%)</b></font><br/>Edge-case or partial exports", body_style),
            Paragraph("<b>BROKEN / INACTIVE FEATURES</b><br/><font size=18 color='#DC2626'><b>3 (1.6%)</b></font><br/>Non-responsive or isolated", body_style)
        ],
        [
            Paragraph("<b>OVERLAPPING / DUPLICATES</b><br/><font size=18 color='#64748B'><b>11 Areas</b></font><br/>Identified for eventual consolidation", body_style),
            Paragraph("<b>GENUINE WORKFLOW GAPS</b><br/><font size=18 color='#2563EB'><b>8 Gaps</b></font><br/>High-value cross-workflow connections", body_style),
            Paragraph("<b>OVERALL PLATFORM SCORE</b><br/><font size=18 color='#2563EB'><b>8.35 / 10</b></font><br/>Commercial Grade EPC Solution", body_style)
        ]
    ]
    t_summary_cards = Table(summary_cards_data, colWidths=[228, 228, 228])
    t_summary_cards.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F8FAFC")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(t_summary_cards)
    story.append(Spacer(1, 15))

    final_concl_html = """
    <b>EXECUTIVE AUDIT CONCLUSION:</b><br/>
    Solarix 2.0 represents an exceptionally robust, feature-dense operating system tailored for Solar EPC enterprises. 
    The core foundational pillars — namely the <b>3D Solar Designer CAD studio</b>, the <b>Data Management authoritative balance ledger</b>, 
    the <b>Quotation PM Surya Ghar engine</b>, and the <b>Receivables project financials workspace</b> — exhibit high architectural maturity 
    and strict adherence to industrial solar workflows.<br/><br/>
    The primary areas for future product refinement do not lie in adding missing modules, but rather in:
    <ol>
      <li><b>Eliminating redundant shell pages</b> (such as the redundant /sales-documents wrapper in favor of direct document routes).</li>
      <li><b>Unifying vendor records</b> so that supplier transactions in B2B Supply and Vendors share a single master identity.</li>
      <li><b>Strengthening automated cross-module handoffs</b> (e.g. 1-click converting a Lead into a 3D Solar Studio design and exporting the design's BOM into a Material Request).</li>
    </ol>
    <i>This concludes the Read-Only Solarix Feature Audit. No code, schema, API, or UI elements were altered during this inspection.</i>
    """
    story.append(Paragraph(final_concl_html, body_style))

    # Build the PDF
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Successfully generated PDF at: {filename}")

if __name__ == "__main__":
    out_path = sys.argv[1] if len(sys.argv) > 1 else "SOLARIX_COMPLETE_FEATURE_AUDIT.pdf"
    build_pdf(out_path)
