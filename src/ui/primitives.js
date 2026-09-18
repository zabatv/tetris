const { createElement: h, useRef, useEffect, useState } = React;

/** Карточка со «спотлайтом»: подсветка следует за курсором. */
export function Panel({ className = '', children, spot = true, ...rest }) {
  const onMouseMove = (event) => {
    const node = event.currentTarget;
    const rect = node.getBoundingClientRect();
    node.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    node.style.setProperty('--my', `${event.clientY - rect.top}px`);
  };
  return h('div', {
    className: `panel ${spot ? 'panel--spot' : ''} ${className}`.trim(),
    onMouseMove: spot ? onMouseMove : undefined,
    ...rest,
  }, children);
}

/** Кнопка, которую слегка притягивает к курсору. */
export function MagneticButton({ className = 'btn', children, strength = 12, ...rest }) {
  const ref = useRef(null);
  const onMouseMove = (event) => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const dx = (event.clientX - rect.left - rect.width / 2) / rect.width;
    const dy = (event.clientY - rect.top - rect.height / 2) / rect.height;
    node.style.transform = `translate(${dx * strength}px, ${dy * strength}px)`;
  };
  const reset = () => {
    if (ref.current) ref.current.style.transform = '';
  };
  return h('button', { ref, className, onMouseMove, onMouseLeave: reset, onBlur: reset, ...rest }, children);
}

/** Число, которое «подпрыгивает» при изменении. */
export function Counter({ value, className = '', format = (v) => v }) {
  const [bump, setBump] = useState(false);
  const previous = useRef(value);
  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    setBump(true);
    const id = setTimeout(() => setBump(false), 420);
    return () => clearTimeout(id);
  }, [value]);
  return h('div', { className: `panel__value ${className} ${bump ? 'is-bump' : ''}`.trim() }, format(value));
}

export function Stat({ label, value, tone = '', format }) {
  return h(Panel, null,
    h('div', { className: 'panel__label' }, label),
    h(Counter, { value, className: tone, format }),
  );
}
