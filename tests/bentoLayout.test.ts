import { describe, expect, it } from 'vitest'
import {
  createPageFromTemplate,
  cycleBentoSpan,
  normalizePageZones,
  packBentoTiles,
  reorderTileIds,
} from '../src/input/bentoLayout'
import type { MobileDeckPage, MobileTile } from '../src/protocol/types'
import { DEFAULT_DEMO_DECK } from '../src/transport/defaultDeck'

function makeTile(
  id: string,
  colSpan: 1 | 2 = 1,
  rowSpan: 1 | 2 = 1,
): MobileTile {
  return {
    id,
    label: id,
    icon: 'zap',
    accent: 'slate',
    colSpan,
    rowSpan,
    mode: 'gesture',
  }
}

describe('bentoLayout — Deterministic 2D Dense Packer & Zone Normalizer', () => {
  it('packs 1x1, 2x1, 1x2, and 2x2 tiles densely with row-major hole filling', () => {
    // 3-column grid:
    // t1 (1x2) -> (col 0, row 0..1)
    // t2 (2x1) -> (col 1..2, row 0)
    // t3 (2x2) -> cannot fit at (col 1, row 1) because row 1 only has cols 1..2 free? Wait:
    //   cols 1..2 on row 1 and row 2 ARE free! So t3 (2x2) fits at (col 1, row 1)!
    // t4 (1x1) -> fills hole at (col 0, row 2)!
    const tiles = [
      makeTile('t1', 1, 2),
      makeTile('t2', 2, 1),
      makeTile('t3', 2, 2),
      makeTile('t4', 1, 1),
    ]

    const packed = packBentoTiles(tiles, 3)
    expect(packed.columns).toBe(3)
    expect(packed.totalRows).toBe(3)
    expect(
      packed.items.map((it) => ({
        id: it.tile.id,
        col: it.col,
        row: it.row,
        w: it.colSpan,
        h: it.rowSpan,
      })),
    ).toEqual([
      { id: 't1', col: 0, row: 0, w: 1, h: 2 },
      { id: 't2', col: 1, row: 0, w: 2, h: 1 },
      { id: 't3', col: 1, row: 1, w: 2, h: 2 },
      { id: 't4', col: 0, row: 2, w: 1, h: 1 },
    ])
  })

  it('backfills earlier 1x1 holes skipped by wide 2x1 tiles (row dense)', () => {
    // 3-column grid:
    // a (2x1) -> (col 0..1, row 0), leaving (col 2, row 0) free
    // b (2x1) -> cannot fit in 1 col at row 0 -> goes to (col 0..1, row 1)
    // c (1x1) -> dense scan starts at row 0 -> backfills (col 2, row 0)!
    const tiles = [makeTile('a', 2, 1), makeTile('b', 2, 1), makeTile('c', 1, 1)]
    const packed = packBentoTiles(tiles, 3)

    expect(packed.totalRows).toBe(2)
    expect(packed.items.find((i) => i.tile.id === 'c')).toMatchObject({
      col: 2,
      row: 0,
      colSpan: 1,
      rowSpan: 1,
    })
  })

  it('clamps spans safely and handles empty tile arrays', () => {
    const empty = packBentoTiles([], 4)
    expect(empty).toEqual({ columns: 4, totalRows: 1, items: [] })

    const oversized = {
      ...makeTile('wide', 2, 2),
      colSpan: 3 as unknown as 1 | 2,
      rowSpan: 5 as unknown as 1 | 2,
    }
    const packed2Col = packBentoTiles([oversized], 2)
    expect(packed2Col.items[0]).toMatchObject({
      col: 0,
      row: 0,
      colSpan: 2,
      rowSpan: 2,
    })
    expect(packed2Col.totalRows).toBe(2)
  })

  it('cycles Bento spans deterministically: 1x1 -> 2x1 -> 1x2 -> 2x2 -> 1x1', () => {
    const s1 = cycleBentoSpan(1, 1)
    expect(s1).toEqual({ colSpan: 2, rowSpan: 1 })
    const s2 = cycleBentoSpan(s1.colSpan, s1.rowSpan)
    expect(s2).toEqual({ colSpan: 1, rowSpan: 2 })
    const s3 = cycleBentoSpan(s2.colSpan, s2.rowSpan)
    expect(s3).toEqual({ colSpan: 2, rowSpan: 2 })
    const s4 = cycleBentoSpan(s3.colSpan, s3.rowSpan)
    expect(s4).toEqual({ colSpan: 1, rowSpan: 1 })
  })

  it('normalizes legacy Classic Remote and Grid pages identically to Desktop contract', () => {
    const classicRemote = DEFAULT_DEMO_DECK.pages[0]
    const remoteZones = normalizePageZones(classicRemote)

    expect(remoteZones).toHaveLength(3)
    expect(remoteZones[0]).toMatchObject({
      kind: 'bento-grid',
      columns: 3,
      tileIds: ['remote.esc', 'remote.menu', 'remote.home'],
    })
    expect(remoteZones[1]).toMatchObject({
      kind: 'dpad-3x3',
      tileIds: [
        'remote.back',
        'remote.up',
        'remote.vol_up',
        'remote.left',
        'remote.ok',
        'remote.right',
        'remote.mute',
        'remote.down',
        'remote.vol_down',
      ],
    })
    expect(remoteZones[2]).toMatchObject({
      kind: 'bento-grid',
      columns: 2,
      tileIds: ['remote.q1', 'remote.q2', 'remote.q3', 'remote.q4'],
    })

    const gridPage = DEFAULT_DEMO_DECK.pages[1]
    const gridZones = normalizePageZones(gridPage)
    expect(gridZones).toEqual([
      {
        id: `${gridPage.id}-grid`,
        kind: 'bento-grid',
        columns: 3,
        tileIds: gridPage.tiles.map((t) => t.id),
      },
    ])
  })

  it('rescues orphaned tiles into trailing bento-grid zone so no tile is ever lost', () => {
    const pointerOnlyPage: MobileDeckPage = {
      id: 'mixed-1',
      name: '混排页',
      columns: 3,
      tiles: [makeTile('orphan.1'), makeTile('orphan.2')],
      zones: [
        {
          id: 'z-pad',
          kind: 'pointer-pad',
          pointerMode: 'trackpad',
          tileIds: [],
        },
      ],
    }

    const normalized = normalizePageZones(pointerOnlyPage)
    expect(normalized).toHaveLength(2)
    expect(normalized[0].kind).toBe('pointer-pad')
    expect(normalized[1]).toMatchObject({
      kind: 'bento-grid',
      columns: 3,
      tileIds: ['orphan.1', 'orphan.2'],
    })
  })

  it('reorders tileIds cleanly and builds mixed/tall templates within limits', () => {
    expect(reorderTileIds(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
    expect(reorderTileIds(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])

    const mixed = createPageFromTemplate('pointer-mixed', 2)
    expect(mixed.zones?.[0].kind).toBe('pointer-pad')
    expect(mixed.zones?.[1].kind).toBe('bento-grid')

    const tall = createPageFromTemplate('media-tall', 3)
    expect(tall.tiles.some((t) => t.colSpan === 2 && t.rowSpan === 2)).toBe(true)
    expect(tall.tiles.some((t) => t.colSpan === 1 && t.rowSpan === 2)).toBe(true)
  })
})
