import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import test from 'node:test';

// Dependency-free content and behavioral checks. This small DOM adapter models
// only the browser contracts exercised below; visual QA remains a browser task.
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const index = readFileSync(resolve(project, 'dist/index.html'), 'utf8');
const app = readFileSync(resolve(project, 'dist/app.js'), 'utf8');
const expectedIds = [
  'compute-model', 'gpu-architecture', 'memory-hierarchy', 'cuda-model',
  'numerical-precision', 'software-stack', 'pytorch-execution',
  'roofline', 'profiling', 'kernels-triton', 'training-memory', 'input-pipeline',
  'llm-inference', 'inference-optimization', 'linux-debugging',
  'containers-scheduling', 'observability', 'reliability-security',
  'distributed-bridge', 'career-projects'
];

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) {
    result[match[1]] = match[2] ?? '';
  }
  return result;
}

function harness(savedProgress = null) {
  const nodes = new Map();
  const collection = [];
  const events = new Map();
  const storage = new Map(savedProgress === null ? [] : [['gpu-field-guide-progress-v1', savedProgress]]);
  class Element {
    constructor(tag, attrs = {}) {
      this.tagName = tag.toUpperCase();
      this.attrs = attrs;
      this.id = attrs.id || '';
      this.min = attrs.min || '';
      this.step = attrs.step || '';
      this.value = attrs.value || '';
      this.style = {};
      this.dataset = Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith('data-')).map(([k,v]) => [k.slice(5).replace(/-([a-z])/g, (_,c) => c.toUpperCase()),v]));
      this.hidden = 'hidden' in attrs;
      this.textContent = '';
      this.open = false;
      this.classes = new Set((attrs.class || '').split(/\s+/).filter(Boolean));
      this.classList = {
        add: (...values) => values.forEach(v => this.classes.add(v)),
        remove: (...values) => values.forEach(v => this.classes.delete(v)),
        contains: value => this.classes.has(value),
        toggle: (value, force) => {
          const on = force ?? !this.classes.has(value);
          if (on) this.classes.add(value); else this.classes.delete(value);
          return on;
        }
      };
    }
    get validity() {
      if (this.attrs.type !== 'number' || this.value === '') return { valid: true };
      const value = Number(this.value);
      if (!Number.isFinite(value)) return { valid: false };
      if (this.min !== '' && value < Number(this.min)) return { valid: false };
      if (this.attrs.max && value > Number(this.attrs.max)) return { valid: false };
      if (this.step === 'any') return { valid: true };
      // HTML number steps are based on min, then the value attribute, then zero.
      const base = Number(this.min || this.attrs.value || 0);
      const steps = (value - base) / Number(this.step || 1);
      return { valid: Math.abs(steps - Math.round(steps)) < 1e-7 };
    }
    set textContent(value) { this.text = String(value); this.html = ''; }
    get textContent() { return this.text || ''; }
    set innerHTML(value) { this.html = value; this.text = ''; ingest(value); }
    get innerHTML() { return this.html || ''; }
    setAttribute(name, value) { this.attrs[name] = value; }
    removeAttribute(name) { delete this.attrs[name]; }
    addEventListener(name, fn) { this[name] = fn; }
    focus() { document.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    scrollIntoView() { this.scrolled = true; }
  }
  function ingest(html) {
    for (const match of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
      const attrs = attributes(match[2]);
      const node = new Element(match[1], attrs);
      if (node.id) nodes.set(node.id, node);
      collection.push(node);
    }
    for (const match of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
      const id = attributes(match[1]).id;
      if (!id) continue;
      const options = [...match[2].matchAll(/<option\b([^>]*)>/gi)].map(x => attributes(x[1]));
      nodes.get(id).value = (options.find(x => 'selected' in x) || options[0])?.value || '';
    }
  }
  function selectAll(selector) {
    if (selector.startsWith('#')) return nodes.has(selector.slice(1)) ? [nodes.get(selector.slice(1))] : [];
    if (selector.startsWith('.')) return collection.filter(n => n.classes.has(selector.slice(1)));
    const attr = selector.match(/^\[([^\]]+)\]$/)?.[1];
    return attr ? collection.filter(n => attr in n.attrs) : [];
  }
  const document = {
    querySelector: selector => selectAll(selector)[0] || null,
    querySelectorAll: selectAll,
    getElementById: id => nodes.get(id),
    addEventListener: (name, fn) => events.set(name, fn),
    activeElement: { tagName: 'BODY' },
    title: ''
  };
  ingest(index);
  const context = vm.createContext({
    window: { addEventListener() {}, scrollTo() {} }, document,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key,value) => storage.set(key,value) },
    location: { hash: '' }, navigator: { clipboard: { writeText: async () => {} } },
    URL, console, setTimeout: () => 0, clearTimeout() {}, confirm: () => true
  });
  for (const name of ['foundations', 'performance', 'production']) {
    const filename = resolve(project, `dist/data/${name}.js`);
    new vm.Script(readFileSync(filename, 'utf8'), { filename }).runInContext(context);
  }
  new vm.Script(app, { filename: 'app.js' }).runInContext(context);
  const run = expression => vm.runInContext(expression, context);
  return { nodes, document, events, run, context, storage,
    modules: run('modules'),
    route: hash => { context.location.hash = hash; run('render()'); return nodes.get('main').innerHTML; },
    tool: name => { run(`activeTool=${JSON.stringify(name)}`); context.location.hash = '#playground'; run('render()'); }
  };
}

function near(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be approximately ${expected}`);
}
function populated(value, name) {
  assert.equal(typeof value, 'string', name);
  assert.ok(value.trim().length > 0, `${name} must not be empty`);
}

test('the twenty-module curriculum has complete educational content', () => {
  const h = harness();
  assert.deepEqual(Array.from(h.modules, m => m.id), expectedIds);
  assert.equal(new Set(h.modules.map(m => m.id)).size, 20);
  assert.deepEqual(['Foundations', 'Performance', 'Production'].map(g => h.modules.filter(m => m.group === g).length), [7,7,6]);
  for (const m of h.modules) {
    for (const key of ['id','title','summary','group','level']) populated(m[key], `${m.id}.${key}`);
    assert.ok(['Beginner','Intermediate','Advanced'].includes(m.level));
    assert.ok(Number.isInteger(m.minutes) && m.minutes > 0);
    assert.ok(m.tags.length > 0);
    m.tags.forEach(t => populated(t, `${m.id} tag`));
    assert.equal(m.objectives.length, 3);
    m.objectives.forEach(t => populated(t, `${m.id} objective`));
    assert.ok(m.sections.length >= 5 && m.sections.length <= 6);
    m.sections.forEach(s => { populated(s.heading, `${m.id} heading`); populated(s.body, `${m.id} body`); });
    assert.ok(m.sections.map(s => s.body).join(' ').split(/\s+/).length >= 300, `${m.id} has substantive explanations`);
    for (const key of ['title','code','success']) populated(m.lab[key], `${m.id}.lab.${key}`);
    assert.ok(m.lab.steps.length >= 3);
    m.lab.steps.forEach(s => populated(s, `${m.id} lab step`));
    populated(m.quiz.question, `${m.id} quiz`);
    populated(m.quiz.explanation, `${m.id} quiz explanation`);
    assert.equal(m.quiz.choices.length, 4);
    assert.equal(new Set(m.quiz.choices).size, 4);
    assert.ok(Number.isInteger(m.quiz.answer) && m.quiz.answer >= 0 && m.quiz.answer < 4);
    assert.ok(m.sources.length >= 2);
    for (const source of m.sources) {
      populated(source.label, `${m.id} source label`);
      assert.equal(new URL(source.url).protocol, 'https:');
    }
  }
});

test('script loading order and every lesson route resolve to actual content', () => {
  assert.deepEqual([...index.matchAll(/<script src="([^"]+)"/g)].map(x => x[1]), ['data/foundations.js','data/performance.js','data/production.js','app.js']);
  const h = harness();
  for (const m of h.modules) {
    const html = h.route(`#lesson/${m.id}`);
    assert.ok(html.includes('class="lab-box"'), `${m.id} exposes a lab`);
    assert.equal([...html.matchAll(/class="choice"/g)].length, 4);
    assert.ok(h.document.title.includes(m.title));
    for (const match of html.matchAll(/href="#lesson\/([^"]+)"/g)) assert.ok(expectedIds.includes(match[1]));
  }
  assert.match(h.route('#lesson/nonexistent'), /TOPIC NOT FOUND/);
  for (const route of ['#overview','#curriculum','#curriculum/Performance','#playground','#interview','#resources']) {
    assert.ok(h.route(route).length > 500, `${route} contains a usable page`);
  }
});

test('search finds explanations and filtered groups do not leak other lessons', () => {
  const h = harness();
  h.route('#curriculum/Performance');
  const html = h.run('moduleList()');
  assert.equal([...html.matchAll(/class="lesson-row"/g)].length, 7);
  assert.ok(!html.includes('#lesson/compute-model'));
  assert.ok(h.run("modules.filter(m=>matches(m,'checkpointing')).some(m=>m.id==='training-memory')"));
  assert.equal(h.run("modules.filter(m=>matches(m,'unfindable-xyz-948271')).length"), 0);
});

test('progress ignores corrupt or obsolete data and preserves known completion ids', () => {
  assert.equal(harness('not json').run('completed.size'), 0);
  const h = harness('["roofline","roofline","removed-module"]');
  assert.equal(h.run('completed.size'), 1);
  assert.equal(h.nodes.get('progress-count').textContent, '1 / 20');
  h.run("completed.add('llm-inference'); saveProgress()");
  assert.deepEqual(JSON.parse(h.storage.get('gpu-field-guide-progress-v1')), ['roofline','llm-inference']);
});

test('the initial navigation state is selected and skip-to-content preserves a lesson', async () => {
  const h = harness();
  const overview = h.document.querySelectorAll('[data-nav]').find(n => n.dataset.nav === 'overview');
  assert.equal(overview.attrs['aria-current'], 'page');
  h.route('#lesson/roofline');
  const skip = h.document.querySelector('.skip-link');
  let prevented = false;
  await h.events.get('click')({
    target: { closest: selector => selector === '[data-scroll]' ? skip : null },
    preventDefault() { prevented = true; }
  });
  assert.ok(prevented, 'skip link must not replace the application route');
  assert.equal(h.context.location.hash, '#lesson/roofline');
  assert.equal(h.document.activeElement.id, 'main');
});

test('quiz feedback and completion controls respond to actual delegated events', async () => {
  const h = harness();
  h.route('#lesson/roofline');
  const lesson = h.modules.find(m => m.id === 'roofline');
  const answer = h.document.querySelectorAll('[data-answer]').find(n => Number(n.dataset.answer) === lesson.quiz.answer);
  await h.events.get('click')({ target: { closest: selector => selector === '[data-answer]' ? answer : null } });
  assert.match(h.document.querySelector('.quiz-result').textContent, /^Correct\./);
  assert.ok(answer.classList.contains('correct'));
  const completion = h.document.querySelector('[data-complete]');
  await h.events.get('click')({ target: { closest: selector => selector === '[data-complete]' ? completion : null } });
  assert.ok(h.run("completed.has('roofline')"));
  assert.deepEqual(JSON.parse(h.storage.get('gpu-field-guide-progress-v1')), ['roofline']);
  await h.events.get('click')({ target: { closest: selector => selector === '[data-complete]' ? completion : null } });
  assert.ok(!h.run("completed.has('roofline')"));
});

test('memory calculator matches independently calculated GiB examples', () => {
  const h = harness();
  const values = { mode:'inference', params:7, weightBytes:2, capacity:24, reserve:2, tokens:4096, batch:1, layers:32, kvHeads:8, headDim:128, kvBytes:2, activations:8 };
  const result = h.run(`memoryBudget(${JSON.stringify(values)})`);
  near(result.weights, 13.0385160446167);
  near(result.kv, 0.5);
  near(result.total, 15.5385160446167);
  const training = h.run(`memoryBudget(${JSON.stringify({...values, mode:'training'})})`);
  near(training.total, 127.3466444015503);
  const gqa = h.run(`memoryBudget(${JSON.stringify({...values, kvHeads:1})})`);
  near(gqa.kv, 0.0625);
  const batched = h.run(`memoryBudget(${JSON.stringify({...values, batch:4})})`);
  near(batched.kv, 2);
});

test('roofline examples distinguish the memory roof, compute roof, and ridge', () => {
  const h = harness();
  const memoryBound = h.run('roofline(100,1000,20)');
  near(memoryBound.attainable, 20); near(memoryBound.ridge, 100);
  const computeBound = h.run('roofline(100,1000,200)');
  near(computeBound.attainable, 100); near(computeBound.memory, 200);
  const ridge = h.run('roofline(120,3000,40)');
  near(ridge.attainable, 120); near(ridge.ridge, 40);
});

test('native number constraints accept calculator defaults and reject invalid dimensions', () => {
  const h = harness();
  h.tool('memory');
  for (const id of ['params','capacity','reserve','tokens','batch','layers','kv-heads','head-dim','activations']) {
    assert.ok(h.nodes.get(id).validity.valid, `${id} default violates HTML number constraints`);
  }
  assert.match(h.nodes.get('memory-total').innerHTML, /15\.54/);
  h.nodes.get('tokens').value = '1.5';
  h.run('updateMemory()');
  assert.equal(h.nodes.get('memory-total').textContent, '—');
  h.nodes.get('tokens').value = '';
  assert.ok(Number.isNaN(h.run("numeric('tokens')")));
  h.nodes.get('mode').value = 'training';
  h.run('updateMemory()');
  assert.match(h.nodes.get('memory-total').innerHTML, /127\.35/);
  h.tool('roofline');
  for (const id of ['peak','bandwidth','intensity']) assert.ok(h.nodes.get(id).validity.valid, `${id} default violates HTML number constraints`);
  assert.match(h.nodes.get('roof-value').innerHTML, /20\.00/);
  h.nodes.get('bandwidth').value = '0';
  h.run('updateRoofline()');
  assert.equal(h.nodes.get('roof-value').textContent, '—');
  assert.equal(h.nodes.get('roof-chart').innerHTML, '');
});

test('calculator UI never renders non-finite results for finite extreme inputs', () => {
  const h = harness();
  h.tool('memory');
  h.nodes.get('params').value = '1e308';
  h.run('updateMemory()');
  for (const id of ['memory-total','memory-bar','memory-detail']) assert.doesNotMatch(h.nodes.get(id).innerHTML, /NaN|Infinity/, id);
  h.tool('roofline');
  h.nodes.get('peak').value = '1e308';
  h.run('updateRoofline()');
  for (const id of ['roof-value','roof-detail','roof-chart']) assert.doesNotMatch(h.nodes.get(id).innerHTML, /NaN|Infinity/, id);
});
