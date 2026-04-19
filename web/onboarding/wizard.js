/**
 * Marble onboarding wizard — step-by-step profile setup.
 * No build tools required; pure ES modules loaded directly by the browser.
 */

import { createChipGroup } from './components/chip-group.js';
import { createToggleRow } from './components/toggle-row.js';
import { createCityPicker } from './components/city-picker.js';

const STORAGE_KEY = 'marble:onboarding:answers';
const API_BASE = '/onboarding';

let steps = [];
let knownCities = [];
let currentStepIndex = 0;
const answers = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');

const wizardEl = document.getElementById('wizard');
const progressFill = document.getElementById('progress-fill');
const progressLabel = document.getElementById('progress-label');

async function loadSteps() {
  const res = await fetch(`${API_BASE}/steps`);
  const json = await res.json();
  steps = json.data.steps;
  knownCities = json.data.knownCities || [];
}

async function loadShopsForCity(city) {
  const res = await fetch(`${API_BASE}/shops?city=${encodeURIComponent(city)}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data.shops || [];
}

function saveAnswers() {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
}

function updateProgress() {
  const pct = Math.round(((currentStepIndex) / steps.length) * 100);
  progressFill.style.width = `${pct}%`;
  progressLabel.textContent = `Step ${currentStepIndex + 1} of ${steps.length}`;
}

async function renderStep(index) {
  const step = steps[index];
  if (!step) return;

  updateProgress();
  wizardEl.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'step-card';

  const title = document.createElement('h2');
  title.className = 'step-title';
  title.textContent = step.title;
  card.appendChild(title);

  if (step.subtitle) {
    const sub = document.createElement('p');
    sub.className = 'step-subtitle';
    sub.textContent = step.subtitle;
    card.appendChild(sub);
  }

  let control = null;

  if (step.kind === 'toggle') {
    const toggle = createToggleRow({ options: step.options, name: step.id });
    if (answers[step.id]) toggle.setValue(answers[step.id]);
    control = toggle;
    card.appendChild(toggle.element);

    // Optional age bracket sub-field (maritalStatus step only)
    if (step.ageBracket) {
      const ageLabel = document.createElement('p');
      ageLabel.className = 'step-subtitle';
      ageLabel.style.marginTop = '1.5rem';
      ageLabel.textContent = 'Your age range (optional)';
      card.appendChild(ageLabel);

      const ageChips = createChipGroup({
        options: step.ageBracket.options,
        multi: false,
        name: 'ageBracket',
      });
      if (answers.ageBracket) ageChips.setValue(answers.ageBracket);
      card.appendChild(ageChips.element);

      // Wrap original control to also capture ageBracket
      const originalControl = control;
      control = {
        getValue: () => {
          const bracketVal = ageChips.getValue();
          if (bracketVal && bracketVal.length > 0) answers.ageBracket = Array.isArray(bracketVal) ? bracketVal[0] : bracketVal;
          return originalControl.getValue();
        },
      };
    }

  } else if (step.kind === 'chips') {
    let options = step.options;

    // Shops step: load dynamically from city answer
    if (step.id === 'favoriteShops' && answers.location?.city) {
      const shops = await loadShopsForCity(answers.location.city);
      if (shops.length > 0) {
        options = shops.map(s => ({ value: s.name, label: s.name }));
      }
    }

    const chips = createChipGroup({ options, multi: step.multi !== false, max: step.max ?? null, name: step.id });
    if (answers[step.id]) chips.setValue(answers[step.id]);
    control = chips;
    card.appendChild(chips.element);

  } else if (step.kind === 'city-picker') {
    const picker = createCityPicker({ knownCities });
    if (answers.location?.city) picker.setValue(answers.location.city);
    control = picker;
    card.appendChild(picker.element);

  } else if (step.kind === 'chip-groups') {
    const groupValues = answers[step.id] || {};
    const groupControls = {};

    for (const group of step.groups) {
      const section = document.createElement('div');
      section.className = 'chip-group-section';

      const label = document.createElement('p');
      label.className = 'chip-group-label';
      label.textContent = group.label;
      section.appendChild(label);

      const chips = createChipGroup({ options: group.options, multi: group.multi !== false, name: group.id });
      if (groupValues[group.id]) chips.setValue(groupValues[group.id]);
      section.appendChild(chips.element);
      card.appendChild(section);

      groupControls[group.id] = chips;
    }

    // Synthesize a control-like object
    control = {
      getValue: () => Object.fromEntries(
        Object.entries(groupControls).map(([k, c]) => [k, c.getValue()])
      ),
    };

  } else if (step.kind === 'freeform') {
    const textarea = document.createElement('textarea');
    textarea.className = 'freeform-input';
    textarea.placeholder = 'Type here… (optional)';
    textarea.maxLength = 120;
    if (answers.freeform) textarea.value = answers.freeform;

    const counter = document.createElement('p');
    counter.className = 'freeform-count';
    counter.textContent = `0 / 120`;

    textarea.addEventListener('input', () => {
      counter.textContent = `${textarea.value.length} / 120`;
    });

    card.appendChild(textarea);
    card.appendChild(counter);

    control = { getValue: () => textarea.value || undefined };

  } else if (step.kind === 'pairs') {
    const pairAnswers = answers[step.id] || {};
    const pairEls = {};

    for (const pair of step.pairs) {
      const row = document.createElement('div');
      row.className = 'pairs-row';

      const btnA = document.createElement('button');
      btnA.className = 'pairs-btn';
      btnA.dataset.pairId = pair.id;
      btnA.dataset.value = pair.labelA.toLowerCase();
      btnA.textContent = pair.labelA;

      const sep = document.createElement('span');
      sep.className = 'pairs-sep';
      sep.textContent = 'vs';

      const btnB = document.createElement('button');
      btnB.className = 'pairs-btn';
      btnB.dataset.pairId = pair.id;
      btnB.dataset.value = pair.labelB.toLowerCase();
      btnB.textContent = pair.labelB;

      const selectBtn = (active, inactive) => {
        active.classList.add('selected');
        inactive.classList.remove('selected');
        pairAnswers[pair.id] = active.dataset.value;
      };

      btnA.addEventListener('click', () => selectBtn(btnA, btnB));
      btnB.addEventListener('click', () => selectBtn(btnB, btnA));

      // Restore prior selection
      if (pairAnswers[pair.id] === pair.labelA.toLowerCase()) btnA.classList.add('selected');
      else if (pairAnswers[pair.id] === pair.labelB.toLowerCase()) btnB.classList.add('selected');

      row.appendChild(btnA);
      row.appendChild(sep);
      row.appendChild(btnB);
      card.appendChild(row);
      pairEls[pair.id] = { btnA, btnB };
    }

    control = {
      getValue: () => {
        // All pairs must be answered
        if (step.pairs.every(p => pairAnswers[p.id] !== undefined)) return { ...pairAnswers };
        return undefined;
      },
    };
  }

  // Navigation
  const nav = document.createElement('div');
  nav.className = 'step-nav';

  if (index > 0) {
    const back = document.createElement('button');
    back.className = 'btn-back';
    back.textContent = '← Back';
    back.addEventListener('click', () => { currentStepIndex--; renderStep(currentStepIndex); });
    nav.appendChild(back);
  }

  const isLast = index === steps.length - 1;
  const isOptional = step.kind === 'freeform';

  if (isOptional) {
    const skip = document.createElement('button');
    skip.className = 'btn-skip';
    skip.textContent = 'Skip';
    skip.addEventListener('click', () => submitWizard());
    nav.appendChild(skip);
  }

  const next = document.createElement('button');
  next.className = 'btn-next';
  next.textContent = isLast ? 'Build my profile →' : 'Continue';
  next.addEventListener('click', async () => {
    const value = control?.getValue?.();
    const isEmpty = value === null || value === undefined ||
      (Array.isArray(value) && value.length === 0) ||
      (typeof value === 'string' && value.trim() === '');

    if (!isOptional && isEmpty) {
      next.textContent = 'Please make a selection';
      setTimeout(() => { next.textContent = isLast ? 'Build my profile →' : 'Continue'; }, 1200);
      return;
    }

    if (step.kind === 'city-picker') {
      answers.location = { city: value };
    } else if (value !== undefined) {
      answers[step.id] = value;
    }

    saveAnswers();

    if (isLast) {
      await submitWizard();
    } else {
      currentStepIndex++;
      renderStep(currentStepIndex);
    }
  });

  nav.appendChild(next);
  card.appendChild(nav);
  wizardEl.appendChild(card);
}

async function submitWizard() {
  wizardEl.innerHTML = '';

  const stages = [
    { id: 'validated', label: 'Validating your answers…' },
    { id: 'seed_applied', label: 'Saving your preferences…' },
    { id: 'research_running', label: `Studying ${answers.location?.city || 'your city'} with web search…` },
    { id: 'research_done', label: 'Building your knowledge graph…' },
    { id: 'done', label: 'Done — setting up your dashboard…' },
  ];

  const checklist = document.createElement('ul');
  checklist.className = 'progress-checklist';

  const items = {};
  for (const stage of stages) {
    const li = document.createElement('li');
    const icon = document.createElement('div');
    icon.className = 'check-icon';
    icon.textContent = '○';
    const text = document.createElement('span');
    text.textContent = stage.label;
    li.appendChild(icon);
    li.appendChild(text);
    checklist.appendChild(li);
    items[stage.id] = icon;
  }

  wizardEl.appendChild(checklist);

  const activateStage = (id) => {
    for (const [stageId, icon] of Object.entries(items)) {
      if (stageId === id) {
        icon.className = 'check-icon active';
        icon.textContent = '…';
      } else if (Object.keys(items).indexOf(stageId) < Object.keys(items).indexOf(id)) {
        icon.className = 'check-icon done';
        icon.textContent = '✓';
      }
    }
  };

  try {
    const res = await fetch(`${API_BASE}/submit/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(answers),
    });

    if (!res.ok || !res.body) throw new Error('Stream unavailable');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    activateStage('validated');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.stage === 'error') {
            wizardEl.innerHTML = `<p style="color:#e74c3c">${event.error || 'Onboarding failed. Please refresh and try again.'}</p>`;
            return;
          }
          activateStage(event.stage);
          if (event.stage === 'done') {
            items['done'].className = 'check-icon done';
            items['done'].textContent = '✓';
            setTimeout(() => { location.href = '/dashboard'; }, 1200);
            return;
          }
        } catch {}
      }
    }
  } catch (err) {
    // Fallback: non-streaming POST
    activateStage('validated');
    try {
      const res = await fetch(`${API_BASE}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answers),
      });
      if (!res.ok) throw new Error('Submit failed');
      activateStage('done');
      items['done'].className = 'check-icon done';
      items['done'].textContent = '✓';
      setTimeout(() => { location.href = '/dashboard'; }, 1200);
    } catch (e2) {
      wizardEl.innerHTML = `<p style="color:#e74c3c">Something went wrong. Please refresh and try again.</p>`;
    }
  }
}

// Boot
(async () => {
  try {
    await loadSteps();
    renderStep(0);
  } catch (err) {
    wizardEl.innerHTML = `<p style="color:#e74c3c">Could not load wizard. Is the Marble server running?</p>`;
  }
})();
