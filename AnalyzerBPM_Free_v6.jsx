// ─── Copyright Notice ────────────────────────────────────────────────────────
// AnalyzerBPM™ — Business Process Maturity Assessment Framework (Free Edition)
// Copyright © 2025 AnalyzerBPM. All rights reserved.
// Unauthorised reproduction, distribution, or commercial use is strictly
// prohibited. For licensing enquiries: hello@analyzerbpm.com
// ─────────────────────────────────────────────────────────────────────────────
//
// FREE EDITION — Key behaviours:
//  • All 6 dimensions, all 17 questions, fully unlocked
//  • Profile form: email, company, job function, industry — all with Other + free text
//  • Process selection: searchable dropdown + Other free text
//  • 85 assessment statements (1 per score × 17 questions)
//  • Report: per-dimension summary using the statement for the LOWEST score in that dim
//  • Data (profile + responses + scores) posted to Supabase on completion
//  • No login, no PDF, no payment, no upgrade prompts
//
// SUPABASE SETUP — run once in SQL Editor:
//
//   CREATE TABLE free_assessments (
//     id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//     workflow_id          TEXT,
//     email                TEXT,
//     job_function         TEXT,
//     company              TEXT,
//     industry             TEXT,
//     process_name         TEXT,
//     responses            JSONB,
//     min_score            INT,
//     avg_score            NUMERIC(4,2),
//     completed            BOOLEAN DEFAULT TRUE,
//     -- Benchmarking fields (v5+)
//     company_size         TEXT,
//     region               TEXT,
//     time_to_complete_secs INT,
//     response_variance    JSONB,
//     created_at           TIMESTAMPTZ DEFAULT NOW()
//   );
//   ALTER TABLE free_assessments ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "public insert only"
//     ON free_assessments FOR INSERT WITH CHECK (true);
//   CREATE POLICY "public read by workflow"
//     ON free_assessments FOR SELECT USING (true);
//
//   CREATE TABLE workflow_sessions (
//     id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//     workflow_id   TEXT UNIQUE NOT NULL,
//     owner_email   TEXT NOT NULL,
//     process_name  TEXT,
//     max_members   INT DEFAULT 5,
//     created_at    TIMESTAMPTZ DEFAULT NOW()
//   );
//   ALTER TABLE workflow_sessions ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "public workflow insert"
//     ON workflow_sessions FOR INSERT WITH CHECK (true);
//   CREATE POLICY "public workflow read"
//     ON workflow_sessions FOR SELECT USING (true);
//
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef, useEffect } from "react"

const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co"
const SUPABASE_KEY = "YOUR_ANON_PUBLIC_KEY"

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
  LANDING:     "landing",
  WORKFLOW:    "workflow",     // create a team workflow
  JOIN:        "join",         // join via URL ?wf= param
  JOIN_MANUAL: "join_manual",  // join by typing email + workflow link
  PROFILE:     "profile",
  SETUP:       "setup",
  ASSESSMENT:  "assessment",
  REPORT:      "report",
}

const ALL_DIMS = ["Design","Skills","Ownership & Governance","People & Technology","Measure","Improvement"]

const ATTR_META = {
  Design:                  { color:"#1B2B3A", bg:"#F0F2F4", label:"DE" },
  Skills:                  { color:"#1B2B3A", bg:"#F0F2F4", label:"SK" },
  "Ownership & Governance":{ color:"#1B2B3A", bg:"#F0F2F4", label:"OG" },
  "People & Technology":         { color:"#1B2B3A", bg:"#F0F2F4", label:"PT" },
  Measure:                 { color:"#1B2B3A", bg:"#F0F2F4", label:"ME" },
  Improvement:             { color:"#1B2B3A", bg:"#F0F2F4", label:"IM" },
}

const LEVEL_META = {
  1:{ name:"Initial",     color:"#1B2B3A", bg:"#F0F2F4", border:"#D4D8DD",
      desc:"Processes are unstructured and unpredictable. Success depends on individual effort rather than system design. Reactive firefighting is the norm." },
  2:{ name:"Managed",     color:"#1B2B3A", bg:"#F0F2F4", border:"#D4D8DD",
      desc:"Processes are repeatable within teams but not standardised across the organisation. Inconsistency between units is common." },
  3:{ name:"Defined",     color:"#1B2B3A", bg:"#F0F2F4", border:"#D4D8DD",
      desc:"Processes are documented and consistently applied organisation-wide. A strong foundation is in place for measurement and integration." },
  4:{ name:"Predictable", color:"#1B2B3A", bg:"#F0F2F4", border:"#D4D8DD",
      desc:"Performance is measured and managed quantitatively. Management can predict outcomes and intervene proactively." },
  5:{ name:"Optimizing",  color:"#1B2B3A", bg:"#F0F2F4", border:"#D4D8DD",
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
    attr:"People & Technology",
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
    attr:"People & Technology",
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
      const r = await fetch(`${SUPABASE_URL}/rest/v1/free_assessments`, {
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

  async createWorkflow(workflowId, ownerEmail, processName) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/workflow_sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey":        SUPABASE_KEY,
          "Prefer":        "return=minimal",
        },
        body: JSON.stringify({ workflow_id: workflowId, owner_email: ownerEmail, process_name: processName, max_members: 5 }),
      })
      return r.ok
    } catch {
      return false
    }
  },

  async getWorkflow(workflowId) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/workflow_sessions?workflow_id=eq.${encodeURIComponent(workflowId)}&select=*`,
        { headers: { "apikey": SUPABASE_KEY } }
      )
      if (!r.ok) return null
      const data = await r.json()
      return data[0] || null
    } catch {
      return null
    }
  },

  async getWorkflowMembers(workflowId) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/free_assessments?workflow_id=eq.${encodeURIComponent(workflowId)}&select=email,completed,avg_score,min_score,created_at`,
        { headers: { "apikey": SUPABASE_KEY } }
      )
      if (!r.ok) return []
      return await r.json()
    } catch {
      return []
    }
  },

  async saveFeedback({ email, processName, rating, comment }) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/feedback`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_KEY,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          assessment_email: email,
          process_name:     processName,
          rating,
          comment:          comment.trim() || null,
        }),
      })
      return r.ok
    } catch { return false }
  },

  async checkEmailInWorkflow(workflowId, email) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/free_assessments?workflow_id=eq.${encodeURIComponent(workflowId)}&email=eq.${encodeURIComponent(email.toLowerCase())}&select=email`,
        { headers: { "apikey": SUPABASE_KEY } }
      )
      if (!r.ok) return false
      const data = await r.json()
      return data.length > 0
    } catch {
      return false
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

// ── Field wrapper ─────────────────────────────────────────────────────────────
const Field = ({ label, required, error, children }) => (
  <div style={{marginBottom:18}}>
    <label style={{fontSize:12,fontWeight:600,color:P.muted,display:"block",marginBottom:6}}>
      {label}{required && <span style={{color:P.navy,marginLeft:3}}>*</span>}
    </label>
    {children}
    {error && <p style={{fontSize:11,color:"#9B1D00",margin:"4px 0 0"}}>{error}</p>}
  </div>
)

// ── Standard select with Other → free text ────────────────────────────────────
const SelectWithOther = ({ value, otherValue, onChange, onOtherChange, options, placeholder, error, otherPlaceholder }) => (
  <>
    <select
      value={value}
      onChange={e=>onChange(e.target.value)}
      style={{
        ...inputStyle,
        borderColor: error ? "#9B1D00" : P.border,
        appearance:"none",
        backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%234B5563' fill='none' stroke-width='1.5'/%3E%3C/svg%3E")`,
        backgroundRepeat:"no-repeat",
        backgroundPosition:"right 12px center",
        paddingRight:36,
      }}
    >
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
    {value === "Other" && (
      <textarea
        value={otherValue}
        onChange={e=>onOtherChange(e.target.value)}
        placeholder={otherPlaceholder || "Please describe…"}
        style={textareaStyle}
      />
    )}
  </>
)

// ── Searchable process dropdown ───────────────────────────────────────────────
const ProcessDropdown = ({ value, otherValue, onChange, onOtherChange, error }) => {
  const [search,  setSearch]  = useState("")
  const [open,    setOpen]    = useState(false)
  const ref = useRef(null)

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
  }

  return (
    <div ref={ref} style={{position:"relative"}}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={()=>setOpen(o=>!o)}
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
              onChange={e=>setSearch(e.target.value)}
              placeholder="Type to search…"
              style={{...inputStyle,padding:"7px 10px",fontSize:13,border:`1px solid ${P.border}`}}
            />
          </div>
          {/* Options list */}
          <div style={{maxHeight:220,overflowY:"auto"}}>
            {filtered.length === 0
              ? <div style={{padding:"12px 14px",fontSize:13,color:P.muted}}>No match — select Other to enter manually</div>
              : filtered.map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={()=>handleSelect(opt)}
                  style={{
                    display:"block",width:"100%",textAlign:"left",
                    padding:"9px 14px",fontSize:13,fontFamily:"inherit",cursor:"pointer",
                    background:value===opt?P.soft:P.white,
                    color:value===opt?P.navy:P.ink,
                    fontWeight:value===opt?700:400,
                    border:"none",borderBottom:`1px solid ${P.border}`,
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

// Pure utility — defined at module level so hooks can reference it safely
function generateWorkflowId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let id = "WF-"
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)]
  id += "-"
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return id
}

export default function AnalyzerBPMFree() {
  const [page,        setPage]        = useState(PAGES.LANDING)
  const [currentQ,    setCurrentQ]    = useState(0)
  const [responses,   setResponses]   = useState(new Array(TOTAL_Q).fill(null))
  const [showReview,  setShowReview]  = useState(false)
  const [toast,       setToast]       = useState({ show:false, msg:"" })
  const [submitting,  setSubmitting]  = useState(false)
  const [feedbackModal, setFeedbackModal] = useState({ open:false, rating:0, hovered:0, comment:"", submitting:false, submitted:false })
  const [llmInsights,   setLlmInsights]   = useState({ text:null, loading:false, error:null })

  // ── Workflow state ────────────────────────────────────────────────────────
  const [workflowId,      setWorkflowId]      = useState("")        // active workflow number
  const [workflowMembers, setWorkflowMembers] = useState([])        // [{email, completed, avg_score}]
  const [workflowMode,    setWorkflowMode]    = useState("solo")    // "solo" | "collab"
  const [joinEmail,       setJoinEmail]       = useState("")        // email for join flow
  const [joinError,       setJoinError]       = useState("")
  const [joiningWf,       setJoiningWf]       = useState(null)      // workflow meta when joining
  const [linkCopied,      setLinkCopied]      = useState(false)
  const [wfLoading,       setWfLoading]       = useState(false)
  const [manualWfLink,    setManualWfLink]    = useState("")       // typed workflow link/id on JOIN_MANUAL

  // Profile fields — value + otherValue for each "Other" capable field
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

  // ── Timing — records when assessment questions start ────────────────────
  const assessmentStartTime = useRef(null)

  // Process selection — separate from profile
  const [processName,      setProcessName]      = useState("")
  const [processNameOther, setProcessNameOther] = useState("")

  const newWfIdRef = useRef(generateWorkflowId())

  const card = { background:P.white, border:`1px solid ${P.border}`, borderRadius:10, padding:"16px 20px" }

  // ── Workflow utilities ────────────────────────────────────────────────────
  const getShareLink = (wfId) => {
    const base = window.location.href.split("?")[0]
    return `${base}?wf=${encodeURIComponent(wfId)}`
  }

  const copyLink = async (wfId) => {
    try {
      await navigator.clipboard.writeText(getShareLink(wfId))
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2500)
    } catch {
      showToast("Copy the URL from your address bar")
    }
  }

  const copyWorkflowNumber = async (wfId) => {
    try {
      await navigator.clipboard.writeText(wfId)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2500)
    } catch {
      showToast("Workflow number: " + wfId)
    }
  }

  // On mount — detect ?wf= in URL and route to JOIN flow
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const wfParam = params.get("wf")
    if (wfParam) {
      setWfLoading(true)
      sb.getWorkflow(wfParam).then(session => {
        setWfLoading(false)
        if (session) {
          setJoiningWf(session)
          setWorkflowId(wfParam)
          setWorkflowMode("collab")
          navigate(PAGES.JOIN)
        } else {
          showToast("Workflow not found — please check the link")
        }
      })
    }
  }, [])

  const refreshWorkflowMembers = async (wfId) => {
    const members = await sb.getWorkflowMembers(wfId || workflowId)
    setWorkflowMembers(members)
  }

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
    return `Lowest score: ${score}/5 — ${LEVEL_META[score]?.name}. ${qObj.assessment[score - 1]}`
  }

  // ── LLM Insights — called automatically when report page loads ──────────
  // Calls a Supabase Edge Function so the Anthropic API key never touches
  // the browser. The Edge Function reads the key from Supabase Secrets only.
  // A per-user daily call counter is enforced server-side — 429 = limit hit.
  const generateInsights = useCallback(async () => {
    setLlmInsights({ text:null, loading:true, error:null })

    const dimSummaries = ALL_DIMS.map(attr => {
      const d = dimData[attr]
      const qs = QUESTIONS.filter(q => q.attr === attr)
      const answered = qs.map((q, i) => {
        const idx = QUESTIONS.indexOf(q)
        const score = responses[idx]
        return score ? `  - ${q.q}: "${q.opts[score-1]}" (score ${score}/5)` : null
      }).filter(Boolean).join("\n")
      return `**${attr}** (avg ${d.avg.toFixed(1)}/5):\n${answered || "  No responses"}`
    }).join("\n\n")

    const prompt = `You are a senior Business Process Management consultant. A user has just completed the AnalyzerBPM™ assessment.

Organisation: ${profile.company || "Not provided"}
Industry: ${profile.industry === "Other" ? profile.industryOther : (profile.industry || "Not provided")}
Process assessed: ${effectiveProcess}
Overall maturity level: ${minScore}/5 — ${minScore ? LEVEL_META[minScore]?.name : "N/A"} (avg ${avgScore.toFixed(1)}/5)

DIMENSION-BY-DIMENSION RESPONSES:
${dimSummaries}

Write a concise, personalised consulting commentary in plain paragraphs (no markdown headings, no bullet points). Structure it as:

1. One opening paragraph (2–3 sentences) interpreting what the overall maturity score means for this specific process in this specific industry.

2. One paragraph per dimension (6 total) — each 2–3 sentences. Be specific: reference the actual score and selected answer. Identify the single most important implication or risk for this organisation.

3. One closing paragraph (2–3 sentences) — the single most important priority action, framed as a concrete next step.

Tone: direct, professional, consultant-grade. No generic advice. Every sentence must be traceable to the data above.`

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-ai-insights`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_KEY,
        },
        // Pass the user's email so the Edge Function can enforce per-user daily limit
        body: JSON.stringify({ prompt, email: profile.email }),
      })

      // 429 = daily limit reached — show a friendly, specific message
      if (res.status === 429) {
        setLlmInsights({ text:null, loading:false, error:"daily_limit" })
        return
      }

      const data = await res.json()
      if (!res.ok || !data.text) throw new Error(data.error || "Empty response")
      setLlmInsights({ text: data.text, loading:false, error:null })
    } catch (err) {
      setLlmInsights({ text:null, loading:false, error:"generic" })
    }
  }, [profile, effectiveProcess, responses, minScore, avgScore, dimData])

  // ── PDF download using browser print ─────────────────────────────────────
  const downloadPdf = useCallback(() => {
    const lvl = minScore ? LEVEL_META[minScore] : LEVEL_META[1]
    const dateStr = new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })

    const qRows = QUESTIONS.map((q, i) => {
      const score = responses[i]
      if (score === null) return ""
      const levelName = LEVEL_META[score]?.name || ""
      return `
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:8px 10px;font-size:11px;color:#4B5563;width:20px;">${i+1}</td>
          <td style="padding:8px 10px;font-size:11px;color:#1B2B3A;font-weight:600;">${q.attr}</td>
          <td style="padding:8px 10px;font-size:11px;color:#111827;line-height:1.5;">${q.q}</td>
          <td style="padding:8px 10px;font-size:11px;color:#111827;line-height:1.5;">${q.opts[score-1]}</td>
          <td style="padding:8px 10px;font-size:11px;font-weight:700;color:#1B2B3A;text-align:center;">${score}/5<br/><span style="font-weight:400;font-size:10px;">${levelName}</span></td>
        </tr>`
    }).join("")

    const dimRows = ALL_DIMS.map(attr => {
      const d = dimData[attr]
      const summary = getDimSummaryForAi(attr)
      return `
        <div style="margin-bottom:14px;padding:12px 14px;border:1px solid #D4D8DD;border-radius:8px;background:#F5F6F7;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <span style="font-size:12px;font-weight:700;color:#1B2B3A;text-transform:uppercase;letter-spacing:0.05em;">${attr}</span>
            <span style="font-size:12px;font-weight:700;color:#fff;background:#1B2B3A;padding:2px 10px;border-radius:12px;">Avg ${d.avg.toFixed(1)}/5</span>
          </div>
          <p style="font-size:11px;color:#111827;line-height:1.6;margin:0;">${summary || "—"}</p>
        </div>`
    }).join("")

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>AnalyzerBPM Report — ${effectiveProcess}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; color: #111827; margin: 0; padding: 32px 40px; font-size: 13px; }
  @media print {
    body { padding: 20px 24px; }
    .no-print { display: none; }
  }
  h1 { font-size: 22px; font-weight: 800; color: #1B2B3A; margin: 0 0 4px; }
  h2 { font-size: 14px; font-weight: 700; color: #1B2B3A; margin: 20px 0 10px; text-transform: uppercase; letter-spacing: 0.05em; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #1B2B3A; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 600; }
  tr:nth-child(even) { background: #F5F6F7; }
</style>
</head>
<body>
  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #1B2B3A;">
    <div>
      <h1>Business Process Maturity Report</h1>
      <p style="margin:4px 0 0;font-size:13px;color:#4B5563;">Generated by AnalyzerBPM™ — ${dateStr}</p>
    </div>
    <div style="text-align:right;font-size:11px;color:#4B5563;line-height:1.8;">
      <strong>${profile.company}</strong><br/>
      ${profile.email}<br/>
      ${profile.jobFunction === "Other" ? profile.jobFunctionOther : profile.jobFunction}<br/>
      ${profile.industry === "Other" ? profile.industryOther : profile.industry}
    </div>
  </div>

  <!-- Overall result -->
  <div style="background:#F0F2F4;border:1.5px solid #D4D8DD;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
    <p style="font-size:12px;color:#4B5563;margin:0 0 6px;font-weight:600;">Process assessed: <span style="color:#1B2B3A;">${effectiveProcess}</span></p>
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px;">
      <span style="background:#1B2B3A;color:#fff;font-weight:800;font-size:13px;padding:5px 14px;border-radius:20px;">Level ${minScore} — ${lvl.name}</span>
      <span style="font-size:12px;color:#4B5563;">Overall avg: ${avgScore.toFixed(1)}/5 · ${answered}/${QUESTIONS.length} questions answered</span>
    </div>
    <p style="font-size:12px;line-height:1.65;color:#111827;margin:0;">${lvl.desc}</p>
  </div>

  <!-- Dimension scores -->
  <h2>Score by Dimension</h2>
  <table style="margin-bottom:20px;">
    <thead><tr>
      <th>Dimension</th>
      <th style="text-align:center;">Avg Score</th>
      <th style="text-align:center;">Maturity Level</th>
    </tr></thead>
    <tbody>
      ${ALL_DIMS.map(attr => {
        const d = dimData[attr]
        const lvlName = d.min ? LEVEL_META[d.min]?.name : "—"
        return `<tr style="border-bottom:1px solid #eee;">
          <td style="padding:8px 10px;font-size:12px;font-weight:600;color:#1B2B3A;">${attr}</td>
          <td style="padding:8px 10px;font-size:12px;font-weight:700;color:#1B2B3A;text-align:center;">${d.count > 0 ? d.avg.toFixed(1) : "—"}/5</td>
          <td style="padding:8px 10px;font-size:12px;color:#4B5563;text-align:center;">${lvlName}</td>
        </tr>`
      }).join("")}
    </tbody>
  </table>

  <!-- Dimension summaries -->
  <h2>Assessment Summary by Dimension</h2>
  ${dimRows}

  <!-- Q&A table -->
  <div style="page-break-before:always;margin-top:0;padding-top:24px;">
    <h2 style="font-size:14px;font-weight:700;color:#1B2B3A;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.05em;">Full Question-by-Question Responses</h2>
    <table>
      <thead><tr>
        <th>#</th>
        <th>Dimension</th>
        <th>Question</th>
        <th>Your Response</th>
        <th style="text-align:center;">Score</th>
      </tr></thead>
      <tbody>${qRows}</tbody>
    </table>
  </div>

  ${llmInsights.text ? `
  <div style="page-break-before:always;margin-top:0;padding-top:24px;">
    <h2 style="font-size:14px;font-weight:700;color:#1B2B3A;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.05em;">Consultant Commentary</h2>
    <div style="font-size:12px;color:#111827;line-height:1.85;white-space:pre-wrap;background:#F5F6F7;padding:16px 18px;border-radius:8px;border:1px solid #D4D8DD;">${llmInsights.text.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>
  </div>` : ""}

  <!-- Footer -->
  <div style="margin-top:32px;padding-top:12px;border-top:1px solid #D4D8DD;font-size:10px;color:#4B5563;text-align:center;">
    © ${CY} AnalyzerBPM™. All rights reserved. This report is confidential and generated for internal use only.<br/>
    hello@analyzerbpm.com
  </div>
</body>
</html>`

    const win = window.open("", "_blank")
    if (!win) { alert("Please allow pop-ups to download the PDF."); return }
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print() }, 600)
  }, [profile, effectiveProcess, responses, minScore, avgScore, dimData, answered, llmInsights])

  const navigate = (p) => { setPage(p); window.scrollTo(0,0) }
  const goHome   = () => navigate(PAGES.LANDING)

  const showToast = (msg) => {
    setToast({ show:true, msg })
    setTimeout(() => setToast({ show:false, msg:"" }), 2500)
  }

  // ── Profile validation ───────────────────────────────────────────────────
  const validateProfile = () => {
    const errs = {}
    if (!profile.email.trim())
      errs.email = "Email is required"
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email))
      errs.email = "Enter a valid email address"
    if (!profile.company.trim())
      errs.company = "Company name is required"
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
    if (validateProfile()) {
      assessmentStartTime.current = Date.now()
      navigate(PAGES.SETUP)
    }
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
    setSubmitting(true)

    // ── Time to complete (seconds since assessment start) ─────────────────
    const timeToCompleteSecs = assessmentStartTime.current
      ? Math.round((Date.now() - assessmentStartTime.current) / 1000)
      : null

    // ── Response variance per dimension ──────────────────────────────────
    // For each dimension, compute variance of the scores answered.
    // variance = average of squared deviations from the mean.
    // Stored as { "Design": 0.22, "Skills": 0.67, ... }
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
      workflow_id:           workflowId || null,
      email:                 profile.email.trim().toLowerCase(),
      job_function:          profile.jobFunction === "Other"
                               ? `Other: ${profile.jobFunctionOther.trim()}`
                               : profile.jobFunction,
      company:               profile.company.trim(),
      industry:              profile.industry === "Other"
                               ? `Other: ${profile.industryOther.trim()}`
                               : profile.industry,
      process_name:          effectiveProcess,
      responses:             responses,
      min_score:             minScore,
      avg_score:             parseFloat(avgScore.toFixed(2)),
      completed:             true,
      // Benchmarking fields
      company_size:          profile.companySize,
      region:                profile.region,
      time_to_complete_secs: timeToCompleteSecs,
      response_variance:     responseVariance,
    }
    const ok = await sb.saveAssessment(record)
    if (workflowId) await refreshWorkflowMembers(workflowId)
    setSubmitting(false)
    if (!ok) console.warn("AnalyzerBPM Free: Supabase save failed — check credentials")
    navigate(PAGES.REPORT)
    // Auto-generate LLM insights when the report page opens
    setTimeout(() => generateInsights(), 300)
  }, [profile, effectiveProcess, responses, minScore, avgScore, workflowId, generateInsights])

  // ════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════

  // ─── LOADING (URL join detection) ─────────────────────────────────────────
  if (wfLoading) return (
    <div style={{fontFamily:"system-ui,'Segoe UI',sans-serif",maxWidth:720,margin:"0 auto",background:P.white,minHeight:"100vh",color:P.ink,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{textAlign:"center",color:P.muted,fontSize:14}}>Loading workflow…</div>
    </div>
  )

  // ─── LANDING ──────────────────────────────────────────────────────────────
  if (page === PAGES.LANDING) return (
    <div style={{fontFamily:"system-ui,'Segoe UI',sans-serif",maxWidth:720,margin:"0 auto",background:P.white,minHeight:"100vh",color:P.ink}}>
      <Header isLanding onHome={goHome}/>
      <div style={{padding:"40px 22px 20px",textAlign:"center"}}>

        <h1 style={{fontSize:28,fontWeight:800,lineHeight:1.3,color:P.navy,margin:"0 auto 12px",maxWidth:490,letterSpacing:"-0.4px"}}>
          Find out exactly how mature your business processes really are
        </h1>
        <p style={{fontSize:14,lineHeight:1.7,color:P.muted,maxWidth:440,margin:"0 auto 28px"}}>
          17 questions across all 6 dimensions. Instant maturity score. Detailed assessment summary per dimension.
        </p>

        {/* CTA options */}
        <div style={{display:"flex",flexDirection:"column",gap:10,maxWidth:400,margin:"0 auto 10px"}}>
          <Btn primary onClick={()=>{ setWorkflowMode("solo"); navigate(PAGES.PROFILE) }} style={{padding:"13px 30px",fontSize:15,justifyContent:"center"}}>
            Start assessment →
          </Btn>
          <div style={{position:"relative"}} onMouseEnter={e=>e.currentTarget.querySelector(".wf-tip").style.opacity="1"} onMouseLeave={e=>e.currentTarget.querySelector(".wf-tip").style.opacity="0"}>
            <Btn onClick={()=>navigate(PAGES.WORKFLOW)} style={{padding:"12px 30px",fontSize:14,justifyContent:"center",gap:7,width:"100%"}}>
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" style={{flexShrink:0}}>
                <path d="M10 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM5 8a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm10 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM2 16c0-2 2-3.5 3-3.5s2.5.5 3.5 1.5M15 16c0-2-2-3.5-3-3.5s-2.5.5-3.5 1.5" stroke={P.navy} strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Start a team assessment
            </Btn>
            <div className="wf-tip" style={{
              opacity:0,transition:"opacity 0.18s",pointerEvents:"none",
              position:"absolute",bottom:"calc(100% + 8px)",left:"50%",transform:"translateX(-50%)",
              background:P.navy,color:"#fff",fontSize:12,lineHeight:1.5,fontWeight:500,
              padding:"9px 13px",borderRadius:8,width:270,textAlign:"center",zIndex:30,
              boxShadow:"0 4px 12px rgba(0,0,0,0.18)",
            }}>
              Create a workflow, share a link with up to 4 colleagues. Each person rates independently — results appear together on one shared report.
              <div style={{position:"absolute",bottom:-5,left:"50%",transform:"translateX(-50%)",width:10,height:10,background:P.navy,clipPath:"polygon(0 0,100% 0,50% 100%)"}}/>
            </div>
          </div>
          <Btn onClick={()=>navigate(PAGES.JOIN_MANUAL)} style={{padding:"12px 30px",fontSize:14,justifyContent:"center",gap:7}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{flexShrink:0}}>
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 8v6M23 11h-6" stroke={P.navy} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Join a team assessment
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
            {Object.entries(LEVEL_META).map(([lv,m]) => (
              <div key={lv} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 0",borderBottom:`1px solid ${P.border}`}}>
                <div style={{width:18,height:18,borderRadius:4,background:P.navy,color:"#fff",fontSize:10,fontWeight:800,
                  display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{lv}</div>
                <span style={{fontSize:12,color:P.ink,fontWeight:600}}>{m.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <footer style={{padding:"16px 22px",borderTop:`1px solid ${P.border}`,textAlign:"center",fontSize:11,color:P.muted,lineHeight:1.9}}>
        &copy; {CY} AnalyzerBPM&#8482;. All rights reserved. Unauthorised reproduction or commercial use is prohibited.<br/>
        AnalyzerBPM&#8482; framework, assessment structure, and scoring methodology are protected intellectual property.<br/>
        <span style={{color:P.navy}}>hello@analyzerbpm.com</span>
      </footer>
    </div>
  )

  // ─── WORKFLOW SETUP PAGE ──────────────────────────────────────────────────
  if (page === PAGES.WORKFLOW) {
    const newWfId = newWfIdRef
    return (
      <div style={{fontFamily:"system-ui,'Segoe UI',sans-serif",maxWidth:720,margin:"0 auto",background:P.white,minHeight:"100vh",color:P.ink}}>
        <Header onHome={goHome} onBack={()=>navigate(PAGES.LANDING)}/>
        <div style={{maxWidth:480,margin:"40px auto",padding:"0 22px 40px"}}>
          <div style={{marginBottom:28}}>
            <div style={{fontSize:12,fontWeight:700,color:P.muted,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:6}}>Team Workflow</div>
            <h2 style={{fontSize:20,fontWeight:800,color:P.navy,margin:"0 0 6px"}}>Create a shared assessment workflow</h2>
            <p style={{fontSize:14,color:P.muted,margin:0,lineHeight:1.6}}>
              Your workflow number is generated below. Share it with up to 4 colleagues — each person completes their own copy of the assessment independently.
            </p>
          </div>

          {/* Workflow number display */}
          <div style={{background:P.surface,border:`1.5px solid ${P.border}`,borderRadius:10,padding:"16px 18px",marginBottom:20}}>
            <p style={{fontSize:11,fontWeight:700,color:P.muted,textTransform:"uppercase",letterSpacing:"0.06em",margin:"0 0 6px"}}>Your workflow number</p>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
              <span style={{fontSize:24,fontWeight:800,color:P.navy,letterSpacing:"0.08em"}}>{newWfId.current}</span>
              <Btn small onClick={()=>{ setWorkflowId(newWfId.current); copyWorkflowNumber(newWfId.current) }}>
                {linkCopied ? "✓ Copied!" : "📋 Copy workflow number"}
              </Btn>
            </div>
            <p style={{fontSize:12,color:P.muted,margin:"8px 0 0",lineHeight:1.5}}>
              Share this number with colleagues so they can join the same workflow. Max 5 people (including you).
            </p>
          </div>

          {/* How it works */}
          <div style={{...card,marginBottom:22}}>
            <p style={{fontSize:11,fontWeight:700,color:P.muted,textTransform:"uppercase",letterSpacing:"0.06em",margin:"0 0 12px"}}>How it works</p>
            {[
              ["1","You create the workflow & share the link"],
              ["2","Colleagues enter the workflow number + their email to join"],
              ["3","Everyone completes the assessment independently"],
              ["4","The report shows all responses side-by-side"],
            ].map(([n,t]) => (
              <div key={n} style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:10}}>
                <div style={{width:22,height:22,borderRadius:"50%",background:P.navy,color:"#fff",fontSize:11,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{n}</div>
                <span style={{fontSize:13,color:P.ink,lineHeight:1.5}}>{t}</span>
              </div>
            ))}
          </div>

          <Btn primary
            onClick={async () => {
              const wfId = newWfId.current
              setWorkflowId(wfId)
              setWorkflowMode("collab")
              navigate(PAGES.PROFILE)
            }}
            style={{width:"100%",justifyContent:"center",padding:"12px",marginTop:4}}>
            Continue as workflow owner →
          </Btn>
          <p style={{fontSize:11,color:P.muted,textAlign:"center",marginTop:10,lineHeight:1.6}}>
            You'll complete your profile next. The workflow is created when you finish your assessment.
          </p>
        </div>
      </div>
    )
  }

  // ─── JOIN PAGE (arrived via shared link) ──────────────────────────────────
  if (page === PAGES.JOIN) {
    const handleJoin = async () => {
      setJoinError("")
      if (!joinEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(joinEmail.trim())) {
        setJoinError("Enter a valid work email address")
        return
      }
      setWfLoading(true)
      // Domain check — compare only the part after @
      const ownerDomain  = (joiningWf?.owner_email || "").split("@")[1]?.toLowerCase() || ""
      const joinerDomain = joinEmail.trim().toLowerCase().split("@")[1] || ""
      if (ownerDomain && joinerDomain !== ownerDomain) {
        setWfLoading(false)
        setJoinError(`Your email domain (@${joinerDomain}) doesn't match the team's domain (@${ownerDomain}). Use your company email.`)
        return
      }
      // Check member count
      const members = await sb.getWorkflowMembers(workflowId)
      const alreadyIn = await sb.checkEmailInWorkflow(workflowId, joinEmail.trim())
      setWfLoading(false)
      if (alreadyIn) {
        setJoinError("This email has already submitted a response for this workflow.")
        return
      }
      if (members.length >= 5) {
        setJoinError("This workflow has reached its 5-person limit.")
        return
      }
      // Pre-fill email into profile and proceed
      setProfile(p => ({ ...p, email: joinEmail.trim().toLowerCase() }))
      // Use the process from the workflow session if available
      if (joiningWf?.process_name) {
        setProcessName(joiningWf.process_name)
      }
      navigate(PAGES.PROFILE)
    }

    return (
      <div style={{fontFamily:"system-ui,'Segoe UI',sans-serif",maxWidth:720,margin:"0 auto",background:P.white,minHeight:"100vh",color:P.ink}}>
        <Header isLanding onHome={goHome}/>
        <div style={{maxWidth:420,margin:"60px auto",padding:"0 22px 40px",textAlign:"center"}}>
          <div style={{width:52,height:52,background:P.soft,borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 18px"}}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke={P.navy} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          <h2 style={{fontSize:20,fontWeight:800,color:P.navy,margin:"0 0 8px"}}>You've been invited to a team assessment</h2>
          <p style={{fontSize:14,color:P.muted,margin:"0 0 6px",lineHeight:1.6}}>
            Workflow: <strong style={{color:P.navy}}>{workflowId}</strong>
          </p>
          {joiningWf?.process_name && (
            <p style={{fontSize:13,color:P.muted,margin:"0 0 20px"}}>
              Process: <strong style={{color:P.navy}}>{joiningWf.process_name}</strong>
            </p>
          )}
          <p style={{fontSize:13,color:P.muted,margin:"0 0 22px",lineHeight:1.6}}>
            Enter your work email to join. You'll then complete your profile and the assessment independently.
          </p>

          <Field label="Your work email" required error={joinError}>
            <input
              type="email"
              value={joinEmail}
              onChange={e=>{ setJoinEmail(e.target.value); setJoinError("") }}
              placeholder="you@company.com"
              style={{...inputStyle,borderColor:joinError?"#9B1D00":P.border,textAlign:"left"}}
              onKeyDown={e=>{ if(e.key==="Enter") handleJoin() }}
            />
          </Field>

          <Btn primary onClick={handleJoin} disabled={wfLoading} style={{width:"100%",justifyContent:"center",padding:"12px",marginTop:4}}>
            {wfLoading ? "Checking…" : "Join workflow →"}
          </Btn>
          <p style={{fontSize:11,color:P.muted,marginTop:14,lineHeight:1.6}}>
            Your responses are your own. Each person submits independently.
          </p>
        </div>
      </div>
    )
  }

  // ─── JOIN_MANUAL PAGE — email + workflow number only ────────────────────────
  if (page === PAGES.JOIN_MANUAL) {
    const handleManualJoin = async () => {
      setJoinError("")
      const email = joinEmail.trim()
      const wfNum = manualWfLink.trim().toUpperCase()

      // Validate email
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setJoinError("Enter a valid work email address")
        return
      }
      // Validate workflow number format (accepts WF-XXXX-XXXX or XXXX-XXXX)
      const wfId = wfNum.startsWith("WF-") ? wfNum : wfNum.match(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/) ? "WF-" + wfNum : wfNum
      if (!wfId) {
        setJoinError("Enter the workflow number shared with you, e.g. WF-XXXX-XXXX")
        return
      }

      setWfLoading(true)
      const session = await sb.getWorkflow(wfId)
      if (!session) {
        setWfLoading(false)
        setJoinError("Workflow number not found. Please double-check with the person who shared it.")
        return
      }

      // Domain check — compare only the part after @ 
      const ownerDomain  = (session.owner_email || "").split("@")[1]?.toLowerCase() || ""
      const joinerDomain = email.split("@")[1]?.toLowerCase() || ""
      if (ownerDomain && joinerDomain !== ownerDomain) {
        setWfLoading(false)
        setJoinError(`Your email domain (@${joinerDomain}) doesn't match the team's domain (@${ownerDomain}). Use your company email.`)
        return
      }

      // Duplicate / capacity checks
      const alreadyIn = await sb.checkEmailInWorkflow(wfId, email)
      if (alreadyIn) {
        setWfLoading(false)
        setJoinError("This email has already completed this workflow.")
        return
      }
      const members = await sb.getWorkflowMembers(wfId)
      if (members.length >= 5) {
        setWfLoading(false)
        setJoinError("This workflow has reached its 5-person limit.")
        return
      }

      setWfLoading(false)
      setJoiningWf(session)
      setWorkflowId(wfId)
      setWorkflowMode("collab")
      setProfile(p => ({ ...p, email: email.toLowerCase() }))
      if (session.process_name) setProcessName(session.process_name)
      navigate(PAGES.PROFILE)
    }

    const emailErr = joinError.startsWith("Enter a valid") || joinError.includes("domain") ? joinError : ""
    const wfErr    = joinError && !emailErr ? joinError : ""

    return (
      <div style={{fontFamily:"system-ui,'Segoe UI',sans-serif",maxWidth:720,margin:"0 auto",background:P.white,minHeight:"100vh",color:P.ink}}>
        <Header onHome={goHome} onBack={()=>navigate(PAGES.LANDING)}/>
        <div style={{maxWidth:420,margin:"50px auto",padding:"0 22px 40px"}}>

          {/* Icon */}
          <div style={{width:50,height:50,background:P.soft,borderRadius:13,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:20}}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 8v6M23 11h-6" stroke={P.navy} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          <div style={{marginBottom:24}}>
            <div style={{fontSize:11,fontWeight:700,color:P.muted,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:6}}>Join Team Assessment</div>
            <h2 style={{fontSize:20,fontWeight:800,color:P.navy,margin:"0 0 8px"}}>Start with your team</h2>
            <p style={{fontSize:14,color:P.muted,margin:0,lineHeight:1.6}}>
              Enter your company email and the workflow number your colleague shared with you.
            </p>
          </div>

          <Field label="Your company email" required error={emailErr}>
            <input
              type="email"
              autoFocus
              value={joinEmail}
              onChange={e=>{ setJoinEmail(e.target.value); setJoinError("") }}
              placeholder="you@company.com"
              style={{...inputStyle,borderColor:emailErr?"#9B1D00":P.border}}
              onKeyDown={e=>{ if(e.key==="Enter") document.getElementById("wf-num-input")?.focus() }}
            />
          </Field>

          <Field label="Workflow number" required error={wfErr}>
            <input
              id="wf-num-input"
              type="text"
              value={manualWfLink}
              onChange={e=>{ setManualWfLink(e.target.value.toUpperCase()); setJoinError("") }}
              placeholder="e.g. WF-AB12-CD34"
              style={{...inputStyle,borderColor:wfErr?"#9B1D00":P.border,fontFamily:"monospace",letterSpacing:"0.06em"}}
              onKeyDown={e=>{ if(e.key==="Enter") handleManualJoin() }}
            />
          </Field>

          {/* Domain hint */}
          <div style={{display:"flex",alignItems:"flex-start",gap:8,background:P.surface,border:`1px solid ${P.border}`,borderRadius:8,padding:"10px 12px",marginBottom:18}}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" style={{flexShrink:0,marginTop:1}}>
              <circle cx="10" cy="10" r="9" stroke={P.muted} strokeWidth="1.5"/>
              <path d="M10 9v5M10 7h.01" stroke={P.muted} strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <p style={{fontSize:12,color:P.muted,margin:0,lineHeight:1.6}}>
              Your email must share the same domain as the workflow owner — e.g. both must be <strong style={{color:P.navy}}>@yourcompany.com</strong>.
            </p>
          </div>

          <Btn primary onClick={handleManualJoin} disabled={wfLoading} style={{width:"100%",justifyContent:"center",padding:"12px"}}>
            {wfLoading ? "Verifying…" : "Join assessment →"}
          </Btn>
          <p style={{fontSize:11,color:P.muted,textAlign:"center",marginTop:14,lineHeight:1.6}}>
            Each person completes the assessment independently. All results appear on one shared report.
          </p>
        </div>
      </div>
    )
  }

  // ─── PROFILE FORM ─────────────────────────────────────────────────────────
  if (page === PAGES.PROFILE) return (
    <div style={{fontFamily:"system-ui,'Segoe UI',sans-serif",maxWidth:720,margin:"0 auto",background:P.white,minHeight:"100vh",color:P.ink}}>
      <Header onHome={goHome} onBack={()=>navigate(workflowMode==="collab" ? (manualWfLink ? PAGES.JOIN_MANUAL : PAGES.JOIN) : PAGES.LANDING)}/>
      <div style={{maxWidth:480,margin:"40px auto",padding:"0 22px 40px"}}>
        <div style={{marginBottom:28}}>
          <div style={{fontSize:12,fontWeight:700,color:P.muted,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:6}}>Step 1 of 3</div>
          {workflowMode==="collab" && workflowId && (
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,background:P.soft,border:`1px solid ${P.border}`,borderRadius:8,padding:"8px 12px"}}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" style={{flexShrink:0}}>
                <path d="M10 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM5 8a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm10 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" stroke={P.navy} strokeWidth="1.5"/>
              </svg>
              <span style={{fontSize:12,fontWeight:600,color:P.navy}}>Workflow: {workflowId}</span>
              <button onClick={()=>copyLink(workflowId)} style={{marginLeft:"auto",fontSize:11,color:P.muted,background:"none",border:"none",cursor:"pointer",padding:"2px 6px"}}>
                {linkCopied?"✓ Copied":"Copy number"}
              </button>
            </div>
          )}
          <h2 style={{fontSize:20,fontWeight:800,color:P.navy,margin:"0 0 6px"}}>Tell us a little about yourself</h2>
          <p style={{fontSize:14,color:P.muted,margin:0,lineHeight:1.6}}>Takes 30 seconds. Your details help contextualise your results.</p>
        </div>

        <Field label="Work email" required error={profileErrors.email}>
          <input type="email" value={profile.email}
            onChange={e=>setProfile(p=>({...p,email:e.target.value}))}
            placeholder="you@company.com"
            style={{...inputStyle,borderColor:profileErrors.email?"#9B1D00":P.border}}/>
        </Field>

        <Field label="Company name" required error={profileErrors.company}>
          <input type="text" value={profile.company}
            onChange={e=>setProfile(p=>({...p,company:e.target.value}))}
            placeholder="e.g. Acme Corp"
            style={{...inputStyle,borderColor:profileErrors.company?"#9B1D00":P.border}}/>
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
          />
        </Field>

        <Field label="Company size" required error={profileErrors.companySize}>
          <select
            value={profile.companySize}
            onChange={e=>setProfile(p=>({...p,companySize:e.target.value}))}
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
    <div style={{fontFamily:"system-ui,'Segoe UI',sans-serif",maxWidth:720,margin:"0 auto",background:P.white,minHeight:"100vh",color:P.ink}}>
      <Header onHome={goHome} onBack={()=>navigate(PAGES.PROFILE)}/>
      <div style={{maxWidth:480,margin:"50px auto",padding:"0 22px"}}>
        <div style={{fontSize:12,fontWeight:700,color:P.muted,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:6}}>Step 2 of 3</div>
        {workflowMode==="collab" && workflowId && (
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16,background:P.soft,border:`1px solid ${P.border}`,borderRadius:8,padding:"8px 12px"}}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" style={{flexShrink:0}}>
              <path d="M10 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM5 8a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm10 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" stroke={P.navy} strokeWidth="1.5"/>
            </svg>
            <span style={{fontSize:12,fontWeight:600,color:P.navy}}>Workflow: {workflowId}</span>
            <button onClick={()=>copyLink(workflowId)} style={{marginLeft:"auto",fontSize:11,color:P.muted,background:"none",border:"none",cursor:"pointer",padding:"2px 6px"}}>
              {linkCopied?"✓ Copied":"Copy number"}
            </button>
          </div>
        )}
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
          onClick={async ()=>{
            setCurrentQ(0)
            setResponses(new Array(TOTAL_Q).fill(null))
            assessmentStartTime.current = Date.now()   // ← timer starts here
            // If workflow owner (not joining), create the workflow session in Supabase now
            if (workflowMode==="collab" && workflowId && !joiningWf) {
              await sb.createWorkflow(workflowId, profile.email.trim().toLowerCase(), processName === "Other" ? (processNameOther.trim() || "Other") : processName)
            }
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
      <div style={{fontFamily:"system-ui,'Segoe UI',sans-serif",maxWidth:720,margin:"0 auto",background:P.white,minHeight:"100vh",color:P.ink}}>
        <Header
          onHome={goHome}
          onBack={()=>currentQ===0?navigate(PAGES.SETUP):goPrev()}
          right={<>
            <Btn small onClick={()=>setShowReview(true)}>
              Review
              {answered < TOTAL_Q && (
                <span style={{background:P.navy,color:"#fff",fontSize:10,fontWeight:800,
                  padding:"1px 5px",borderRadius:10,marginLeft:2}}>{TOTAL_Q-answered}</span>
              )}
            </Btn>
            {allAnswered && (
              <Btn small primary onClick={doSubmit} disabled={submitting}>
                {submitting?"Saving…":"See results →"}
              </Btn>
            )}
          </>}
        />

        <DimBar currentQ={currentQ} responses={responses}/>

        <div style={{height:3,background:P.border}}>
          <div style={{height:"100%",width:`${progress}%`,background:P.navy,transition:"width 0.4s"}}/>
        </div>

        <div style={{padding:"20px 22px",maxWidth:560,margin:"0 auto"}}>
          <div style={{fontSize:11,fontWeight:700,color:P.muted,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:12}}>
            Step 3 of 3 — Assessment
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

  // ─── REPORT ───────────────────────────────────────────────────────────────
  if (page === PAGES.REPORT) {
    const lvl = minScore ? LEVEL_META[minScore] : LEVEL_META[1]

    return (
      <div style={{fontFamily:"system-ui,'Segoe UI',sans-serif",maxWidth:720,margin:"0 auto",background:P.white,minHeight:"100vh",color:P.ink}}>
        <Header
          onHome={goHome}
          onBack={()=>navigate(PAGES.ASSESSMENT)}
          right={<>
            <Btn small onClick={()=>setShowReview(true)}>Review</Btn>
            <Btn small onClick={()=>navigate(PAGES.ASSESSMENT)}>Edit answers</Btn>
          </>}
        />

        <div style={{padding:"22px"}}>

          {/* Overall result banner */}
          <div style={{background:lvl.bg,border:`1.5px solid ${lvl.border}`,borderRadius:10,padding:"16px 18px",marginBottom:14}}>
            {effectiveProcess && (
              <p style={{fontSize:12,color:P.muted,margin:"0 0 8px",fontWeight:600}}>
                Process assessed: <span style={{color:P.navy}}>{effectiveProcess}</span>
              </p>
            )}
            <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:8}}>
              <span style={{background:lvl.color,color:"#fff",fontWeight:800,fontSize:12,padding:"4px 13px",borderRadius:20}}>
                Level {minScore} — {lvl.name}
              </span>
              <span style={{fontSize:12,color:P.muted}}>
                Avg: {avgScore.toFixed(1)}/5 · {answered}/{TOTAL_Q} answered
              </span>
            </div>
            <p style={{fontSize:13,lineHeight:1.65,color:P.ink,margin:0}}>{lvl.desc}</p>
          </div>

          {/* Workflow members panel (only in collab mode) */}
          {workflowMode==="collab" && workflowId && (
            <div style={{...card,marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
                <div>
                  <p style={{fontSize:11,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",color:P.muted,margin:"0 0 2px"}}>
                    Workflow responses
                  </p>
                  <p style={{fontSize:12,color:P.muted,margin:0}}>Workflow: <strong style={{color:P.navy}}>{workflowId}</strong></p>
                </div>
                <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                  <Btn small onClick={()=>copyWorkflowNumber(workflowId)}>{linkCopied?"✓ Copied!":"📋 Copy workflow number"}</Btn>
                  <Btn small onClick={()=>refreshWorkflowMembers()}>↻ Refresh</Btn>
                </div>
              </div>

              {workflowMembers.length === 0 ? (
                <p style={{fontSize:13,color:P.muted,margin:0}}>No other responses yet. Share the link above to invite colleagues.</p>
              ) : (
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {workflowMembers.map((m,i) => (
                    <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:7,border:`1px solid ${P.border}`,background:P.surface}}>
                      <div style={{width:30,height:30,borderRadius:"50%",background:P.navy,color:"#fff",fontSize:12,fontWeight:800,
                        display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        {m.email?.[0]?.toUpperCase() || "?"}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <p style={{fontSize:12,fontWeight:600,color:P.ink,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.email}</p>
                        <p style={{fontSize:11,color:P.muted,margin:0}}>
                          {m.completed ? `Avg: ${parseFloat(m.avg_score).toFixed(1)}/5 · Min: ${m.min_score}/5` : "In progress"}
                        </p>
                      </div>
                      <span style={{
                        fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:12,
                        background:m.completed?P.navy:P.border,color:m.completed?"#fff":P.muted,
                        whiteSpace:"nowrap",flexShrink:0,
                      }}>{m.completed?"✓ Done":"Pending"}</span>
                    </div>
                  ))}
                  <p style={{fontSize:11,color:P.muted,margin:"4px 0 0",textAlign:"right"}}>
                    {workflowMembers.length}/5 members responded
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Dimension score bars */}
          <div style={{...card,marginBottom:14}}>
            <p style={{fontSize:11,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",color:P.muted,marginBottom:12}}>
              Score by dimension
            </p>
            {ALL_DIMS.map(attr => {
              const d   = dimData[attr]
              const pct = Math.round(d.avg/5*100)
              const m   = ATTR_META[attr]
              return (
                <div key={attr} style={{marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{width:7,height:7,borderRadius:"50%",background:m.color}}/>
                      <span style={{fontSize:12,fontWeight:600,color:P.ink}}>{attr}</span>
                    </div>
                    <span style={{fontSize:12,fontWeight:700,color:P.navy}}>
                      {d.count > 0 ? d.avg.toFixed(1) : "—"}
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
            <p style={{fontSize:12,color:P.muted,margin:"0 0 16px",lineHeight:1.6}}>
              Each summary below reflects the area of greatest concern identified within that dimension — based on the lowest-scoring response you provided.
            </p>

            {ALL_DIMS.map(attr => {
              const summary = getDimSummary(attr)
              const m       = ATTR_META[attr]
              const d       = dimData[attr]
              if (!summary) return null
              return (
                <div key={attr} style={{
                  marginBottom:16,
                  padding:"14px 16px",
                  borderRadius:8,
                  border:`1px solid ${P.border}`,
                  background:P.surface,
                }}>
                  {/* Dimension header */}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:700,
                        letterSpacing:"0.06em",padding:"3px 10px",borderRadius:20,textTransform:"uppercase",
                        background:m.bg,color:m.color,border:`1px solid ${m.color}30`}}>
                        <span style={{fontSize:9,fontWeight:800,opacity:0.65}}>{m.label}</span>{attr}
                      </span>
                      <span style={{fontSize:11,color:P.muted}}>avg {d.avg.toFixed(1)}/5</span>
                    </div>
                    {/* Lowest score badge */}
                    <span style={{
                      fontSize:11,fontWeight:700,
                      padding:"3px 10px",borderRadius:20,
                      background:P.navy,color:"#fff",
                    }}>
                      Lowest score: {summary.score}/5 — {LEVEL_META[summary.score]?.name}
                    </span>
                  </div>

                  {/* The assessment statement for the lowest-scored question */}
                  <p style={{
                    fontSize:13,lineHeight:1.7,color:P.ink,
                    margin:0,fontStyle:"normal",
                  }}>
                    {summary.statement}
                  </p>
                </div>
              )
            })}
          </div>

          {/* ── LLM Consultant Insights ───────────────────────────────────────── */}
          <div style={{...card, marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10,marginBottom:12}}>
              <div>
                <p style={{fontSize:11,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",color:P.muted,margin:"0 0 2px"}}>
                  Consultant Commentary
                </p>
                <p style={{fontSize:12,color:P.muted,margin:0,lineHeight:1.5}}>
                  AI-generated analysis personalised to your assessment responses.
                </p>
              </div>
              {!llmInsights.loading && llmInsights.error !== "daily_limit" && (
                <button
                  onClick={generateInsights}
                  style={{background:"none",border:"none",cursor:"pointer",padding:0,fontSize:11,fontWeight:600,color:P.muted,fontFamily:"inherit"}}
                >
                  ↺ Regenerate
                </button>
              )}
            </div>

            {llmInsights.loading && (
              <div style={{padding:"24px 0",textAlign:"center"}}>
                <div style={{display:"inline-block",width:20,height:20,border:`3px solid ${P.border}`,borderTopColor:P.navy,borderRadius:"50%",animation:"spin 0.8s linear infinite",marginBottom:10}}/>
                <p style={{fontSize:13,color:P.muted,margin:0}}>Generating your personalised commentary…</p>
              </div>
            )}

            {llmInsights.error && (
              <div style={{padding:"12px 14px",borderRadius:7,background: llmInsights.error === "daily_limit" ? "#FFFBEB" : "#FEF2F2", border:`1px solid ${llmInsights.error === "daily_limit" ? "#FCD34D" : "#FECACA"}`,fontSize:13,color: llmInsights.error === "daily_limit" ? "#92400E" : "#991B1B"}}>
                {llmInsights.error === "daily_limit" ? (
                  <span>⚠ You have reached the daily limit for AI commentary (3 per day). Your commentary will be available again tomorrow. The rest of your report is unaffected.</span>
                ) : (
                  <span style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                    <span>Unable to generate insights. Please try again.</span>
                    <button onClick={generateInsights} style={{fontSize:11,color:"#1B2B3A",fontWeight:600,background:"none",border:"none",cursor:"pointer",padding:0,fontFamily:"inherit",flexShrink:0}}>
                      Retry →
                    </button>
                  </span>
                )}
              </div>
            )}

            {llmInsights.text && (
              <div style={{
                fontSize:13,lineHeight:1.85,color:P.ink,
                background:P.surface,borderRadius:8,padding:"16px 18px",
                border:`1px solid ${P.border}`,
                whiteSpace:"pre-wrap",
              }}>
                {llmInsights.text}
              </div>
            )}
          </div>

          {/* ── PDF Download — gated behind feedback ─────────────────────────── */}
          <div style={{...card, marginBottom:14, background: P.navy}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
              <div>
                <p style={{fontSize:12,fontWeight:700,color:"#fff",margin:"0 0 2px"}}>Download Full Report (PDF)</p>
                <p style={{fontSize:11,color:"rgba(255,255,255,0.65)",margin:0,lineHeight:1.5}}>
                  Includes your scores, all responses, and dimension summaries.
                </p>
              </div>
              <Btn
                small
                onClick={() => setFeedbackModal(f => ({...f, open:true}))}
                style={{background:"#fff",color:P.navy,border:"none",fontWeight:700,flexShrink:0}}
              >
                ⬇ Download PDF
              </Btn>
            </div>
          </div>

          {/* ── Feedback Modal ────────────────────────────────────────────────── */}
          {feedbackModal.open && (
            <div
              style={{position:"fixed",inset:0,background:"rgba(15,35,64,0.55)",zIndex:60,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}
              onClick={() => !feedbackModal.submitting && setFeedbackModal(f => ({...f, open:false}))}
            >
              <div onClick={e => e.stopPropagation()} style={{background:P.white,borderRadius:14,padding:"28px 28px 24px",width:"100%",maxWidth:440,boxShadow:"0 12px 40px rgba(0,0,0,0.18)"}}>
                {feedbackModal.submitted ? (
                  <div style={{textAlign:"center",padding:"8px 0 4px"}}>
                    <div style={{fontSize:36,marginBottom:10}}>🙏</div>
                    <p style={{fontSize:16,fontWeight:700,color:P.navy,margin:"0 0 6px"}}>Thank you for your feedback!</p>
                    <p style={{fontSize:13,color:P.muted,margin:"0 0 20px",lineHeight:1.5}}>Your PDF report is now downloading.</p>
                    <Btn primary small onClick={() => { setFeedbackModal(f => ({...f, open:false})); downloadPdf() }}>
                      ⬇ Download PDF now
                    </Btn>
                  </div>
                ) : (
                  <>
                    <p style={{fontSize:15,fontWeight:700,color:P.navy,margin:"0 0 4px"}}>Before you download…</p>
                    <p style={{fontSize:13,color:P.muted,margin:"0 0 18px",lineHeight:1.5}}>
                      How useful was this assessment? Takes 10 seconds — your feedback genuinely helps us improve.
                    </p>

                    {/* Stars */}
                    <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:14}}>
                      {[1,2,3,4,5].map(star => {
                        const filled = star <= (feedbackModal.hovered || feedbackModal.rating)
                        return (
                          <button key={star}
                            onClick={() => setFeedbackModal(f => ({...f, rating:star}))}
                            onMouseEnter={() => setFeedbackModal(f => ({...f, hovered:star}))}
                            onMouseLeave={() => setFeedbackModal(f => ({...f, hovered:0}))}
                            style={{background:"none",border:"none",cursor:"pointer",padding:"2px 3px",fontSize:34,lineHeight:1,color:filled?"#F59E0B":"#D1D5DB",transition:"color 0.1s,transform 0.1s",transform:filled?"scale(1.18)":"scale(1)"}}
                            aria-label={`${star} star`}
                          >★</button>
                        )
                      })}
                      {feedbackModal.rating > 0 && (
                        <span style={{fontSize:12,fontWeight:600,color:P.muted,marginLeft:6}}>
                          {["","Poor","Fair","Good","Great","Excellent"][feedbackModal.rating]}
                        </span>
                      )}
                    </div>

                    {/* Comment box */}
                    <textarea
                      value={feedbackModal.comment}
                      onChange={e => setFeedbackModal(f => ({...f, comment:e.target.value}))}
                      placeholder="Any comments or suggestions? (optional)"
                      rows={3}
                      style={{width:"100%",padding:"10px 12px",borderRadius:8,border:`1.5px solid ${P.border}`,fontSize:13,fontFamily:"inherit",boxSizing:"border-box",outline:"none",background:P.white,color:P.ink,resize:"vertical",marginBottom:16}}
                    />

                    <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                      <Btn small onClick={() => { downloadPdf(); setFeedbackModal(f => ({...f, open:false})) }}>
                        Skip &amp; Download
                      </Btn>
                      <Btn primary small
                        disabled={feedbackModal.rating === 0 || feedbackModal.submitting}
                        onClick={async () => {
                          setFeedbackModal(f => ({...f, submitting:true}))
                          await sb.saveFeedback({
                            email:       profile.email,
                            processName: effectiveProcess,
                            rating:      feedbackModal.rating,
                            comment:     feedbackModal.comment,
                          })
                          setFeedbackModal(f => ({...f, submitting:false, submitted:true}))
                          downloadPdf()
                        }}
                      >
                        {feedbackModal.submitting ? "Saving…" : "Submit & Download"}
                      </Btn>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

          {/* Start again */}
          <div style={{textAlign:"center",paddingTop:4}}>
            <Btn small onClick={()=>{
              setResponses(new Array(TOTAL_Q).fill(null))
              setCurrentQ(0)
              setProcessName("")
              setProcessNameOther("")
              setProfile({email:"",company:"",jobFunction:"",jobFunctionOther:"",industry:"",industryOther:"",companySize:"",region:""})
              setWorkflowId("")
              setWorkflowMode("solo")
              setWorkflowMembers([])
              setJoiningWf(null)
              setJoinEmail("")
              setManualWfLink("")
              setFeedbackModal({ open:false, rating:0, hovered:0, comment:"", submitting:false, submitted:false })
              assessmentStartTime.current = null
              navigate(PAGES.LANDING)
            }}>↺ Start a new assessment</Btn>
          </div>
        </div>

        <footer style={{padding:"18px 22px",borderTop:`1px solid ${P.border}`,textAlign:"center",fontSize:11,color:P.muted,lineHeight:1.9}}>
          &copy; {CY} AnalyzerBPM&#8482;. All rights reserved. Unauthorised reproduction or commercial use is prohibited.<br/>
          AnalyzerBPM&#8482; framework, assessment structure, and scoring methodology are protected intellectual property.<br/>
          <span style={{color:P.navy}}>hello@analyzerbpm.com</span>
        </footer>

        {showReview && <ReviewPanel responses={responses} onJump={jumpTo} onClose={()=>setShowReview(false)}/>}
        <Toast show={toast.show} msg={toast.msg}/>
      </div>
    )
  }

  return null
}
