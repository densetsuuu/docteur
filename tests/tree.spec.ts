import { test } from '@japa/runner'
import { buildDependencyTree, getImportChain } from '../src/xray/tree.js'
import type { ModuleTiming } from '../src/types.js'

function createModule(
  url: string,
  loadTime: number,
  parentUrl?: string,
  subtreeTime?: number
): ModuleTiming {
  return {
    specifier: url.split('/').pop() || url,
    resolvedUrl: url,
    loadTime,
    parentUrl,
    subtreeTime,
  }
}

test.group('buildDependencyTree', () => {
  test('creates nodes for all modules', ({ assert }) => {
    const modules = [
      createModule('file:///app/a.ts', 10),
      createModule('file:///app/b.ts', 20),
      createModule('file:///app/c.ts', 30),
    ]

    const tree = buildDependencyTree(modules, '/app')

    assert.equal(tree.nodeMap.size, 3)
    assert.isTrue(tree.nodeMap.has('file:///app/a.ts'))
    assert.isTrue(tree.nodeMap.has('file:///app/b.ts'))
    assert.isTrue(tree.nodeMap.has('file:///app/c.ts'))
  })

  test('establishes parent-child relationships', ({ assert }) => {
    const modules = [
      createModule('file:///app/parent.ts', 10),
      createModule('file:///app/child.ts', 20, 'file:///app/parent.ts'),
    ]

    const tree = buildDependencyTree(modules, '/app')

    const parentNode = tree.nodeMap.get('file:///app/parent.ts')!
    const childNode = tree.nodeMap.get('file:///app/child.ts')!

    assert.lengthOf(parentNode.children, 1)
    assert.equal(parentNode.children[0], childNode)
    assert.equal(childNode.parent, parentNode)
  })

  test('identifies root modules correctly', ({ assert }) => {
    const modules = [
      createModule('file:///app/root1.ts', 10),
      createModule('file:///app/root2.ts', 15),
      createModule('file:///app/child.ts', 20, 'file:///app/root1.ts'),
    ]

    const tree = buildDependencyTree(modules, '/app')

    assert.lengthOf(tree.roots, 2)
    const rootUrls = tree.roots.map((r) => r.timing.resolvedUrl)
    assert.include(rootUrls, 'file:///app/root1.ts')
    assert.include(rootUrls, 'file:///app/root2.ts')
  })

  test('calculates depths correctly', ({ assert }) => {
    const modules = [
      createModule('file:///app/root.ts', 10),
      createModule('file:///app/child.ts', 20, 'file:///app/root.ts'),
      createModule('file:///app/grandchild.ts', 30, 'file:///app/child.ts'),
    ]

    const tree = buildDependencyTree(modules, '/app')

    assert.equal(tree.nodeMap.get('file:///app/root.ts')!.depth, 0)
    assert.equal(tree.nodeMap.get('file:///app/child.ts')!.depth, 1)
    assert.equal(tree.nodeMap.get('file:///app/grandchild.ts')!.depth, 2)
  })

  test('sorts children by time descending', ({ assert }) => {
    const modules = [
      createModule('file:///app/parent.ts', 5),
      createModule('file:///app/fast.ts', 10, 'file:///app/parent.ts'),
      createModule('file:///app/slow.ts', 50, 'file:///app/parent.ts'),
      createModule('file:///app/medium.ts', 25, 'file:///app/parent.ts'),
    ]

    const tree = buildDependencyTree(modules, '/app')
    const parent = tree.nodeMap.get('file:///app/parent.ts')!

    assert.equal(parent.children[0].timing.resolvedUrl, 'file:///app/slow.ts')
    assert.equal(parent.children[1].timing.resolvedUrl, 'file:///app/medium.ts')
    assert.equal(parent.children[2].timing.resolvedUrl, 'file:///app/fast.ts')
  })

  test('simplifies display names relative to cwd', ({ assert }) => {
    const modules = [createModule('file:///app/project/src/index.ts', 10)]

    const tree = buildDependencyTree(modules, '/app/project')
    const node = tree.nodeMap.get('file:///app/project/src/index.ts')!

    assert.equal(node.displayName, './src/index.ts')
  })

  test('handles missing parent gracefully', ({ assert }) => {
    const modules = [createModule('file:///app/orphan.ts', 10, 'file:///app/missing.ts')]

    const tree = buildDependencyTree(modules, '/app')
    const orphan = tree.nodeMap.get('file:///app/orphan.ts')!

    assert.isUndefined(orphan.parent)
    assert.include(tree.roots, orphan)
  })

  test('handles circular parent references', ({ assert }) => {
    const modules = [
      createModule('file:///app/a.ts', 10, 'file:///app/b.ts'),
      createModule('file:///app/b.ts', 20, 'file:///app/a.ts'),
    ]

    const tree = buildDependencyTree(modules, '/app')

    assert.equal(tree.nodeMap.size, 2)
    for (const node of tree.nodeMap.values()) {
      assert.isNumber(node.depth)
    }
  })
})

test.group('getImportChain', () => {
  test('returns single node for root module', ({ assert }) => {
    const modules = [createModule('file:///app/root.ts', 10)]
    const tree = buildDependencyTree(modules, '/app')
    const root = tree.nodeMap.get('file:///app/root.ts')!

    const chain = getImportChain(root)

    assert.lengthOf(chain, 1)
    assert.equal(chain[0], root)
  })

  test('returns full chain from root to leaf', ({ assert }) => {
    const modules = [
      createModule('file:///app/root.ts', 10),
      createModule('file:///app/middle.ts', 20, 'file:///app/root.ts'),
      createModule('file:///app/leaf.ts', 30, 'file:///app/middle.ts'),
    ]

    const tree = buildDependencyTree(modules, '/app')
    const leaf = tree.nodeMap.get('file:///app/leaf.ts')!

    const chain = getImportChain(leaf)

    assert.lengthOf(chain, 3)
    assert.equal(chain[0].timing.resolvedUrl, 'file:///app/root.ts')
    assert.equal(chain[1].timing.resolvedUrl, 'file:///app/middle.ts')
    assert.equal(chain[2].timing.resolvedUrl, 'file:///app/leaf.ts')
  })

  test('handles circular references without infinite loop', ({ assert }) => {
    const modules = [
      createModule('file:///app/a.ts', 10, 'file:///app/b.ts'),
      createModule('file:///app/b.ts', 20, 'file:///app/a.ts'),
    ]

    const tree = buildDependencyTree(modules, '/app')
    const nodeA = tree.nodeMap.get('file:///app/a.ts')!

    const chain = getImportChain(nodeA)

    assert.isArray(chain)
    assert.isAtMost(chain.length, 2)
  })
})
