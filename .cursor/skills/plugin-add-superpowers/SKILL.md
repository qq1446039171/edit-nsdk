---
name: plugin-add-superpowers
description: Scaffold, configure, and extend the "superpowers" plugin in this repository. Use when the user asks to add skills, hooks, scripts, MCP servers, apps, or other features to the superpowers plugin. Triggers on /plugin-add, /plugin-extend, /plugin-config, or mentions of the superpowers plugin.
---

# Plugin Add: Superpowers

Scaffold and extend the superpowers plugin located at plugins/superpowers/.

## Quick Reference

| Component | Path |
|-----------|------|
| Plugin manifest | plugins/superpowers/.codex-plugin/plugin.json |
| Skills | plugins/superpowers/skills/ |
| Hooks | plugins/superpowers/hooks.json |
| Scripts | plugins/superpowers/scripts/ |
| MCP servers | plugins/superpowers/.mcp.json |
| Apps | plugins/superpowers/.app.json |
| Assets | plugins/superpowers/assets/ |

## Workflow

1. **Read the current state** 鈥?open plugins/superpowers/.codex-plugin/plugin.json and the marketplace entry in .agents/plugins/marketplace.json.
2. **Determine what's missing** using the checklist below.
3. **Scaffold missing components** per the sections that follow.
4. **Update plugin.json** to fill [TODO: ...] placeholders and register new components.
5. **Verify** all referenced files exist and paths in plugin.json are correct.

### Component Checklist

`
plugins/superpowers/
鈹溾攢鈹€ .codex-plugin/plugin.json   鈫?fill all [TODO] placeholders
鈹溾攢鈹€ skills/                     鈫?create if adding agent skills
鈹溾攢鈹€ hooks.json                  鈫?create if adding lifecycle hooks
鈹溾攢鈹€ scripts/                    鈫?create if adding utility scripts
鈹溾攢鈹€ .mcp.json                   鈫?create if adding MCP servers
鈹溾攢鈹€ .app.json                   鈫?create if adding apps
鈹斺攢鈹€ assets/                     鈫?create if adding icons/logo
`

## Adding Skills

Skills are directories with a SKILL.md file. Place under plugins/superpowers/skills/<skill-name>/.

For each skill directory:
- Create SKILL.md with YAML frontmatter (
ame, description) and markdown body
- Optionally add eference.md, examples.md, or scripts/ subdirectories

After creating skills, update plugin.json to ensure "skills" points to "./skills/".

## Adding Hooks

Hooks are defined in plugins/superpowers/hooks.json. Create the file if it doesn't exist:

`json
{
  "hooks": [
    {
      "event": "onStartup",
      "action": "script:scripts/onStartup.js"
    }
  ]
}
`

Supported events: onStartup, onMessage, onAgentStart, onAgentEnd, onToolCall.

## Adding Scripts

Place scripts under plugins/superpowers/scripts/. Use forward-slash paths.

## Adding MCP Servers

Define MCP servers in plugins/superpowers/.mcp.json:

`json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "@some/mcp-package"]
    }
  }
}
`

## Adding Apps

Define apps in plugins/superpowers/.app.json:

`json
{
  "apps": [
    {
      "name": "My App",
      "command": "node",
      "args": ["scripts/app.js"]
    }
  ]
}
`

## Updating plugin.json

Fill every [TODO: ...] placeholder:

- description 鈥?brief plugin summary
- uthor.name, uthor.email, uthor.url
- homepage, epository
- interface.shortDescription 鈥?subtitle text
- interface.longDescription 鈥?detail page text
- interface.developerName
- interface.websiteURL, interface.privacyPolicyURL, interface.termsOfServiceURL
- interface.defaultPrompt 鈥?array of 1-3 starter prompts
- interface.brandColor 鈥?hex color for UI
- interface.composerIcon, interface.logo 鈥?paths to assets (create ssets/ if needed)
- interface.screenshots 鈥?array of screenshot paths

Only keep skills, hooks, mcpServers, pps fields in plugin.json if the corresponding files/directories actually exist.

## Marketplace

The marketplace entry in .agents/plugins/marketplace.json is already configured for superpowers. Update the [TODO: marketplace-name] and [TODO: Marketplace Display Name] placeholders if not already done.

For full plugin.json schema details, see [reference.md](reference.md).
For usage examples, see [examples.md](examples.md).
