import { test } from '@japa/runner'
import { join } from 'node:path'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { findEntryPoint, isAdonisProject } from '../src/profiler/profiler.js'

const testDir = join(process.cwd(), 'tests', '.tmp')

test.group('isAdonisProject', (group) => {
  group.setup(() => {
    mkdirSync(testDir, { recursive: true })
  })

  group.teardown(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  group.each.setup(() => {
    rmSync(testDir, { recursive: true, force: true })
    mkdirSync(testDir, { recursive: true })
  })

  test('returns true when adonisrc.ts exists', ({ assert }) => {
    writeFileSync(join(testDir, 'adonisrc.ts'), 'export default {}')
    assert.isTrue(isAdonisProject(testDir))
  })

  test('returns true when .adonisrc.ts exists', ({ assert }) => {
    writeFileSync(join(testDir, '.adonisrc.ts'), 'export default {}')
    assert.isTrue(isAdonisProject(testDir))
  })

  test('returns false when neither config exists', ({ assert }) => {
    assert.isFalse(isAdonisProject(testDir))
  })
})

test.group('findEntryPoint', (group) => {
  group.setup(() => {
    mkdirSync(testDir, { recursive: true })
  })

  group.teardown(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  group.each.setup(() => {
    rmSync(testDir, { recursive: true, force: true })
    mkdirSync(testDir, { recursive: true })
    mkdirSync(join(testDir, 'bin'), { recursive: true })
  })

  test('finds default bin/server.ts entry point', ({ assert }) => {
    writeFileSync(join(testDir, 'bin', 'server.ts'), '')
    const entry = findEntryPoint(testDir)
    assert.equal(entry, join(testDir, 'bin/server.ts'))
  })

  test('finds custom entry point', ({ assert }) => {
    mkdirSync(join(testDir, 'custom'), { recursive: true })
    writeFileSync(join(testDir, 'custom', 'start.ts'), '')
    const entry = findEntryPoint(testDir, 'custom/start.ts')
    assert.equal(entry, join(testDir, 'custom/start.ts'))
  })

  test('throws when default entry point does not exist', ({ assert }) => {
    assert.throws(() => findEntryPoint(testDir), /Entry point not found/)
  })

  test('throws when custom entry point does not exist', ({ assert }) => {
    assert.throws(() => findEntryPoint(testDir, 'missing/entry.ts'), /Entry point not found/)
  })

  test('includes full path in error message', ({ assert }) => {
    try {
      findEntryPoint(testDir, 'custom/missing.ts')
      assert.fail('Should have thrown')
    } catch (error) {
      assert.instanceOf(error, Error)
      assert.include((error as Error).message, join(testDir, 'custom/missing.ts'))
    }
  })
})
