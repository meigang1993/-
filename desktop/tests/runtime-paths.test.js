const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { gameRoot, resolveGameAsset } = require('../src/runtime-paths');

test('development and packaged game roots stay outside the shell source', () => {
  assert.equal(
    gameRoot({ isPackaged: false, appPath: '/repo/desktop', resourcesPath: '/unused' }),
    path.resolve('/repo/publish'),
  );
  assert.equal(
    gameRoot({ isPackaged: true, appPath: '/unused', resourcesPath: '/app/resources' }),
    path.join('/app/resources', 'publish'),
  );
});

test('game protocol resolves the index and nested assets', () => {
  const root = path.resolve('/repo/publish');
  assert.equal(resolveGameAsset(root, 'game://app/'), path.join(root, 'index.html'));
  assert.equal(
    resolveGameAsset(root, 'game://app/assets/cards/card.webp?v=1'),
    path.join(root, 'assets/cards/card.webp'),
  );
});

test('game protocol rejects other hosts and traversal', () => {
  const root = path.resolve('/repo/publish');
  assert.equal(resolveGameAsset(root, 'https://app/index.html'), null);
  assert.equal(resolveGameAsset(root, 'game://other/index.html'), null);
  assert.equal(resolveGameAsset(root, 'game://app/%2e%2e%2fsecret.txt'), null);
  assert.equal(resolveGameAsset(root, 'game://app/%2e%2e%5csecret.txt'), null);
  assert.equal(resolveGameAsset(root, 'game://app/%E0%A4%A'), null);
});
