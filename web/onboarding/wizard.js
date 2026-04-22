/**
 * Marble onboarding wizard — step-by-step profile setup.
 * No build tools required; pure ES modules loaded directly by the browser.
 *
 * Flow:
 *   1. Splash: optional Twitter/X handle → infer profile → pre-fill answers
 *   2. 13 wizard steps (pre-filled where possible, manual where not)
 *   3. Submit → SSE progress → done
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
  const pct = Math.round((currentStepIndex / steps.length) * 100);
  progressFill.style.width = `${pct}%`;
  progressLabel.textContent = `Step ${currentStepIndex + 1} of ${steps.length}`;
}

// ─── Splash screen ────────────────────────────────────────────────────────────

function renderSplash() {
  progressFill.style.width = '0%';
  progressLabel.textContent = '';

  wizardEl.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'step-card';

  const xIcon = document.createElement('div');
  xIcon.className = 'x-logo';
  xIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.858L1.255 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`;
  card.appendChild(xIcon);

  const title = document.createElement('h2');
  title.className = 'step-title';
  title.textContent = 'Start with your X profile';
  card.appendChild(title);

  const sub = document.createElement('p');
  sub.className = 'step-subtitle';
  sub.textContent = 'Enter your X (Twitter) handle and we\'ll research your public profile to pre-fill everything. Or skip to fill in manually.';
  card.appendChild(sub);

  const inputRow = document.createElement('div');
  inputRow.className = 'handle-input-row';

  const prefix = document.createElement('span');
  prefix.className = 'handle-prefix';
  prefix.textContent = '@';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'handle-input';
  input.placeholder = 'yourhandle';
  input.maxLength = 50;
  input.autocomplete = 'off';
  input.spellcheck = false;

  inputRow.appendChild(prefix);
  inputRow.appendChild(input);
  card.appendChild(inputRow);

  const uploadLabel = document.createElement('p');
  uploadLabel.className = 'posts-upload-label';
  uploadLabel.textContent = 'Or upload a profile data file (.txt)';
  card.appendChild(uploadLabel);

  const fileRow = document.createElement('div');
  fileRow.className = 'posts-upload-row';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.txt,.csv,.tsv';
  fileInput.className = 'posts-file-input';
  fileInput.id = 'splash-posts-file';

  const fileLabel = document.createElement('label');
  fileLabel.htmlFor = 'splash-posts-file';
  fileLabel.className = 'posts-file-label';
  fileLabel.textContent = 'Choose file';

  const fileName = document.createElement('span');
  fileName.className = 'posts-file-name';
  fileName.textContent = 'No file chosen';

  fileInput.addEventListener('change', () => {
    fileName.textContent = fileInput.files[0]?.name || 'No file chosen';
    loadBtn.textContent = fileInput.files[0] ? 'Analyze profile →' : 'Load from X →';
  });

  fileRow.appendChild(fileInput);
  fileRow.appendChild(fileLabel);
  fileRow.appendChild(fileName);
  card.appendChild(fileRow);

  const loadBtn = document.createElement('button');
  loadBtn.className = 'btn-next';
  loadBtn.textContent = 'Load from X →';

  const skipBtn = document.createElement('button');
  skipBtn.className = 'btn-skip splash-skip';
  skipBtn.textContent = 'Skip — fill in manually';

  card.appendChild(loadBtn);
  card.appendChild(skipBtn);
  wizardEl.appendChild(card);

  const statusArea = document.createElement('div');
  statusArea.className = 'handle-status';
  wizardEl.appendChild(statusArea);

  skipBtn.addEventListener('click', () => {
    currentStepIndex = 0;
    renderStep(0);
  });

  loadBtn.addEventListener('click', async () => {
    const handle = input.value.trim().replace(/^@/, '');
    const file = fileInput.files[0];

    if (!handle && !file) {
      inputRow.classList.add('handle-error');
      input.focus();
      setTimeout(() => inputRow.classList.remove('handle-error'), 1500);
      return;
    }

    const postsText = file ? await file.text() : null;
    loadFromSource(handle || null, postsText, statusArea, card);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadBtn.click();
  });

  setTimeout(() => input.focus(), 50);
}

// ─── Load profile from X handle or post extract ───────────────────────────────

async function loadFromSource(handle, postsText, statusArea, splashCard) {
  splashCard.querySelectorAll('button, input').forEach(el => { el.disabled = true; });
  statusArea.innerHTML = '';

  const fromPosts = !!postsText;
  const displayId = handle ? `@${handle}` : 'posts';

  const stageList = [
    { id: 'start',       label: fromPosts ? 'Reading post export…' : `Looking up @${handle}…` },
    { id: 'researching', label: fromPosts ? 'Analysing profile data…' : 'Researching public posts and bio…' },
    { id: 'inferred',    label: 'Inferring persona…' },
    { id: 'applying',    label: 'Applying to profile…' },
  ];

  const checklist = document.createElement('ul');
  checklist.className = 'progress-checklist';
  checklist.style.marginTop = '24px';

  const stageEls = {};
  for (const s of stageList) {
    const li = document.createElement('li');
    const icon = document.createElement('div');
    icon.className = 'check-icon';
    icon.textContent = '○';
    const text = document.createElement('span');
    text.textContent = s.label;
    li.appendChild(icon);
    li.appendChild(text);
    checklist.appendChild(li);
    stageEls[s.id] = { icon, text };
  }
  statusArea.appendChild(checklist);

  const timeNotice = document.createElement('p');
  timeNotice.className = 'step-subtitle';
  timeNotice.style.cssText = 'margin-top:16px;font-size:12px;';
  timeNotice.textContent = 'Searching the web takes about 1–2 minutes. Hang tight…';
  statusArea.appendChild(timeNotice);

  const ids = stageList.map(s => s.id);
  const activateStage = (id) => {
    const idx = ids.indexOf(id);
    if (idx < 0) return;
    for (let i = 0; i < ids.length; i++) {
      const { icon } = stageEls[ids[i]];
      if (i < idx)      { icon.className = 'check-icon done'; icon.textContent = '✓'; }
      else if (i === idx) { icon.className = 'check-icon active'; icon.textContent = '…'; }
    }
  };

  const clientAbort = new AbortController();
  const clientTimeout = setTimeout(() => clientAbort.abort(), 8 * 60 * 1000);

  try {
    activateStage('start');

    const res = await fetch(`${API_BASE}/social/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle, platform: 'twitter', ...(postsText ? { posts_text: postsText } : {}) }),
      signal: clientAbort.signal,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Server returned ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        throw new Error('Stream closed before completion. Please try again.');
      }

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let event;
        try { event = JSON.parse(line.slice(6)); } catch { continue; }

        if (event.stage === 'error') throw new Error(event.error || 'Profile inference failed');
        if (event.stage === 'researching') activateStage('researching');
        if (event.stage === 'inferred')    activateStage('inferred');
        if (event.stage === 'applying')    activateStage('applying');

        if (event.stage === 'done') {
          clearTimeout(clientTimeout);
          for (const { icon } of Object.values(stageEls)) {
            icon.className = 'check-icon done';
            icon.textContent = '✓';
          }
          prefillFromProfile(event);
          statusArea.innerHTML = '';
          renderProfilePreview(event, statusArea);
          return;
        }
      }
    }
  } catch (err) {
    clearTimeout(clientTimeout);
    statusArea.innerHTML = '';
    const isTimeout = err.name === 'AbortError';
    const errCard = document.createElement('div');
    errCard.className = 'error-card';
    errCard.innerHTML = `<p>${isTimeout ? 'Research timed out (3 min).' : `Could not infer profile from ${fromPosts ? 'profile data' : `@${handle}`}: <em>${err.message}</em>`}</p>`;

    const manualBtn = document.createElement('button');
    manualBtn.className = 'btn-next';
    manualBtn.style.marginTop = '12px';
    manualBtn.textContent = 'Continue manually →';
    manualBtn.addEventListener('click', () => { currentStepIndex = 0; renderStep(0); });

    errCard.appendChild(manualBtn);
    statusArea.appendChild(errCard);
  }
}

function prefillFromProfile(profile) {
  if (profile.ageBracket && profile.ageBracket !== 'unknown') {
    answers.ageBracket = profile.ageBracket;
  }
  if (Array.isArray(profile.passions) && profile.passions.length > 0) {
    answers.passions = profile.passions.slice(0, 2);
  }
  if (Array.isArray(profile.foodPreferences) && profile.foodPreferences.length > 0) {
    answers.foodPreferences = profile.foodPreferences;
  }
  if (Array.isArray(profile.movieGenres) && profile.movieGenres.length > 0) {
    answers.movieGenres = profile.movieGenres;
  }
  if (profile.location?.city) {
    answers.location = { city: profile.location.city };
  }
  saveAnswers();
}

function renderProfilePreview(profile, container) {
  const card = document.createElement('div');
  card.className = 'profile-preview-card';

  const avatarWrap = document.createElement('div');
  avatarWrap.className = 'profile-avatar-wrap';

  const img = document.createElement('img');
  img.className = 'profile-avatar';
  img.src = `https://unavatar.io/twitter/${profile.handle}`;
  img.alt = profile.displayName || profile.handle;
  img.onerror = () => {
    img.style.display = 'none';
    const fallback = document.createElement('div');
    fallback.className = 'profile-avatar-fallback';
    fallback.textContent = (profile.displayName || profile.handle || '?')[0].toUpperCase();
    avatarWrap.appendChild(fallback);
  };
  avatarWrap.appendChild(img);

  const info = document.createElement('div');
  info.className = 'profile-info';

  const nameRow = document.createElement('div');
  nameRow.className = 'profile-name-row';

  const name = document.createElement('strong');
  name.textContent = profile.displayName || (profile.handle ? `@${profile.handle}` : 'Inferred profile');
  nameRow.appendChild(name);

  const handleSpan = document.createElement('span');
  handleSpan.className = 'profile-handle';
  handleSpan.textContent = `@${profile.handle}`;
  nameRow.appendChild(handleSpan);

  info.appendChild(nameRow);

  if (profile.inferredBio) {
    const bio = document.createElement('p');
    bio.className = 'profile-bio';
    bio.textContent = profile.inferredBio;
    info.appendChild(bio);
  }

  const tags = document.createElement('div');
  tags.className = 'profile-tags';

  const tagItems = [
    profile.location?.city ? `📍 ${profile.location.city}` : null,
    profile.ageBracket && profile.ageBracket !== 'unknown' ? profile.ageBracket : null,
    ...(profile.passions || []).map(p => p.replace(/-/g, ' ')),
  ].filter(Boolean);

  for (const tag of tagItems) {
    const chip = document.createElement('span');
    chip.className = 'profile-tag';
    chip.textContent = tag;
    tags.appendChild(chip);
  }
  info.appendChild(tags);

  card.appendChild(avatarWrap);
  card.appendChild(info);
  container.appendChild(card);

  const notice = document.createElement('p');
  notice.className = 'prefill-notice';
  notice.textContent = "We've pre-filled your answers from your X profile. Review and adjust each step.";
  container.appendChild(notice);

  const continueBtn = document.createElement('button');
  continueBtn.className = 'btn-next';
  continueBtn.style.marginTop = '20px';
  continueBtn.textContent = 'Review my profile →';
  continueBtn.addEventListener('click', () => { currentStepIndex = 0; renderStep(0); });
  container.appendChild(continueBtn);
}

// ─── Wizard steps ─────────────────────────────────────────────────────────────

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
    counter.textContent = `${(answers.freeform || '').length} / 120`;

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
        if (step.pairs.every(p => pairAnswers[p.id] !== undefined)) return { ...pairAnswers };
        return undefined;
      },
    };
  }

  // Navigation
  const nav = document.createElement('div');
  nav.className = 'step-nav';

  const backTarget = index === 0 ? 'splash' : index - 1;
  const back = document.createElement('button');
  back.className = 'btn-back';
  back.textContent = '← Back';
  back.addEventListener('click', () => {
    if (backTarget === 'splash') {
      renderSplash();
    } else {
      currentStepIndex = backTarget;
      renderStep(currentStepIndex);
    }
  });
  nav.appendChild(back);

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

// ─── Submit ───────────────────────────────────────────────────────────────────

async function submitWizard() {
  wizardEl.innerHTML = '';

  const stages = [
    { id: 'validated',       label: 'Validating your answers…' },
    { id: 'seed_applied',    label: 'Saving your preferences…' },
    { id: 'research_running', label: `Studying ${answers.location?.city || 'your city'} with web search…` },
    { id: 'research_done',   label: 'Building your knowledge graph…' },
    { id: 'done',            label: 'Done — setting up your dashboard…' },
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
    const stageIds = Object.keys(items);
    for (const [stageId, icon] of Object.entries(items)) {
      if (stageId === id) {
        icon.className = 'check-icon active';
        icon.textContent = '…';
      } else if (stageIds.indexOf(stageId) < stageIds.indexOf(id)) {
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
        let event;
        try { event = JSON.parse(line.slice(6)); } catch { continue; }

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
      }
    }
  } catch {
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
    } catch {
      wizardEl.innerHTML = `<p style="color:#e74c3c">Something went wrong. Please refresh and try again.</p>`;
    }
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

(async () => {
  try {
    await loadSteps();
    renderSplash();
  } catch (err) {
    wizardEl.innerHTML = `<p style="color:#e74c3c">Could not load wizard. Is the Marble server running?</p>`;
  }
})();
