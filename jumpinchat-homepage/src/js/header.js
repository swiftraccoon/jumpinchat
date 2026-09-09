import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';

const trigger = document.querySelector('#profile-drop-trigger');
const dropdown = document.querySelector('#profile-drop-container');
if (trigger && dropdown) {
  let stopPositioning;
  let open = false;
  let revision = 0;
  const position = async () => {
    const current = ++revision;
    const { x, y } = await computePosition(trigger, dropdown, {
      placement: 'bottom', strategy: 'fixed',
      middleware: [offset(5), flip({ padding: 8 }), shift({ padding: 8 })],
    });
    if (!open || current !== revision) return;
    Object.assign(dropdown.style, { left: `${x}px`, top: `${y}px` });
  };
  const close = () => {
    open = false;
    revision += 1;
    stopPositioning?.();
    stopPositioning = null;
    dropdown.style.display = 'none';
    trigger.setAttribute('aria-expanded', 'false');
  };
  close();
  Object.assign(dropdown.style, { position: 'fixed', zIndex: '10000' });
  trigger.setAttribute('aria-controls', dropdown.id);
  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    if (open) { close(); return; }
    open = true;
    dropdown.style.display = 'block';
    trigger.setAttribute('aria-expanded', 'true');
    stopPositioning = autoUpdate(trigger, dropdown, position);
  });
  document.addEventListener('pointerdown', (event) => {
    if (!trigger.contains(event.target) && !dropdown.contains(event.target)) close();
  });
  document.addEventListener('keydown', (event) => {
    if (open && event.key === 'Escape') { close(); trigger.focus(); }
  });
}
