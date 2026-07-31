# Changelog

## 0.3.0

- add a native Node-API/libuv queue-wait probe for thread pool contention;
- add configurable probe interval and pressure thresholds;
- expose thread pool metrics through snapshots, JSON, HTTP, and Prometheus;
- add warning and critical thread pool pressure diagnostics;
- log structured pressure transitions through the configured logger;
- retain the maximum probe wait per snapshot window;
- add native saturation integration and overhead benchmarks;
- connect the visual PBKDF2 experiment to the real native metric.

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
