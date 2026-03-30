import { mount as mountCalendar } from '../calendar/index.js';

export function mount(el, context) {
  return mountCalendar(el, context, {
    lockToDay: true,
    dayListTitle: 'Schedule',
    initialDay: new Date(),
  });
}
