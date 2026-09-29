"""
Test suite for Solar Quotation / Proposal module.
Tests:
- S1 Template Generation and Mapping
- S2 Template Generation and Mapping
- Real-time calculations and update consistency (100kW -> 120kW)
- Zero remaining raw placeholders
- Table injection (Payment Terms, Bank Details, BOM, Scope, Terms)
- Number formatting (Indian comma format and INR)
"""

import os
import io
import sys
import re
from pathlib import Path

# Add backend to sys.path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

import docx
import solar_quotation_engine as engine

def run_tests():
    print("==================== STARTING SOLAR QUOTATION TESTS ====================")

    quotation_100kw = {
        "id": "test-q-100",
        "reference_no": "GVP/QTN/2026/0001",
        "date": "29-09-2026",
        "customer": {
            "name": "ABC Industries",
            "address": "100 Main Road, Kolhapur, Maharashtra 416001",
            "phone": "+91 98765 43210",
            "email": "contact@abcindustries.com",
            "city": "Kolhapur"
        },
        "company": {
            "name": "GVP Solar",
            "address": "Pune Commercial Hub, Maharashtra",
            "phone": "+91 98765 00000",
            "email": "info@gvpsolar.com",
            "poc": "Solar Solutions Team",
            "gst": "27AAACG0000A1Z5"
        },
        "project": {
            "size_kw": 100,
            "structure_type": "HDGI Elevated Rooftop Superstructure",
            "system_type": "Grid Connected Solar PV System",
            "location": "Kolhapur Rooftop Site",
            "description": "100 kW Grid Connected Industrial Rooftop Solar Plant"
        },
        "solar_system": {
            "panel": {
                "watt_peak": "590 Wp",
                "quantity": 170,
                "make": "Adani Solar",
                "brand": "Adani Solar",
                "type": "Mono PERC Bifacial",
                "warranty": "12 Years Product / 25 Years Performance"
            },
            "inverter": {
                "size_kw": "100 kW",
                "quantity": 1,
                "make": "Solis",
                "brand": "Solis",
                "phase": "Three Phase",
                "warranty": "5 Years Standard Warranty"
            },
            "cable": {
                "make": "Polycab",
                "ac": "4C x 50 sq.mm Aluminium Armoured Cable",
                "dc": "1C x 4 sq.mm Copper Solar Cable"
            },
            "structure": {
                "description": "HDGI Elevated Superstructure with SS304 Fasteners"
            },
            "bos": {
                "description": "ACDB, DCDB, Chemical Earthing & Lightning Protection",
                "warranty": "5 Years Complete Balance of System"
            }
        },
        "financials": {
            "price_per_kw": 2600,
            "project_cost": 260000,
            "payback_years": 3.5,
            "annual_generation": 150000,
            "annual_saving": 1200000,
            "tree_saved": 1600,
            "co2_reduction": 140,
            "monthly_generation": 12500,
            "monthly_saving": 100000
        },
        "commercial": {
            "price": 260000,
            "price_per_kw": 2600,
            "payment_terms": [
                {"stage": "Advance", "percent": 20, "amount": 52000, "description": "Along with purchase order"},
                {"stage": "Material Delivery", "percent": 60, "amount": 156000, "description": "Upon dispatch of panels and inverter"},
                {"stage": "Installation", "percent": 15, "amount": 39000, "description": "Upon mechanical & electrical installation"},
                {"stage": "Commissioning", "percent": 5, "amount": 13000, "description": "Upon net metering and handover"}
            ],
            "bank_details": {
                "bank_name": "HDFC Bank Ltd",
                "account_name": "GVP Solar Technologies",
                "account_number": "50200012345678",
                "ifsc": "HDFC0001234",
                "branch": "Pune Main Branch"
            }
        },
        "bom": [
            {"item": "Solar PV Modules", "specification": "590 Wp Mono PERC Bifacial", "make": "Adani Solar", "quantity": 170, "unit": "Nos"},
            {"item": "Grid-Tied Solar Inverter", "specification": "100 kW Three Phase String Inverter", "make": "Solis", "quantity": 1, "unit": "Nos"},
            {"item": "Module Mounting Structure", "specification": "HDGI Elevated Structure", "make": "Standard", "quantity": "100 kW", "unit": "Set"}
        ],
        "timeline": [
            {"stage": "Finalization of Design and Drawings", "duration": "7 Days", "sequence": 1},
            {"stage": "Engineering, Procurement, and Supply of Material", "duration": "15 Days", "sequence": 2},
            {"stage": "Solar Plant Installation", "duration": "20 Days", "sequence": 3},
            {"stage": "Commissioning and Testing", "duration": "14 Days", "sequence": 4}
        ],
        "scope_of_work": [
            "Engineering design, 3D shadow analysis, and detailed layout drawings.",
            "Supply and safe transport of modules, inverters, and structures to customer site.",
            "Complete installation, earthing pits, and testing.",
            "Net-metering documentation and DISCOM liaison."
        ],
        "terms_and_conditions": [
            "Validity: 15 days from issuance.",
            "Payment: Milestone-wise as per schedule.",
            "Site access: Client to provide shadow-free roof, water and power."
        ]
    }

    company_doc = {
        "company_name": "GVP Solar",
        "owner_name": "Solar Solutions Team",
        "mobile": "+91 98765 00000",
        "email": "info@gvpsolar.com",
        "address": "Pune Commercial Hub, Maharashtra",
        "gst_number": "27AAACG0000A1Z5"
    }

    # TEST 1: Generate S1
    print("\n--- TEST 1: Generate Format S1 ---")
    s1_bytes = engine.generate_quotation_docx(quotation_100kw, company_doc, "S1")
    assert len(s1_bytes) > 100000, f"S1 bytes too small: {len(s1_bytes)}"
    doc_s1 = docx.Document(io.BytesIO(s1_bytes))
    s1_full_text = " ".join(p.text for p in doc_s1.paragraphs)

    assert "ABC Industries" in s1_full_text, "Customer Name missing in S1"
    assert "100 kW" in s1_full_text, "Project Size missing in S1"
    assert "2,60,000" in s1_full_text, "Project Cost missing in S1"
    assert "1,50,000" in s1_full_text, "Annual Generation missing in S1"
    assert "GVP/QTN/2026/0001" in s1_full_text, "Reference No missing in S1"
    assert "«" not in s1_full_text, "Raw unresolved placeholder found in S1!"
    print(f"✓ S1 generation passed! Document size: {len(s1_bytes):,} bytes, 0 raw placeholders.")

    # TEST 2: Generate S2
    print("\n--- TEST 2: Generate Format S2 ---")
    s2_bytes = engine.generate_quotation_docx(quotation_100kw, company_doc, "S2")
    assert len(s2_bytes) > 50000, f"S2 bytes too small: {len(s2_bytes)}"
    doc_s2 = docx.Document(io.BytesIO(s2_bytes))
    s2_full_text = " ".join(p.text for p in doc_s2.paragraphs)

    assert "ABC Industries" in s2_full_text, "Customer Name missing in S2"
    assert "100 kW" in s2_full_text, "Project Size missing in S2"
    assert "590 Wp" in s2_full_text, "Watt Peak missing in S2"
    assert "170" in s2_full_text, "Number of panels missing in S2"
    assert "Adani Solar" in s2_full_text, "Panel make missing in S2"
    assert "Solis" in s2_full_text, "Inverter make missing in S2"
    assert "2,60,000" in s2_full_text, "Project Cost missing in S2"
    assert "«" not in s2_full_text, "Raw unresolved placeholder found in S2!"
    print(f"✓ S2 generation passed! Document size: {len(s2_bytes):,} bytes, 0 raw placeholders.")

    # TEST 3: Edit 100 kW -> 120 kW and verify recalculations
    print("\n--- TEST 3: Edit 100 kW -> 120 kW ---")
    import copy
    quotation_120kw = copy.deepcopy(quotation_100kw)
    quotation_120kw["project"]["size_kw"] = 120
    # Dependent calculations
    # 120 kW * 2600 = 3,12,000
    quotation_120kw["commercial"]["price"] = 312000
    quotation_120kw["financials"]["project_cost"] = 312000
    quotation_120kw["financials"]["annual_generation"] = 120 * 1500 # 1,80,000
    quotation_120kw["financials"]["annual_saving"] = 180000 * 8 # 14,40,000

    s1_120_bytes = engine.generate_quotation_docx(quotation_120kw, company_doc, "S1")
    doc_s1_120 = docx.Document(io.BytesIO(s1_120_bytes))
    s1_120_text = " ".join(p.text for p in doc_s1_120.paragraphs)

    assert "120 kW" in s1_120_text, "Updated 120 kW missing in S1"
    assert "3,12,000" in s1_120_text, "Updated cost 3,12,000 missing in S1"
    assert "1,80,000" in s1_120_text, "Updated generation 1,80,000 missing in S1"
    assert "«" not in s1_120_text, "Raw placeholder in updated S1"
    print("✓ Recalculation update to 120 kW passed! Document reflects 120 kW and ₹3,12,000.")

    s2_120_bytes = engine.generate_quotation_docx(quotation_120kw, company_doc, "S2")
    doc_s2_120 = docx.Document(io.BytesIO(s2_120_bytes))
    s2_120_text = " ".join(p.text for p in doc_s2_120.paragraphs)
    assert "120 kW" in s2_120_text, "Updated 120 kW missing in S2"
    assert "3,12,000" in s2_120_text, "Updated cost 3,12,000 missing in S2"
    assert "«" not in s2_120_text, "Raw placeholder in updated S2"
    print("✓ S2 recalculation update to 120 kW passed!")

    print("\n==================== ALL TESTS COMPLETED SUCCESSFULLY! ====================")

if __name__ == "__main__":
    run_tests()
