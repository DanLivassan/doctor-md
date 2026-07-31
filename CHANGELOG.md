# Changelog

## 0.2.0

- add synchronous and asynchronous custom collectors;
- add configurable collector timeout and error policy;
- serialize concurrent asynchronous snapshots and skip overlapping periodic collections;
- expose collection failures in `collectionErrors`;
- isolate rejected asynchronous snapshot listeners;
- add runtime integration tests and overhead regression tests;
- add an overhead comparison benchmark;
- extend the visual example with actionable Garbage Collection and libuv thread pool pressure experiments;
- complete Phase 4 documentation.
