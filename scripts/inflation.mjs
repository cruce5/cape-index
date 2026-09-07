// US CPI-U, annual average (BLS series CUUR0000SA0), used to express historic
// grosses in 2025 dollars for the viz's inflation toggle. 2026 uses a flat
// carry-forward of 2025 (partial year; refine when the annual average lands).
export const CPI_U = {
  2000: 172.200, 2001: 177.100, 2002: 179.900, 2003: 184.000, 2004: 188.900,
  2005: 195.300, 2006: 201.600, 2007: 207.342,
  2008: 215.303, 2009: 214.537, 2010: 218.056, 2011: 224.939, 2012: 229.594,
  2013: 232.957, 2014: 236.736, 2015: 237.017, 2016: 240.007, 2017: 245.120,
  2018: 251.107, 2019: 255.657, 2020: 258.811, 2021: 270.970, 2022: 292.655,
  2023: 304.702, 2024: 313.689, 2025: 322.100, 2026: 322.100,
};

const BASE = CPI_U[2025];

export function toReal2025(nominal, year) {
  if (nominal == null) return null;
  const cpi = CPI_U[year] ?? CPI_U[2025];
  return Math.round(nominal * (BASE / cpi));
}
