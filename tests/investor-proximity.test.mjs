import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("topic scoring includes grounded investor proximity", () => {
  const semantic = read("app/hotspot-semantic.ts");
  assert.match(semantic, /investorProximity: number/);
  assert.match(semantic, /topic\.investorProximity \* 0\.08/);
  assert.match(semantic, /知名度、市值和品牌曝光不能单独构成高分/);
});

test("company preference has evidence gates and no fixed company whitelist", () => {
  const route = read("app/api/baidu-websearch/route.ts");
  assert.match(route, /isSingleCompanyCatalyst && topic\.verifiedAudienceSignal && topic\.ageHours <= 24/);
  assert.match(route, /desiredCompanyTopFive = Math\.min\(2/);
  const skill = read("skills/discover-financial-topics/SKILL.md");
  assert.match(skill, /不得建立固定公司白名单/);
  assert.match(skill, /24小时内新动作、可验证关注信号、具体上市公司实体/);
});
