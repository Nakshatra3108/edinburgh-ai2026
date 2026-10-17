# Installed hackathon toolkit

Installed on 16 October 2026 as personal Codex skills and agent profiles, usable across projects. Existing skills were preserved.

## Hackathon workflows

| Skill | Purpose |
| --- | --- |
| `hackathon-strategy` | Generate ideas, verify event rules, compare differentiation, and rank against the rubric |
| `hackathon-sprint` | Test critical dependencies, build an MVP, rehearse the demo, and prepare submission artifacts |
| `hackathon-pitch` | Write a timed pitch, demo script, submission copy, and judge Q&A |
| `hackathon-team` | Coordinate independent specialist subagents and integrate their results |

These four skills were authored locally for this setup. Their definitions live in `/Users/naksh/.codex/skills/`, one directory per skill. Their frontmatter and UI metadata passed the bundled skill validator.

## Supporting skills

| Skill | Source | Purpose |
| --- | --- | --- |
| `brainstorm-ideas-new` | [phuryn/pm-skills](https://github.com/phuryn/pm-skills/tree/main/pm-product-discovery/skills/brainstorm-ideas-new) | Product, design, and engineering perspectives on new ideas |
| `webapp-testing` | [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills/webapp-testing) | Test local application behavior with Playwright |
| `mcp-builder` | [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills/mcp-builder) | Build MCP integrations and tools |
| `chatgpt-apps` | [openai/skills](https://github.com/openai/skills/tree/main/skills/.curated/chatgpt-apps) | Build ChatGPT app integrations |
| `jupyter-notebook` | [openai/skills](https://github.com/openai/skills/tree/main/skills/.curated/jupyter-notebook) | Experiments, data analysis, and prototypes |
| `gh-fix-ci` | [openai/skills](https://github.com/openai/skills/tree/main/skills/.curated/gh-fix-ci) | Diagnose GitHub Actions failures |
| `security-best-practices` | [openai/skills](https://github.com/openai/skills/tree/main/skills/.curated/security-best-practices) | Review supported stacks for relevant security issues |

These seven skills were installed from their upstream repositories using the Codex skill installer. Dependencies and service credentials are task-specific and were not installed or provisioned as part of this setup.

Existing design, React, deployment, presentations, documents, and image generation skills complement this toolkit.

## Specialist subagents

Six personal TOML profiles are saved under `/Users/naksh/.codex/agents/`:

- `hackathon-strategist`: idea selection and rubric fit.
- `hackathon-researcher`: official rules, competitors, API access, and data.
- `hackathon-architect`: critical dependency, minimal architecture, and interfaces.
- `hackathon-builder`: bounded implementation and verification.
- `hackathon-judge`: independent demo and submission assessment.
- `hackathon-pitch-coach`: timed storytelling and judge answers.

Each profile passed TOML parsing and required-field checks. Profiles inherit the parent model and permissions. No global model, permission, or concurrency settings were changed. Live spawning with these profiles has not been tested in this session.

Profiles use the personal agent format documented in [OpenAI's subagent documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents). If the current runtime does not expose custom profile selection, `hackathon-team` instructs the parent to pass the corresponding profile instructions to an ordinary subagent.

## Example requests

Skills become available on your next turn. If a newly saved profile is not discovered in an existing chat, start a fresh local chat.

```text
Use $hackathon-strategy to propose and rank ideas for this event: [event link].
Our team has [skills], [team size] people, and [hours] hours.
```

```text
Use $hackathon-team with researcher and strategist subagents to compare ideas.
Wait for both, then recommend a direction grounded in the event rubric.
```

```text
Use $hackathon-sprint to turn our chosen idea into a working demo before [deadline].
```

```text
Use $hackathon-pitch and a judge subagent to rehearse our three-minute demo.
```

Idea scores guide decisions; they do not establish probabilities of winning. Event rules and demonstrated functionality take priority over generic advice.
