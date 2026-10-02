import React from "react";
import { Link } from "react-router-dom";
import {
  MessageSquare,
  ArrowRight,
  CheckCircle2,
  Zap,
  Users,
  BarChart3,
  Inbox,
  ShieldCheck,
  Send,
  Smartphone,
  Eye,
  CheckCheck,
  Sparkles,
  Calendar,
  Layers,
  ChevronRight,
  Sun
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function WhatsAppMarketingPublic() {
  const features = [
    {
      icon: Users,
      title: "CRM-Powered Campaigns",
      desc: "Send high-converting broadcasts directly to filtered Solarix customers segmented by solar capacity, city, and status.",
    },
    {
      icon: MessageSquare,
      title: "Smart Templates",
      desc: "Create reusable communication templates with dynamic variables like {{customer_name}}, {{solar_capacity}}, and {{city}}.",
    },
    {
      icon: BarChart3,
      title: "Campaign Analytics",
      desc: "Accurately track sent, delivered, read, and failed messages with cryptographic webhook verification.",
    },
    {
      icon: Inbox,
      title: "WhatsApp Inbox",
      desc: "Manage two-way customer conversations with live CRM customer profiles right beside every chat.",
    },
    {
      icon: Zap,
      title: "Automated Follow-Ups",
      desc: "Trigger automatic reminders when milestone payments are due, installations complete, or services are scheduled.",
    },
    {
      icon: ShieldCheck,
      title: "Multiple Providers",
      desc: "Seamlessly switch between high-speed Evolution Go or enterprise Meta WhatsApp Cloud API with zero downtime.",
    },
  ];

  const steps = [
    { num: "01", title: "Connect WhatsApp", desc: "Link your WhatsApp number in seconds via Evolution Go QR code or Meta Cloud API." },
    { num: "02", title: "Select CRM Audience", desc: "Filter verified Solarix residential, commercial, or lead contacts by city and capacity." },
    { num: "03", title: "Create Message", desc: "Craft engaging messages with images, documents, and dynamic CRM personalized tags." },
    { num: "04", title: "Preview & Confirm", desc: "Verify live WhatsApp device preview and compliance notice before hitting dispatch." },
    { num: "05", title: "Send or Schedule", desc: "Queue instant background sends with rate-limiting or schedule for the ideal hour." },
    { num: "06", title: "Track Results", desc: "Monitor delivery receipts, read rates, and customer replies directly in your inbox." },
  ];

  const useCases = [
    { title: "Service Reminders", desc: "Notify rooftop solar clients when their scheduled panel cleaning is due." },
    { title: "Payment Reminders", desc: "Dispatch milestone payment requests with invoice PDFs attached." },
    { title: "Installation Updates", desc: "Keep homeowners updated on structure erection and DISCOM net meter sync." },
    { title: "Customer Follow-Ups", desc: "Engage warm leads who submitted solar inquiries on your website." },
    { title: "Festival Greetings", desc: "Broadcast festive wishes paired with PM Surya Ghar subsidy promotional offers." },
    { title: "Solar Maintenance", desc: "Inform commercial plants about preventive inverter checkups." },
    { title: "Lead Follow-Up", desc: "Instant automated WhatsApp welcome as soon as an inquiry arrives." },
    { title: "Customer Notifications", desc: "Official DISCOM inspection dates and commissioning certificates." },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-emerald-500 selection:text-white">
      {/* Top Navigation */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
              <Sun className="w-5 h-5" />
            </div>
            <span className="font-bold text-lg tracking-tight text-white" style={{ fontFamily: "Outfit" }}>
              SOLARIX
            </span>
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[10px] ml-1">
              WhatsApp Engine
            </Badge>
          </div>

          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" size="sm" className="text-xs text-slate-300 hover:text-white hover:bg-slate-800">
                Log In
              </Button>
            </Link>
            <Link to="/login">
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-600/20">
                Start WhatsApp Marketing
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative pt-20 pb-24 overflow-hidden">
        {/* Subtle glow background */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-emerald-500/15 blur-[120px] rounded-full pointer-events-none" />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center space-y-6 relative z-10">
          <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs px-3.5 py-1 rounded-full font-medium">
            ⚡ Powered by Solarix CRM Data Architecture
          </Badge>

          <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-white leading-tight" style={{ fontFamily: "Outfit" }}>
            Turn Solarix CRM Into Your <br />
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-blue-400 bg-clip-text text-transparent">
              WhatsApp Marketing Engine
            </span>
          </h1>

          <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Connect WhatsApp with your Solarix CRM, manage customer conversations, create campaigns and track message delivery from one place.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-2">
            <Link to="/login">
              <Button size="lg" className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm h-12 px-7 gap-2 shadow-lg shadow-emerald-500/25">
                Start WhatsApp Marketing <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>

            <a href="#demo">
              <Button size="lg" variant="outline" className="border-slate-800 text-slate-300 hover:text-white hover:bg-slate-900 text-sm h-12 px-6">
                View Interactive Demo
              </Button>
            </a>
          </div>
        </div>

        {/* HERO VISUAL: PREMIUM SOLARIX DASHBOARD MOCKUP */}
        <div id="demo" className="max-w-6xl mx-auto px-4 sm:px-6 mt-16 relative z-10">
          <div className="p-2 sm:p-3 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-2xl backdrop-blur-xl ring-1 ring-white/10">
            {/* Window bar */}
            <div className="px-4 py-2.5 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                <span className="ml-2 font-mono text-[11px] text-slate-400">solarix.crm / whatsapp-marketing</span>
              </div>
              <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                Connected: +91 98765 43210 (Evolution Go)
              </Badge>
            </div>

            {/* Dashboard Content Mockup */}
            <div className="p-6 bg-slate-950/90 rounded-b-2xl space-y-6">
              {/* Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase">Messages Sent</div>
                  <div className="text-2xl font-bold text-white mt-1">1,420</div>
                  <div className="text-[10px] text-emerald-400 mt-0.5">↑ 98.2% delivered</div>
                </div>
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase">Delivered</div>
                  <div className="text-2xl font-bold text-emerald-400 mt-1">1,380</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Webhook verified</div>
                </div>
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase">Read Receipts</div>
                  <div className="text-2xl font-bold text-teal-400 mt-1">1,190</div>
                  <div className="text-[10px] text-teal-300 mt-0.5">86.2% read rate</div>
                </div>
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase">Response Rate</div>
                  <div className="text-2xl font-bold text-blue-400 mt-1">24.8%</div>
                  <div className="text-[10px] text-blue-300 mt-0.5">Live CRM replies</div>
                </div>
              </div>

              {/* Split Chat & Campaign Simulation */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-7 p-4 bg-slate-900/50 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-white">Active Campaign: Diwali Rooftop Subsidy Blast</span>
                    <Badge className="bg-emerald-500/20 text-emerald-300 border-0 text-[10px]">Sending (420 Contacts)</Badge>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 font-mono text-xs text-slate-300 leading-relaxed">
                    Hello <span className="text-emerald-400 font-bold">&#123;&#123;customer_name&#125;&#125;</span>! ☀️
                    <br /><br />
                    Celebrate with zero electricity bills! Under PM Surya Ghar Yojana, your home in <span className="text-blue-400">&#123;&#123;city&#125;&#125;</span> qualifies for up to ₹78,000 direct subsidy.
                    <br /><br />
                    GVP Solar Energy provides complete net-metering. Reply YES to book your survey!
                  </div>
                </div>

                <div className="md:col-span-5 p-4 bg-slate-900/50 border border-slate-800 rounded-xl flex flex-col justify-between">
                  <div className="flex items-center gap-2.5 pb-2 border-b border-slate-800 text-xs">
                    <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[10px]">
                      R
                    </div>
                    <div>
                      <div className="font-bold text-white">Rajesh Kulkarni</div>
                      <div className="text-[10px] text-slate-400">Pune • 6.0 kW Solar System</div>
                    </div>
                  </div>
                  <div className="py-3 space-y-2 text-xs">
                    <div className="bg-slate-800/80 p-2.5 rounded-lg text-slate-300">
                      "Sir, when will your engineer visit our site for survey?"
                    </div>
                    <div className="bg-emerald-950/60 border border-emerald-500/30 p-2.5 rounded-lg text-emerald-200 self-end">
                      "Engineer Prashant Patil will visit tomorrow at 11 AM."
                      <div className="text-[9px] text-slate-400 text-right mt-1">11:15 AM • Read</div>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-[11px] text-slate-400">
                    <span>CRM Status: <span className="text-white font-medium">Active Client</span></span>
                    <Badge variant="outline" className="text-[9px] text-blue-300 border-blue-500/30">Synced with Solarix</Badge>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section className="py-20 border-t border-slate-800/80 bg-slate-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto space-y-3 mb-16">
            <Badge className="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs">
              Built Specifically for Solar EPCs
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-black text-white" style={{ fontFamily: "Outfit" }}>
              Everything You Need to Scale Customer Outreach
            </h2>
            <p className="text-sm text-slate-400">
              Stop juggling separate spreadsheet exports and personal WhatsApp chats. Unify marketing and customer operations in Solarix CRM.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <div
                  key={i}
                  className="p-6 bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-2xl space-y-3 transition group"
                >
                  <div className="w-12 h-12 rounded-xl bg-slate-800 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-white">{f.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-20 border-t border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-xl mx-auto space-y-3 mb-16">
            <h2 className="text-3xl sm:text-4xl font-black text-white" style={{ fontFamily: "Outfit" }}>
              How It Works
            </h2>
            <p className="text-sm text-slate-400">
              A friction-free 6-step workflow designed for rapid execution and carrier compliance.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {steps.map((s) => (
              <div key={s.num} className="p-6 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-2">
                <div className="text-2xl font-black text-emerald-400 font-mono">{s.num}</div>
                <h4 className="text-base font-bold text-white">{s.title}</h4>
                <p className="text-xs text-slate-400 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* USE CASES */}
      <section className="py-20 border-t border-slate-800/80 bg-slate-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-xl mx-auto space-y-3 mb-14">
            <h2 className="text-3xl sm:text-4xl font-black text-white" style={{ fontFamily: "Outfit" }}>
              High-Impact Solar Use Cases
            </h2>
            <p className="text-sm text-slate-400">
              Pre-built campaign and notification workflows ready for Indian solar installers.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {useCases.map((uc, i) => (
              <div key={i} className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1.5">
                <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {uc.title}
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">{uc.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ANALYTICS SECTION */}
      <section className="py-20 border-t border-slate-800/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center space-y-12">
          <div className="space-y-3">
            <Badge className="bg-teal-500/10 text-teal-400 border border-teal-500/20 text-xs">
              Delivery Intelligence
            </Badge>
            <h2 className="text-3xl sm:text-5xl font-black text-white" style={{ fontFamily: "Outfit" }}>
              Know What Happens After You Hit Send
            </h2>
            <p className="text-sm text-slate-400 max-w-xl mx-auto">
              Real-time webhook telemetry guarantees you never guess if a customer received or opened your proposal.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
            {[
              { label: "Sent", val: "100%", sub: "Queued & Paced" },
              { label: "Delivered", val: "98.2%", sub: "Confirmed Receipt" },
              { label: "Read", val: "86.4%", sub: "Double Blue Check" },
              { label: "Failed", val: "1.8%", sub: "Invalid / Blocked" },
              { label: "Response Rate", val: "24.8%", sub: "Direct CRM Chat" },
            ].map((m, i) => (
              <div key={i} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-xs space-y-1">
                <div className="text-xs font-semibold text-slate-400">{m.label}</div>
                <div className="text-2xl font-bold text-white">{m.val}</div>
                <div className="text-[10px] text-emerald-400">{m.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-20 border-t border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 text-center">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 space-y-6">
          <h2 className="text-3xl sm:text-4xl font-black text-white" style={{ fontFamily: "Outfit" }}>
            Your customers are already on WhatsApp.
          </h2>
          <p className="text-sm text-slate-400 max-w-lg mx-auto">
            Bring your CRM conversations, campaigns and follow-ups into Solarix. Connect your number and launch your first campaign in 2 minutes.
          </p>

          <div className="pt-2">
            <Link to="/login">
              <Button size="lg" className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm h-12 px-8 shadow-lg shadow-emerald-500/25">
                Connect WhatsApp Now
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-8 text-center text-xs text-slate-500">
        © 2026 SOLARIX CRM. All rights reserved. Built for modern Solar EPC & Distribution enterprises.
      </footer>
    </div>
  );
}
