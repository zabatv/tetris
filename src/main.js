import { App } from './ui/App.js';

// Сенсорный ввод помечаем классом: медиазапрос pointer срабатывает не везде.
if (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) {
  document.documentElement.classList.add('is-touch');
}

const root = document.getElementById('root');
ReactDOM.createRoot(root).render(React.createElement(App));

// Показываем сбои прямо на странице: консоль на чужом устройстве не откроешь.
window.addEventListener('error', (event) => {
  let box = document.getElementById('js-error');
  if (!box) {
    box = document.createElement('div');
    box.id = 'js-error';
    document.body.appendChild(box);
  }
  box.textContent = `Ошибка: ${event.message} @ ${event.filename || ''}:${event.lineno || 0}`;
});
