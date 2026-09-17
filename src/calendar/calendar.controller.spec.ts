import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { CalendarController } from './calendar.controller';

describe('CalendarController public booking routes', () => {
  it.each(['publicEventType', 'slots', 'book'] as const)(
    'marks %s as public',
    (method) => {
      const handler = Object.getOwnPropertyDescriptor(
        CalendarController.prototype,
        method,
      )?.value as unknown;
      expect(typeof handler).toBe('function');
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler as object)).toBe(true);
    },
  );
});
