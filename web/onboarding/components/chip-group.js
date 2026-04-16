/**
 * Multi- or single-select chip group component.
 *
 * @param {{ options: {value:string,label:string}[], multi?: boolean, name: string }} config
 * @returns {{ element: HTMLElement, getValue: ()=>string|string[], setValue: (v:string|string[])=>void, on: (ev:string, cb:Function)=>void }}
 */
export function createChipGroup({ options, multi = false, name }) {
  const container = document.createElement('div');
  container.className = 'chip-group';
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', name);

  const listeners = { change: [] };

  for (const opt of options) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.textContent = opt.label;
    btn.dataset.value = opt.value;
    btn.setAttribute('aria-pressed', 'false');

    btn.addEventListener('click', () => {
      if (multi) {
        const pressed = btn.getAttribute('aria-pressed') === 'true';
        btn.setAttribute('aria-pressed', String(!pressed));
        btn.classList.toggle('selected', !pressed);
      } else {
        container.querySelectorAll('.chip').forEach(c => {
          c.setAttribute('aria-pressed', 'false');
          c.classList.remove('selected');
        });
        btn.setAttribute('aria-pressed', 'true');
        btn.classList.add('selected');
      }
      listeners.change.forEach(cb => cb(getValue()));
    });

    btn.addEventListener('keydown', e => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        btn.click();
      }
    });

    container.appendChild(btn);
  }

  function getValue() {
    const selected = Array.from(container.querySelectorAll('.chip[aria-pressed="true"]'))
      .map(b => b.dataset.value);
    return multi ? selected : (selected[0] || null);
  }

  function setValue(v) {
    const values = Array.isArray(v) ? v : [v];
    container.querySelectorAll('.chip').forEach(btn => {
      const active = values.includes(btn.dataset.value);
      btn.setAttribute('aria-pressed', String(active));
      btn.classList.toggle('selected', active);
    });
  }

  return {
    element: container,
    getValue,
    setValue,
    on(ev, cb) { if (listeners[ev]) listeners[ev].push(cb); },
  };
}
