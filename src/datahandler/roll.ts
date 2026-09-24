const sampleValue = (y: number | null): number | null =>
  typeof y === "number" && y === y ? y : null;

export const slideRoll = (
  length: number,
  rollPeriod: number,
  yAt: (index: number) => number | null,
  extraAt: ((index: number) => number) | null,
  emit: (index: number, sum: number, count: number, extraSum: number) => void,
): void => {
  const period = Math.min(rollPeriod, length);
  let sum = 0;
  let extraSum = 0;
  let count = 0;
  for (let i = 0; i < length; i++) {
    const y = sampleValue(yAt(i));
    if (y !== null) {
      sum += y;
      count += 1;
      if (extraAt) {
        extraSum += extraAt(i);
      }
    }
    const leave = i - period;
    if (leave >= 0) {
      const prev = sampleValue(yAt(leave));
      if (prev !== null) {
        sum -= prev;
        count -= 1;
        if (extraAt) {
          extraSum -= extraAt(leave);
        }
      }
    }
    emit(i, sum, count, extraSum);
  }
};
