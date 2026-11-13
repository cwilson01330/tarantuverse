import {
  clampQuantity,
  maturedAtFromMolts,
  readMoltPhotoDismissed,
  rememberMoltPhotoChoice,
  writeMoltPhotoDismissed,
} from '../everyday-logging-ui'

describe('clampQuantity', () => {
  it('keeps 1..20 and defaults to 1', () => {
    expect(clampQuantity(0)).toBe(1)
    expect(clampQuantity(-4)).toBe(1)
    expect(clampQuantity(21)).toBe(20)
    expect(clampQuantity(7)).toBe(7)
    expect(clampQuantity('3')).toBe(3)
    expect(clampQuantity(undefined)).toBe(1)
    expect(clampQuantity('abc')).toBe(1)
  })
})

describe('maturedAtFromMolts', () => {
  it('returns the newest ultimate molt day, ignoring others', () => {
    const molts = [
      { molted_at: new Date(2026, 5, 1, 12).toISOString(), is_ultimate: true },
      { molted_at: new Date(2026, 8, 9, 12).toISOString(), is_ultimate: true },
      { molted_at: new Date(2026, 9, 1, 12).toISOString() },
    ]
    expect(maturedAtFromMolts(molts)).toBe('2026-09-09')
  })
  it('is null with no ultimate molt', () => {
    expect(maturedAtFromMolts([{ molted_at: new Date().toISOString() }])).toBeNull()
    expect(maturedAtFromMolts([])).toBeNull()
  })
})

describe('molt photo prompt storage', () => {
  it('reads dismissed only when stored as 1; errors keep asking', async () => {
    expect(await readMoltPhotoDismissed({ getItem: async () => '1' }, 'k')).toBe(true)
    expect(await readMoltPhotoDismissed({ getItem: async () => null }, 'k')).toBe(false)
    expect(await readMoltPhotoDismissed({ getItem: async () => { throw new Error('x') } }, 'k')).toBe(false)
  })
  it('write never throws', async () => {
    await expect(writeMoltPhotoDismissed({ setItem: async () => { throw new Error('x') } }, 'k')).resolves.toBeUndefined()
  })
})

describe('rememberMoltPhotoChoice', () => {
  it('stores the tick on any exit (Take / Choose / Not now) and nothing when unticked', async () => {
    const writes: Array<[string, string]> = []
    const storage = { setItem: async (k: string, v: string) => { writes.push([k, v]) } }
    await rememberMoltPhotoChoice(false, storage, 'k')
    expect(writes).toEqual([])
    await rememberMoltPhotoChoice(true, storage, 'k')
    expect(writes).toEqual([['k', '1']])
  })
})
