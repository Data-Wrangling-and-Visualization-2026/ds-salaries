export const formatNumber = (value: number, digits = 0) =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });

export const formatCurrency = (value: number, digits = 0) =>
  `$${formatNumber(value, digits)}`;

export const formatPercent = (value: number, digits = 1) =>
  `${formatNumber(value, digits)}%`;

export const formatScore = (value: number, digits = 1) =>
  formatNumber(value, digits);
