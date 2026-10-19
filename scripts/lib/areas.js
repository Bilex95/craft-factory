// Problem areas the factory draws projects from. Each one names WHO has the
// problem, so every project starts from a person at work, not a technology.
// These are opportunity areas, not quotas: selection favours whichever area
// has gone longest without a project (see pickArea in generate.js).

const AREAS = [
  {
    key: "it-ops",
    label: "IT & technical operations",
    audience: "IT support staff, sysadmins and on-call engineers",
    hint: "Troubleshooting, monitoring, runbooks and documentation, support-ticket workflows, repetitive admin tasks. Examples: group noisy log lines into incident signatures, check certificate expiry across a host list, turn a runbook into a guided checklist.",
  },
  {
    key: "dev-tools",
    label: "Software development",
    audience: "developers and tech leads",
    hint: "Developer tooling, debugging aids, code-quality checks, release workflows. Examples: draft release notes from commit history, find TODOs that are past their date, explain why a cron expression fires when it does.",
  },
  {
    key: "qa-testing",
    label: "QA & software testing",
    audience: "QA engineers, SDETs and developers who own tests",
    hint: "Test management, regression coverage, bug reporting, API testing, practical automation (Playwright, Cypress, node:test). Examples: flag flaky tests across CI runs, turn a bug report into reproducible steps, map tests to requirements.",
  },
  {
    key: "people-ops",
    label: "HR & people operations",
    audience: "HR generalists, recruiters, people managers and new hires",
    hint: "Onboarding, recruitment coordination, employee admin, HR reporting. Examples: build an onboarding plan from a start date, balance interview panels, strip identifying details from CVs for fairer screening. Examples and fixtures must use invented people, never real personal data.",
  },
  {
    key: "ai-automation",
    label: "AI & workflow automation",
    audience: "teams adopting AI tools and the people who build their automations",
    hint: "Reliable agents, integrations, document processing, human-approved automation. Examples: redact sensitive data before text reaches an AI tool, validate model JSON output against a schema, a review step where a person approves each automated action. The demo must work offline, without paid APIs.",
  },
  {
    key: "business-ops",
    label: "Finance, operations & knowledge work",
    audience: "finance and operations staff, project managers, support agents and knowledge workers",
    hint: "Expense and invoice checks, project tracking, customer-support triage, knowledge management. Examples: check an expense CSV against policy, turn meeting notes into owned action items, find stale pages in a docs export.",
  },
];

const AREA_KEYS = AREAS.map((a) => a.key);

module.exports = { AREAS, AREA_KEYS };
