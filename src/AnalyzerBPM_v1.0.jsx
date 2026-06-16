// ─── Copyright Notice ────────────────────────────────────────────────────────
// AnalyzerBPM™ — Business Process Maturity Assessment
// Copyright © 2025 AnalyzerBPM. All rights reserved.
// Unauthorised reproduction, distribution, or commercial use is strictly
// prohibited. For licensing enquiries: tellus@analyzerbpm.com
// ─────────────────────────────────────────────────────────────────────────────
//
// KEY BEHAVIOURS (v7):
//  • Email OTP login — 6-digit code, 10-min expiry, resend button
//  • Rate limit — max 2 assessments per email per rolling 7-day window
//  • All 6 dimensions, all 17 questions, fully unlocked
//  • Profile form: email, company (optional), job function, industry, company size, region, process
//  • Process selection: searchable dropdown + Other free text
//  • Progress bar tracks answered questions
//  • Review & question-level edit before submission; locked after submit
//  • On submit → AI summary (100-150 words) + avg score shown on results screen
//  • "Create recommendation report" button → feedback (5-star + text) required first
//  • AI PDF report: weighted gap scoring, top 5-7 steps (≤30 words each), ≤310 words total
//  • PDF filename: AnalyzerBPM_<ProcessName>
//  • Timestamps (start/end) and response variance stored in DB
//  • Solo assessment only — team workflow removed
//
// SUPABASE SETUP — run once in SQL Editor:
//
//   CREATE TABLE assessments (
//     id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//     email                TEXT,
//     job_function         TEXT,
//     company              TEXT,
//     industry             TEXT,
//     process_name         TEXT,
//     responses            JSONB,
//     min_score            INT,
//     avg_score            NUMERIC(4,2),
//     completed            BOOLEAN DEFAULT TRUE,
//     company_size         TEXT,
//     region               TEXT,
//     started_at           TIMESTAMPTZ,
//     completed_at         TIMESTAMPTZ,
//     time_to_complete_secs INT,
//     response_variance    JSONB,
//     created_at           TIMESTAMPTZ DEFAULT NOW()
//   );
//   ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "public insert only"
//     ON assessments FOR INSERT WITH CHECK (true);
//   CREATE POLICY "public read by email"
//     ON assessments FOR SELECT USING (true);
//
//   -- OTP table
//   CREATE TABLE otp_codes (
//     id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//     email      TEXT NOT NULL,
//     code       TEXT NOT NULL,
//     expires_at TIMESTAMPTZ NOT NULL,
//     used       BOOLEAN DEFAULT FALSE,
//     created_at TIMESTAMPTZ DEFAULT NOW()
//   );
//   ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "public otp insert" ON otp_codes FOR INSERT WITH CHECK (true);
//   CREATE POLICY "public otp read"   ON otp_codes FOR SELECT USING (true);
//   CREATE POLICY "public otp update" ON otp_codes FOR UPDATE USING (true);
//
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef, useEffect } from "react"

const SUPABASE_URL = "https://dukfzmfbnnhwijlppphf.supabase.co"
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1a2Z6bWZibm5od2lqbHBwcGhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1ODQ2ODksImV4cCI6MjA5NzE2MDY4OX0.agLkxo3RCCdHKV7CXAMj-uhdNatr2Vlq1B1VFvlwkjo"

const BRAND = "AnalyzerBPM"
const CY    = 2026

const P = {
  navy:   "#1B2B3A",
  soft:   "#F0F2F4",
  ink:    "#111827",
  muted:  "#4B5563",
  border: "#D4D8DD",
  surface:"#F5F6F7",
  white:  "#FFFFFF",
}

const PAGES = {
  LANDING:    "landing",
  OTP:        "otp",
  PROFILE:    "profile",
  SETUP:      "setup",
  ASSESSMENT: "assessment",
  RESULTS:    "results",
  FEEDBACK:   "feedback",
  REPORT:     "report",
}

const ALL_DIMS = ["Design","Skills","Ownership & Governance","Support Functions","Measure","Improvement"]

const ATTR_META = {
  Design:                  { color:"#1B2B3A", bg:"#F0F2F4", label:"DE" },
  Skills:                  { color:"#1B2B3A", bg:"#F0F2F4", label:"SK" },
  "Ownership & Governance":{ color:"#1B2B3A", bg:"#F0F2F4", label:"OG" },
  "Support Functions":     { color:"#1B2B3A", bg:"#F0F2F4", label:"SF" },
  Measure:                 { color:"#1B2B3A", bg:"#F0F2F4", label:"ME" },
  Improvement:             { color:"#1B2B3A", bg:"#F0F2F4", label:"IM" },
}

const LEVEL_META = {
  1:{ color:"#1B2B3A", bg:"#F0F2F4", border:"#D4D8DD",
      label:"Ad hoc, unpredictable — success depends on individuals",
      desc:"Processes are unstructured and unpredictable. Success depends on individual effort rather than system design. Reactive firefighting is the norm." },
  2:{ color:"#1B2B3A", bg:"#F0F2F4", border:"#D4D8DD",
      label:"Repeatable within teams, inconsistent across the organisation",
      desc:"Processes are repeatable within teams but not standardised across the organisation. Inconsistency between units is common." },
  3:{ color:"#1B2B3A", bg:"#F0F2F4", border:"#D4D8DD",
      label:"Documented, standardised, and consistently applied organisation-wide",
      desc:"Processes are documented and consistently applied organisation-wide. A strong foundation is in place for measurement and integration." },
  4:{ color:"#1B2B3A", bg:"#F0F2F4", border:"#D4D8DD",
      label:"Measured, data-driven, and proactively managed",
      desc:"Performance is measured and managed quantitatively. Management can predict outcomes and intervene proactively." },
  5:{ color:"#1B2B3A", bg:"#F0F2F4", border:"#D4D8DD",
      label:"Continuously improving through innovation and data-driven feedback",
      desc:"Processes are continuously improved through data-driven feedback loops, innovation, and emerging technology adoption." },
}

// ═══════════════════════════════════════════════════════════════════════════
// QUESTIONS — 17 total, each with 5 answer options AND 5 assessment statements
// assessment[i] = statement shown in the report when score i+1 is the lowest
//                 selected for this dimension
// ═══════════════════════════════════════════════════════════════════════════
const QUESTIONS = [
  // ── DESIGN (Q1–Q3) ────────────────────────────────────────────────────────
  {
    attr:"Design",
    q:"Is the process designed to align with neighbouring processes, IT systems, and the overall value chain?",
    opts:[
      "Never formally designed end-to-end, relies on legacy workarounds",
      "Partially redesigned for key pain points but isolated from adjacent processes",
      "Fully redesigned end-to-end, limited integration with other units or systems",
      "Deliberately interfaces with related processes and IT systems as a cohesive unit",
      "Architecturally integrated across the full value chain with interoperability standards",
    ],
    assessment:[
      "The process has never been formally designed end-to-end and relies on legacy workarounds, creating significant fragility and hidden inefficiency at every boundary.",
      "Key pain points have been partially addressed but the process remains isolated from adjacent processes, meaning improvements in one area frequently create friction elsewhere.",
      "The process has been fully redesigned end-to-end, though integration with other units and systems remains limited, leaving handoffs as a source of inconsistency.",
      "The process deliberately interfaces with related processes and IT systems as a cohesive unit, with clear input/output agreements reducing boundary failures.",
      "The process is architecturally integrated across the full value chain with interoperability standards, enabling seamless data flow and coordinated performance management.",
    ],
  },
  {
    attr:"Design",
    q:"Do all stakeholders share a clear, agreed understanding of process scope, inputs, outputs, and boundaries?",
    opts:[
      "Inputs and outputs vary by person, ambiguity causes frequent errors",
      "Core inputs and outputs documented but inconsistently applied",
      "All participants agree on what the process consumes, produces, and who is responsible",
      "Process owner and all connected process owners formally aligned on interface standards",
      "Mutual performance agreements extend to customers and suppliers across the value chain",
    ],
    assessment:[
      "Inputs and outputs vary by person and ambiguity is causing frequent errors, indicating the process lacks a shared mental model among those who run it.",
      "Core inputs and outputs have been documented but are inconsistently applied, meaning the documentation exists on paper but has not yet changed how people work.",
      "All participants have a consistent understanding of what the process consumes and produces, providing a stable foundation for performance improvement.",
      "The process owner and all connected process owners are formally aligned on interface standards, eliminating a major source of cross-functional rework.",
      "Mutual performance agreements extend to customers and suppliers, meaning the process operates within a fully negotiated ecosystem of shared accountability.",
    ],
  },
  {
    attr:"Design",
    q:"How comprehensive and current is the documentation governing this process?",
    opts:[
      "No formal documentation, knowledge lives with individuals",
      "Basic flow documentation exists with some reference to handoffs",
      "Detailed documentation covers design, roles, decision rules, and exceptions",
      "Documentation covers integration with IT systems, data structures, and related processes",
      "A living digital model enables real-time simulation and impact analysis",
    ],
    assessment:[
      "No formal documentation exists and process knowledge lives with individuals, making the process entirely dependent on staff continuity and impossible to systematically improve.",
      "Basic flow documentation captures the main steps and some handoffs, but gaps in decision rules and exception handling leave too much to individual interpretation.",
      "Detailed documentation covers design, roles, decision rules, and exceptions, giving the organisation a reliable reference point for training, auditing, and improvement.",
      "Documentation extends to IT system integration, data structures, and related processes, enabling impact analysis before changes are made and faster onboarding.",
      "A living digital model enables real-time simulation and impact analysis, positioning the organisation to test changes before deployment and model future-state scenarios.",
    ],
  },

  // ── SKILLS (Q4–Q6) ────────────────────────────────────────────────────────
  {
    attr:"Skills",
    q:"How well do process performers understand the end-to-end process and their role within it?",
    opts:[
      "Know the process name but unaware of performance targets or the bigger picture",
      "Can describe their own steps and identify key metrics for their output",
      "Understand the full end-to-end flow and what good performance looks like at every stage",
      "Connect daily work to strategic objectives and understand the impact of process failures",
      "Have deep industry knowledge and understand the competitive positioning of the process",
    ],
    assessment:[
      "Performers know the process name but are unaware of performance targets or the bigger picture, meaning they cannot self-correct or prioritise when trade-offs arise.",
      "Performers can describe their own steps and identify key metrics for their output, though their view does not extend far enough to anticipate the downstream impact of their work.",
      "Performers understand the full end-to-end flow and what good performance looks like at every stage, enabling them to make better local decisions and support colleagues more effectively.",
      "Performers connect their daily work to strategic objectives and understand the cost of process failures, creating a workforce that is genuinely invested in outcomes rather than just outputs.",
      "Performers have deep industry knowledge and understand how this process positions the organisation competitively, enabling them to contribute to strategic conversations and benchmark externally.",
    ],
  },
  {
    attr:"Skills",
    q:"What is the skill and competency level of performers in executing, improving, and adapting the process?",
    opts:[
      "Can follow steps under normal conditions, unable to resolve exceptions",
      "Can identify common problems and apply known fixes",
      "Collaborate effectively, manage workload, and contribute to improvement discussions",
      "Apply structured analytical techniques to optimise outcomes and resolve novel issues",
      "Are change agents who proactively lead improvement initiatives and coach others",
    ],
    assessment:[
      "Performers can follow the steps under normal conditions but cannot resolve exceptions, meaning any deviation from the standard path escalates or stalls.",
      "Performers can identify common problems and apply known fixes, providing a degree of operational resilience but without the analytical depth needed to address novel issues.",
      "Performers collaborate effectively, manage their workload, and contribute meaningfully to improvement discussions, representing a team that is ready to be engaged in formal improvement programmes.",
      "Performers apply structured analytical techniques to optimise outcomes and resolve novel issues, indicating a team capable of leading improvement work rather than just participating in it.",
      "Performers are change agents who proactively lead improvement initiatives and coach others, representing a self-sustaining improvement culture that does not depend on external prompting.",
    ],
  },
  {
    attr:"Skills",
    q:"How engaged are performers with the process and to what extent do they own its outcomes?",
    opts:[
      "Carry out tasks with little interest in whether the overall process succeeds",
      "Comply with process steps as required, loyalty is to individual job function",
      "Follow agreed ways of working, support colleagues, and flag issues proactively",
      "Take personal accountability for outcomes and align behaviour with organisational goals",
      "Act as process stewards who monitor for degradation signals and drive sustainable change",
    ],
    assessment:[
      "Performers carry out tasks with little interest in whether the overall process succeeds, creating a compliance-only culture where problems are not surfaced until they become crises.",
      "Performers comply with process steps as required but their loyalty is to their individual job function, meaning cross-functional collaboration and collective accountability remain weak.",
      "Performers follow agreed ways of working, support colleagues, and flag issues proactively, indicating a team culture that sustains process standards without requiring constant management attention.",
      "Performers take personal accountability for outcomes and align their behaviour with organisational goals, demonstrating a maturity of engagement that significantly reduces management overhead.",
      "Performers act as process stewards who monitor for degradation signals and drive sustainable change, representing the highest level of distributed ownership and continuous vigilance.",
    ],
  },

  // ── OWNERSHIP & GOVERNANCE (Q7–Q11) ──────────────────────────────────────
  {
    attr:"Ownership & Governance",
    q:"Is a process owner clearly identified, and does their role carry appropriate organisational authority?",
    opts:[
      "No process owner exists, accountability is diffuse and informal",
      "A person is informally designated but lacks formal authority or executive backing",
      "Named process owner holds a formally recognised role appointed by senior leadership",
      "Process owner dedicates significant time and treats it as their primary accountability",
      "Process owner sits on the senior leadership team, ensuring strategic influence",
    ],
    assessment:[
      "No process owner exists and accountability is diffuse and informal, meaning there is no single person who can be held responsible when the process underperforms or needs to change.",
      "A person is informally designated as owner but lacks formal authority or executive backing, limiting their ability to convene stakeholders, allocate resources, or drive cross-functional change.",
      "A named process owner holds a formally recognised role appointed by senior leadership, providing the organisational legitimacy needed to manage the process as a strategic asset.",
      "The process owner dedicates significant time to the role and treats it as their primary accountability, ensuring the process receives consistent management attention rather than ad hoc oversight.",
      "The process owner sits on the senior leadership team, ensuring that process performance is visible at the highest level and that strategic decisions account for process capabilities and constraints.",
    ],
  },
  {
    attr:"Ownership & Governance",
    q:"What activities does the process owner lead in documentation, improvement, and strategic alignment?",
    opts:[
      "Delegates all execution and monitors outcomes passively",
      "Maintains documentation, communicates changes, and supports incremental fixes",
      "Sets performance targets, sponsors improvement initiatives, and manages structured change plans",
      "Collaborates with other process owners to align on shared KPIs and organisational goals",
      "Shapes long-term process strategy and works with external partners on value-chain optimisation",
    ],
    assessment:[
      "The process owner delegates all execution and monitors outcomes passively, functioning as a nominal owner without the active management engagement the role requires.",
      "The process owner maintains documentation, communicates changes, and supports incremental fixes, providing basic stewardship but not yet driving the structured improvement activity the organisation needs.",
      "The process owner sets performance targets, sponsors improvement initiatives, and manages structured change plans, demonstrating active and accountable ownership with clear output expectations.",
      "The process owner collaborates with other process owners to align on shared KPIs and organisational goals, demonstrating a systems-level view of ownership that reduces inter-process conflict.",
      "The process owner shapes long-term process strategy and works with external partners on value-chain optimisation, positioning the process as a source of competitive advantage rather than just an operational necessity.",
    ],
  },
  {
    attr:"Ownership & Governance",
    q:"What level of decision-making authority does the process owner hold over resources and change?",
    opts:[
      "No formal authority, can only raise concerns",
      "Can recommend changes but relies on line managers in other departments to act",
      "Can convene a cross-functional team and has some influence over technology spend",
      "Controls process technology portfolio, improvement budget, and has input on role design",
      "Has full budgetary authority and can mandate changes across any function touching the process",
    ],
    assessment:[
      "The process owner has no formal authority and can only raise concerns, making meaningful improvement entirely dependent on the goodwill of others and creating chronic delays in change delivery.",
      "The process owner can recommend changes but must rely on line managers in other departments to act, introducing dependency and delay into every improvement cycle that crosses a functional boundary.",
      "The process owner can convene a cross-functional team and has some influence over technology spend, providing enough authority to initiate and guide improvements without full organisational mandate.",
      "The process owner controls the process technology portfolio, the improvement budget, and has input on role design, enabling them to drive change without seeking approval at every step.",
      "The process owner has full budgetary authority and can mandate changes across any function that touches the process, eliminating the authority gaps that stall most cross-functional improvement programmes.",
    ],
  },
  {
    attr:"Ownership & Governance",
    q:"Are there formal governance structures and accountability mechanisms to oversee this process?",
    opts:[
      "No governance structures, oversight is entirely ad hoc",
      "Informal oversight at team level, issues escalated reactively when visible to management",
      "Defined governance assigns clear roles, escalation paths, and review cadences consistently followed",
      "Process governance integrated with wider organisational risk, audit, and compliance frameworks",
      "Governance embedded in culture, stakeholders at all levels proactively own accountability",
    ],
    assessment:[
      "No governance structures exist and oversight is entirely ad hoc, meaning the process has no formal mechanism for detecting problems early, escalating decisions, or holding anyone accountable.",
      "Informal oversight operates at team level and issues are escalated reactively when visible to management, providing a safety net of sorts but one that depends on problems becoming visible before action is taken.",
      "Defined governance assigns clear roles, escalation paths, and review cadences that are consistently followed, providing the structural foundation for reliable process oversight and timely decision-making.",
      "Process governance is integrated with the wider organisational risk, audit, and compliance framework, ensuring that process risks are managed within the same rigour applied to financial and regulatory risk.",
      "Governance is embedded in culture and stakeholders at all levels proactively own accountability, meaning the organisation does not rely on formal structures alone but on a shared sense of responsibility.",
    ],
  },
  {
    attr:"Ownership & Governance",
    q:"How well is this process aligned to the organisation's strategy, risk appetite, and compliance requirements?",
    opts:[
      "Operates independently of strategy, no deliberate link to organisational goals",
      "Management aware of strategic context but process not formally reviewed or adjusted",
      "Process periodically reviewed against strategic goals, risk policies, and compliance requirements",
      "Process is a named component in strategic planning and triggers formal reviews when strategy shifts",
      "Process actively contributes to competitive differentiation and feeds back into strategy decisions",
    ],
    assessment:[
      "The process operates independently of strategy with no deliberate link to organisational goals, meaning it may be consuming resources efficiently while pursuing objectives that no longer matter.",
      "Management is aware of the strategic context but the process has not been formally reviewed or adjusted to reflect it, creating a growing gap between stated direction and operational reality.",
      "The process is periodically reviewed against strategic goals, risk policies, and compliance requirements, ensuring it remains fit for purpose as the organisation and its environment evolve.",
      "The process is a named component in strategic planning and triggers formal reviews when strategy shifts, positioning it as a managed strategic asset rather than a background operational function.",
      "The process actively contributes to competitive differentiation and feeds back into strategy decisions, meaning operational learning at the process level informs organisational direction.",
    ],
  },

  // ── PEOPLE & TECHNOLOGY (Q12–Q13) ───────────────────────────────────────
  {
    attr:"Support Functions",
    q:"How well does the IT infrastructure support, automate, and integrate this process?",
    opts:[
      "Entirely manual, no automation or dedicated system support",
      "Fragmented legacy systems with significant manual handoffs and data re-entry",
      "Purpose-built applications handle specific steps, end-to-end integration is incomplete",
      "Integrated platform supports the full process with automated decisions and minimal manual work",
      "Modular API-enabled architecture connects all systems with real-time data exchange",
    ],
    assessment:[
      "The process is entirely manual with no automation or dedicated system support, meaning every execution depends on human effort and there is no digital audit trail for performance analysis.",
      "Fragmented legacy systems with significant manual handoffs and data re-entry are creating hidden error and delay costs that are rarely visible in aggregate but consistently degrade throughput.",
      "Purpose-built applications handle specific steps but end-to-end integration remains incomplete, meaning the technology reduces effort in pockets but has not yet eliminated the costly handoff between systems.",
      "An integrated platform supports the full process with automated decisions and minimal manual work, enabling consistent execution at scale and freeing staff to focus on exception management.",
      "A modular API-enabled architecture connects all systems with real-time data exchange, providing the technical foundation for advanced analytics, AI augmentation, and rapid process reconfiguration.",
    ],
  },
  {
    attr:"Support Functions",
    q:"How well does the HR infrastructure support recruitment, development, and retention of process talent?",
    opts:[
      "Process roles undefined, no structured approach to capability building",
      "Managers reward good individual performance but no link to process needs",
      "Job descriptions, training, and performance criteria derived directly from process requirements",
      "Hiring and development shaped by both process-specific needs and the broader capability agenda",
      "Talent model explicitly values collaboration, continuous learning, and adaptability",
    ],
    assessment:[
      "Process roles are undefined and there is no structured approach to capability building, meaning the organisation cannot systematically hire, develop, or retain the people needed to run this process well.",
      "Managers reward good individual performance but there is no link to process needs, creating a talent model that reinforces functional silos rather than the cross-functional behaviours the process requires.",
      "Job descriptions, training programmes, and performance criteria are derived directly from process requirements, ensuring the people development system is aligned to what the process actually needs.",
      "Hiring and development are shaped by both process-specific needs and the broader organisational capability agenda, creating a talent model that balances operational excellence with strategic workforce planning.",
      "The talent model explicitly values collaboration, continuous learning, and adaptability, attracting and retaining people who will improve the process over time rather than simply maintain it.",
    ],
  },

  // ── MEASURE (Q12–Q13) ─────────────────────────────────────────────────────
  {
    attr:"Measure",
    q:"Are the metrics for this process clearly defined, strategically aligned, and understood by all stakeholders?",
    opts:[
      "No metrics defined, if they exist performers are unaware of them",
      "Basic cost and quality metrics tracked informally by management",
      "End-to-end customer-focused metrics defined, documented, and communicated to all participants",
      "Metrics cover cross-functional dependencies and link directly to strategic goals",
      "Metrics benchmarked against interenterprise standards for world-class comparison",
    ],
    assessment:[
      "No metrics are defined or, where they exist, performers are unaware of them, meaning there is no feedback mechanism to tell the organisation whether the process is performing or deteriorating.",
      "Basic cost and quality metrics are tracked informally by management, providing a minimal signal on process health but without the visibility or cadence needed to drive consistent improvement.",
      "End-to-end customer-focused metrics are defined, documented, and communicated to all participants, giving the whole team a shared view of what success looks like and how their work contributes.",
      "Metrics cover cross-functional dependencies and link directly to strategic goals, ensuring that process performance is understood in the context of what the organisation is trying to achieve.",
      "Metrics are benchmarked against interenterprise standards for world-class comparison, enabling the organisation to understand its performance relative to the best in the industry and set credible stretch targets.",
    ],
  },
  {
    attr:"Measure",
    q:"How effectively are process metrics used to manage, improve, and communicate performance?",
    opts:[
      "Metrics exist on paper but are never used to make decisions or drive accountability",
      "Management reviews data periodically to assess health and direct corrective action",
      "Performance data used to benchmark against peers and set targets from external references",
      "Metrics actively shared with performers to drive engagement and daily decision-making",
      "Dynamic system continuously updates targets, triggers alerts, and feeds improvement planning",
    ],
    assessment:[
      "Metrics exist on paper but are never used to make decisions or drive accountability, meaning measurement is a compliance exercise rather than a management tool.",
      "Management reviews data periodically to assess process health and direct corrective action, providing reactive oversight but without the frequency or granularity needed for proactive management.",
      "Performance data is used to benchmark against peers and set externally referenced targets, moving the organisation beyond internal norms and towards an objective view of competitive performance.",
      "Metrics are actively shared with performers to drive engagement and daily decision-making, creating a feedback loop that distributes accountability and enables front-line self-correction.",
      "A dynamic system continuously updates targets, triggers alerts, and feeds improvement planning, effectively turning the measurement infrastructure into a live management instrument.",
    ],
  },

  // ── IMPROVEMENT (Q16–Q17) ─────────────────────────────────────────────────
  {
    attr:"Improvement",
    q:"Does the organisation have a structured approach to identifying and implementing process improvements?",
    opts:[
      "Improvements happen reactively when failures become too painful, no systematic approach",
      "Ad hoc ideas occasionally acted upon, no consistent framework or tracking",
      "Structured improvement methodology applied consistently with a managed improvement backlog",
      "Initiatives prioritised by quantitative data, business impact, and strategic alignment",
      "Continuous improvement is an ingrained cultural expectation with global benchmarking",
    ],
    assessment:[
      "Improvements happen reactively only when failures become too painful to tolerate, meaning the organisation is always behind the problem rather than ahead of it.",
      "Ad hoc improvement ideas are occasionally acted upon but without a consistent framework or tracking, making it impossible to build on past learning or demonstrate cumulative impact.",
      "A structured improvement methodology is applied consistently with a managed improvement backlog, giving the organisation the operational discipline to deliver improvement reliably rather than sporadically.",
      "Initiatives are prioritised by quantitative data, business impact, and strategic alignment, ensuring that improvement effort is directed where it creates the most value rather than where it is easiest.",
      "Continuous improvement is an ingrained cultural expectation supported by global benchmarking, meaning the organisation is in a permanent state of learning and adaptation rather than periodic improvement cycles.",
    ],
  },
  {
    attr:"Improvement",
    q:"How effectively does the organisation manage change when improvements to this process are implemented?",
    opts:[
      "Changes implemented without planning, no change management or communication",
      "Basic communication of changes occurs but adoption is inconsistent across the team",
      "Change management plan covers communication, training, and post-implementation review",
      "Change management is a formal discipline with dedicated resources and adoption targets",
      "Feedback loops measure behaviour change, sustain new ways of working, and enable rapid course correction",
    ],
    assessment:[
      "Changes are implemented without planning, change management, or communication, meaning improvements that work on paper frequently fail in practice because the people side of change has been ignored.",
      "Basic communication of changes occurs but adoption is inconsistent across the team, indicating that awareness of the change is being created but not the understanding or capability needed to embed it.",
      "The change management plan covers communication, training, and post-implementation review, providing the minimum infrastructure needed to give improvements a realistic chance of sticking.",
      "Change management is a formal discipline with dedicated resources and adoption targets, ensuring that the human side of improvement receives the same rigour as the technical design.",
      "Feedback loops measure actual behaviour change, sustain new ways of working, and enable rapid course correction, making the change management approach as sophisticated as the improvement methodology it supports.",
    ],
  },
]

const TOTAL_Q = QUESTIONS.length // 17

const DIM_BUCKETS = ALL_DIMS.map(attr => ({
  attr,
  indices: QUESTIONS.map((q,i) => q.attr===attr ? i : -1).filter(i => i>=0),
}))

// ── Process options for searchable dropdown ───────────────────────────────────
const PROCESS_OPTIONS = [
  "Accounts Payable",
  "Accounts Receivable",
  "Asset Management",
  "Budget Planning & Forecasting",
  "Capital Expenditure Approval",
  "Cash Management & Treasury",
  "Compliance Monitoring",
  "Contract Management",
  "Customer Complaints Handling",
  "Customer Onboarding",
  "Demand Planning",
  "Employee Onboarding",
  "Employee Offboarding",
  "Financial Close & Reporting",
  "Fraud Detection & Prevention",
  "HR Recruitment & Hiring",
  "Incident Management",
  "Inventory Management",
  "Invoice Processing",
  "IT Change Management",
  "IT Service Desk",
  "Knowledge Management",
  "Order Fulfilment",
  "Order-to-Cash",
  "Payroll Processing",
  "Performance Management",
  "Procure-to-Pay",
  "Product Development",
  "Project Management",
  "Purchase-to-Pay",
  "Quality Assurance",
  "Record-to-Report",
  "Risk Management",
  "Sales & Operations Planning",
  "Supplier Management",
  "Supply Chain Planning",
  "Travel & Expense Management",
  "Vendor Onboarding",
  "Warehouse Management",
  "Other",
]

const JOB_FUNCTIONS = [
  "Operations / Process Management",
  "Consulting / Advisory",
  "Finance / Accounting",
  "Human Resources",
  "Information Technology",
  "Strategy / Transformation",
  "Sales / Business Development",
  "Supply Chain / Procurement",
  "General Management / Leadership",
  "Other",
]

const INDUSTRIES = [
  "Banking / Financial Services",
  "Insurance",
  "Healthcare / Pharma",
  "Manufacturing",
  "Retail / E-commerce",
  "Technology / Software",
  "Consulting / Professional Services",
  "Logistics / Supply Chain",
  "Energy / Utilities",
  "Public Sector / Government",
  "Education",
  "Other",
]

const COMPANY_SIZES = [
  "1–50 employees",
  "51–200 employees",
  "201–1,000 employees",
  "1,000+ employees",
]

const REGIONS = [
  "United Kingdom",
  "India",
  "European Union",
  "United States",
  "Middle East",
  "Southeast Asia",
  "Australia / New Zealand",
  "Africa",
  "Other",
]

// ── Supabase REST helper ──────────────────────────────────────────────────────
const sb = {
  async saveAssessment(record) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/assessments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey":        SUPABASE_KEY,
          "Prefer":        "return=minimal",
        },
        body: JSON.stringify(record),
      })
      return r.ok
    } catch {
      return false
    }
  },

  // Check how many assessments this email has done in the last 7 days
  async getWeeklyCount(email) {
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/assessments?email=eq.${encodeURIComponent(email.toLowerCase())}&created_at=gte.${since}&select=id`,
        { headers: { "apikey": SUPABASE_KEY } }
      )
      if (!r.ok) return 0
      const data = await r.json()
      return data.length
    } catch {
      return 0
    }
  },

  // Create an OTP record
  async createOtp(email, code) {
    try {
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
      const r = await fetch(`${SUPABASE_URL}/rest/v1/otp_codes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey":        SUPABASE_KEY,
          "Prefer":        "return=minimal",
        },
        body: JSON.stringify({ email: email.toLowerCase(), code, expires_at: expiresAt, used: false }),
      })
      return r.ok
    } catch {
      return false
    }
  },

  // Verify an OTP — returns "ok" | "expired" | "invalid"
  async verifyOtp(email, code) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/otp_codes?email=eq.${encodeURIComponent(email.toLowerCase())}&code=eq.${encodeURIComponent(code)}&used=eq.false&order=created_at.desc&limit=1&select=*`,
        { headers: { "apikey": SUPABASE_KEY } }
      )
      if (!r.ok) return "invalid"
      const data = await r.json()
      if (!data.length) return "invalid"
      const row = data[0]
      if (new Date(row.expires_at) < new Date()) return "expired"
      // Mark used
      await fetch(`${SUPABASE_URL}/rest/v1/otp_codes?id=eq.${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY },
        body: JSON.stringify({ used: true }),
      })
      return "ok"
    } catch {
      return "invalid"
    }
  },
}

// ── UI Primitives ─────────────────────────────────────────────────────────────
const Logo = ({ onClick }) => (
  <button onClick={onClick} style={{background:"none",border:"none",cursor:"pointer",padding:0,display:"flex",alignItems:"center",gap:8}}>
    <div style={{width:30,height:30,background:P.navy,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="1" width="6" height="6" rx="1.5" fill="#60A5FA"/>
        <rect x="9" y="1" width="6" height="6" rx="1.5" fill="#93C5FD" opacity="0.6"/>
        <rect x="1" y="9" width="6" height="6" rx="1.5" fill="#93C5FD" opacity="0.6"/>
        <rect x="9" y="9" width="6" height="6" rx="1.5" fill="white"/>
      </svg>
    </div>
    <span style={{fontSize:16,fontWeight:800,color:P.navy,letterSpacing:"-0.3px"}}>{BRAND}</span>
  </button>
)

const Btn = ({ children, primary, small, disabled, onClick, style={} }) => (
  <button onClick={onClick} disabled={disabled} style={{
    fontFamily:"inherit", cursor:disabled?"not-allowed":"pointer",
    background: primary ? P.navy : "transparent",
    color:       primary ? "#fff" : P.navy,
    border:`1.5px solid ${primary?"transparent":P.border}`,
    padding: small ? "6px 12px" : "10px 20px",
    borderRadius:8, fontSize:small?12:14, fontWeight:600,
    opacity:disabled?0.4:1, transition:"opacity 0.15s",
    whiteSpace:"nowrap", display:"inline-flex", alignItems:"center", gap:5,
    ...style,
  }}>{children}</button>
)

const Header = ({ isLanding, onHome, onBack, right }) => (
  <header style={{
    display:"flex",alignItems:"center",justifyContent:"space-between",
    padding:"13px 22px",borderBottom:`1px solid ${P.border}`,
    position:"sticky",top:0,background:P.white,zIndex:20,gap:10,
  }}>
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      {!isLanding && <Btn small onClick={onBack}>← Back</Btn>}
      <Logo onClick={onHome}/>
    </div>
    <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}>{right}</div>
  </header>
)

const inputStyle = {
  width:"100%", padding:"10px 12px", borderRadius:8,
  border:`1.5px solid ${P.border}`, fontSize:14,
  fontFamily:"inherit", boxSizing:"border-box", outline:"none",
  background:P.white, color:P.ink,
}

const textareaStyle = {
  ...inputStyle,
  resize:"vertical",
  minHeight:72,
  marginTop:8,
  fontSize:13,
}

// Inject global focus-visible styles once
if (typeof document !== "undefined" && !document.getElementById("abpm-focus-styles")) {
  const s = document.createElement("style")
  s.id = "abpm-focus-styles"
  s.textContent = `
    input:focus, select:focus, textarea:focus {
      outline: 2px solid #1B2B3A !important;
      outline-offset: 2px !important;
      border-color: #1B2B3A !important;
    }
    button:focus-visible {
      outline: 2px solid #1B2B3A !important;
      outline-offset: 2px !important;
    }
  `
  document.head.appendChild(s)
}

// ── Field wrapper ─────────────────────────────────────────────────────────────
const Field = ({ label, required, error, children }) => (
  <div style={{marginBottom:18}}>
    <label style={{fontSize:12,fontWeight:600,color:P.muted,display:"block",marginBottom:6,textAlign:"left"}}>
      {label}{required && <span style={{color:P.navy,marginLeft:3}}>*</span>}
    </label>
    {children}
    {error && <p style={{fontSize:11,color:"#9B1D00",margin:"4px 0 0"}}>{error}</p>}
  </div>
)

// ── Standard select with Other → free text ────────────────────────────────────
const SelectWithOther = ({ value, otherValue, onChange, onOtherChange, options, placeholder, error, otherPlaceholder, selectProps, nextField }) => (
  <>
    <select
      value={value}
      onChange={e=>onChange(e.target.value)}
      onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); if(value==="Other"){ e.currentTarget.closest("[data-fieldgroup]")?.querySelector("textarea")?.focus() } else if(nextField){ document.querySelector(`[data-field='${nextField}']`)?.focus() } } }}
      style={{
        ...inputStyle,
        borderColor: error ? "#9B1D00" : P.border,
        appearance:"none",
        backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%234B5563' fill='none' stroke-width='1.5'/%3E%3C/svg%3E")`,
        backgroundRepeat:"no-repeat",
        backgroundPosition:"right 12px center",
        paddingRight:36,
      }}
      {...(selectProps||{})}
    >
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
    {value === "Other" && (
      <textarea
        value={otherValue}
        onChange={e=>onOtherChange(e.target.value)}
        onKeyDown={e=>{ if(e.key==="Tab" && !e.shiftKey && nextField){ e.preventDefault(); document.querySelector(`[data-field='${nextField}']`)?.focus() } }}
        placeholder={otherPlaceholder || "Please describe…"}
        style={textareaStyle}
      />
    )}
  </>
)

// ── Searchable process dropdown ───────────────────────────────────────────────
const ProcessDropdown = ({ value, otherValue, onChange, onOtherChange, error }) => {
  const [search,      setSearch]      = useState("")
  const [open,        setOpen]        = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const ref         = useRef(null)
  const listRef     = useRef(null)
  const triggerRef  = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const filtered = PROCESS_OPTIONS.filter(o =>
    o.toLowerCase().includes(search.toLowerCase())
  )

  const handleSelect = (opt) => {
    onChange(opt)
    setSearch("")
    setOpen(false)
    setHighlighted(-1)
    // Return focus to trigger so Tab continues naturally
    setTimeout(() => triggerRef.current?.focus(), 0)
  }

  const handleTriggerKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(o => !o) }
    else if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true) }
    else if (e.key === "Escape") { setOpen(false) }
  }

  const handleSearchKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlighted(h => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlighted(h => Math.max(h - 1, 0))
    } else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault()
      handleSelect(filtered[highlighted])
    } else if (e.key === "Escape") {
      setOpen(false)
      triggerRef.current?.focus()
    } else if (e.key === "Tab") {
      // Tab while dropdown open: close and let Tab move to next field
      setOpen(false)
    }
  }

  return (
    <div ref={ref} style={{position:"relative"}}>
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={()=>setOpen(o=>!o)}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          ...inputStyle,
          display:"flex",alignItems:"center",justifyContent:"space-between",
          cursor:"pointer",textAlign:"left",
          borderColor: error ? "#9B1D00" : P.border,
          color: value ? P.ink : P.muted,
        }}
      >
        <span>{value || "Select or search a process…"}</span>
        <svg width="12" height="8" viewBox="0 0 12 8" fill="none" style={{flexShrink:0,marginLeft:8,transform:open?"rotate(180deg)":"none",transition:"transform 0.15s"}}>
          <path d="M1 1l5 5 5-5" stroke="#4B5563" strokeWidth="1.5" fill="none"/>
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position:"absolute",top:"calc(100% + 4px)",left:0,right:0,
          background:P.white,border:`1.5px solid ${P.border}`,borderRadius:8,
          zIndex:100,boxShadow:"0 4px 16px rgba(0,0,0,0.10)",overflow:"hidden",
        }}>
          {/* Search box */}
          <div style={{padding:"8px 10px",borderBottom:`1px solid ${P.border}`}}>
            <input
              autoFocus
              value={search}
              onChange={e=>{ setSearch(e.target.value); setHighlighted(-1) }}
              onKeyDown={handleSearchKeyDown}
              placeholder="Type to search…"
              style={{...inputStyle,padding:"7px 10px",fontSize:13,border:`1px solid ${P.border}`}}
            />
          </div>
          {/* Options list */}
          <div ref={listRef} style={{maxHeight:220,overflowY:"auto"}} role="listbox">
            {filtered.length === 0
              ? <div style={{padding:"12px 14px",fontSize:13,color:P.muted}}>No match — select Other to enter manually</div>
              : filtered.map((opt, idx) => (
                <button
                  key={opt}
                  type="button"
                  role="option"
                  aria-selected={value===opt}
                  onClick={()=>handleSelect(opt)}
                  onMouseEnter={()=>setHighlighted(idx)}
                  style={{
                    display:"block",width:"100%",textAlign:"left",
                    padding:"9px 14px",fontSize:13,fontFamily:"inherit",cursor:"pointer",
                    background: highlighted===idx ? P.soft : value===opt ? P.soft : P.white,
                    color:value===opt?P.navy:P.ink,
                    fontWeight:value===opt?700:400,
                    border:"none",borderBottom:`1px solid ${P.border}`,
                    outline: highlighted===idx ? `2px solid #1B2B3A` : "none",
                    outlineOffset:-2,
                  }}
                >{opt}</button>
              ))
            }
          </div>
        </div>
      )}

      {/* Other free text */}
      {value === "Other" && (
        <textarea
          value={otherValue}
          onChange={e=>onOtherChange(e.target.value)}
          placeholder="Please describe the process you are assessing…"
          style={textareaStyle}
        />
      )}
    </div>
  )
}

// ── Dimension progress bar ────────────────────────────────────────────────────
const DimBar = ({ currentQ, responses }) => (
  <div style={{background:P.surface,borderBottom:`1px solid ${P.border}`,padding:"8px 22px",overflowX:"auto"}}>
    <div style={{display:"flex",gap:4,minWidth:"max-content"}}>
      {DIM_BUCKETS.map(({attr,indices}) => {
        const done    = indices.filter(i=>responses[i]!==null).length
        const total   = indices.length
        const active  = QUESTIONS[currentQ]?.attr===attr
        const complete= done===total
        const m       = ATTR_META[attr]
        return (
          <div key={attr} style={{
            minWidth:64,borderRadius:6,overflow:"hidden",
            border:`1.5px solid ${active?m.color:complete?m.color+"70":P.border}`,
            background:active?m.bg:complete?m.bg+"88":P.white,
          }}>
            <div style={{height:3,background:m.color,width:`${Math.round(done/total*100)}%`,transition:"width 0.4s"}}/>
            <div style={{padding:"3px 6px"}}>
              <div style={{fontSize:10,fontWeight:700,color:active?m.color:P.muted,whiteSpace:"nowrap"}}>{attr}</div>
              <div style={{fontSize:9,color:P.muted}}>{done}/{total}</div>
            </div>
          </div>
        )
      })}
    </div>
  </div>
)

// ── Review panel ──────────────────────────────────────────────────────────────
const ReviewPanel = ({ responses, onJump, onClose }) => (
  <div style={{position:"fixed",inset:0,background:"rgba(15,35,64,0.45)",zIndex:50,display:"flex",alignItems:"flex-end",justifyContent:"center"}}
    onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{
      background:P.white,width:"100%",maxWidth:720,borderRadius:"14px 14px 0 0",
      padding:"18px 22px 36px",maxHeight:"72vh",overflowY:"auto",
    }}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <span style={{fontSize:15,fontWeight:700,color:P.navy}}>Question review</span>
        <Btn small onClick={onClose}>✕ Close</Btn>
      </div>
      <div style={{display:"flex",gap:16,marginBottom:14,fontSize:12,color:P.muted}}>
        <span>✓ Answered ({responses.filter(r=>r!==null).length})</span>
        <span>○ Unanswered ({responses.filter(r=>r===null).length})</span>
      </div>
      {DIM_BUCKETS.map(({attr,indices}) => {
        const m = ATTR_META[attr]
        return (
          <div key={attr} style={{marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:m.color,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:6}}>{attr}</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {indices.map(idx => {
                const ans = responses[idx]
                return (
                  <button key={idx} onClick={()=>onJump(idx)} style={{
                    width:32,height:32,borderRadius:6,cursor:"pointer",
                    border:`1.5px solid ${ans!==null?m.color:P.border}`,
                    background:ans!==null?m.bg:P.surface,
                    color:P.muted,fontSize:11,fontWeight:700,
                    display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",lineHeight:1,
                    fontFamily:"inherit",
                  }}>
                    <span>{idx+1}</span>
                    {ans!==null && <span style={{fontSize:8,marginTop:1}}>{ans}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  </div>
)

const Toast = ({ show, msg }) => (
  <div style={{
    position:"fixed",bottom:24,left:"50%",transform:`translateX(-50%) translateY(${show?0:80}px)`,
    background:P.navy,color:"#fff",padding:"10px 20px",borderRadius:8,
    fontSize:13,fontWeight:600,zIndex:60,transition:"transform 0.3s",
    display:"flex",alignItems:"center",gap:8,pointerEvents:"none",
    boxShadow:"0 4px 12px rgba(0,0,0,0.15)",
  }}>✓ {msg}</div>
)

// ════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════════════════════════════════════

export default function AnalyzerBPM() {  const [page,        setPage]        = useState(PAGES.LANDING)
  const [currentQ,    setCurrentQ]    = useState(0)
  const [responses,   setResponses]   = useState(new Array(TOTAL_Q).fill(null))
  const [showReview,  setShowReview]  = useState(false)
  const [toast,       setToast]       = useState({ show:false, msg:"" })
  const [submitting,  setSubmitting]  = useState(false)
  const [submitted,   setSubmitted]   = useState(false)   // locked after submit

  // ── OTP state ─────────────────────────────────────────────────────────────
  const [otpCode,     setOtpCode]     = useState("")
  const [otpError,    setOtpError]    = useState("")
  const [otpSending,  setOtpSending]  = useState(false)
  const [otpVerifying,setOtpVerifying]= useState(false)
  const [otpExpiry,   setOtpExpiry]   = useState(null)   // Date object
  const [otpCountdown,setOtpCountdown]= useState(0)
  const [rateLimitMsg,setRateLimitMsg]= useState("")

  // ── AI summary (results page) ─────────────────────────────────────────────
  const [aiSummary,   setAiSummary]   = useState(null)   // { text, loading, error }

  // ── Feedback state ────────────────────────────────────────────────────────
  const [feedbackStars, setFeedbackStars] = useState(0)
  const [feedbackText,  setFeedbackText]  = useState("")
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)

  // ── AI PDF report ─────────────────────────────────────────────────────────
  const [aiReport,    setAiReport]    = useState(null)   // { text, loading, error }
  const [pdfLoading,  setPdfLoading]  = useState(false)

  // Profile fields
  const [profile, setProfile] = useState({
    email:            "",
    company:          "",
    jobFunction:      "",
    jobFunctionOther: "",
    industry:         "",
    industryOther:    "",
    companySize:      "",
    region:           "",
  })
  const [profileErrors, setProfileErrors] = useState({})

  // ── Timing ───────────────────────────────────────────────────────────────
  const assessmentStartTime = useRef(null)
  const startedAtRef        = useRef(null)

  // Process selection
  const [processName,      setProcessName]      = useState("")
  const [processNameOther, setProcessNameOther] = useState("")

  const card = { background:P.white, border:`1px solid ${P.border}`, borderRadius:10, padding:"16px 20px" }

  // ── OTP countdown timer ──────────────────────────────────────────────────
  useEffect(() => {
    if (!otpExpiry) return
    const tick = setInterval(() => {
      const secs = Math.max(0, Math.round((otpExpiry - Date.now()) / 1000))
      setOtpCountdown(secs)
      if (secs === 0) clearInterval(tick)
    }, 1000)
    return () => clearInterval(tick)
  }, [otpExpiry])

  // ── Effective display name for process ───────────────────────────────────
  const effectiveProcess = processName === "Other"
    ? (processNameOther.trim() || "Other")
    : processName

  // ── Score calculations ───────────────────────────────────────────────────
  const valid     = responses.filter(r => r !== null)
  const minScore  = valid.length ? Math.min(...valid) : null
  const avgScore  = valid.length ? valid.reduce((a,b)=>a+b,0)/valid.length : 0
  const answered  = responses.filter(r => r !== null).length
  const allAnswered = answered === TOTAL_Q

  // Per-dimension: scores array, min score, avg score
  const dimData = {}
  DIM_BUCKETS.forEach(({attr, indices}) => {
    const scores = indices.map(i => responses[i]).filter(r => r !== null)
    dimData[attr] = {
      scores,
      min:   scores.length ? Math.min(...scores) : null,
      avg:   scores.length ? scores.reduce((a,b)=>a+b,0)/scores.length : 0,
      count: scores.length,
    }
  })

  // Weighted average score: sum(dim_avg * weight) across all dimensions with responses
  const WEIGHTS_CONST = {
    "Design":0.15,"Skills":0.20,"Ownership & Governance":0.20,
    "Support Functions":0.10,"Measure":0.20,"Improvement":0.15,
  }
  const weightedAvgScore = (() => {
    let weightedSum = 0, totalWeight = 0
    ALL_DIMS.forEach(attr => {
      const d = dimData[attr]
      if (d.count > 0) {
        weightedSum  += d.avg * (WEIGHTS_CONST[attr] || 0)
        totalWeight  += (WEIGHTS_CONST[attr] || 0)
      }
    })
    return totalWeight > 0 ? weightedSum / totalWeight : 0
  })()

  // Helper — same as getDimSummary but safe to call before hooks run
  const getDimSummaryForAi = (attr) => {
    const bucket = DIM_BUCKETS.find(b => b.attr === attr)
    if (!bucket) return null
    const { indices } = bucket
    const answered = indices.filter(i => responses[i] !== null)
    if (!answered.length) return null
    const worstIdx = answered.reduce((worst, i) => responses[i] < responses[worst] ? i : worst, answered[0])
    const score = responses[worstIdx]
    const qObj = QUESTIONS[worstIdx]
    return { score, statement: qObj.assessment[score - 1] }
  }

  // ── OTP send — calls Supabase Edge Function (send-otp) ──────────────────
  const sendOtp = async (emailOverride) => {
    const email = (emailOverride || profile.email).trim().toLowerCase()
    setOtpSending(true)
    setOtpError("")
    setRateLimitMsg("")
    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/send-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_KEY,
          },
          body: JSON.stringify({ email }),
        }
      )
      const data = await res.json()
      if (!res.ok) {
        setOtpError(data.error || "Failed to send login code. Please try again.")
        setOtpSending(false)
        return
      }
      setOtpExpiry(new Date(Date.now() + 10 * 60 * 1000))
      setOtpSending(false)
      navigate(PAGES.OTP)
    } catch {
      setOtpError("Network error. Please check your connection and try again.")
      setOtpSending(false)
    }
  }

  const resendOtp = async () => {
    await sendOtp(profile.email)
  }

  // ── OTP verify ───────────────────────────────────────────────────────────
  const verifyOtp = async () => {
    setOtpVerifying(true)
    setOtpError("")
    const result = await sb.verifyOtp(profile.email.trim().toLowerCase(), otpCode.trim())
    setOtpVerifying(false)
    if (result === "ok") {
      navigate(PAGES.PROFILE)
    } else if (result === "expired") {
      setOtpError("This code has expired. Click 'Resend login code' to get a new one.")
    } else {
      setOtpError("Invalid code. Please check and try again.")
    }
  }

  // ── AI Summary (on results screen) ───────────────────────────────────────
  const generateAiSummary = useCallback(async () => {
    setAiSummary({ text: null, loading: true, error: null })
    const qAndA = QUESTIONS.map((q, i) => {
      const score = responses[i]
      if (score === null) return null
      return `Q${i+1} [${q.attr}]: ${q.q}\nAnswer: ${q.opts[score-1]} (Score: ${score}/5)`
    }).filter(Boolean).join("\n\n")

    const prompt = `You are an expert Business Process Management consultant. A user has completed the AnalyzerBPM Business Process Maturity Assessment. Write a 100-150 word executive summary of the overall assessment results below. Be specific, professional, and mention the process name and average score. Do not use bullet points — write as a single cohesive paragraph. Do NOT use CMMI terminology (no "Initial", "Managed", "Defined", "Quantitatively Managed", "Optimizing").

Profile:
- Industry: ${profile.industry === "Other" ? profile.industryOther : profile.industry}
- Job Function: ${profile.jobFunction === "Other" ? profile.jobFunctionOther : profile.jobFunction}
- Process Assessed: ${effectiveProcess}
- Average Score: ${avgScore.toFixed(1)}/5
- Weighted Average Score: ${weightedAvgScore.toFixed(1)}/5

Question-by-question responses:
${qAndA}`

    try {
        const EDGE_URL = "https://dukfzmfbnnhwijlppphf.supabase.co/functions/v1/generate-report"
        const response = await fetch(EDGE_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_KEY,
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 300,
            messages: [{ role: "user", content: prompt }],
          }),
        })
      const data = await response.json()
      const text = data?.content?.filter(b => b.type === "text").map(b => b.text).join("") || ""
      if (!text) throw new Error("Empty response")
      setAiSummary({ text, loading: false, error: null })
    } catch {
      setAiSummary({ text: null, loading: false, error: "Failed to generate summary. Please try again." })
    }
  }, [profile, effectiveProcess, responses, avgScore])

  // ── AI PDF report generation ─────────────────────────────────────────────
  // Dimension weights for weighted gap scoring
  const DIM_WEIGHTS = {
    "Design":                  0.15,
    "Skills":                  0.20,
    "Ownership & Governance":  0.20,
    "Support Functions":       0.10,
    "Measure":                 0.20,
    "Improvement":             0.15,
  }

  const generateAiReport = useCallback(async () => {
    setAiReport({ text: null, loading: true, error: null })

    // Weighted gap scoring: score = weight * (5 - avg_dim_score)
    const dimGaps = ALL_DIMS.map(attr => {
      const d = dimData[attr]
      const weight = DIM_WEIGHTS[attr] || 0
      const gap = weight * (5 - d.avg)
      return { attr, avg: d.avg, gap: parseFloat(gap.toFixed(4)), weight }
    }).sort((a, b) => b.gap - a.gap)

    const dimGapText = dimGaps.map(d =>
      `${d.attr}: avg ${d.avg.toFixed(1)}/5, weight ${(d.weight*100).toFixed(0)}%, weighted gap ${d.gap.toFixed(3)}`
    ).join("\n")

    const qAndA = QUESTIONS.map((q, i) => {
      const score = responses[i]
      if (score === null) return null
      return `Q${i+1} [${q.attr}]: ${q.q}\nAnswer: ${q.opts[score-1]} (Score: ${score}/5)`
    }).filter(Boolean).join("\n\n")

    const prompt = `You are an expert BPM consultant generating a concise recommendation report.

Organisation profile:
- Company: ${profile.company || "Not provided"}
- Industry: ${profile.industry === "Other" ? profile.industryOther : profile.industry}
- Job Function: ${profile.jobFunction === "Other" ? profile.jobFunctionOther : profile.jobFunction}
- Process: ${effectiveProcess}
- Average Score: ${avgScore.toFixed(1)}/5
- Weighted Average Score: ${weightedAvgScore.toFixed(1)}/5

Dimension weighted gap scores (higher gap = higher priority):
${dimGapText}

Full responses:
${qAndA}

INSTRUCTIONS — follow exactly:
1. Write a Recommendation Summary of 80-100 words as a single paragraph. Start with "Recommendation Summary".
2. Then write exactly 6 dimension-specific recommendations, one per dimension, in this order: Design, Skills, Ownership & Governance, Support Functions, Measure, Improvement.
3. Format each as: "[Dimension Name]: <recommendation text>"
4. Each recommendation must be a maximum of 50 words. Be specific and actionable.
5. Total output (summary + all 6 recommendations) must not exceed 400 words.
6. Do NOT use CMMI terminology: no "Initial", "Managed", "Defined", "Quantitatively Managed", "Predictable", or "Optimizing".
7. Do NOT use markdown headers, bold, or asterisks. Plain text only.`

    try {
        const EDGE_URL = "https://dukfzmfbnnhwijlppphf.supabase.co/functions/v1/generate-report"
        const response = await fetch(EDGE_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_KEY,
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 600,
            messages: [{ role: "user", content: prompt }],
          }),
        })
      const data = await response.json()
      const text = data?.content?.filter(b => b.type === "text").map(b => b.text).join("") || ""
      if (!text) throw new Error("Empty response")
      setAiReport({ text, loading: false, error: null })
    } catch {
      setAiReport({ text: null, loading: false, error: "Failed to generate report. Please try again." })
    }
  }, [profile, effectiveProcess, responses, avgScore, dimData])

  // ── PDF download using browser print ─────────────────────────────────────
  const downloadPdf = useCallback(() => {
    if (!aiReport?.text) return
    const safeProcess = effectiveProcess.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_")
    const industryDisplay    = profile.industry    === "Other" ? profile.industryOther    : profile.industry
    const jobFunctionDisplay = profile.jobFunction === "Other" ? profile.jobFunctionOther : profile.jobFunction

    // ── Score bar helper (filled navy blocks out of 5) ──────────────────────
    const scoreBar = (score) => {
      const filled = Math.round(score)
      let bar = ""
      for (let i = 1; i <= 5; i++) {
        bar += `<span style="display:inline-block;width:28px;height:10px;background:${i <= filled ? "#1B2B3A" : "#D4D8DD"};margin-right:3px;border-radius:2px;"></span>`
      }
      return bar
    }

    // ── Dimension table rows — Score by Dimension (with bar + summary) ──────
    const dimTableRows = ALL_DIMS.map(attr => {
      const d       = dimData[attr]
      const w       = DIM_WEIGHTS[attr]
      const dimSum  = getDimSummaryForAi(attr)
      const avgVal  = d.count > 0 ? d.avg : null
      const secMat  = d.count > 0 ? d.min : null
      return `<tr style="border-bottom:1px solid #E5E7EB;vertical-align:top;">
        <td style="padding:10px 10px;font-size:11px;font-weight:700;color:#1B2B3A;white-space:nowrap;">${attr}</td>
        <td style="padding:10px 10px;font-size:11px;color:#4B5563;white-space:nowrap;">${(w*100).toFixed(0)}%</td>
        <td style="padding:10px 10px;font-size:12px;font-weight:800;color:#1B2B3A;white-space:nowrap;">${avgVal !== null ? avgVal.toFixed(1) : "—"}</td>
        <td style="padding:10px 10px;font-size:12px;font-weight:800;color:#1B2B3A;white-space:nowrap;text-align:center;">${secMat !== null ? secMat + "/5" : "—"}</td>
        <td style="padding:10px 10px;font-size:11px;color:#374151;line-height:1.55;">${dimSum ? dimSum.statement : "—"}</td>
      </tr>`
    }).join("")

    // ── Parse AI text: extract summary paragraph + dimension recommendations ─
    const lines = aiReport.text.split("\n").filter(l => l.trim())
    let summaryText = ""
    const dimRecs = {}
    lines.forEach(line => {
      const dimMatch = line.trim().match(/^([A-Za-z &]+):\s+(.+)/)
      if (dimMatch && ALL_DIMS.includes(dimMatch[1].trim())) {
        dimRecs[dimMatch[1].trim()] = dimMatch[2].trim()
      } else {
        const clean = line.replace(/^Recommendation Summary[:\s]*/i, "").trim()
        if (clean) summaryText += (summaryText ? " " : "") + clean
      }
    })

    // ── Order recommendations by weighted gap (highest first) ───────────────
    const orderedRecs = ALL_DIMS
      .map(attr => {
        const d   = dimData[attr]
        const gap = (DIM_WEIGHTS[attr] || 0) * (5 - d.avg)
        return { attr, gap, text: dimRecs[attr] || "" }
      })
      .filter(r => r.text)
      .sort((a, b) => b.gap - a.gap)

    const recRows = orderedRecs.map((r, i) => `
      <div style="margin-bottom:16px;display:flex;align-items:flex-start;gap:14px;">
        <div style="flex-shrink:0;width:28px;height:28px;background:#1B2B3A;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;line-height:28px;text-align:center;">${i+1}</div>
        <div style="flex:1;">
          <div style="font-size:11px;font-weight:800;color:#1B2B3A;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">${r.attr}</div>
          <div style="font-size:12px;color:#111827;line-height:1.65;">${r.text}</div>
        </div>
      </div>`).join("")

    // ── Maturity level reference rows ────────────────────────────────────────
    const maturityRows = [
      [1,"Ad hoc, unpredictable — success depends on individuals, not systems"],
      [2,"Repeatable within teams, inconsistent across the organisation"],
      [3,"Documented, standardised, and consistently applied organisation-wide"],
      [4,"Measured, data-driven, and proactively managed"],
      [5,"Continuously improving through innovation and data-driven feedback"],
    ].map(([lvl, desc]) => `<tr style="border-bottom:1px solid #E5E7EB;">
      <td style="padding:7px 10px;font-size:11px;font-weight:700;color:#1B2B3A;width:40px;">${lvl}</td>
      <td style="padding:7px 10px;font-size:11px;color:#374151;">${desc}</td>
    </tr>`).join("")

    // ── Page header/footer snippet (repeated via CSS) ────────────────────────
    const pageHeaderHtml = `
      <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:8px;border-bottom:2px solid #1B2B3A;margin-bottom:20px;">
        <span style="font-size:13px;font-weight:800;color:#1B2B3A;letter-spacing:0.01em;">AnalyzerBPM&#8482; Business Process Maturity Assessment</span>
      </div>`

    const pageFooterHtml = (pageNum) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid #D4D8DD;margin-top:20px;font-size:10px;color:#6B7280;">
        <span>Write to us at &#8212; tellus@analyzerbpm.com</span>
        <span>Page ${pageNum}</span>
        <span>&#169; ${CY} AnalyzerBPM&#8482;. All rights reserved.</span>
      </div>`

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>AnalyzerBPM_${safeProcess}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, system-ui, sans-serif; color: #111827; margin: 0; padding: 0; font-size: 13px; }
  @media print {
    .no-print { display: none !important; }
    .page { page-break-after: always; padding: 28px 36px; min-height: 100vh; display: flex; flex-direction: column; }
    .page:last-child { page-break-after: avoid; }
    @page { margin: 0; size: A4; }
  }
  @media screen {
    .no-print { background:#1B2B3A; color:#fff; padding:14px 20px; text-align:center; font-size:13px; font-weight:600; position:sticky; top:0; z-index:99; }
    .no-print button { background:#fff; color:#1B2B3A; border:none; padding:7px 18px; border-radius:6px; font-size:13px; font-weight:700; cursor:pointer; margin-left:14px; }
    .page { padding: 36px 44px; max-width: 820px; margin: 0 auto 40px; border: 1px solid #e5e7eb; }
  }
  .section-heading { font-size: 11px; font-weight: 700; color: #1B2B3A; text-transform: uppercase; letter-spacing: 0.08em; margin: 20px 0 10px; border-bottom: 1px solid #D4D8DD; padding-bottom: 5px; }
  table { border-collapse: collapse; width: 100%; }
</style>
</head>
<body>

<div class="no-print">
  📄 Your report is ready — click Save as PDF to download it.
  <button onclick="window.print()">Save as PDF</button>
</div>

<!-- ═══════════════ PAGE 1 ═══════════════ -->
<div class="page">
  ${pageHeaderHtml}

  <!-- Profile tags -->
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px;">
    <div style="background:#F0F2F4;border:1px solid #D4D8DD;border-radius:5px;padding:5px 12px;">
      <span style="font-size:9px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.08em;display:block;">INDUSTRY</span>
      <span style="font-size:11px;font-weight:700;color:#1B2B3A;">${industryDisplay}</span>
    </div>
    <div style="background:#F0F2F4;border:1px solid #D4D8DD;border-radius:5px;padding:5px 12px;">
      <span style="font-size:9px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.08em;display:block;">JOB FUNCTION</span>
      <span style="font-size:11px;font-weight:700;color:#1B2B3A;">${jobFunctionDisplay}</span>
    </div>
    <div style="background:#F0F2F4;border:1px solid #D4D8DD;border-radius:5px;padding:5px 12px;">
      <span style="font-size:9px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.08em;display:block;">PROCESS</span>
      <span style="font-size:11px;font-weight:700;color:#1B2B3A;">${effectiveProcess}</span>
    </div>
  </div>

  <!-- Title block -->
  <div style="margin-bottom:20px;">
    <h1 style="font-size:22px;font-weight:800;color:#1B2B3A;margin:0 0 6px;">Process Maturity Assessment Report</h1>
  </div>

  <!-- Score summary cards -->
  <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
    <div style="flex:1;min-width:140px;border:2px solid #1B2B3A;border-radius:8px;padding:14px 18px;text-align:center;background:#F0F2F4;">
      <div style="font-size:9px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Overall Maturity</div>
      <div style="font-size:32px;font-weight:800;color:#1B2B3A;line-height:1;">${minScore !== null ? minScore : "—"}<span style="font-size:14px;color:#4B5563;font-weight:600;">/5</span></div>
      <div style="font-size:10px;color:#6B7280;margin-top:4px;">Driven by lowest score received across all dimension responses</div>
    </div>
    <div style="flex:1;min-width:120px;border:1.5px solid #D4D8DD;border-radius:8px;padding:14px 18px;text-align:center;">
      <div style="font-size:9px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Average Score</div>
      <div style="font-size:28px;font-weight:800;color:#1B2B3A;line-height:1;">${avgScore.toFixed(1)}<span style="font-size:14px;color:#4B5563;font-weight:600;">/5</span></div>
      <div style="font-size:10px;color:#6B7280;margin-top:4px;">Simple average across all 17 responses</div>
    </div>
    <div style="flex:1;min-width:120px;border:1.5px solid #D4D8DD;border-radius:8px;padding:14px 18px;text-align:center;">
      <div style="font-size:9px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Weighted Score</div>
      <div style="font-size:28px;font-weight:800;color:#1B2B3A;line-height:1;">${weightedAvgScore.toFixed(1)}<span style="font-size:14px;color:#4B5563;font-weight:600;">/5</span></div>
      <div style="font-size:10px;color:#6B7280;margin-top:4px;">Weighted by dimension importance</div>
    </div>
  </div>

  <p style="font-size:11px;color:#374151;line-height:1.65;margin:0 0 20px;">Overall maturity is determined by the lowest score received across all dimension responses. This reflects the principle that a process is only as strong as its weakest link — a single under-managed dimension can constrain the performance of all others. Review the dimension breakdown below to identify which areas require the most urgent attention and where targeted improvement will have the greatest impact on overall process performance.</p>

  <!-- Score by Dimension table -->
  <div class="section-heading">Score by Dimension</div>
  <p style="font-size:10px;color:#6B7280;margin:0 0 10px;">Average score per dimension (1–5). Each dimension is assessed across 2–3 questions; the figure shown is the mean of those responses. Weight reflects the relative importance of each dimension. Section Maturity shows the lowest individual response score within each dimension.</p>
  <table style="margin-bottom:20px;">
    <thead>
      <tr style="background:#1B2B3A;">
        <th style="color:#fff;padding:8px 10px;font-size:11px;text-align:left;font-weight:700;">Dimension</th>
        <th style="color:#fff;padding:8px 10px;font-size:11px;text-align:left;font-weight:700;">Weight</th>
        <th style="color:#fff;padding:8px 10px;font-size:11px;text-align:left;font-weight:700;">Weighted Score</th>
        <th style="color:#fff;padding:8px 10px;font-size:11px;text-align:center;font-weight:700;">Section Maturity</th>
        <th style="color:#fff;padding:8px 10px;font-size:11px;text-align:left;font-weight:700;">Summary</th>
      </tr>
    </thead>
    <tbody>${dimTableRows}</tbody>
  </table>

  <div style="flex:1;"></div>
  ${pageFooterHtml(1)}
</div>

<!-- ═══════════════ PAGE 2 — RECOMMENDATIONS ═══════════════ -->
<div class="page">
  ${pageHeaderHtml}

  <!-- Recommendation Summary -->
  <div class="section-heading">Recommendation Summary</div>
  <p style="font-size:12px;color:#111827;line-height:1.7;margin:0 0 24px;">${summaryText}</p>

  <!-- Improvement Steps by Dimension -->
  <div class="section-heading">Improvement Steps by Dimension</div>
  <p style="font-size:10px;color:#6B7280;margin:0 0 16px;">One targeted recommendation per dimension, ordered by weighted gap priority (highest gap first). Each recommendation is specific to the responses provided in this assessment.</p>
  <div>${recRows}</div>

  <!-- Maturity Level Reference -->
  <div class="section-heading" style="margin-top:24px;">Maturity Level Reference</div>
  <table style="margin-bottom:16px;">
    <tbody>${maturityRows}</tbody>
  </table>

  <p style="font-size:10px;color:#6B7280;line-height:1.6;margin:0 0 16px;">This report is generated by AnalyzerBPM&#8482; and is intended solely for the use of the individual or organisation to which it is addressed. Results are based on self-reported assessment responses. AI-generated recommendations are advisory in nature and do not constitute professional consulting or strategic advice.</p>

  <div style="flex:1;"></div>
  ${pageFooterHtml(2)}
</div>

</body>
</html>`

    // Open via Blob URL — bypasses popup blockers entirely
    const blob = new Blob([html], { type: "text/html;charset=utf-8" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href     = url
    a.target   = "_blank"
    a.rel      = "noopener noreferrer"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 30000)
  }, [profile, effectiveProcess, responses, avgScore, weightedAvgScore, dimData, aiReport, answered])

  const navigate = (p) => { setPage(p); window.scrollTo(0,0) }
  const goHome   = () => {
    // Reset all state
    setResponses(new Array(TOTAL_Q).fill(null))
    setCurrentQ(0)
    setProcessName("")
    setProcessNameOther("")
    setProfile({email:"",company:"",jobFunction:"",jobFunctionOther:"",industry:"",industryOther:"",companySize:"",region:""})
    setSubmitted(false)
    setAiSummary(null)
    setAiReport(null)
    setFeedbackStars(0)
    setFeedbackText("")
    setFeedbackSubmitted(false)
    setOtpCode("")
    setOtpError("")
    setOtpExpiry(null)
    setRateLimitMsg("")
    assessmentStartTime.current = null
    startedAtRef.current = null
    navigate(PAGES.LANDING)
  }

  const showToast = (msg) => {
    setToast({ show:true, msg })
    setTimeout(() => setToast({ show:false, msg:"" }), 2500)
  }

  // ── Profile validation ───────────────────────────────────────────────────
  const validateProfile = () => {
    const errs = {}
    if (!profile.jobFunction)
      errs.jobFunction = "Please select your job function"
    if (profile.jobFunction === "Other" && !profile.jobFunctionOther.trim())
      errs.jobFunctionOther = "Please describe your job function"
    if (!profile.industry)
      errs.industry = "Please select your industry"
    if (profile.industry === "Other" && !profile.industryOther.trim())
      errs.industryOther = "Please describe your industry"
    if (!profile.companySize)
      errs.companySize = "Please select your company size"
    if (!profile.region)
      errs.region = "Please select your region"
    setProfileErrors(errs)
    return Object.keys(errs).length === 0
  }

  const submitProfile = () => {
    if (validateProfile()) navigate(PAGES.SETUP)
  }

  // ── Assessment navigation ────────────────────────────────────────────────
  const selectOption = (score) => {
    const n = [...responses]; n[currentQ] = score; setResponses(n)
  }
  const jumpTo = (idx) => { setCurrentQ(idx); setShowReview(false); navigate(PAGES.ASSESSMENT) }
  const goNext = () => {
    if (responses[currentQ] === null) return
    if (currentQ >= TOTAL_Q - 1) { doSubmit(); return }
    setCurrentQ(currentQ + 1)
  }
  const goPrev = () => { if (currentQ > 0) setCurrentQ(currentQ - 1) }

  // For each dimension, find the question index that has the lowest score
  // and return that question's assessment statement for that score
  const getDimSummary = (attr) => {
    const { indices } = DIM_BUCKETS.find(b => b.attr===attr)
    const answered = indices.filter(i => responses[i] !== null)
    if (!answered.length) return null
    // Find the question with the lowest score (first occurrence if tie)
    const worstIdx = answered.reduce((worst, i) => {
      return responses[i] < responses[worst] ? i : worst
    }, answered[0])
    const score      = responses[worstIdx]         // 1–5
    const qObj       = QUESTIONS[worstIdx]
    const statement  = qObj.assessment[score - 1]  // 0-indexed
    return { score, question: qObj.q, statement }
  }

  // ── Submit to Supabase ───────────────────────────────────────────────────
  const doSubmit = useCallback(async () => {
    if (submitted) return
    setSubmitting(true)

    const completedAt = new Date().toISOString()
    const timeToCompleteSecs = assessmentStartTime.current
      ? Math.round((Date.now() - assessmentStartTime.current) / 1000)
      : null

    const responseVariance = {}
    DIM_BUCKETS.forEach(({ attr, indices }) => {
      const scores = indices.map(i => responses[i]).filter(r => r !== null)
      if (scores.length < 2) {
        responseVariance[attr] = 0
      } else {
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length
        const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length
        responseVariance[attr] = parseFloat(variance.toFixed(4))
      }
    })

    const record = {
      email:                 profile.email.trim().toLowerCase(),
      job_function:          profile.jobFunction === "Other"
                               ? `Other: ${profile.jobFunctionOther.trim()}`
                               : profile.jobFunction,
      company:               profile.company.trim() || null,
      industry:              profile.industry === "Other"
                               ? `Other: ${profile.industryOther.trim()}`
                               : profile.industry,
      process_name:          effectiveProcess,
      responses:             responses,
      min_score:             minScore,
      avg_score:             parseFloat(avgScore.toFixed(2)),
      completed:             true,
      company_size:          profile.companySize,
      region:                profile.region,
      started_at:            startedAtRef.current,
      completed_at:          completedAt,
      time_to_complete_secs: timeToCompleteSecs,
      response_variance:     responseVariance,
    }
    await sb.saveAssessment(record)
    setSubmitted(true)
    setSubmitting(false)
    navigate(PAGES.RESULTS)
    generateAiSummary()
  }, [profile, effectiveProcess, responses, minScore, avgScore, submitted, generateAiSummary])

  // ════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════

  // ─── LANDING ──────────────────────────────────────────────────────────────
  if (page === PAGES.LANDING) return (
    <div style={{fontFamily:"system-ui,'Segoe UI',sans-serif",width:"100%",background:P.white,minHeight:"100vh",color:P.ink}}>
      <Header isLanding onHome={goHome}/>
      <div style={{padding:"40px 22px 20px",textAlign:"center"}}>
        <h1 style={{fontSize:28,fontWeight:800,lineHeight:1.3,color:P.navy,margin:"0 auto 12px",maxWidth:490,letterSpacing:"-0.4px"}}>
          Assess your business process maturity
        </h1>
        <p style={{fontSize:14,lineHeight:1.7,color:P.muted,maxWidth:440,margin:"0 auto 28px"}}>
          17 questions across 6 dimensions. Instant maturity score. Personalised recommendation report.
        </p>
        <div style={{display:"flex",flexDirection:"column",gap:10,maxWidth:340,margin:"0 auto 10px"}}>
          <Btn primary onClick={()=>navigate("email_entry")} style={{padding:"13px 30px",fontSize:15,justifyContent:"center"}}>
            Start assessment →
          </Btn>
        </div>
      </div>
      <div style={{padding:"0 22px 32px"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:20}}>
          {[["6","Dimensions"],["17","Questions"],["5","Levels"]].map(([v,l]) => (
            <div key={l} style={{background:P.surface,borderRadius:8,padding:"14px 8px",textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:800,color:P.navy}}>{v}</div>
              <div style={{fontSize:11,color:P.muted,marginTop:2}}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div style={card}>
            <p style={{fontSize:11,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",color:P.muted,margin:"0 0 10px"}}>All 6 dimensions</p>
            {ALL_DIMS.map(n => (
              <div key={n} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 0",borderBottom:`1px solid ${P.border}`}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:P.navy,flexShrink:0}}/>
                <span style={{fontSize:12,fontWeight:600,color:P.ink}}>{n}</span>
              </div>
            ))}
          </div>
          <div style={card}>
            <p style={{fontSize:11,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",color:P.muted,margin:"0 0 10px"}}>Maturity levels</p>
            {[1,2,3,4,5].map(lv => (
              <div key={lv} style={{display:"flex",alignItems:"flex-start",gap:9,padding:"7px 0",borderBottom:`1px solid ${P.border}`}}>
                <div style={{width:20,height:20,borderRadius:4,background:P.navy,color:"#fff",fontSize:10,fontWeight:800,
                  display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>{lv}</div>
                <span style={{fontSize:11,color:P.ink,lineHeight:1.5}}>{LEVEL_META[lv].label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <footer style={{padding:"16px 22px",borderTop:`1px solid ${P.border}`,textAlign:"center",fontSize:11,color:P.muted,lineHeight:1.9}}>
        &copy; {CY} AnalyzerBPM&#8482;. All rights reserved. Unauthorised reproduction or commercial use is prohibited.<br/>
        AnalyzerBPM&#8482; framework, assessment structure, and scoring methodology are protected intellectual property.<br/>
        <span style={{color:P.navy}}>tellus@analyzerbpm.com</span>
      </footer>
    </div>
  )

  // ─── EMAIL ENTRY ──────────────────────────────────────────────────────────
  if (page === "email_entry") {
    const handleEmailSubmit = async () => {
      setOtpError("")
      setRateLimitMsg("")
      const em = profile.email.trim().toLowerCase()
      if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        setOtpError("Enter a valid work email address")
        return
      }
      setOtpSending(true)

      // ── PRODUCTION: check rate limit then send OTP via Edge Function ────────
      const count = await sb.getWeeklyCount(em)
      if (count >= 2) {
        setOtpSending(false)
        setRateLimitMsg("This account has already completed their assessment limit for the week.")
        return
      }
      setProfile(p => ({ ...p, email: em }))
      await sendOtp(em)
    }

    return (
      <div style={{fontFamily:"system-ui,'Segoe UI',sans-serif",width:"100%",background:P.white,minHeight:"100vh",color:P.ink}}>
        <Header onHome={goHome} onBack={()=>navigate(PAGES.LANDING)}/>
        <div style={{maxWidth:560,margin:"60px auto",padding:"0 22px 40px"}}>
          <div style={{marginBottom:28}}>
            <div style={{fontSize:12,fontWeight:700,color:P.muted,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:6}}>Step 1 of 4</div>
            <h2 style={{fontSize:20,fontWeight:800,color:P.navy,margin:"0 0 6px"}}>Enter your work email</h2>
            <p style={{fontSize:14,color:P.muted,margin:0,lineHeight:1.6}}>
              We'll send a one-time login code to verify your email address.
            </p>
          </div>
          <Field label="Work email" required error={otpError || rateLimitMsg}>
            <input
              type="email"
              autoFocus
              value={profile.email}
              onChange={e=>{ setProfile(p=>({...p,email:e.target.value})); setOtpError(""); setRateLimitMsg("") }}
              placeholder="you@company.com"
              style={{...inputStyle, borderColor:(otpError||rateLimitMsg)?"#9B1D00":P.border}}
              onKeyDown={e=>{ if(e.key==="Enter") handleEmailSubmit() }}
            />
          </Field>
          <Btn primary onClick={handleEmailSubmit} disabled={otpSending} style={{width:"100%",justifyContent:"center",padding:"12px",marginTop:4}}>
            {otpSending ? "Sending code…" : "Send login code →"}
          </Btn>
          <p style={{fontSize:11,color:P.muted,textAlign:"center",marginTop:14,lineHeight:1.6}}>
            A 6-digit code will be sent to your email. It expires in 10 minutes.
          </p>
        </div>
      </div>
    )
  }

  // ─── OTP VERIFICATION ─────────────────────────────────────────────────────
  if (page === PAGES.OTP) {
    const otpMins    = Math.floor(otpCountdown / 60)
    const otpSecs    = otpCountdown % 60
    const otpExpired = otpCountdown === 0 && !!otpExpiry

    const handleResend = async () => {
      setOtpError("")
      setOtpCode("")
      setOtpSending(true)
      const em = profile.email.trim().toLowerCase()
      const code = String(Math.floor(100000 + Math.random() * 900000))
      await sb.createOtp(em, code)
      setOtpExpiry(new Date(Date.now() + 10 * 60 * 1000))
      setOtpSending(false)
      showToast(`Demo OTP: ${code}`)
    }

    return (
      <div style={{fontFamily:"system-ui,'Segoe UI',sans-serif",width:"100%",background:P.white,minHeight:"100vh",color:P.ink}}>
        <Header onHome={goHome} onBack={()=>navigate("email_entry")}/>
        <div style={{maxWidth:560,margin:"60px auto",padding:"0 22px 40px"}}>
          <div style={{marginBottom:28}}>
            <div style={{fontSize:12,fontWeight:700,color:P.muted,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:6}}>Step 2 of 4</div>
            <h2 style={{fontSize:20,fontWeight:800,color:P.navy,margin:"0 0 6px"}}>Enter your login code</h2>
            <p style={{fontSize:14,color:P.muted,margin:0,lineHeight:1.6}}>
              We sent a 6-digit code to <strong style={{color:P.navy}}>{profile.email}</strong>.
            </p>
          </div>

          <Field label="Login code" required error={otpError}>
            <input
              autoFocus
              value={otpCode}
              onChange={e=>{ setOtpCode(e.target.value.replace(/\D/g,"").slice(0,6)); setOtpError("") }}
              placeholder="123456"
              style={{...inputStyle, borderColor:otpError?"#9B1D00":P.border, fontSize:20, letterSpacing:"0.2em", textAlign:"center", fontWeight:700}}
              maxLength={6}
              onKeyDown={e=>{ if(e.key==="Enter" && otpCode.length===6) verifyOtp() }}
            />
          </Field>

          {otpExpiry && (
            <p style={{fontSize:12,color:otpExpired?"#9B1D00":P.muted,textAlign:"center",marginBottom:14}}>
              {otpExpired
                ? "Code expired."
                : `Code expires in ${otpMins}:${String(otpSecs).padStart(2,"0")}`
              }
            </p>
          )}

          <Btn primary onClick={verifyOtp} disabled={otpVerifying || otpCode.length < 6} style={{width:"100%",justifyContent:"center",padding:"12px",marginBottom:12}}>
            {otpVerifying ? "Verifying…" : "Verify & continue →"}
          </Btn>

          <div style={{textAlign:"center"}}>
            <button
              onClick={handleResend}
              disabled={otpSending}
              style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:P.navy,fontWeight:600,fontFamily:"inherit",padding:0,opacity:otpSending?0.5:1}}
            >
              {otpSending ? "Sending…" : "Resend login code"}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── PROFILE FORM ─────────────────────────────────────────────────────────
  if (page === PAGES.PROFILE) return (
    <div style={{fontFamily:"system-ui,'Segoe UI',sans-serif",width:"100%",background:P.white,minHeight:"100vh",color:P.ink}}>
      <Header onHome={goHome} onBack={()=>navigate(PAGES.OTP)}/>
      <div style={{maxWidth:640,margin:"40px auto",padding:"0 22px 40px"}}>
        <div style={{marginBottom:28}}>
          <div style={{fontSize:12,fontWeight:700,color:P.muted,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:6}}>Step 3 of 4</div>
          <h2 style={{fontSize:20,fontWeight:800,color:P.navy,margin:"0 0 6px"}}>Tell us about yourself</h2>
          <p style={{fontSize:14,color:P.muted,margin:0,lineHeight:1.6}}>Takes 30 seconds. Your details help contextualise your results.</p>
        </div>

        <Field label="Company name (optional)">
          <input type="text" value={profile.company}
            onChange={e=>setProfile(p=>({...p,company:e.target.value}))}
            placeholder="e.g. Acme Corp"
            style={inputStyle}
            onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); document.querySelector("select[data-field='jobFunction']")?.focus() } }}
          />
        </Field>

        <Field label="Job function" required error={profileErrors.jobFunction || profileErrors.jobFunctionOther}>
          <SelectWithOther
            value={profile.jobFunction}
            otherValue={profile.jobFunctionOther}
            onChange={v=>setProfile(p=>({...p,jobFunction:v,jobFunctionOther:""}))}
            onOtherChange={v=>setProfile(p=>({...p,jobFunctionOther:v}))}
            options={JOB_FUNCTIONS}
            placeholder="Select your function…"
            otherPlaceholder="Please describe your job function…"
            error={profileErrors.jobFunction}
            selectProps={{"data-field":"jobFunction"}}
            nextField="industry"
          />
        </Field>

        <Field label="Industry" required error={profileErrors.industry || profileErrors.industryOther}>
          <SelectWithOther
            value={profile.industry}
            otherValue={profile.industryOther}
            onChange={v=>setProfile(p=>({...p,industry:v,industryOther:""}))}
            onOtherChange={v=>setProfile(p=>({...p,industryOther:v}))}
            options={INDUSTRIES}
            placeholder="Select your industry…"
            otherPlaceholder="Please describe your industry…"
            error={profileErrors.industry}
            selectProps={{"data-field":"industry"}}
            nextField="companySize"
          />
        </Field>

        <Field label="Company size" required error={profileErrors.companySize}>
          <select
            value={profile.companySize}
            onChange={e=>setProfile(p=>({...p,companySize:e.target.value}))}
            data-field="companySize"
            style={{
              ...inputStyle,
              borderColor: profileErrors.companySize ? "#9B1D00" : P.border,
              appearance:"none",
              backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%234B5563' fill='none' stroke-width='1.5'/%3E%3C/svg%3E")`,
              backgroundRepeat:"no-repeat",
              backgroundPosition:"right 12px center",
              paddingRight:36,
            }}
          >
            <option value="">Select number of employees…</option>
            {COMPANY_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>

        <Field label="Region" required error={profileErrors.region}>
          <select
            value={profile.region}
            onChange={e=>setProfile(p=>({...p,region:e.target.value}))}
            data-field="region"
            style={{
              ...inputStyle,
              borderColor: profileErrors.region ? "#9B1D00" : P.border,
              appearance:"none",
              backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%234B5563' fill='none' stroke-width='1.5'/%3E%3C/svg%3E")`,
              backgroundRepeat:"no-repeat",
              backgroundPosition:"right 12px center",
              paddingRight:36,
            }}
          >
            <option value="">Select your region…</option>
            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>

        <Btn primary onClick={submitProfile} style={{width:"100%",justifyContent:"center",padding:"12px",marginTop:4}}>
          Continue to assessment →
        </Btn>
        <p style={{fontSize:11,color:P.muted,textAlign:"center",marginTop:14,lineHeight:1.6}}>
          Your details are used to contextualise your results and are never sold or shared with third parties.
        </p>
      </div>
    </div>
  )

  // ─── SETUP — process selection ────────────────────────────────────────────
  if (page === PAGES.SETUP) return (
    <div style={{fontFamily:"system-ui,'Segoe UI',sans-serif",width:"100%",background:P.white,minHeight:"100vh",color:P.ink}}>
      <Header onHome={goHome} onBack={()=>navigate(PAGES.PROFILE)}/>
      <div style={{maxWidth:640,margin:"50px auto",padding:"0 22px"}}>
        <div style={{fontSize:12,fontWeight:700,color:P.muted,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:6}}>Step 4 of 4</div>
        <h2 style={{fontSize:20,fontWeight:800,color:P.navy,margin:"0 0 6px"}}>Select the process you are assessing</h2>
        <p style={{fontSize:14,color:P.muted,margin:"0 0 24px",lineHeight:1.6}}>
          Search the list or select Other to name your own process.
        </p>

        <Field label="Process" required error={!processName && undefined}>
          <ProcessDropdown
            value={processName}
            otherValue={processNameOther}
            onChange={setProcessName}
            onOtherChange={setProcessNameOther}
            error={undefined}
          />
        </Field>

        <Btn primary
          onClick={()=>{
            setCurrentQ(0)
            setResponses(new Array(TOTAL_Q).fill(null))
            const now = Date.now()
            assessmentStartTime.current = now
            startedAtRef.current = new Date(now).toISOString()
            navigate(PAGES.ASSESSMENT)
          }}
          disabled={!processName || (processName==="Other" && !processNameOther.trim())}
          style={{width:"100%",justifyContent:"center",padding:"12px",marginTop:4}}>
          Begin assessment →
        </Btn>
      </div>
    </div>
  )

  // ─── ASSESSMENT ───────────────────────────────────────────────────────────
  if (page === PAGES.ASSESSMENT) {
    const q        = QUESTIONS[currentQ]
    const m        = ATTR_META[q.attr]
    const progress = Math.round((currentQ / TOTAL_Q) * 100)

    return (
      <div style={{fontFamily:"system-ui,'Segoe UI',sans-serif",width:"100%",background:P.white,minHeight:"100vh",color:P.ink}}>
        <Header
          onHome={goHome}
          right={<>
            <Btn small onClick={()=>setShowReview(true)}>
              Review
              {answered < TOTAL_Q && (
                <span style={{background:P.navy,color:"#fff",fontSize:10,fontWeight:800,
                  padding:"1px 5px",borderRadius:10,marginLeft:2}}>{TOTAL_Q-answered}</span>
              )}
            </Btn>

          </>}
        />

        <DimBar currentQ={currentQ} responses={responses}/>

        <div style={{height:3,background:P.border}}>
          <div style={{height:"100%",width:`${progress}%`,background:P.navy,transition:"width 0.4s"}}/>
        </div>

        <div style={{padding:"20px 40px",maxWidth:860,margin:"0 auto"}}>
          <div style={{fontSize:11,fontWeight:700,color:P.muted,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:12}}>
            Assessment — 17 questions
          </div>

          {/* Dimension jump buttons */}
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:16}}>
            {ALL_DIMS.map(attr => {
              const indices = DIM_BUCKETS.find(b=>b.attr===attr)?.indices||[]
              const active  = q.attr===attr
              const m2      = ATTR_META[attr]
              const dimDone = indices.every(i=>responses[i]!==null)
              return (
                <button key={attr} onClick={()=>setCurrentQ(indices[0])} style={{
                  fontSize:11,fontWeight:600,padding:"4px 10px",borderRadius:6,cursor:"pointer",
                  border:`1.5px solid ${active?m2.color:dimDone?m2.color+"60":P.border}`,
                  background:active?m2.bg:dimDone?m2.bg+"80":P.surface,
                  color:active?m2.color:dimDone?m2.color:P.muted,
                  fontFamily:"inherit",
                }}>
                  {dimDone && !active?"✓ ":""}{attr}
                </button>
              )
            })}
          </div>

          {/* Question header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,fontWeight:700,
              letterSpacing:"0.06em",padding:"3px 10px",borderRadius:20,textTransform:"uppercase",
              background:m.bg,color:m.color,border:`1px solid ${m.color}30`}}>
              <span style={{fontSize:9,fontWeight:800,opacity:0.65}}>{m.label}</span>{q.attr}
            </span>
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2}}>
              <span style={{fontSize:11,color:P.muted,fontWeight:600,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {effectiveProcess||"Unnamed process"}
              </span>
              <span style={{fontSize:11,color:P.muted}}>Q {currentQ+1} / {TOTAL_Q}</span>
            </div>
          </div>

          <h2 style={{fontSize:15,fontWeight:700,lineHeight:1.55,color:P.navy,marginBottom:18}}>{q.q}</h2>

          {/* Answer options */}
          <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:18}}>
            {q.opts.map((opt,i) => {
              const sc  = i+1
              const sel = responses[currentQ]===sc
              return (
                <button key={i} onClick={()=>selectOption(sc)} style={{
                  textAlign:"left",display:"flex",gap:10,alignItems:"flex-start",
                  padding:"10px 13px",borderRadius:9,cursor:"pointer",
                  border:`1.5px solid ${sel?m.color:P.border}`,
                  background:sel?m.bg:P.white,transition:"all 0.12s",fontFamily:"inherit",
                }}>
                  <div style={{width:21,height:21,borderRadius:"50%",flexShrink:0,marginTop:1,
                    border:`1.5px solid ${sel?m.color:P.border}`,background:sel?m.color:"transparent",
                    display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <span style={{color:sel?"#fff":P.muted,fontSize:11,fontWeight:700}}>{sc}</span>
                  </div>
                  <span style={{fontSize:13,lineHeight:1.5,color:P.ink,fontWeight:sel?600:400}}>{opt}</span>
                </button>
              )
            })}
          </div>

          {/* Within-dimension navigation dots */}
          <div style={{display:"flex",gap:5,marginBottom:18,flexWrap:"wrap"}}>
            {DIM_BUCKETS.find(b=>b.attr===q.attr)?.indices.map(idx => (
              <button key={idx} onClick={()=>setCurrentQ(idx)} style={{
                width:28,height:28,borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:700,
                border:`1.5px solid ${responses[idx]!==null?m.color:P.border}`,
                background:responses[idx]!==null?m.bg:P.surface,
                color:idx===currentQ?m.color:P.muted,
                outline:idx===currentQ?`2px solid ${m.color}`:"none",outlineOffset:1,
                fontFamily:"inherit",
              }}>{idx+1}</button>
            ))}
          </div>

          {/* Nav buttons */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <Btn onClick={goPrev} style={{visibility:currentQ===0?"hidden":"visible"}}>← Back</Btn>
            <Btn primary onClick={goNext} disabled={responses[currentQ]===null||submitting}>
              {submitting?"Saving…":currentQ===TOTAL_Q-1?"See results →":"Next →"}
            </Btn>
          </div>
        </div>

        {showReview && <ReviewPanel responses={responses} onJump={jumpTo} onClose={()=>setShowReview(false)}/>}
        <Toast show={toast.show} msg={toast.msg}/>
      </div>
    )
  }

  // ─── RESULTS PAGE ─────────────────────────────────────────────────────────
  if (page === PAGES.RESULTS) {
    return (
      <div style={{fontFamily:"system-ui,'Segoe UI',sans-serif",width:"100%",background:P.white,minHeight:"100vh",color:P.ink}}>
        <Header onHome={goHome}/>

        <div style={{padding:"28px 40px 40px"}}>

          {/* ── Submission confirmation ── */}
          <div style={{textAlign:"center",marginBottom:28}}>
            <div style={{
              width:54,height:54,borderRadius:"50%",
              background:"#ECFDF5",border:"2px solid #6EE7B7",
              display:"flex",alignItems:"center",justifyContent:"center",
              margin:"0 auto 14px",fontSize:24,
            }}>✓</div>
            <h2 style={{fontSize:20,fontWeight:800,color:P.navy,margin:"0 0 6px"}}>Assessment submitted</h2>
            {effectiveProcess && (
              <p style={{fontSize:13,color:P.muted,margin:0}}>
                Process assessed: <strong style={{color:P.navy}}>{effectiveProcess}</strong>
              </p>
            )}
          </div>

          {/* ── Average Score — large and prominent ── */}
          <div style={{
            background:P.navy,borderRadius:14,padding:"28px 24px",
            marginBottom:16,textAlign:"center",
          }}>
            <div style={{display:"flex",justifyContent:"center",gap:24,flexWrap:"wrap",marginBottom:18}}>
              <div>
                <p style={{fontSize:11,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",
                  color:"rgba(255,255,255,0.6)",margin:"0 0 6px"}}>Average Score</p>
                <div style={{fontSize:56,fontWeight:800,color:"#fff",lineHeight:1,letterSpacing:"-2px"}}>
                  {avgScore.toFixed(1)}
                </div>
                <div style={{fontSize:12,color:"rgba(255,255,255,0.55)",marginTop:4}}>out of 5.0 · simple avg</div>
              </div>
              <div style={{width:1,background:"rgba(255,255,255,0.15)",alignSelf:"stretch",margin:"0 4px"}}/>
              <div>
                <p style={{fontSize:11,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",
                  color:"rgba(255,255,255,0.6)",margin:"0 0 6px"}}>Weighted Score</p>
                <div style={{fontSize:56,fontWeight:800,color:"#fff",lineHeight:1,letterSpacing:"-2px"}}>
                  {weightedAvgScore.toFixed(1)}
                </div>
                <div style={{fontSize:12,color:"rgba(255,255,255,0.55)",marginTop:4}}>out of 5.0 · by dimension weight</div>
              </div>
            </div>
            <div style={{display:"flex",justifyContent:"center",gap:6,flexWrap:"wrap"}}>
              {ALL_DIMS.map(attr => {
                const d = dimData[attr]
                const w = WEIGHTS_CONST[attr]
                return (
                  <div key={attr} style={{
                    background:"rgba(255,255,255,0.12)",borderRadius:8,
                    padding:"6px 10px",textAlign:"center",minWidth:90,
                  }}>
                    <div style={{fontSize:13,fontWeight:700,color:"#fff"}}>{d.count>0?d.avg.toFixed(1):"—"}</div>
                    <div style={{fontSize:9,color:"rgba(255,255,255,0.5)",marginTop:1}}>{(w*100).toFixed(0)}% wt</div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,0.6)",marginTop:1,lineHeight:1.3}}>{attr}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── AI-Generated Summary — central content ── */}
          <div style={{
            border:`1.5px solid ${P.border}`,borderRadius:12,
            padding:"20px 22px",marginBottom:16,
            background:P.surface,
          }}>
            <p style={{
              fontSize:11,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",
              color:P.muted,margin:"0 0 14px",display:"flex",alignItems:"center",gap:7,
            }}>
              <span style={{fontSize:14}}>✦</span> Summary
            </p>

            {aiSummary?.loading && (
              <div style={{padding:"20px 0",textAlign:"center"}}>
                <div style={{
                  display:"inline-block",width:20,height:20,
                  border:`3px solid ${P.border}`,borderTopColor:P.navy,
                  borderRadius:"50%",animation:"spin 0.8s linear infinite",marginBottom:10,
                }}/>
                <p style={{fontSize:13,color:P.muted,margin:0,lineHeight:1.6}}>
                  Analysing your {TOTAL_Q} responses…
                </p>
              </div>
            )}

            {aiSummary?.error && (
              <div style={{padding:"12px 14px",borderRadius:8,background:"#FEF2F2",border:"1px solid #FECACA"}}>
                <p style={{fontSize:12,color:"#991B1B",margin:"0 0 8px"}}>{aiSummary.error}</p>
                <button onClick={generateAiSummary} style={{
                  fontSize:12,color:P.navy,fontWeight:700,background:"none",
                  border:"none",cursor:"pointer",padding:0,fontFamily:"inherit",
                }}>↺ Retry</button>
              </div>
            )}

            {aiSummary?.text && (
              <p style={{
                fontSize:14,lineHeight:1.85,color:P.ink,
                margin:0,fontStyle:"normal",
              }}>
                {aiSummary.text}
              </p>
            )}

            {!aiSummary && (
              <p style={{fontSize:13,color:P.muted,margin:0,fontStyle:"italic"}}>
                Generating summary…
              </p>
            )}
          </div>

          {/* ── Recommendation report CTA ── */}
          <div style={{
            background:P.navy,borderRadius:12,padding:"18px 20px",
            marginBottom:16,
          }}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
              <div>
                <p style={{fontSize:13,fontWeight:700,color:"#fff",margin:"0 0 4px"}}>
                  Get your recommendation report
                </p>
                <p style={{fontSize:11,color:"rgba(255,255,255,0.65)",margin:0,lineHeight:1.5}}>
                  Prioritised improvement steps based on your scores.
                </p>
              </div>
              <Btn small onClick={()=>navigate(PAGES.FEEDBACK)}
                style={{background:"#fff",color:P.navy,border:"none",fontWeight:700,flexShrink:0,whiteSpace:"nowrap"}}>
                Create report →
              </Btn>
            </div>
          </div>

          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

          <div style={{textAlign:"center"}}>
            <Btn small onClick={goHome}>↺ Start a new assessment</Btn>
          </div>
        </div>

        <footer style={{padding:"18px 22px",borderTop:`1px solid ${P.border}`,textAlign:"center",fontSize:11,color:P.muted,lineHeight:1.9}}>
          &copy; {CY} AnalyzerBPM&#8482;. All rights reserved.<br/>
          <span style={{color:P.navy}}>tellus@analyzerbpm.com</span>
        </footer>

        <Toast show={toast.show} msg={toast.msg}/>
      </div>
    )
  }

  // ─── FEEDBACK PAGE ────────────────────────────────────────────────────────
  if (page === PAGES.FEEDBACK) {
    const canSubmit = feedbackStars > 0

    const handleFeedbackSubmit = () => {
      if (!canSubmit) return
      setFeedbackSubmitted(true)
      // Generate report immediately after feedback
      generateAiReport()
      navigate(PAGES.REPORT)
    }

    return (
      <div style={{fontFamily:"system-ui,'Segoe UI',sans-serif",width:"100%",background:P.white,minHeight:"100vh",color:P.ink}}>
        <Header onHome={goHome} onBack={()=>navigate(PAGES.RESULTS)}/>
        <div style={{maxWidth:640,margin:"60px auto",padding:"0 22px 40px"}}>
          <div style={{marginBottom:28,textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:12}}>⭐</div>
            <h2 style={{fontSize:20,fontWeight:800,color:P.navy,margin:"0 0 8px"}}>Before we generate your report</h2>
            <p style={{fontSize:14,color:P.muted,margin:0,lineHeight:1.6}}>
              Please take a moment to rate your experience. Your feedback helps us improve AnalyzerBPM.
            </p>
          </div>

          {/* Star rating */}
          <div style={{textAlign:"center",marginBottom:24}}>
            <p style={{fontSize:12,fontWeight:700,color:P.muted,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:12}}>
              Rate your experience <span style={{color:P.navy}}>*</span>
            </p>
            <div
              style={{display:"flex",justifyContent:"center",gap:8}}
              role="radiogroup"
              aria-label="Star rating"
              onKeyDown={e=>{
                if(e.key==="ArrowRight"||e.key==="ArrowUp"){   e.preventDefault(); setFeedbackStars(s=>Math.min(s+1,5)) }
                if(e.key==="ArrowLeft"||e.key==="ArrowDown"){  e.preventDefault(); setFeedbackStars(s=>Math.max(s-1,1)) }
              }}
            >
              {[1,2,3,4,5].map(star => (
                <button
                  key={star}
                  onClick={()=>setFeedbackStars(star)}
                  tabIndex={star===1?0:-1}
                  aria-label={`${star} star${star>1?"s":""}`}
                  aria-checked={star===feedbackStars}
                  role="radio"
                  style={{
                    background:"none",border:"none",cursor:"pointer",fontSize:32,padding:0,
                    color:star <= feedbackStars ? "#F59E0B" : P.border,
                    transition:"color 0.1s, transform 0.1s",
                    transform: star <= feedbackStars ? "scale(1.1)" : "scale(1)",
                  }}
                >★</button>
              ))}
            </div>
            {feedbackStars > 0 && (
              <p style={{fontSize:12,color:P.muted,marginTop:8}}>
                {["","Very poor","Poor","Average","Good","Excellent"][feedbackStars]}
              </p>
            )}
          </div>

          {/* Free text */}
          <Field label="Additional comments (optional)">
            <textarea
              value={feedbackText}
              onChange={e=>setFeedbackText(e.target.value)}
              placeholder="Tell us what you thought of the assessment…"
              style={{...textareaStyle,minHeight:100}}
            />
          </Field>

          <Btn primary onClick={handleFeedbackSubmit} disabled={!canSubmit}
            style={{width:"100%",justifyContent:"center",padding:"12px",marginTop:8}}>
            Submit feedback & generate report →
          </Btn>
          {!canSubmit && (
            <p style={{fontSize:11,color:"#9B1D00",textAlign:"center",marginTop:8}}>
              Please select a star rating to continue.
            </p>
          )}
        </div>
      </div>
    )
  }

  // ─── REPORT PAGE ──────────────────────────────────────────────────────────
  if (page === PAGES.REPORT) {
    return (
      <div style={{fontFamily:"system-ui,'Segoe UI',sans-serif",width:"100%",background:P.white,minHeight:"100vh",color:P.ink}}>
        <Header onHome={goHome}/>

        <div style={{padding:"22px 40px"}}>

          {/* Score summary */}
          <div style={{background:P.soft,border:`1.5px solid ${P.border}`,borderRadius:10,padding:"16px 18px",marginBottom:14}}>
            {effectiveProcess && (
              <p style={{fontSize:12,color:P.muted,margin:"0 0 8px",fontWeight:600}}>
                Process: <span style={{color:P.navy}}>{effectiveProcess}</span>
              </p>
            )}
            <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <span style={{background:P.navy,color:"#fff",fontWeight:800,fontSize:13,padding:"5px 14px",borderRadius:20}}>
                Overall Maturity: {minScore !== null ? minScore : "—"}/5
              </span>
              <span style={{background:P.soft,color:P.navy,fontWeight:700,fontSize:13,padding:"5px 14px",borderRadius:20,border:`1px solid ${P.border}`}}>
                Avg: {avgScore.toFixed(1)}/5
              </span>
              <span style={{background:P.soft,color:P.navy,fontWeight:700,fontSize:13,padding:"5px 14px",borderRadius:20,border:`1px solid ${P.border}`}}>
                Weighted: {weightedAvgScore.toFixed(1)}/5
              </span>
              <span style={{fontSize:12,color:P.muted}}>{answered}/{TOTAL_Q} questions</span>
            </div>
          </div>

          {/* Dimension score bars */}
          <div style={{...card,marginBottom:14}}>
            <p style={{fontSize:11,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",color:P.muted,marginBottom:12}}>
              Score by dimension
            </p>
            {ALL_DIMS.map(attr => {
              const d   = dimData[attr]
              const pct = Math.round(d.avg/5*100)
              const m   = ATTR_META[attr]
              const wt  = WEIGHTS_CONST[attr]
              return (
                <div key={attr} style={{marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{width:7,height:7,borderRadius:"50%",background:m.color}}/>
                      <span style={{fontSize:12,fontWeight:600,color:P.ink}}>{attr}</span>
                      <span style={{fontSize:10,color:P.muted}}>({(wt*100).toFixed(0)}% weight)</span>
                    </div>
                    <span style={{fontSize:12,fontWeight:700,color:P.navy}}>
                      {d.count > 0 ? d.avg.toFixed(1) : "—"}/5
                    </span>
                  </div>
                  <div style={{height:5,background:P.border,borderRadius:3}}>
                    <div style={{height:"100%",width:`${pct}%`,background:P.navy,borderRadius:3,transition:"width 0.7s"}}/>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Dimension assessment summaries */}
          <div style={{...card,marginBottom:14}}>
            <p style={{fontSize:11,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",color:P.muted,marginBottom:16}}>
              Assessment summary by dimension
            </p>
            {ALL_DIMS.map(attr => {
              const summary = getDimSummary(attr)
              const m       = ATTR_META[attr]
              const d       = dimData[attr]
              if (!summary) return null
              return (
                <div key={attr} style={{
                  marginBottom:16,padding:"14px 16px",borderRadius:8,
                  border:`1px solid ${P.border}`,background:P.surface,
                }}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:700,
                        letterSpacing:"0.06em",padding:"3px 10px",borderRadius:20,textTransform:"uppercase",
                        background:m.bg,color:m.color,border:`1px solid ${m.color}30`}}>
                        <span style={{fontSize:9,fontWeight:800,opacity:0.65}}>{m.label}</span>{attr}
                      </span>
                      <span style={{fontSize:11,color:P.muted}}>avg {d.avg.toFixed(1)}/5</span>
                    </div>
                    <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,background:P.navy,color:"#fff"}}>
                      Section Maturity: {summary.score}/5
                    </span>
                  </div>
                  <p style={{fontSize:13,lineHeight:1.7,color:P.ink,margin:0}}>{summary.statement}</p>
                </div>
              )
            })}
          </div>

          {/* AI Recommendations */}
          <div style={{...card, marginBottom:14}}>
            <p style={{fontSize:11,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",color:P.muted,marginBottom:12}}>
              Recommendation Report
            </p>

            {aiReport?.loading && (
              <div style={{padding:"20px 0",textAlign:"center"}}>
                <div style={{display:"inline-block",width:20,height:20,border:`3px solid ${P.border}`,borderTopColor:P.navy,borderRadius:"50%",animation:"spin 0.8s linear infinite",marginBottom:10}}/>
                <p style={{fontSize:13,color:P.muted,margin:0}}>Generating your recommendation report…</p>
              </div>
            )}

            {aiReport?.error && (
              <div style={{padding:"10px 14px",borderRadius:7,background:"#FEF2F2",border:"1px solid #FECACA",fontSize:12,color:"#991B1B"}}>
                {aiReport.error}
                <button onClick={generateAiReport} style={{marginLeft:10,fontSize:11,color:P.navy,fontWeight:600,background:"none",border:"none",cursor:"pointer",padding:0,fontFamily:"inherit"}}>
                  Retry →
                </button>
              </div>
            )}

            {aiReport?.text && (() => {
              // Parse and render: summary paragraph + per-dimension blocks
              const lines = aiReport.text.split("\n").filter(l => l.trim())
              let summaryLines = [], dimLines = []
              lines.forEach(line => {
                const dimMatch = line.trim().match(/^([A-Za-z &]+):\s+(.+)/)
                if (dimMatch && ALL_DIMS.includes(dimMatch[1].trim())) {
                  dimLines.push({ dim: dimMatch[1].trim(), text: dimMatch[2].trim() })
                } else {
                  summaryLines.push(line.replace(/^Recommendation Summary[:\s]*/i, "").trim())
                }
              })
              return (
                <div>
                  {summaryLines.filter(Boolean).length > 0 && (
                    <div style={{background:P.surface,borderRadius:8,padding:"14px 16px",marginBottom:14,border:`1px solid ${P.border}`}}>
                      <p style={{fontSize:11,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",color:P.muted,margin:"0 0 8px"}}>Recommendation Summary</p>
                      <p style={{fontSize:13,lineHeight:1.8,color:P.ink,margin:0}}>{summaryLines.filter(Boolean).join(" ")}</p>
                    </div>
                  )}
                  {dimLines.map(({dim, text}) => {
                    const m = ATTR_META[dim]
                    return (
                      <div key={dim} style={{
                        marginBottom:10,padding:"12px 14px",
                        borderLeft:`3px solid ${P.navy}`,
                        background:P.surface,borderRadius:"0 8px 8px 0",
                        border:`1px solid ${P.border}`,borderLeft:`3px solid ${P.navy}`,
                      }}>
                        <span style={{fontSize:11,fontWeight:700,color:P.navy,textTransform:"uppercase",letterSpacing:"0.05em"}}>{dim}</span>
                        <p style={{fontSize:13,lineHeight:1.7,color:P.ink,margin:"5px 0 0"}}>{text}</p>
                      </div>
                    )
                  })}
                  {dimLines.length === 0 && (
                    <div style={{fontSize:13,lineHeight:1.8,color:P.ink,whiteSpace:"pre-wrap"}}>
                      {aiReport.text}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>

          {/* PDF Download */}
          <div style={{...card, marginBottom:14, background: P.navy}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center"}}>
              <Btn
                small
                id="download-pdf-btn"
                onClick={downloadPdf}
                disabled={!aiReport?.text}
                style={{background:"#fff",color:P.navy,border:"none",fontWeight:700,opacity:aiReport?.text?1:0.5,padding:"10px 24px",fontSize:14}}
              >
                ⬇ Download Recommendation Report
              </Btn>
            </div>
          </div>

          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

          <div style={{textAlign:"center",paddingTop:4}}>
            <Btn small onClick={goHome}>↺ Start a new assessment</Btn>
          </div>
        </div>

        <footer style={{padding:"18px 22px",borderTop:`1px solid ${P.border}`,textAlign:"center",fontSize:11,color:P.muted,lineHeight:1.9}}>
          &copy; {CY} AnalyzerBPM&#8482;. All rights reserved. Unauthorised reproduction or commercial use is prohibited.<br/>
          AnalyzerBPM&#8482; framework, assessment structure, and scoring methodology are protected intellectual property.<br/>
          <span style={{color:P.navy}}>tellus@analyzerbpm.com</span>
        </footer>

        {showReview && <ReviewPanel responses={responses} onJump={jumpTo} onClose={()=>setShowReview(false)}/>}
        <Toast show={toast.show} msg={toast.msg}/>
      </div>
    )
  }

  return null
}

// Named export alias for backward compatibility
export { AnalyzerBPM as AnalyzerBPMFree }
