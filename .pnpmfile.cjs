// openapi-typescript drives the TypeScript 5 compiler API, which TypeScript 7 no longer ships. It names
// TypeScript as a peer, so pnpm would hand it the workspace's 7; this gives it TypeScript 5 of its own,
// used only to write dist/types.d.ts, while everything else compiles with 7.
module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name === 'openapi-typescript') {
        delete pkg.peerDependencies?.typescript;
        pkg.dependencies = { ...pkg.dependencies, typescript: '^5.9.3' };
      }
      return pkg;
    },
  },
};
