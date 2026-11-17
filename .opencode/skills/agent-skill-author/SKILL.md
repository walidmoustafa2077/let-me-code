---
name: agent-skill-author
description: Author, validate, and format new OpenCode SKILL.md files following factory standards.
---
# Agent Skill Author
## Structure
- One directory per skill at `.opencode/skills/<name>/SKILL.md`.
- The directory name MUST equal the frontmatter `name` property exactly.
- Required frontmatter: `name` and `description`, delimited by `---` on their own lines.
## Naming
- `name`: lowercase, hyphen-separated, no spaces or underscores; matches the directory.
- `description`: one sentence, imperative, states what the skill does and when to use it.
## Content
- Start with a single `# Title` heading after the frontmatter.
- Use concise, actionable bullets; no fluff, no duplicated rules.
- Reference real tools and paths that exist in this repo.
- Keep it short — a skill is instructions, not documentation.
## Validation
- Confirm the directory name equals `name` for every skill.
- Confirm YAML parses and both required keys are present and non-empty.
- Confirm no skill name collides with another.
