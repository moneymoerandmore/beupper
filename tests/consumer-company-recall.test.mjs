import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("consumer listed-company signals have an independent, non-whitelist recall lane", async () => {
  const taxonomy = await read("app/topic-taxonomy.ts");
  assert.match(taxonomy, /key: "consumer_company_signals"/);
  assert.match(taxonomy, /同店.*客流.*翻台率.*门店/);
  assert.match(taxonomy, /餐饮.*食品饮料.*零售.*旅游酒店.*服饰美妆.*家电汽车.*潮玩影视/);
});

test("consumer operating facts survive standardization and expose a full funnel", async () => {
  const route = await read("app/api/baidu-websearch/route.ts");
  const semantic = await read("app/hotspot-semantic.ts");
  const panel = await read("app/baidu-source-panel.tsx");
  assert.match(route, /const consumerCompanyPattern/);
  assert.match(route, /function isConsumerCompanyEvent/);
  assert.match(route, /consumerCompanyFunnel/);
  assert.match(route, /audienceQualified/);
  assert.match(route, /specificCompanyEntities/);
  assert.match(route, /qualifiedEvents/);
  assert.match(route, /selectedTopics/);
  assert.match(panel, /消费个股漏斗/);
  assert.match(panel, /合格消费事件/);
  assert.match(panel, /消费选题落位/);
  assert.match(semantic, /不得被吞进抽象的“消费复苏”/);
});

test("consumer top-five protection still requires freshness and verified attention", async () => {
  const route = await read("app/api/baidu-websearch/route.ts");
  assert.match(route, /topic\.isConsumerCompany && topic\.verifiedAudienceSignal && topic\.ageHours <= 24 && topic\.investorProximity >= 60/);
  assert.doesNotMatch(route, /海底捞|泡泡玛特|特斯拉|小米/);
});
