// Разметка голосовой дорожки assets/hof/voice.m4a (секунды от начала обрезанной дорожки).
// talk – Вим говорит; breathe – count вдохов от t до end; hold – задержка на выдохе; recover – вдох и задержка 15 с.
// skipTo у hold – куда перемотать по кнопке «вдохнуть» (начало подсказки к вдоху).
const o = 1.8;
const R = (round, b0, b1, h0, h1, r0, r1) => [
    { t: b0 - o, end: b1 - o, kind: 'breathe', round, count: 30 },
    { t: h0 - o, kind: 'hold', round, skipTo: h1 - o },
    { t: h1 - o, kind: 'talk', round, label: 'приготовься вдохнуть' },
    { t: r0 - o, end: r1 - o, kind: 'recover', round },
    { t: r1 - o, kind: 'talk', round, label: 'выдох и отпускаем' },
];
export const TIMELINE = [
    { t: 0, kind: 'talk', label: 'устройся удобно – сидя или лёжа' },
    ...R(1, 20.0, 130.4, 131.4, 157.5, 162.3, 175.9),
    ...R(2, 185.0, 297.7, 298.1, 358.5, 360.7, 371.4),
    ...R(3, 385.8, 495.9, 496.5, 587.6, 588.0, 601.9),
    { t: 607.5 - o, kind: 'end' },
];
