import { describe, expect, it } from 'vitest';

import {
  addWeeks,
  dateForDayOfWeek,
  formatMonthTitle,
  isSameWeek,
  startOfWeek,
} from './week-dates';

describe('week-dates', () => {
  describe('startOfWeek', () => {
    it('devuelve el lunes de la semana para un miércoles', () => {
      // 2026-07-01 es miércoles → lunes 2026-06-29
      const monday = startOfWeek(new Date(2026, 6, 1));
      expect(monday.getFullYear()).toBe(2026);
      expect(monday.getMonth()).toBe(5); // junio (0-based)
      expect(monday.getDate()).toBe(29);
      expect(monday.getDay()).toBe(1); // lunes
    });

    it('trata el domingo como fin de semana (no inicio)', () => {
      // 2026-07-05 es domingo → lunes 2026-06-29
      const monday = startOfWeek(new Date(2026, 6, 5));
      expect(monday.getDate()).toBe(29);
      expect(monday.getMonth()).toBe(5);
    });

    it('es idempotente para un lunes', () => {
      const monday = startOfWeek(new Date(2026, 5, 29));
      expect(startOfWeek(monday).getTime()).toBe(monday.getTime());
    });
  });

  describe('dateForDayOfWeek', () => {
    const weekStart = startOfWeek(new Date(2026, 6, 1)); // lunes 2026-06-29

    it('mapea lunes (dayOfWeek=1) al inicio de semana', () => {
      expect(dateForDayOfWeek(weekStart, 1).getDate()).toBe(29);
    });

    it('mapea domingo (dayOfWeek=0) al final de la semana', () => {
      const sunday = dateForDayOfWeek(weekStart, 0);
      expect(sunday.getMonth()).toBe(6); // julio
      expect(sunday.getDate()).toBe(5);
    });

    it('mapea sábado (dayOfWeek=6) al penúltimo día', () => {
      const saturday = dateForDayOfWeek(weekStart, 6);
      expect(saturday.getDate()).toBe(4);
      expect(saturday.getMonth()).toBe(6);
    });
  });

  describe('addWeeks', () => {
    it('avanza y retrocede semanas completas', () => {
      const monday = startOfWeek(new Date(2026, 6, 1)); // 06-29
      expect(addWeeks(monday, 1).getDate()).toBe(6); // 07-06
      expect(addWeeks(monday, -1).getDate()).toBe(22); // 06-22
    });
  });

  describe('isSameWeek', () => {
    it('true para fechas en la misma semana', () => {
      const monday = startOfWeek(new Date(2026, 6, 1));
      expect(isSameWeek(monday, new Date(2026, 6, 5))).toBe(true); // domingo
    });

    it('false para semanas distintas', () => {
      const monday = startOfWeek(new Date(2026, 6, 1));
      expect(isSameWeek(monday, new Date(2026, 6, 6))).toBe(false); // lunes siguiente
    });
  });

  describe('formatMonthTitle', () => {
    it('un solo mes: "Mes Año"', () => {
      const title = formatMonthTitle(startOfWeek(new Date(2026, 6, 8))); // lunes 07-06
      expect(title).toBe('Julio 2026');
    });

    it('cruce de meses en el mismo año usa nombres cortos', () => {
      const title = formatMonthTitle(startOfWeek(new Date(2026, 6, 1))); // 06-29 → 07-05
      expect(title).toContain('–');
      expect(title).toContain('2026');
    });

    it('cruce de año incluye ambos años', () => {
      // 2026-12-28 es lunes → domingo 2027-01-03
      const title = formatMonthTitle(startOfWeek(new Date(2026, 11, 28)));
      expect(title).toContain('2026');
      expect(title).toContain('2027');
    });
  });
});
