// Pruebas de la lógica pura (sin base de datos): validaciones, horarios, fechas, comisiones y lealtad.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as v from "../src/lib/validate";
import { intersect, merge, subtract } from "../src/lib/availability";
import { addDays, localToUtc, toLocalDate, weekday } from "../src/lib/time";
import { nextPayday } from "../src/lib/payroll";
import { previewStampDiscount, stampRewardLabel } from "../src/lib/loyalty";

test("dinero: acepta montos válidos y rechaza negativos, texto y más de 2 decimales", () => {
  assert.equal(v.money("180", "el precio").value, 180);
  assert.equal(v.money("1250.50", "el precio").value, 1250.5);
  assert.ok(v.money("-5", "el precio").error);
  assert.ok(v.money("abc", "el precio").error);
  assert.ok(v.money("10.555", "el precio").error);
  assert.ok(v.money("", "el precio", { required: true }).error);
  assert.ok(v.money("200", "el precio", { max: 100 }).error);
});

test("enteros y porcentajes", () => {
  assert.equal(v.int("5", "la cantidad").value, 5);
  assert.ok(v.int("2.5", "la cantidad").error);
  assert.ok(v.int("0", "la cantidad", { min: 1 }).error);
  assert.equal(v.percent("40", "la comisión").value, 0.4);
  assert.ok(v.percent("120", "la comisión").error);
});

test("teléfono de México: 10 dígitos, acepta +52 y 521", () => {
  assert.equal(v.phone("312 555 0142").value, "3125550142");
  assert.equal(v.phone("+52 1 312 555 0142").value, "3125550142");
  assert.equal(v.phone("+52 312 555 0142").value, "3125550142");
  assert.ok(v.phone("12345").error);
  assert.ok(v.phone("", { required: true }).error);
  assert.equal(v.phone("").value, null);
});

test("correo y texto", () => {
  assert.equal(v.email(" Ana@Mail.com ").value, "ana@mail.com");
  assert.ok(v.email("ana@").error);
  assert.equal(v.text("  Hola   mundo ", "x").value, "Hola mundo");
  assert.ok(v.text("x".repeat(10), "x", { max: 5 }).error);
  assert.equal(v.first({ value: 1 }, { error: "falla" }, { error: "otra" }), "falla");
});

test("intervalos: unir, cruzar y restar", () => {
  assert.deepEqual(merge([{ start: 5, end: 10 }, { start: 0, end: 6 }, { start: 20, end: 30 }]), [{ start: 0, end: 10 }, { start: 20, end: 30 }]);
  assert.deepEqual(intersect([{ start: 0, end: 100 }], [{ start: 50, end: 150 }]), [{ start: 50, end: 100 }]);
  // Una cita a media jornada parte el horario en dos
  assert.deepEqual(subtract([{ start: 0, end: 100 }], [{ start: 40, end: 60 }]), [{ start: 0, end: 40 }, { start: 60, end: 100 }]);
  assert.deepEqual(subtract([{ start: 0, end: 100 }], [{ start: 0, end: 100 }]), []);
});

test("fechas en la zona horaria de la barbería", () => {
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(weekday("2026-11-13"), 5); // viernes
  const at = localToUtc("2026-11-13", 10 * 60, "America/Mexico_City");
  assert.equal(at.toISOString(), "2026-11-13T16:00:00.000Z");
  assert.equal(toLocalDate(new Date("2026-11-14T05:30:00Z"), "America/Mexico_City"), "2026-11-13");
});

test("día de pago de comisiones", () => {
  // Semanal, se paga el sábado (6)
  assert.deepEqual(nextPayday("WEEKLY", 6, "2026-11-13"), { payday: "2026-11-14", start: "2026-11-08" });
  assert.deepEqual(nextPayday("WEEKLY", 6, "2026-11-14"), { payday: "2026-11-14", start: "2026-11-08" });
  // Quincenal: 15 y fin de mes
  assert.deepEqual(nextPayday("BIWEEKLY", 0, "2026-11-13"), { payday: "2026-11-15", start: "2026-11-01" });
  assert.deepEqual(nextPayday("BIWEEKLY", 0, "2026-02-16"), { payday: "2026-02-28", start: "2026-02-16" });
  assert.deepEqual(nextPayday("MONTHLY", 0, "2026-12-01"), { payday: "2026-12-31", start: "2026-12-01" });
});

test("premio de la tarjeta de sellos", () => {
  const free = { stampReward: "FREE_SERVICE", stampRewardValue: 0 };
  assert.equal(stampRewardLabel(free), "servicio gratis");
  assert.equal(stampRewardLabel({ stampReward: "FREE_SERVICE", stampRewardValue: 200 }), "servicio gratis (hasta $200)");
  assert.equal(stampRewardLabel({ stampReward: "PERCENT", stampRewardValue: 20 }), "20% de descuento");
  // Servicio gratis: el más caro del ticket, con tope opcional, nunca más de lo que falta por pagar
  assert.equal(previewStampDiscount(free, [180, 320], 500), 320);
  assert.equal(previewStampDiscount({ stampReward: "FREE_SERVICE", stampRewardValue: 200 }, [320], 320), 200);
  assert.equal(previewStampDiscount({ stampReward: "PERCENT", stampRewardValue: 20 }, [180], 180), 36);
  assert.equal(previewStampDiscount({ stampReward: "AMOUNT", stampRewardValue: 500 }, [180], 180), 180);
  assert.equal(previewStampDiscount(free, [], 100), 0);
});
