# PlotArmour Studio: hackathon suitability

Assessment date: 17 October 2026. This is a read-only project assessment and proposal; no product functionality was changed or demonstrated.

## Evidence and limits

- Local portfolio source: `/Users/naksh/Downloads/plotarmour-studio-ayush/src/content/data/ventures.ts`. It lists Keystone, VEDA, Verity, and Convoke. The first three are labelled in development; Convoke is researching/validation. These content labels do not independently establish implementation maturity.
- Separate implementation inspected: `/Users/naksh/Downloads/verity`. Source includes an LLM tool-calling agent (`src/server/platform/agent-chat.ts`), permission-filtered business tools (`tool-manifest.ts`), and a workflow executor (`workflow.ts`). Relevant test files also exist. No app, database, provider call, or tests were run for this assessment. Deployment readiness remains unknown. The provider comments describe Groq, which is different from Grok.
- The challenge screenshot supplied in the earlier hackathon chat says “Flip the Script”: reverse an assumption behind a familiar process rather than merely improve it. Four teammates and a 10–4 build window came from that chat. Actual time remaining must be established before implementation.
- No official judging weights, submission deadline, sponsor requirements, or pre-existing-code policy were verified. Recommendations about reuse are conditional on that policy. The public Studio URL did not load through the browsing tool; conclusions use the local checkout.
- FOLLOW is the previously selected direction. These alternatives are a comparison, not a decision to replace it.

## Ranking

Provisional rubric: problem value 25%, demo clarity 25%, feasibility 20%, differentiation 20%, theme fit 10%. Each dimension is scored 1–5; totals are out of 5 and are subjective decision aids, not probabilities of winning. Feasibility assumes approximately six hours and permission to reuse existing code.

| Proposed adaptation | Problem | Demo | Feasibility | Difference | Theme | Weighted | Confidence |
|---|---:|---:|---:|---:|---:|---:|---|
| Verity: outcome-first operations | 4 | 4 | 4 | 3 | 4 | 3.80 | Medium |
| Convoke: companies apply to builders | 4 | 4 | 3 | 2 | 5 | 3.50 | Medium-low |
| VEDA: start from a failed delivery and work backwards | 4 | 4 | 2 | 2 | 3 | 3.10 | Low-medium |
| Keystone: workers specify acceptable jobs | 4 | 3 | 3 | 2 | 3 | 3.05 | Low-medium |

Verity has a concrete problem, a visible record-changing demo, and inspected implementation assets; differentiation remains the weak point. Convoke offers the most immediately understandable reversal, but requires a new small prototype and a convincing distinction from talent matching. VEDA offers a visual dependency story, but credible production constraints make a short build harder. Keystone has a useful worker-centred premise, but preferences-to-job matching risks appearing incremental.

## Recommended reuse candidate: Verity

**Pitch:** “Tell the business system the result you need; it works backwards, finds what is missing, and brings only the unresolved decisions to you.”

User: a service coordinator trying to complete a job. Existing workaround: inspect multiple records, chase evidence, and navigate forms. Smallest outcome: one job reaches a valid next state, with its blockers and evidence visible.

The reversal must be visible: conventional software makes the person discover and follow its screens; this prototype begins at the desired result and constructs the required questions and actions around it. A chat box that simply navigates existing forms would be insufficient.

Suggested 30-second demo, using an explicitly synthetic service job:

1. Ask: “Get this completed maintenance job ready for invoicing.”
2. Show a compact backward dependency map: invoice readiness depends on completion evidence and approval.
3. Query seeded records and reveal the missing evidence. These relationships must come from explicit demo rules, not invented universal accounting rules.
4. Supply the missing note or approval; show the blocker disappearing and the actual record advancing through the existing action layer.
5. Change the requested outcome and show that the required path changes. This distinguishes the interaction from a recorded sequence.

AI parses varied outcome requests and produces grounded explanations or targeted questions. Explicit rules and existing commands decide which transitions are valid. A deterministic checklist is the simpler baseline: AI must add flexibility in interpreting the request, not merely narrate a fixed checklist.

Must build: one outcome surface, one dependency map, grounded blocker queries, one evidence interaction, and a real state update with its history. Cut: general-purpose workflow generation, new ERP modules, voice, external messaging, autonomous invoicing, and multiple business sectors.

Dependencies: a working local Verity instance, isolated seeded demo tenant, provider credentials or a tested compatible local model, and mapped queries/commands. Model costs and available credits were not verified. Existing provider configuration is not proof that credentials work.

**First invalidation experiment: 30 minutes.** Boot Verity and complete one query → missing-evidence resolution → valid state-transition sequence with existing actions. If this fails because setup or integration is too heavy, the reuse advantage is unproven. Do not spend the hackathon repairing the whole platform.

Approximate six-hour milestones: 0–0.5h dependency experiment; 0.5–2h narrow outcome controller and seeded scenario; 2–4h interactive map and action integration; 4–5h paraphrases, changed goals, and failure handling; final hour rehearsal and submission. Rebase to actual time remaining.

Fallback: a clearly labelled standalone synthetic-data prototype, with a genuinely working rule engine and AI interpretation. If no model can run, a deterministic interface is a workflow prototype, not a demonstrated AI feature. Existing FOLLOW remains the preferred default if a pivot would consume time already invested there.

## Runner-up: Convoke

**Pitch:** “You show the work you can do; companies explain why their opportunity deserves you.”

User: an early-career builder. Workaround: repeatedly tailor applications and CVs. Demo: submit one project artifact plus preferences, compare three synthetic opportunities, and inspect evidence for why each qualifies or fails. AI reads the artifact and opportunity briefs; explicit preferences filter results. Do not fabricate real employer interest or send applications.

Use a pasted artifact or user-selected files rather than making GitHub permissions a critical dependency. Build one artifact view, three opportunity briefs, evidence-linked comparisons, and an editable preference. Cut the marketplace, accounts, employer outreach, and automated hiring decisions. First test: whether five materially different preferences produce sensible changes supported by the supplied evidence. Fallback: curated skill tags with openly disclosed manual annotation.

This is a clear thematic reversal, but employer-side AI sourcing already exists. Its distinction must be companies demonstrating suitability to the builder, not ordinary AI candidate ranking. [Handshake’s official sourcing update](https://updates.joinhandshake.com/announcements/handshake-employer-product-updates-february-10-2026).

## Other candidates

**VEDA:** start with a missed dispatch or defective batch and trace backwards through a small, synthetic production dependency graph. For a production coordinator, the value is finding one actionable cause rather than browsing logs. AI interprets a question and explains retrieved evidence; deterministic constraints calculate feasibility. Demo: introduce a failed quality check and watch the downstream dispatch become blocked, then inspect its causes. Build one product, a few operations and one disruption. Do not claim to diagnose arbitrary factories or optimise an entire plant. Main dependency: credible process data. First test: a hand-checked disruption must propagate correctly. Fallback: a disclosed authored graph. AI-assisted frontline operations is established; Tulip already documents data and document assistance, so a generic manufacturing copilot is weak differentiation. [Official Tulip AI widget documentation](https://support.tulip.co/docs/ai-chat-widget).

**Keystone:** workers set acceptable shift, location and pay conditions; opportunities must demonstrate compatibility. For a contract worker, this reduces repeated screening of unsuitable listings. Demo: edit a shift constraint and see a synthetic opportunity become ineligible with an evidence-linked explanation. AI extracts conditions from job text; explicit matching rules enforce them. Build three listings and a preference card. Avoid payroll, legal compliance determinations and a real staffing marketplace. Main dependency: sufficiently specific listing data. First test: ambiguous or missing conditions must remain unknown rather than become assumed matches. Fallback: structured sample listings. This overlaps Convoke and is less visually distinctive for this event.

## Decision

Verity is the strongest candidate for reusing inspected code; Convoke is the strongest simple role reversal. Neither has demonstrated a decisive advantage over the chosen FOLLOW concept. Keep FOLLOW unless the Verity dependency experiment succeeds quickly and the team prefers its business-operations story. Verify the pre-existing-code rule before treating the existing platform as submission-ready work; disclose prior work and identify the hackathon contribution.
