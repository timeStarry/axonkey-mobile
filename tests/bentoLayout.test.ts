import { describe, expect, it } from 'vitest'
import {
  PAGE_TEMPLATES,
  createNewZone,
  createPageFromTemplate,
  cycleBentoSpan,
  normalizeGesturePadSlotIds,
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

describe('bentoLayout — Plan B Circular Clickpad Ring, Corner Rescue & Dense Packer', () => {
  it('packs 1x1, 2x1, 1x2, and 2x2 tiles densely with row-major hole filling', () => {
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

  it('clamps spans safely and cycles Bento spans deterministically', () => {
    const empty = packBentoTiles([], 4)
    expect(empty).toEqual({ columns: 4, totalRows: 1, items: [] })

    const s1 = cycleBentoSpan(1, 1)
    expect(s1).toEqual({ colSpan: 2, rowSpan: 1 })
    const s2 = cycleBentoSpan(s1.colSpan, s1.rowSpan)
    expect(s2).toEqual({ colSpan: 1, rowSpan: 2 })
    const s3 = cycleBentoSpan(s2.colSpan, s2.rowSpan)
    expect(s3).toEqual({ colSpan: 2, rowSpan: 2 })
    const s4 = cycleBentoSpan(s3.colSpan, s3.rowSpan)
    expect(s4).toEqual({ colSpan: 1, rowSpan: 1 })
  })

  it('normalizes Plan B Classic Remote (5-slot Circular Clickpad Ring) & legacy zone-less remote pages', () => {
    const classicRemote = DEFAULT_DEMO_DECK.pages[0]
    const remoteZones = normalizePageZones(classicRemote)

    expect(remoteZones).toHaveLength(4)
    expect(remoteZones[0]).toMatchObject({
      kind: 'bento-grid',
      columns: 3,
      tileIds: ['remote.esc', 'remote.menu', 'remote.home'],
    })
    expect(remoteZones[1]).toMatchObject({
      kind: 'dpad-3x3',
      tileIds: [
        '',
        'remote.up',
        '',
        'remote.left',
        'remote.ok',
        'remote.right',
        '',
        'remote.down',
        '',
      ],
    })
    expect(remoteZones[2]).toMatchObject({
      kind: 'bento-grid',
      columns: 4,
      tileIds: ['remote.back', 'remote.mute', 'remote.vol_down', 'remote.vol_up'],
    })
    expect(remoteZones[3]).toMatchObject({
      kind: 'bento-grid',
      columns: 2,
      tileIds: ['remote.q1', 'remote.q2', 'remote.q3', 'remote.q4'],
    })

    // Zone-less legacy remote snapshot synthesizes identical Plan B structure
    const legacyZoneLessRemote: MobileDeckPage = {
      ...classicRemote,
      zones: undefined,
    }
    const synthesized = normalizePageZones(legacyZoneLessRemote)
    expect(synthesized).toHaveLength(4)
    expect(synthesized[1].tileIds).toEqual([
      '',
      'remote.up',
      '',
      'remote.left',
      'remote.ok',
      'remote.right',
      '',
      'remote.down',
      '',
    ])
    expect(synthesized[2]).toMatchObject({
      kind: 'bento-grid',
      columns: 4,
      tileIds: ['remote.back', 'remote.mute', 'remote.vol_down', 'remote.vol_up'],
    })
  })

  it('rescues non-empty corner slots [0, 2, 6, 8] from legacy dpad-3x3 zones into an immediate bento-grid row', () => {
    const legacyDpadPage: MobileDeckPage = {
      id: 'legacy-remote',
      name: '旧版九宫遥控',
      columns: 3,
      tiles: [
        'remote.back',
        'remote.up',
        'remote.vol_up',
        'remote.left',
        'remote.ok',
        'remote.right',
        'remote.mute',
        'remote.down',
        'remote.vol_down',
        'remote.q1',
        'remote.q2',
      ].map((id) => makeTile(id)),
      zones: [
        {
          id: 'z-ring',
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
        },
        {
          id: 'z-bottom',
          kind: 'bento-grid',
          columns: 2,
          tileIds: ['remote.q1', 'remote.q2'],
        },
      ],
    }

    const normalized = normalizePageZones(legacyDpadPage)
    expect(normalized).toHaveLength(3)
    expect(normalized[0]).toEqual({
      id: 'z-ring',
      kind: 'dpad-3x3',
      tileIds: [
        '',
        'remote.up',
        '',
        'remote.left',
        'remote.ok',
        'remote.right',
        '',
        'remote.down',
        '',
      ],
    })
    expect(normalized[1]).toEqual({
      id: 'z-ring-corners',
      kind: 'bento-grid',
      columns: 4,
      tileIds: ['remote.back', 'remote.vol_up', 'remote.mute', 'remote.vol_down'],
    })
    expect(normalized[2]).toMatchObject({
      id: 'z-bottom',
      kind: 'bento-grid',
      columns: 2,
      tileIds: ['remote.q1', 'remote.q2'],
    })
  })

  it('creates 5-slot Circular Clickpad Ring zones and exposes the 4 geometric page templates', () => {
    const basePage: MobileDeckPage = {
      id: 'p1',
      name: '空白页',
      columns: 3,
      tiles: [],
      zones: [],
    }
    const { zone: ringZone, addedTiles: ringTiles } = createNewZone(basePage, 'dpad-3x3')
    expect(ringZone.kind).toBe('dpad-3x3')
    expect(ringTiles).toHaveLength(5)
    expect(ringTiles.map((t) => t.label)).toEqual(['上', '左', '确定', '右', '下'])
    expect(ringTiles.every((t) => t.accent === 'slate')).toBe(true)
    expect(ringZone.tileIds[0]).toBe('')
    expect(ringZone.tileIds[2]).toBe('')
    expect(ringZone.tileIds[6]).toBe('')
    expect(ringZone.tileIds[8]).toBe('')
    expect([
      ringZone.tileIds[1],
      ringZone.tileIds[3],
      ringZone.tileIds[4],
      ringZone.tileIds[5],
      ringZone.tileIds[7],
    ]).toEqual(ringTiles.map((t) => t.id))

    expect(PAGE_TEMPLATES.map((t) => t.title)).toEqual([
      '触控圆盘遥控',
      '快捷按键网格',
      '触控板混排',
      '空白网格',
    ])

    expect(reorderTileIds(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
    const mixed = createPageFromTemplate('pointer-mixed', 2)
    expect(mixed.zones?.[0].kind).toBe('pointer-pad')
    expect(mixed.zones?.[1].kind).toBe('bento-grid')
    expect(normalizeGesturePadSlotIds(['a', 'b'])).toEqual(['a', 'b', '', '', '', ''])
  })
})
