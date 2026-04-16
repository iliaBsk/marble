/**
 * City picker: pre-seeded chips for known cities + a text input for unlisted ones.
 *
 * @param {{ knownCities: string[] }} config
 * @returns {{ element: HTMLElement, getValue: ()=>string|null, setValue: (v:string)=>void, on: (ev:string, cb:Function)=>void }}
 */
export function createCityPicker({ knownCities }) {
  const container = document.createElement('div');
  container.className = 'city-picker';

  let selectedCity = null;
  const listeners = { change: [] };

  // Chip grid for known cities
  const chipGrid = document.createElement('div');
  chipGrid.className = 'chip-group city-chips';

  for (const city of knownCities.slice(0, 12)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.textContent = city;
    btn.dataset.value = city;
    btn.setAttribute('aria-pressed', 'false');

    btn.addEventListener('click', () => {
      selectCity(city);
      chipGrid.querySelectorAll('.chip').forEach(c => {
        c.setAttribute('aria-pressed', c.dataset.value === city ? 'true' : 'false');
        c.classList.toggle('selected', c.dataset.value === city);
      });
      input.value = '';
      confirmRow.style.display = 'none';
    });

    chipGrid.appendChild(btn);
  }

  container.appendChild(chipGrid);

  // Text input for unlisted cities
  const inputWrapper = document.createElement('div');
  inputWrapper.className = 'city-input-wrapper';
  const inputLabel = document.createElement('label');
  inputLabel.textContent = 'Or type your city:';
  inputLabel.className = 'city-input-label';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'city-input';
  input.placeholder = 'e.g. Lisbon, Chicago, Singapore…';
  input.maxLength = 60;
  inputWrapper.appendChild(inputLabel);
  inputWrapper.appendChild(input);
  container.appendChild(inputWrapper);

  // Confirm row shown after debounced typing
  const confirmRow = document.createElement('div');
  confirmRow.className = 'city-confirm-row';
  confirmRow.style.display = 'none';
  container.appendChild(confirmRow);

  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const val = input.value.trim();
    if (!val) {
      confirmRow.style.display = 'none';
      return;
    }
    debounceTimer = setTimeout(() => showConfirm(val), 350);
  });

  function showConfirm(city) {
    confirmRow.innerHTML = '';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip selected';
    btn.textContent = `Use "${city}"`;
    btn.addEventListener('click', () => {
      selectCity(city);
      chipGrid.querySelectorAll('.chip').forEach(c => {
        c.setAttribute('aria-pressed', 'false');
        c.classList.remove('selected');
      });
      confirmRow.style.display = 'none';
    });
    confirmRow.appendChild(btn);
    confirmRow.style.display = 'flex';
  }

  function selectCity(city) {
    selectedCity = city;
    listeners.change.forEach(cb => cb(city));
  }

  return {
    element: container,
    getValue() { return selectedCity; },
    setValue(v) {
      selectedCity = v;
      chipGrid.querySelectorAll('.chip').forEach(c => {
        const active = c.dataset.value === v;
        c.setAttribute('aria-pressed', String(active));
        c.classList.toggle('selected', active);
      });
      if (!knownCities.includes(v)) {
        input.value = v;
      }
    },
    on(ev, cb) { if (listeners[ev]) listeners[ev].push(cb); },
  };
}
