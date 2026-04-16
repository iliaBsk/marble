/**
 * Single-choice toggle row (radio semantics via aria-pressed on a button group).
 *
 * @param {{ options: {value:string,label:string}[], name: string }} config
 * @returns {{ element: HTMLElement, getValue: ()=>string|null, setValue: (v:string)=>void, on: (ev:string, cb:Function)=>void }}
 */
export function createToggleRow({ options, name }) {
  const container = document.createElement('div');
  container.className = 'toggle-row';
  container.setAttribute('role', 'radiogroup');
  container.setAttribute('aria-label', name);

  const listeners = { change: [] };

  for (const opt of options) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toggle-btn';
    btn.textContent = opt.label;
    btn.dataset.value = opt.value;
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', 'false');

    btn.addEventListener('click', () => {
      container.querySelectorAll('.toggle-btn').forEach(b => {
        b.setAttribute('aria-checked', 'false');
        b.classList.remove('selected');
      });
      btn.setAttribute('aria-checked', 'true');
      btn.classList.add('selected');
      listeners.change.forEach(cb => cb(btn.dataset.value));
    });

    container.appendChild(btn);
  }

  function getValue() {
    const sel = container.querySelector('.toggle-btn[aria-checked="true"]');
    return sel ? sel.dataset.value : null;
  }

  function setValue(v) {
    container.querySelectorAll('.toggle-btn').forEach(btn => {
      const active = btn.dataset.value === v;
      btn.setAttribute('aria-checked', String(active));
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
