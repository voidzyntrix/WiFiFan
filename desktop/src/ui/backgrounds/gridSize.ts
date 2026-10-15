// One resolution for everything that is a grid (Settings > App UI > Grid resolution): the Cells net,
// the Dots net's spacing and the Grid fluid all take their cell size from here, so a Cells net sits
// exactly on the cells of a Grid fluid.

/** The size of a cell in CSS px for a resolution slider value of 0 (coarse) to 1 (fine); 0.5 is 26 px. */
export function gridCell(resolution: number): number {
  const w = window.innerWidth, h = window.innerHeight
  const wanted = 26 * 2 ** ((0.5 - resolution) * 2.5)
  // never so many cells that they cost too much (about 4500)
  return Math.max(wanted, Math.sqrt((w * h) / 4500), 8)
}
