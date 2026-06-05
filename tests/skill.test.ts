import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const claudeSkillPath = "plugins/claude-code/skills/halttrace-dump-analysis/SKILL.md";
const codexSkillPath = "plugins/codex/skills/halttrace-dump-analysis/SKILL.md";

test("packaged HaltTrace dump-analysis skills stay in sync and include goal recovery workflow", async () => {
  const claudeSkill = await readFile(claudeSkillPath, "utf8");
  const codexSkill = await readFile(codexSkillPath, "utf8");

  assert.equal(codexSkill, claudeSkill);
  assert.match(claudeSkill, /goal-mode recovery plan/);
  assert.match(claudeSkill, /create or update one goal/i);
  assert.match(claudeSkill, /halttrace:explain <dump>/);
  assert.match(claudeSkill, /otherwise run `halttrace explain <dump>`/);
  assert.match(claudeSkill, /halttrace:doctor <dump>/);
  assert.match(claudeSkill, /Omit `<dump>` to read the latest matching dump\./);
  assert.match(claudeSkill, /# HaltTrace Recovery Plan/);
  assert.match(claudeSkill, /Do not claim that it repairs code, retries failed actions, approves permissions, denies permissions, mutates hook configuration, or guarantees redaction\./);
});
