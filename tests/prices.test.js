// Checks every approved price, on the booking page and on the server. Run: node tests/prices.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'Code.gs'), 'utf8');

const LENGTHS = ['30 min', '1 Hour', '2 Hours', 'Half Day', 'Full Day', 'Weekend (2 days)', 'Week (7 days)'];
const APPROVED = {
  SUP: [25, 40, 65, 80, 120, 220, 520],
  KAY2: [30, 50, 85, 110, 160, 290, 690],
  SNK: [10, 15, 25, 40, 55, 100, 230],
  FLT: [10, 15, 25, 30, 45, 80, 180],
  KAY: [25, 35, 60, 75, 110, 200, 470],
  // not on the approved list: kept at their old prices, by the owner's decision
  FLC: [null, 10, null, null, 20, 35, 90],
  BPG: [null, 8, null, null, 15, 25, 60],
};
const PACKAGES = { 'Family Package': [285, 340, { SUP: 2, FLT: 1, SNK: 1 }], 'Paddle Board + Snorkel Duo': [195, 230, { SUP: 1, SNK: 2 }], 'Day Rental Combo': [150, 175, { SUP: 1, SNK: 1 }] };

let failed = 0, passed = 0;
const check = (name, ok) => { if (ok) passed++; else { failed++; console.log('FAIL', name); } };

const grab = (name) => Function('"use strict";return ' + page.match(new RegExp('const ' + name + ' = (\\[[\\s\\S]*?\\n\\]);'))[1])();
const GEAR = grab('GEAR'), DURATIONS = grab('DURATIONS'), PAGE_PACKAGES = grab('PACKAGES');
const between = (start, end) => server.slice(server.indexOf(start), server.indexOf(end, server.indexOf(start)));
const ctx = {};
vm.createContext(ctx);
vm.runInContext(between('var PRICES = {', '// Order matters: "paddle games"') + between('var GEAR_BY_NAME', '\n};') + '\n};' + between('function _expectedTotal', 'function _parseBookText') + between('function _missingPrice', '\nfunction _expectedTotal'), ctx);

check('page has all 7 lengths in order', DURATIONS.map((d) => d.label).join() === LENGTHS.join());
for (const [id, prices] of Object.entries(APPROVED)) {
  const g = GEAR.find((x) => x.id === id);
  LENGTHS.forEach((len, i) => {
    const onPage = g[DURATIONS[i].key];
    check(`${id} ${len} page`, (onPage === undefined ? null : onPage) === prices[i]);
    const single = ctx._expectedTotal(g.name, len), triple = ctx._expectedTotal(`${g.name} x3`, len);
    check(`${id} ${len} server`, prices[i] === null ? single === null : single === prices[i] && triple === prices[i] * 3);
    check(`${id} ${len} integer`, prices[i] === null || Number.isInteger(prices[i]));
    check(`${id} ${len} missing flag`, ctx._missingPrice(g.name, len) === (prices[i] === null));
  });
}
for (const [name, [price, standard, uses]] of Object.entries(PACKAGES)) {
  const p = PAGE_PACKAGES.find((x) => x.name === name);
  check(`${name} on page`, p && p.price === price && JSON.stringify(p.uses) === JSON.stringify(uses));
  check(`${name} on server`, ctx._expectedTotal(name, 'Full Day') === price);
  const sum = Object.entries(uses).reduce((n, [id, q]) => n + APPROVED[id][4] * q, 0);
  check(`${name} standard total adds up and is a saving`, sum === standard && price < standard);
}
check('Premium is gone from the page', !PAGE_PACKAGES.some((p) => /premium/i.test(p.name)));
check('older Premium bookings still price-check', ctx._expectedTotal('Premium Paddle + 2 Snorkel Sets', 'Full Day') === 270);
check('mixed gear adds up', ctx._expectedTotal('Paddle Board x2, Snorkel Set x3', 'Half Day') === 80 * 2 + 40 * 3);
check('unknown gear is not priced', ctx._expectedTotal('Jet Ski', '1 Hour') === null);
check('a negative quantity is not priced', ctx._expectedTotal('Paddle Board x-2', '1 Hour') === null);
for (let i = 0; i < 6; i++) for (const id of ['SUP', 'KAY2', 'SNK', 'FLT', 'KAY']) check(`${id} longer never costs less (${LENGTHS[i]})`, APPROVED[id][i + 1] > APPROVED[id][i]);

console.log(`${passed}/${passed + failed} price checks passed`);
process.exit(failed ? 1 : 0);
